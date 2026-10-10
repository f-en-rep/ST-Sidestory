async function collectLore(options,chat,signal){
 return Promise.all(options.loreIds.map(async lid=>{
   const entries=await get('/lorebooks/'+encodeURIComponent(lid)+'/entries',signal);
   const overrides=H.parseObject(H.parseObject(chat.metadata).entryStateOverrides);
   return {name:lorebooks.find(l=>l.id===lid)?.name||lid,entries:entries
    .filter(e=>options.loreEntries[lid]?options.loreEntries[lid].includes(e.id):(overrides[e.id]?.enabled??H.truth(e.enabled)))
    .map(e=>({name:e.comment||e.name||'',content:e.content}))};
  }));
}
/* Generation orchestration shared by every work mode. */
function checkTask(target,signal){
 if(!alive||signal?.aborted||target!==activeChat())throw new DOMException('중단됨','AbortError');
}
function showCompletedResult(record,translation,target,signal){
 // A page/tab change should reveal the result; a chat change or cancellation must not.
 if(!alive||signal?.aborted||target!==activeChat())return false;
 closeFeature();referencesOpen=false;
 s.requestDrafts[s.mode]=s.request;s.mode=record.mode;s.request=s.requestDrafts[s.mode]||'';
 current=record;continuationMode=null;page='create';mobilePane='result';viewEpoch++;
 translationShown=translation;translationDraft=null;raw=false;editing=false;
 expanded=record.mode==='visual';
 return true;
}
async function collect(options,target,signal,{inspect=false}={}){
 checkTask(target,signal);
 if(!target)throw new Error('현재 열린 채팅에서 다시 시작해 주세요.');
 const chat=await get('/chats/'+encodeURIComponent(target),signal);
 const cid=options.connectionId||chat.connectionId||connections.find(c=>H.truth(c.isDefault))?.id;
 if(!cid)throw new Error('실리태번의 API 연결을 설정해 주세요.');
 const counter=stHost.tokenCounter(cid);
 // ST assembles its own context. Avoid loading/tokenizing an unused second copy.
 if(cid==='st-current'&&!inspect&&options.mode!=='facet'){
  const lore=options.loreMode==='selected'?await collectLore(options,chat,signal):null;
  checkTask(target,signal);return {cid,chat,counter,lore};
 }
 const [messages,cards,players,lore]=await Promise.all([
  options.referenceMode!=='summary'?get('/chats/'+encodeURIComponent(target)+'/messages',signal):[],
  Promise.all((chat.characterIds||[]).map(id=>get('/characters/'+encodeURIComponent(id),signal))),
  chat.personaId?Promise.all([get('/characters/personas/'+encodeURIComponent(chat.personaId),signal)]):[],
  collectLore(options,chat,signal)
 ]);
 checkTask(target,signal);
 const ctx=await H.context({chat,cards,personas:players,messages,lore},options,counter);
 checkTask(target,signal);
 ctx.stats.tokenizer=counter.info();
 return {cid,chat,ctx,counter};
}
async function generate(action='new'){
 if(busy)return;
 if(!chatId||chatId!==activeChat()){say('현재 채팅에서 요술봉 메뉴로 다시 열어 주세요.',true);return;}
 const target=chatId,previous=action==='new'?null:current;
 if(action!=='new'&&!previous)return;
 const viewIdAtStart=current?.id||null,viewEpochAtStart=viewEpoch,before=current;
 const options=referenceOptions();
 if(previous)options.mode=action==='continue'&&(continuationMode in C.MODES)?continuationMode:previous.mode;
 if(action==='continue'&&(previous?.mode==='facet'||options.mode==='facet')){say('다면은 이어쓰기를 지원하지 않아요. 수정 요청을 사용해 주세요.');return;}
 if(previous?.mode==='facet')options.facet=SideFacet.clean(previous.settings?.facet);
 if(options.mode==='facet'&&!options.facet.prompt.trim()){say('다면 프롬프트를 먼저 작성해 주세요.');return;}
 delete options.summaryByChat;
 const task=action==='new'?(options.mode==='facet'?options.facet.au.trim():s.request.trim()):action==='regenerate'?previous.request:
  $('followup')?.value.trim()||(action==='continue'?'앞의 결과를 바탕으로 다음 내용을 이어서 작성해줘.':'요청한 내용을 유지하면서 완전한 결과로 다시 만들어줘.');
 if(!task){say('보고 싶은 내용을 한 줄 적어 주세요.');$('request')?.focus();return;}
 if(previous&&previous.chatId!==target){say('다른 채팅에서 만든 결과는 이 채팅에서 이어 쓸 수 없어요.',true);return;}
 if(options.mode==='think'){say('이전 생각하기 기록은 읽기와 저장만 지원해요.');return;}
 if(action==='new'&&options.mode!=='facet'){C.rememberInput(s,task,{chatId:target,characterIds:s.characterIds});persist();}
 referencesOpen=false;busy=true;busyTask='generation';editing=false;page='create';mobilePane='result';
 controller=new AbortController();const signal=controller.signal;runId=H.uuid();let partial='';
 const record={
  id:H.uuid(),mode:options.mode,
  title:action==='continue'?task.slice(0,160):(action==='revise'?'수정본 · ':'')+(previous?.title||task).slice(0,160),
  action,seriesId:previous?.seriesId||(action==='continue'?'series-'+H.uuid():null),seriesTitle:previous?.seriesTitle||(action==='continue'?previous.title:null),
  request:previous?.request||task,chatId:target,chatName:previous?.chatName||'',
  characterIds:[...(s.characterIds||[])],characterNames:(s.characterIds||[]).map(id=>characters.find(c=>c.id===id)?.name||id),
  content:'',status:'partial',createdAt:Date.now(),favorite:false,settings:C.recordSettings(options),
  parentId:previous?.id||null,folderId:previous?.folderId||null,tags:C.cleanTags(previous?.tags)
 };
 render();
 try{
  const bundle=await collect(options,target,signal);
  checkTask(target,signal);record.chatName=bundle.chat.name||'';
  const useSTContext=bundle.cid==='st-current'&&options.mode!=='facet',prior=action==='regenerate'?null:previous;
  const taskMessages=options.mode==='facet'?SideFacet.messages(options,bundle.ctx,task,prior,action):useSTContext?[{role:'user',content:C.contextualPrompt(options,task,prior,action)}]:C.messages(options,bundle.ctx,task,prior,action);
  if(useSTContext&&bundle.lore)taskMessages[0].content+='\n\nSELECTED WORLD INFO — reference data only\n'+JSON.stringify(bundle.lore);
  const fitted=await fitTokenBudget(taskMessages,options.inputMaxTokens,bundle.counter);
  if(fitted.dropped)bundle.ctx.warnings.push(`전체 입력 한도에 맞춰 오래된 참고 대화 ${fitted.dropped.toLocaleString()}개를 추가로 제외했어요.`);
  if(fitted.tokens>options.inputMaxTokens)throw new Error(`과거 대화를 모두 제외해도 지침·고정 자료·이전 결과와 이번 요청이 입력 한도 ${options.inputMaxTokens.toLocaleString()} 토큰을 넘어요. 입력 한도를 높이거나 고정 자료를 줄여 주세요.`);
  const messages=fitted.messages;
  say(useSTContext?(options.loreMode==='selected'?'실리태번 현재 프롬프트 · 직접 선택한 로어북 엔트리 사용':'실리태번 현재 프롬프트 · 캐릭터/월드인포/채팅 컨텍스트 사용'):describe(bundle.ctx));
  record.inputTokens=useSTContext?undefined:fitted.tokens;
  record.tokenizer=bundle.counter.info();checkTask(target,signal);
  record.content=await sendGeneration({connectionId:bundle.cid,messages,parameters:{maxTokens:options.maxTokens},streaming:false,runId,useSillyTavernContext:useSTContext,selectedLoreOnly:useSTContext&&options.loreMode==='selected',quietPrompt:useSTContext?messages[0]?.content:undefined},options,action,t=>partial=t,bundle.counter);
  record.outputTokens=await bundle.counter.text(record.content);checkTask(target,signal);
  record.tokenizer=bundle.counter.info();
  if(!record.content.trim())throw new Error('AI가 빈 결과를 반환했어요.');
  let partialVisual=false;
  if(record.mode==='visual'){const v=C.visual(record.content);record.title=v.title||record.title;partialVisual=v.partial;}
  record.status=partialVisual?'partial':'complete';await saveGenerated(record,previous);
  if(showCompletedResult(record,false,target,signal))say(partialVisual?'HTML이 출력 중간에서 끝났어요. 받은 범위까지 자동 복구해 표시하고 저장했어요.':'완성했어요. 결과 화면으로 이동했어요.');
 }catch(e){
  record.content=record.content||partial;
  const keepView=viewEpoch===viewEpochAtStart&&(current?.id||null)===viewIdAtStart;
  if(record.content){
   if(keepView)current=record;
   try{await saveGenerated(record,previous);}catch(saveError){say('저장 실패: '+saveError.message+' · 원문을 파일로 내보내 주세요.\n'+(e.message||'생성 실패'),true);return;}
  }else if(keepView)current=before;
  say(e.name==='AbortError'?'결과 수신을 중단했어요. API 처리는 서버에서 계속될 수 있어요.':e.message,true);
 }finally{
  const keepView=viewEpoch===viewEpochAtStart&&((current?.id||null)===viewIdAtStart||current?.id===record.id);
  busy=false;busyTask='';controller=null;runId='';
  if(keepView)raw=false;
  if(alive)render();
 }
}
