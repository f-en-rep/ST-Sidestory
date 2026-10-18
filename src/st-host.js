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
        // ids are indexes in the full ST chat so series anchors can address them.
        return (get().chat||[]).map((m,i)=>[m,i]).filter(([m])=>!m.is_system).map(([m,i])=>({id:String(i),role:m.is_user?'user':m.name||'assistant',content:String(m.mes||''),characterId:m.original_avatar||'',extra:{hiddenFromAI:!!m.extra?.hiddenFromAI,hiddenFromUser:!!m.extra?.hiddenFromUser}}));
    }
    /** The latest message visible to the model: the canon point a new side story starts from. */
    function currentAnchor() {
        const chat=get().chat||[];
        for(let i=chat.length-1;i>=0;i--)if(!chat[i]?.is_system)return {index:i,sendDate:String(chat[i].send_date??''),name:String(chat[i].name??'')};
        return null;
    }
    /** Finds an anchor again after edits/deletions shifted indexes. -1 when it no longer exists. */
    function resolveAnchor(anchor) {
        if(!anchor||!Number.isInteger(anchor.index))return -1;
        const chat=get().chat||[],same=m=>m&&String(m.send_date??'')===anchor.sendDate&&String(m.name??'')===anchor.name;
        if(same(chat[anchor.index]))return anchor.index;
        if(anchor.sendDate)for(let i=chat.length-1;i>=0;i--)if(same(chat[i]))return i;
        return -1;
    }
    // ---- RP preset for Side Story generations (current API's preset manager) ----
    function presetManager() { try { return get().getPresetManager?.() || null; } catch { return null; } }
    function presetNames() { const pm = presetManager(); try { return pm ? [...new Set(pm.getAllPresets().filter(Boolean))] : []; } catch { return []; } }
    function currentPresetName() { try { return presetManager()?.getSelectedPresetName() || ''; } catch { return ''; } }
    /**
     * Runs fn with the named preset active, then restores the previous one even on failure or abort.
     * Main-chat sending is disabled meanwhile so an RP turn never goes out with the Side Story preset.
     */
    async function withPreset(name, fn) {
        if (!name) return fn();
        const pm = presetManager(), c = get();
        if (!pm) throw new Error('실리태번 프리셋 관리자를 찾지 못했어요. "현재 프리셋 따르기"로 바꿔 주세요.');
        if (pm.getSelectedPresetName() === name) return fn();
        const value = pm.findPreset(name);
        if (value === undefined || value === null) throw new Error(`프리셋 "${name}"을 찾지 못했어요. 이름이 바뀌었거나 다른 API의 프리셋일 수 있어요.`);
        const previous = pm.getSelectedPreset();
        c.deactivateSendButtons?.();
        try {
            await pm.selectPreset(value);
            return await fn();
        } finally {
            try { await pm.selectPreset(previous); } catch (e) { console.warn('[Side Story] could not restore preset', e); }
            c.activateSendButtons?.();
        }
    }
    // ---- Side Story turn shaping inside ST's own prompt assembly ----
    let pending=null;
    const INTERCEPTOR='sideStoryGenerateInterceptor';
    /**
     * generate_interceptor: trims ST's chat copy before the preset assembles history.
     * plan = {limit:number|null, anchor:{index,sendDate,name}|null, exclude:boolean, append:[{role,content}]}
     * append: earlier Side Story parts, added after the (trimmed) RP history as real chat messages.
     */
    function interceptHistory(chat,type) {
        const plan=pending?.history;
        if(!plan||type!=='quiet'||!Array.isArray(chat))return;
        const report={before:chat.length,anchor:null};
        let keep=chat.map((_,k)=>k);
        if(plan.exclude)keep=[];
        else {
            if(plan.anchor){
                const all=get().chat||[],visible=[];
                all.forEach((m,i)=>{if(!m?.is_system||Array.isArray(m?.extra?.tool_invocations))visible.push(i);});
                const cut=resolveAnchor(plan.anchor);
                report.anchor=cut>=0&&visible.length===chat.length?'applied':'missing';
                if(report.anchor==='applied')keep=keep.filter(k=>visible[k]<=cut);
            }
            if(Number.isInteger(plan.limit)&&plan.limit>=0)keep=keep.slice(Math.max(0,keep.length-plan.limit));
        }
        const set=new Set(keep);
        for(let k=chat.length-1;k>=0;k--)if(!set.has(k))chat.splice(k,1);
        report.after=chat.length;
        if(Array.isArray(plan.append)&&plan.append.length){
            const c=get(),date=new Date().toISOString();
            for(const m of plan.append){
                const user=m.role==='user';
                chat.push({name:user?String(c.name1||'User'):String(m.name||c.name2||'Assistant'),is_user:user,is_system:false,send_date:date,mes:String(m.content??''),extra:{sideStory:true}});
            }
            report.appended=plan.append.length;
        }
        pending.historyReport=report;
        // Kept so the history can be put back if another prompt rewriter drops it (see shapePrompt).
        const names=new Set(chat.map(m=>m?.name).filter(Boolean)),prefix=names.size>2;
        pending.historyTurns=chat.map(m=>({role:m?.is_user?'user':'assistant',content:(prefix&&m?.name?m.name+': ':'')+String(m?.mes??'')})).filter(m=>m.content.trim());
    }
    const textOf=m=>typeof m?.content==='string'?m.content:Array.isArray(m?.content)?m.content.map(p=>p?.text||'').join(''):'';
    /**
     * CHAT_COMPLETION_PROMPT_READY: the quiet prompt arrives as a system message (possibly squashed into the
     * preset's post-history text). Split it out and make it the final user turn, as if the user sent it.
     */
    /** Lines of plain dialogue from the last turns, used to tell whether the history reached the prompt at all. */
    function historyProbes(turns){
        const out=[];
        for(const m of turns.slice(-3)){
            const lines=String(m.content).split('\n').map(x=>x.trim()).filter(x=>x.length>=12&&!/[<>\[\]{}|]/.test(x)).sort((a,b)=>b.length-a.length);
            if(lines[0])out.push(lines[0].slice(0,40));
        }
        return out;
    }
    function restoreHistory(chat){
        const turns=pending?.historyTurns;
        if(!Array.isArray(turns)||!turns.length)return;
        const probes=historyProbes(turns);
        if(!probes.length||chat.some(m=>probes.some(p=>textOf(m).includes(p))))return;
        let at=chat.length;for(let i=chat.length-1;i>=0;i--)if(textOf(chat[i]).includes(pending.marker)){at=i;break;}
        chat.splice(at,0,...turns.map(m=>({role:m.role,content:m.content})));
        pending.meta={...pending.meta,historyRestored:turns.length};
    }
    function shapePrompt(data) {
        if(!pending||data?.dryRun||!Array.isArray(data?.chat))return;
        for(let i=data.chat.length-1;i>=0;i--)if(pending.auxInserted?.has(data.chat[i]))data.chat.splice(i,1);
        try{shapeTurn(data);for(const row of pending.auxiliaryTurns||[]){const copy={...row};data.chat.push(copy);pending.auxInserted.add(copy);}}finally{if(Array.isArray(data.chat)){restoreHistory(data.chat);pending.finalPrompt=structuredClone(data.chat);}}
    }
    function shapeTurn(data) {
        const chat=data.chat,marker=pending.marker;
        let index=-1;for(let i=chat.length-1;i>=0;i--)if(textOf(chat[i]).includes(marker)){index=i;break;}
        // Another PROMPT_READY listener may rebuild the prompt and drop the quiet prompt; put the request back as the last user turn.
        if(index<0){if(pending.turn){chat.push({role:'user',content:pending.turn});pending.meta={...pending.meta,reinserted:true};}pending.finalPrompt=structuredClone(chat);return;}
        const message=chat[index];
        if(typeof message.content==='string'){
            const at=message.content.indexOf(marker),before=message.content.slice(0,at).trim(),turn=message.content.slice(at);
            chat.splice(index,1);
            if(before)chat.splice(index,0,{...message,content:before});
            chat.push({role:'user',content:turn});
        } else {
            chat.splice(index,1);chat.push({...message,role:'user'});
        }
        pending.finalPrompt=structuredClone(chat);
    }
    globalThis[INTERCEPTOR]=async(chat,contextSize,abort,type)=>{try{interceptHistory(chat,type);}catch(e){console.warn('[Side Story] history interceptor failed',e);}};
    cleanups.push(()=>{if(globalThis[INTERCEPTOR])delete globalThis[INTERCEPTOR];});
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
    async function createChatFromRecord(record, parts) {
        const list=(Array.isArray(parts)&&parts.length?parts:[record]).filter(Boolean);
        const c=get(),origin=currentChatId();
        if(running||(typeof state.isGenerating==='function'&&state.isGenerating())||c.isSendPress||(typeof c.isGenerating==='function'?c.isGenerating():c.isGenerating))throw new Error('생성이 끝난 뒤 새 채팅을 만들어 주세요.');
        if(!record||list.some(r=>!r?.content?.trim()))throw new Error('새 채팅에 넣을 아티클이 없어요.');
        let owner='';try{const parsed=JSON.parse(record.chatId);if(typeof parsed?.[0]==='string')owner=parsed[0];}catch{}
        const avatar=owner.startsWith('character:')?owner.slice(10):record.characterIds?.length===1?record.characterIds[0]:'';
        const index=(c.characters||[]).findIndex(row=>row.avatar===avatar),character=c.characters?.[index];
        if(!character)throw new Error('원본 캐릭터를 찾지 못했어요. 새 채팅은 캐릭터가 하나인 아티클에서 지원해요.');
        if(typeof c.openCharacterChat!=='function'||typeof c.selectCharacterById!=='function'||typeof c.getRequestHeaders!=='function')throw new Error('새 채팅 API를 지원하는 ST 버전이 필요해요.');
        const uuid=()=>c.uuidv4?.()||globalThis.crypto.randomUUID?.()||Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
        const name='Side Story - '+String((list.length>1&&record.seriesTitle)||record.title||'새 아티클').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,60)+' - '+uuid();
        const messages=list.map(r=>({name:character.name,is_user:false,is_system:false,send_date:new Date().toISOString(),mes:r.content,extra:{sideStoryRecordId:r.id}}));
        const response=await fetcher('/api/chats/save',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({ch_name:character.name,avatar_url:character.avatar,file_name:name,force:false,chat:[{user_name:'unused',character_name:'unused',chat_metadata:{integrity:uuid()}},...messages]})});
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
    async function appendToCurrentChat(record, parts) {
        const c=get(),list=(Array.isArray(parts)&&parts.length?parts:[record]).filter(Boolean);
        if(running||(typeof state.isGenerating==='function'&&state.isGenerating())||c.isSendPress||(typeof c.isGenerating==='function'?c.isGenerating():c.isGenerating))throw new Error('생성이 끝난 뒤 채팅에 추가해 주세요.');
        if(!record||list.some(r=>!r?.content?.trim()))throw new Error('채팅에 넣을 아티클이 없어요.');
        if(record.chatId!==currentChatId())throw new Error('이 아티클을 만든 채팅에서만 추가할 수 있어요.');
        if(!Array.isArray(c.chat)||typeof c.addOneMessage!=='function'||typeof c.saveChat!=='function')throw new Error('메시지 추가 API를 지원하는 ST 버전이 필요해요.');
        // Group chats: speak as the character the result was written for when that member is present.
        const own=c.characters?.[c.characterId],picked=c.groupId!=null?(c.characters||[]).find(row=>row.avatar===record.characterIds?.[0]):own;
        const name=picked?.name||c.name2||record.characterNames?.[0]||'';
        if(!name)throw new Error('메시지를 붙일 캐릭터를 찾지 못했어요.');
        for(const r of list){
            const message={name,is_user:false,is_system:false,send_date:new Date().toISOString(),mes:r.content,extra:{sideStoryRecordId:r.id}};
            if(c.groupId!=null&&picked?.avatar)message.original_avatar=picked.avatar;
            c.chat.push(message);
            c.addOneMessage(message,{scroll:true});
        }
        await c.saveChat();
        return list.length;
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
                    const readyEvent=c.eventTypes?.CHAT_COMPLETION_PROMPT_READY,events=c.eventSource;
                    const ready=data=>{try{shapePrompt(data);}catch(e){console.warn('[Side Story] prompt shaping failed',e);}};
                    const shaping=payload.asUserTurn!==false&&readyEvent&&typeof events?.on==='function';
                    const cc=c.chatCompletionSettings||{};
                    // Connection facts only (no prompt text): used by the content-free structure report.
                    const meta={api:String(c.mainApi||''),source:String(cc.chat_completion_source||''),model:String(c.getChatCompletionModel?.()||''),squash:cc.squash_system_messages===true,postProcessing:String(cc.custom_prompt_post_processing||''),prefillChars:String(cc.assistant_prefill||'').length,presetMaxTokens:Number(cc.openai_max_tokens)||null,requestedMaxTokens:payload.parameters?.maxTokens??null,promptReadyEvent:!!readyEvent};
                    const marker=payload.marker||'<SIDESTORY>',at=quietPrompt.indexOf(marker);
                    if(payload.auxiliaryTurns?.length&&(!shaping||(c.mainApi&&c.mainApi!=='openai')))throw Error('보조 대화는 프롬프트 편집 이벤트를 지원하는 채팅 완성 API에서 사용할 수 있어요.');
                    pending={auxiliaryTurns:payload.auxiliaryTurns||[],auxInserted:new WeakSet(),marker,turn:at>=0?quietPrompt.slice(at):'',history:payload.history||null,meta};
                    // Run after other extensions' PROMPT_READY handlers so the request stays the final user turn.
                    if(shaping){if(typeof events.makeLast==='function')events.makeLast(readyEvent,ready);else events.on(readyEvent,ready);}
                    try{return await withPreset(payload.presetName||'',quietRun);}
                    finally{
                        if(shaping)events.removeListener?.(readyEvent,ready);
                        payload.onPromptReady?.({messages:pending.finalPrompt||null,history:pending.historyReport||null,meta:pending.meta});
                        pending=null;
                    }
                };
                const quietRun=async()=>{
                    // Only the local scan arrays are changed; stored books and entry objects stay untouched.
                    const event=c.eventTypes?.WORLDINFO_ENTRIES_LOADED,events=c.eventSource;
                    const filter=rows=>{for(const key of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(rows[key]))rows[key].splice(0);};
                    if(payload.selectedLoreOnly&&(!event||typeof events?.on!=='function'||typeof events?.removeListener!=='function'))throw new Error('엔트리 직접 선택은 WORLDINFO_ENTRIES_LOADED를 지원하는 ST 버전이 필요해요. ST를 업데이트하거나 ST 설정 따르기를 선택해 주세요.');
                    if(payload.selectedLoreOnly)events.on(event,filter);
                    // Text-completion instruct templates label the quiet turn with quietName: present it as the user.
                    const quietName=payload.asUserTurn!==false?(c.name1||undefined):undefined;
                    // ST reserves the response length out of the context size. A Side Story asks for a longer reply than the
                    // RP preset, so without this the preset's own prompts would eat the budget and ST would silently drop
                    // the persona, the chat history and the request. Widen the context by exactly the extra reply length.
                    const live=get().chatCompletionSettings,requested=Number(payload.parameters?.maxTokens)||0;
                    const ctx=Number(live?.openai_max_context),own=Number(live?.openai_max_tokens)||0,extra=String(get().mainApi||'')==='openai'&&Number.isFinite(ctx)&&ctx>0?Math.max(0,requested-own):0;
                    if(pending)pending.meta={...pending.meta,contextSize:Number.isFinite(ctx)?ctx:null,contextWidened:extra};
                    if(extra)live.openai_max_context=ctx+extra;
                    try{return await c.generateQuietPrompt({quietPrompt,quietToLoud:false,responseLength:payload.parameters?.maxTokens,removeReasoning:true,...(quietName?{quietName}:{})});}
                    finally{if(extra&&live.openai_max_context===ctx+extra)live.openai_max_context=ctx;if(payload.selectedLoreOnly)events.removeListener(event,filter);}
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
        request,generate,presetNames,currentPresetName,currentAnchor,resolveAnchor,createChatFromRecord,appendToCurrentChat,createCharacterFromProfile,createPersonaFromProfile,currentChatId,currentChat,linked,currentPersona,tokenCounter,connections,
        storage:{async get(){return {sideStory:get().extensionSettings?.st_sidestory||{}};},async patch(value){const c=get();if(!c.extensionSettings||typeof c.saveSettingsDebounced!=='function')throw new Error('실리태번 설정 저장 API를 찾지 못했어요.');c.extensionSettings.st_sidestory=structuredClone(value.sideStory);c.saveSettingsDebounced();}},
        setTimeout:globalThis.setTimeout.bind(globalThis),clearTimeout:globalThis.clearTimeout.bind(globalThis),
        onCleanup(fn){cleanups.push(fn);},cleanup(){for(const fn of cleanups.splice(0))fn();}
    };
}
