/** SillyTavern adapter. Chat creation is an explicit user action. */
export function createSTHost({context = () => globalThis.SillyTavern.getContext(), world = {}, state = {}, services = {}, personasApi = {}, fetcher = globalThis.fetch} = {}) {
    let running = null;
    const cleanups = [];
    const get = () => context();
    const abortError = () => new DOMException('중단됨', 'AbortError');
    const check = signal => { if (signal?.aborted) throw abortError(); };
    function currentChatId() {
        const c = get();
        const id = c.getCurrentChatId?.() ?? c.chatId;
        if (id == null || id === '') return '';
        const owner = c.groupId != null ? 'group:' + c.groupId : 'character:' + (c.characters?.[c.characterId]?.avatar || c.characterId || '');
        return JSON.stringify([owner, String(id)]);
    }
    function card(row) { return {...row, id: String(row.avatar), data: row.data || row}; }
    function cards() { return (get().characters || []).filter(x => x.avatar).map(card); }
    function players() {
        const c=get(), p=c.powerUserSettings || {};
        const rows=Object.entries(p.personas || {}).map(([id,name])=>({id,name,data:{name,description:p.persona_descriptions?.[id]?.description || ''}}));
        if (!rows.length && (c.name1 || p.persona_description)) rows.push({id:'current',name:c.name1||'사용자',data:{name:c.name1||'사용자',description:p.persona_description||''}});
        return rows;
    }
    function currentPersona() {
        const c=get(),p=c.powerUserSettings||{};
        const id=state.user_avatar || c.userAvatar || c.chatMetadata?.persona;
        if(players().some(x=>x.id===id))return id;
        const matches=players().filter(x=>x.name===c.name1);return matches.length===1?matches[0].id:'';
    }
    function linked() {
        const c=get(), group=c.groups?.find(x=>String(x.id)===String(c.groupId));
        if(c.groupId!=null) return (group?.members||[]).filter(id=>cards().some(x=>x.id===id));
        const row=c.characters?.[c.characterId];return row?.avatar?[row.avatar]:[];
    }
    function books() {
        const names=get().getWorldInfoNames?.() ?? world.world_names;
        if(!Array.isArray(names)) throw new Error('월드인포 목록을 불러오지 못했어요. 실리태번 버전과 월드인포 모듈을 확인해 주세요.');
        const c=get(), p=c.powerUserSettings||{}, connected=new Set([
            ...(world.selected_world_info || []),c.chatMetadata?.world_info,p.persona_description_lorebook,
            ...linked().map(id=>cards().find(x=>x.id===id)?.data?.extensions?.world),
            ...linked().flatMap(id=>world.world_info?.charLore?.find(x=>x.name===id.replace(/\.[^.]+$/, ''))?.extraBooks||[]),
        ].filter(Boolean));
        return names.map(name=>({id:name,name,enabled:true,isGlobal:connected.has(name)}));
    }
    function currentChat() {
        const c=get();let summary=typeof c.chatMetadata?.summary==='string'?c.chatMetadata.summary:'';
        if(!summary) for(let i=(c.chat?.length||0)-1;i>=0;i--) { if(typeof c.chat[i]?.extra?.memory==='string' && !c.chat[i].is_system) {summary=c.chat[i].extra.memory;break;} }
        let lore=[];try{lore=books().filter(x=>x.isGlobal).map(x=>x.id);}catch{}
        return {id:currentChatId(),name:String(c.getCurrentChatId?.()??c.chatId??'현재 채팅'),mode:'roleplay',connectionId:'st-current',characterIds:linked(),personaId:currentPersona(),metadata:{summary,activeLorebookIds:lore}};
    }
    function messages() {
        return (get().chat||[]).filter(m=>!m.is_system).map((m,i)=>({id:String(i),role:m.is_user?'user':m.name||'assistant',content:String(m.mes||''),characterId:m.original_avatar||'',extra:{hiddenFromAI:!!m.extra?.hiddenFromAI,hiddenFromUser:!!m.extra?.hiddenFromUser}}));
    }
    async function entries(name, signal) {
        check(signal);
        let data;
        const load=get().loadWorldInfo || world.loadWorldInfo;
        if(typeof load==='function') data=await load(name);
        else {
            const r=await fetcher('/api/worldinfo/get',{method:'POST',headers:get().getRequestHeaders(),body:JSON.stringify({name}),signal});
            if(!r.ok)throw new Error('월드인포 읽기 실패: '+r.status); data=await r.json();
        }
        check(signal);
        if(!data?.entries)throw new Error('월드인포를 찾을 수 없어요: '+name);
        return Object.entries(data.entries).map(([key,e])=>({...e,id:String(e.uid??key),name:e.comment||String(e.uid??key),enabled:!e.disable,content:String(e.content||'')}));
    }
    const connectionService = () => get().ConnectionManagerRequestService || services.ConnectionManagerRequestService;
    function profiles() {
        const c=get();if(c.extensionSettings?.disabledExtensions?.includes('connection-manager'))return [];
        const rows=c.extensionSettings?.connectionManager?.profiles||[], service=connectionService();
        return rows.filter(p=>{try{return p?.id && (service?.isProfileSupported ? service.isProfileSupported(p) : ['openai','textgenerationwebui'].includes(c.CONNECT_API_MAP?.[p.api]?.selected));}catch{return false;}});
    }
    function connections() {
        const c=get(),active=c.extensionSettings?.connectionManager?.selectedProfile;
        const list=profiles();
        return [{id:'st-current',name:'현재 실리태번 연결'+(list.find(p=>p.id===active)?.name?' · '+list.find(p=>p.id===active).name:''),model:c.getChatCompletionModel?.()||c.mainApi||'',isDefault:true},...list.map(p=>({id:p.id,name:p.name||p.id,model:p.model||p.api||'',provider:p.api}))];
    }
    function tokenCounter(connectionId) {
        const c=get(), cache=new Map();let fallback=false;
        const model=c.getTokenizerModel?.()||c.mainApi||'현재 모델';
        const profile=connectionId && connectionId!=='st-current';
        const same=!profile || c.extensionSettings?.connectionManager?.selectedProfile===connectionId;
        const estimate=text=>{let a=0,b=0;for(const ch of text){if(ch.codePointAt(0)<128)a++;else b++;}return Math.ceil(a/3.5+b*1.5);};
        async function text(value){
            const str=typeof value==='string'?value:JSON.stringify(value??'');if(!str)return 0;
            if(cache.has(str))return cache.get(str);
            let n;try {if(typeof c.getTokenCountAsync!=='function')throw new Error('No tokenizer');n=await c.getTokenCountAsync(str);if(!Number.isFinite(n)||n<=0)throw new Error('Invalid count');}catch {fallback=true;n=estimate(str);}
            if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(str,n);return n;
        }
        return {text,async messages(rows){let n=3;for(const m of rows)n+=await text(m.content)+8;return n;},info(){return {source:fallback?'estimate':'sillytavern',model,profileMatched:same,label:fallback?'글자 수 추정 (토크나이저 사용 불가)':`ST 토크나이저 · ${model}${same?'':' · 현재 연결 기준, 선택 프로필과 다름'}`};}};
    }
    async function request(path, body, signal) {
        check(signal);const [route]=path.split('?');
        if(route==='/chats')return currentChatId()?[currentChat()]:[];
        if(route==='/connections')return connections();
        if(route==='/characters') {
            const target=currentChatId(), ids=linked(), c=get();
            const hydrate=c.unshallowCharacter || state.unshallowCharacter;
            if(typeof hydrate==='function')for(const id of ids){const index=c.characters.findIndex(x=>x.avatar===id);if(c.characters[index]?.shallow)await hydrate(index);check(signal);}
            if(target!==currentChatId())throw abortError();
            return cards().filter(x=>ids.includes(x.id));
        }
        if(route==='/characters/personas/list')return players().filter(x=>x.id===currentPersona());
        if(route==='/lorebooks')return books();
        if(route==='/prompts')return [];
        let match=route.match(/^\/chats\/([^/]+)(\/messages)?$/);
        if(match) {
            if(decodeURIComponent(match[1])!==currentChatId())throw new Error('참고 채팅이 바뀌었어요. 해당 채팅을 열고 새로고침해 주세요.');
            return match[2]?messages():currentChat();
        }
        match=route.match(/^\/characters\/(personas\/)?([^/]+)$/);
        if(match){const row=(match[1]?players():cards()).find(x=>x.id===decodeURIComponent(match[2]));if(!row)throw new Error('선택한 카드를 찾지 못했어요. 참고 자료를 다시 선택해 주세요.');return structuredClone(row);}
        match=route.match(/^\/lorebooks\/([^/]+)\/entries$/);
        if(match)return entries(decodeURIComponent(match[1]),signal);
        throw new Error('실리태번 이식판에서 지원하지 않는 요청: '+route);
    }
    async function avatarFile(url) {
        const response=await fetcher(url,{method:'GET',cache:'no-store'});
        if(!response.ok)throw new Error('원본 이미지 읽기 실패: '+response.status);
        const blob=await response.blob();
        if(!blob?.size||!String(blob.type||'').startsWith('image/'))throw new Error('유효한 이미지 파일이 아니에요.');
        const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
        return new File([blob],'avatar.'+extension,{type:blob.type});
    }
    async function createCharacterFromProfile({name,description,sourceAvatar=''}) {
        if(!String(name||'').trim()||!String(description||'').trim())throw new Error('캐릭터 이름과 프로필이 필요해요.');
        const c=get(),data={ch_name:String(name).trim().slice(0,120),description:String(description),personality:'',scenario:'',first_mes:'',mes_example:''};
        let image=null;
        if(sourceAvatar){try{image=await avatarFile('characters/'+encodeURIComponent(sourceAvatar));}catch(e){console.warn('[Side Story] 원본 캐릭터 이미지 복사 실패, 기본 이미지 사용:',e);}}
        let headers,body;
        if(image){const form=new FormData();for(const [k,v]of Object.entries(data))form.append(k,v);form.append('avatar',image);headers=c.getRequestHeaders({omitContentType:true});body=form;}
        else{headers=c.getRequestHeaders();body=JSON.stringify(data);}
        const response=await fetcher('/api/characters/create',{method:'POST',headers,body});
        if(!response.ok)throw new Error('새 캐릭터 저장 실패: '+response.status);
        const avatar=await response.text();
        try{await c.getCharacters?.();}catch{}
        return avatar;
    }
    async function createPersonaFromProfile({name,description,sourceAvatar=''}) {
        if(!String(name||'').trim()||!String(description||'').trim())throw new Error('페르소나 이름과 프로필이 필요해요.');
        if(typeof personasApi.initPersona!=='function')throw new Error('실리태번 페르소나 모듈을 불러올 수 없어요. 최신 실리태번에서 다시 시도해 주세요.');
        const c=get();
        let image;
        if(sourceAvatar){try{image=await avatarFile('User Avatars/'+encodeURIComponent(sourceAvatar));}catch(e){console.warn('[Side Story] 원본 페르소나 이미지 복사 실패, 기본 이미지 사용:',e);}}
        if(!image)image=await avatarFile(state.default_user_avatar||'img/user-default.png');
        const form=new FormData();form.append('avatar',image);
        const id='side-story-'+(c.uuidv4?.()||globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))+'.png';
        form.append('overwrite_name',id);
        const response=await fetcher('/api/avatars/upload',{method:'POST',headers:c.getRequestHeaders({omitContentType:true}),body:form});
        if(!response.ok)throw new Error('페르소나 이미지 저장 실패: '+response.status);
        const result=await response.json(),avatarId=result?.path;
        if(!avatarId||avatarId!==id)throw new Error('새 페르소나 이미지 저장 결과를 확인할 수 없어요.');
        await personasApi.initPersona(avatarId,String(name).trim().slice(0,120),String(description),'');
        try{await personasApi.getUserAvatars?.(true,avatarId);}catch(e){console.warn('[Side Story] 페르소나 목록 새로고침 실패:',e);}
        return avatarId;
    }
    async function createChatFromRecord(record) {
        const c=get(),origin=currentChatId();
        if(running||(typeof state.isGenerating==='function'&&state.isGenerating())||c.isSendPress||(typeof c.isGenerating==='function'?c.isGenerating():c.isGenerating))throw new Error('생성이 끝난 뒤 새 채팅을 만들어 주세요.');
        if(!record?.content?.trim())throw new Error('새 채팅에 넣을 원문이 없어요.');
        let owner='';try{const parsed=JSON.parse(record.chatId);if(typeof parsed?.[0]==='string')owner=parsed[0];}catch{}
        const avatar=owner.startsWith('character:')?owner.slice(10):record.characterIds?.length===1?record.characterIds[0]:'';
        const index=(c.characters||[]).findIndex(row=>row.avatar===avatar),character=c.characters?.[index];
        if(!character)throw new Error('원본 캐릭터를 찾지 못했어요. 새 채팅은 캐릭터가 하나인 결과에서 지원해요.');
        if(typeof c.openCharacterChat!=='function'||typeof c.selectCharacterById!=='function'||typeof c.getRequestHeaders!=='function')throw new Error('새 채팅 API를 지원하는 ST 버전이 필요해요.');
        const uuid=()=>c.uuidv4?.()||globalThis.crypto.randomUUID?.()||Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
        const name='Side Story - '+String(record.title||'새 이야기').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,60)+' - '+uuid();
        const message={name:character.name,is_user:false,is_system:false,send_date:new Date().toISOString(),mes:record.content,extra:{sideStoryRecordId:record.id}};
        const response=await fetcher('/api/chats/save',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({ch_name:character.name,avatar_url:character.avatar,file_name:name,force:false,chat:[{user_name:'unused',character_name:'unused',chat_metadata:{integrity:uuid()}},message]})});
        if(!response.ok)throw new Error('새 채팅 저장 실패: '+response.status);
        const saved=await response.json();if(saved?.ok!==true)throw new Error('새 채팅 저장을 확인하지 못했어요.');
        if(origin!==currentChatId())throw new Error('새 채팅은 저장했지만 현재 채팅이 바뀌어 열지 않았어요. '+character.name+'의 채팅 목록에서 '+name+'을 열어 주세요.');
        await c.saveChat?.();
        if(origin!==currentChatId())throw new Error('채팅이 바뀌었어요. 저장된 새 채팅은 캐릭터 채팅 목록에서 열어 주세요: '+name);
        await c.selectCharacterById(index,{switchMenu:false});
        const selected=get();if(selected.groupId!=null||selected.characters?.[selected.characterId]?.avatar!==avatar)throw new Error('캐릭터 전환이 끝나지 않았어요. 저장된 새 채팅을 채팅 목록에서 열어 주세요: '+name);
        await selected.openCharacterChat(name);
        return name;
    }
    async function generate(payload, signal) {
        check(signal);
        if(running)throw new Error('이전 API 요청이 종료될 때까지 잠시 기다려 주세요.');
        const c=get();
        if((typeof state.isGenerating==='function' && state.isGenerating()) || (typeof c.isGenerating==='function'?c.isGenerating():c.isGenerating) || c.isSendPress)throw new Error('본편 생성이 끝난 뒤 다시 시도해 주세요.');
        const id=payload.connectionId||'st-current',service=connectionService();
        let send;
        if(id!=='st-current') {
            if(!profiles().some(p=>p.id===id))throw new Error('선택한 연결 프로필을 찾을 수 없어요. 설정에서 다시 선택해 주세요.');
            if(typeof service?.sendRequest!=='function')throw new Error('연결 프로필 요청 API를 지원하지 않는 실리태번 버전이에요.');
            send=()=>service.sendRequest(id,structuredClone(payload.messages),payload.parameters?.maxTokens,{stream:false,signal,extractData:true,includePreset:true,includeInstruct:true});
        } else {
            if(payload.useSillyTavernContext) {
                if(typeof c.generateQuietPrompt!=='function')throw new Error('현재 실리태번 프롬프트를 사용하려면 generateQuietPrompt를 지원하는 실리태번 버전이 필요해요.');
                const quietPrompt=String(payload.quietPrompt||payload.messages?.map(m=>m.content).filter(Boolean).join('\n\n')||'');
                send=async()=>{
                    // Only the local scan arrays are changed; stored books and entry objects stay untouched.
                    const event=c.eventTypes?.WORLDINFO_ENTRIES_LOADED,events=c.eventSource;
                    const filter=rows=>{for(const key of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(rows[key]))rows[key].splice(0);};
                    if(payload.selectedLoreOnly&&(!event||typeof events?.on!=='function'||typeof events?.removeListener!=='function'))throw new Error('엔트리 직접 선택은 WORLDINFO_ENTRIES_LOADED를 지원하는 ST 버전이 필요해요. ST를 업데이트하거나 ST 설정 따르기를 선택해 주세요.');
                    if(payload.selectedLoreOnly)events.on(event,filter);
                    try{return await c.generateQuietPrompt({quietPrompt,quietToLoud:false,responseLength:payload.parameters?.maxTokens,removeReasoning:true});}
                    finally{if(payload.selectedLoreOnly)events.removeListener(event,filter);}
                };
            } else {
                if(typeof c.generateRaw!=='function')throw new Error('generateRaw를 지원하는 실리태번 버전이 필요해요.');
                send=()=>c.generateRaw({prompt:structuredClone(payload.messages),responseLength:payload.parameters?.maxTokens,trimNames:false});
            }
        }
        const job=Promise.resolve().then(()=>{check(signal);return send();});
        running=job;
        job.then(()=>{if(running===job)running=null;},()=>{if(running===job)running=null;});
        let handler;
        try {
            const cancelled=new Promise((_,reject)=>{handler=()=>reject(abortError());signal?.addEventListener('abort',handler,{once:true});if(signal?.aborted)handler();});
            const result=await Promise.race([job,cancelled]);check(signal);const text=typeof result==='string'?result:result?.content;
            if(typeof text!=='string')throw new Error('실리태번에서 텍스트 결과를 받지 못했어요.');return text;
        } finally {signal?.removeEventListener('abort',handler);}
    }
    return {
        request,generate,createChatFromRecord,createCharacterFromProfile,createPersonaFromProfile,currentChatId,currentChat,linked,currentPersona,tokenCounter,connections,
        storage:{async get(){return {sideStory:get().extensionSettings?.st_sidestory||{}};},async patch(value){const c=get();if(!c.extensionSettings||typeof c.saveSettingsDebounced!=='function')throw new Error('실리태번 설정 저장 API를 찾지 못했어요.');c.extensionSettings.st_sidestory=structuredClone(value.sideStory);c.saveSettingsDebounced();}},
        setTimeout:globalThis.setTimeout.bind(globalThis),clearTimeout:globalThis.clearTimeout.bind(globalThis),
        onCleanup(fn){cleanups.push(fn);},cleanup(){for(const fn of cleanups.splice(0))fn();}
    };
}
