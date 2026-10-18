async function collectLore(options,chat,signal){
 const overrides=H.parseObject(H.parseObject(chat.metadata).entryStateOverrides);
 return Promise.all(options.loreIds.map(async lid=>{
   const entries=await get('/lorebooks/'+encodeURIComponent(lid)+'/entries',signal);
   return {name:lorebooks.find(l=>l.id===lid)?.name||lid,entries:entries
    .filter(e=>options.loreEntries[lid]?options.loreEntries[lid].includes(e.id):(overrides[e.id]?.enabled??H.truth(e.enabled)))
    .filter(e=>typeof options.loreScan!=='string'||C.loreActive(e,options.loreScan))
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
 closeFeature();
 s.requestDrafts[s.mode]=s.request;s.mode=record.mode;s.request=s.requestDrafts[s.mode]||'';
 current=record;if(record.mode==='facet')s.facetWorkspace=record.facetPhase==='plan'?'identity':'au';continuationMode=null;continuationKnobs=null;page='create';mobilePane='result';viewEpoch++;
 translationShown=translation;translationDraft=null;raw=false;editing=false;
 return true;
}
async function collect(options,target,signal,{inspect=false,approvedFacetPlan=false}={}){
 checkTask(target,signal);
 if(!target)throw new Error('현재 열린 채팅에서 다시 시작해 주세요.');
 const chat=await get('/chats/'+encodeURIComponent(target),signal);
 const cid=options.connectionId||chat.connectionId||connections.find(c=>H.truth(c.isDefault))?.id;
 if(!cid)throw new Error('실리태번의 API 연결을 설정해 주세요.');
 const counter=stHost.tokenCounter(cid);
 // Approved Facet plans already contain everything required for writing or revising.
 // Do not re-fetch cards, chat messages, personas or lore just to render an approved design.
 if(approvedFacetPlan){checkTask(target,signal);return {cid,chat,counter};}
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
async function collectFacetOriginalProfiles(options,chat,signal){
 const f=SideFacet.clean(options.facet);
 if(options.mode!=='facet'||f.degree!=='preserve')return [];
 const kinds=f.target==='both'?['character','user']:[f.target];
 // When preserving the original relationship, the counterpart sheet may provide facts
 // even if the user asks to generate just one final profile.
 if(f.relation==='original'){
  if((options.characterIds?.[0]||chat.characterIds?.[0])&&!kinds.includes('character'))kinds.push('character');
  if((options.personaIds?.[0]||chat.personaId)&&!kinds.includes('user'))kinds.push('user');
 }
 return Promise.all(kinds.map(async kind=>{
  const id=kind==='character'?String(options.characterIds?.[0]||chat.characterIds?.[0]||''):
   String(options.personaIds?.[0]||'').replace(/^persona:/,'')||String(chat.personaId||'');
  if(!id)throw new Error((kind==='user'?'페르소나':'캐릭터')+' 원본을 찾지 못했어요. 원본 기반 재구성을 진행할 수 없어요.');
  const card=await get(kind==='character'?'/characters/'+encodeURIComponent(id):'/characters/personas/'+encodeURIComponent(id),signal);
  const data=card?.data&&typeof card.data==='object'?card.data:card||{};
  const profile={kind,name:String(data.name||data.ch_name||card?.name||'').slice(0,180)};
  for(const key of ['description','personality','scenario','mes_example']){
   const v=data[key]??card?.[key];
   if(typeof v==='string'&&v.trim())profile[key]=v.trim();
  }
  if(!['description','personality','scenario','mes_example'].some(k=>profile[k]))
   throw new Error((kind==='user'?'페르소나':'캐릭터')+' 원본 시트가 비어 있어요. 원본 기반 재구성을 위해 시트를 확인해 주세요.');
  return profile;
 }));
}

async function collectFacetRelationshipEvidence(options,chat,target,signal,counter){
 const f=SideFacet.clean(options.facet);
 if(options.mode!=='facet'||f.degree!=='preserve'||f.relation!=='original')return null;
 const budget=Math.max(800,Math.min(11000,Math.floor((options.contextBudget||24000)*0.5),Math.floor((options.inputMaxTokens||64000)*0.38)));
 const metadata=H.parseObject(chat.metadata),summary=[];
 const evidence={chat:String(chat.name||'').slice(0,160),summary,dialogue:[]};
 const candidates=[metadata.summary,chat.summary,options.manualSummary].filter(v=>typeof v==='string'&&v.trim());
 // Chat summaries supply long-term context even when specific early dialogue is no longer in the selection.
 for(const value of [...new Set(candidates.map(v=>v.trim()))]){
  let excerpt=value.slice(0,18000);
  while(excerpt.length>200&&await counter.text(JSON.stringify({...evidence,summary:[...summary,excerpt]}))>budget*0.55)excerpt=excerpt.slice(0,Math.floor(excerpt.length*.78));
  if(await counter.text(JSON.stringify({...evidence,summary:[...summary,excerpt]}))<=budget*0.6)summary.push(excerpt);
 }
 let messages=[];
 try {
  const got=await get('/chats/'+encodeURIComponent(target)+'/messages',signal);
  messages=Array.isArray(got)?got:Array.isArray(got?.messages)?got.messages:[];
 }catch(error){
  if(signal?.aborted||error?.name==='AbortError')throw error;
  return summary.length?evidence:null;
 }
 checkTask(target,signal);
 let eligible=messages.filter(m=>m&&m.role!=='system'&&!H.truth(H.parseObject(m.extra).hiddenFromAI)&&!H.truth(H.parseObject(m.extra).hiddenFromUser));
 let boundary=-1;eligible.forEach((m,i)=>{if(H.truth(H.parseObject(m.extra).isConversationStart))boundary=i;});
 if(boundary>=0)eligible=eligible.slice(boundary);
 // Reserve room for the beginning of the relationship as well as recent progression.
 const first=eligible.slice(0,Math.min(16,eligible.length));
 const tail=eligible.slice(Math.max(first.length,eligible.length-105));
 const convert=m=>({speaker:m.role==='user'?'PC':String(characters.find(x=>x.id===m.characterId)?.name||m.role||'캐릭터').slice(0,100),text:String(m.content||'').trim().slice(0,1800)});
 const selected=[];
 for(const m of first){
  const entry=convert(m);if(!entry.text)continue;
  if(await counter.text(JSON.stringify({...evidence,dialogue:[...selected,entry]}))>budget*0.45)break;
  selected.push(entry);
 }
 // Include recent exchanges, trimming the oldest first when the budget is full.
 const recent=[];
 for(let i=tail.length-1;i>=0;i--){
  const entry=convert(tail[i]);if(!entry.text)continue;
  if(await counter.text(JSON.stringify({...evidence,dialogue:[...selected,entry,...recent]}))>budget)continue;
  recent.unshift(entry);
 }
 evidence.dialogue=[...selected,...recent];
 return summary.length||evidence.dialogue.length?evidence:null;
}

async function generate(action='new'){
 if(busy)return;
 if(action==='facet-approve'){const source=current;await saveFacetIdentity();if(current?.id!==source?.id)return;}
 if(!chatId||chatId!==activeChat()){say('현재 채팅에서 요술봉 메뉴로 다시 열어 주세요.',true);return;}
 const extract=action==='facet-extract',target=chatId,previous=action==='new'||extract?null:current;
 if(action!=='new'&&!extract&&!previous)return;
 const viewIdAtStart=current?.id||null,viewEpochAtStart=viewEpoch,before=current;
 const options=referenceOptions();if(extract){options.mode='facet';options.facet.target=s.facetIdentityTarget;options.facet.relation=s.facetIdentityRelation;}
 if(previous)options.mode=action==='continue'&&(continuationMode in C.MODES)?continuationMode:previous.mode;
 if(action==='continue'){const knobs=continueKnobValues(options.mode);if(knobs)for(const k of CONTINUE_KNOBS[options.mode==='think'?'speak':options.mode])options[k]=knobs[k];}
 if(action==='continue'&&(previous?.mode==='facet'||options.mode==='facet')){say('다면은 이어쓰기를 지원하지 않아요. 수정 요청을 사용해 주세요.');return;}
 if(previous?.mode==='facet')options.facet=SideFacet.clean(previous.settings?.facet);
 if(options.mode==='facet'&&!extract&&!options.facet.prompt.trim()){say('다면 프롬프트를 먼저 작성해 주세요.');return;}
 if(options.mode==='facet'&&!extract&&options.facet.relation==='custom'&&!options.facet.relationInput.trim()){say('새 관계 조건을 입력해 주세요.');return;}
 delete options.summaryByChat;
 // Regular modes: a regenerate re-runs the record's own action (continue/revise) against the same parent.
 const regular=options.mode!=='facet'&&!extract&&!['facet-replan','facet-approve'].includes(action);
 let baseAction=action,parent=null,source=previous;
 if(regular&&action==='regenerate'){
  // A manual edit has no request of its own: regenerate what it was edited from.
  for(let guard=0;source?.action==='edit'&&guard<50;guard++)source=records.find(r=>r.id===source.parentId)||null;
  source=source||previous;
  baseAction=source.action==='regenerate'?(source.baseAction||'new'):['continue','revise'].includes(source.action)?source.action:'new';
  parent=source.parentId?records.find(r=>r.id===source.parentId):null;
  if(baseAction!=='new'&&!parent)baseAction='new';
 }
 const legacyInstruction=r=>r?.instruction??(r?.action==='continue'?r.title:r?.request);
 const task=extract?'원본 핵심정보 추출':action==='new'?(options.mode==='facet'?options.facet.au.trim():s.request.trim()):regular&&action==='regenerate'?legacyInstruction(source)+(rewriteNote.trim()?'\n\n추가로 반영할 점: '+rewriteNote.trim():''):['regenerate','facet-replan','facet-approve'].includes(action)?previous.request:
  followupText(action)||(action==='continue'?'앞의 결과를 바탕으로 다음 내용을 이어서 작성해줘.':'요청한 내용을 유지하면서 완전한 결과로 다시 만들어줘.');
 if(!task){say('보고 싶은 내용을 한 줄 적어 주세요.');$('request')?.focus();return;}
 if(previous&&previous.chatId!==target){say('다른 채팅에서 만든 아티클은 이 채팅에서 이어 쓸 수 없어요.',true);return;}
 if(options.mode==='think'){say('이전 생각하기 기록은 읽기와 저장만 지원해요.');return;}
 if(action==='new'&&options.mode!=='facet'){C.rememberInput(s,task,{chatId:target,characterIds:s.characterIds});persist();}
 let selectedIdentity=null;
 if(options.mode==='facet'&&action==='new'){
  try{selectedIdentity=facetSourcePlan(options.facet.target,options.facet.relation);}
  catch(e){s.facetIdentityTarget=options.facet.target;switchFacetWorkspace('identity');say(e.message,true);return;}
 }
 // Series canon: which RP history a part may see. New pieces start from the chat as it is now.
 const canon=action==='continue'?(continueCanonValue()?'include':'exclude'):(previous?.canon||'include');
 const anchor=action==='new'?(stHost.currentAnchor?.()||null):(previous?.anchor||null);
 const priorChain=!regular?null:action==='continue'||action==='revise'?C.seriesChain(records,previous):action==='regenerate'&&baseAction!=='new'?C.seriesChain(records,parent):null;
 if(regular){
  options.historyExclude=canon==='exclude';
  if(action!=='new'&&anchor){const cut=stHost.resolveAnchor?.(anchor);options.historyCutoff=Number.isInteger(cut)&&cut>=0?cut:undefined;}
 }
 // Directly chosen lore: constant entries always, keyword entries only when the request or the last few messages mention them.
 if(options.loreMode==='selected'&&options.loreKeywordScan){
  const depth=options.loreScanDepth,recent=priorChain&&['continue','revise'].includes(action)?priorChain.slice(-depth).map(r=>C.plainText(r)):(()=>{const rows=(SillyTavern.getContext().chat||[]).filter(m=>m&&!m.is_system);const cut=Number.isInteger(options.historyCutoff)?options.historyCutoff:null;return (cut===null?rows:rows.slice(0,cut+1)).slice(-depth).map(m=>String(m.mes||''));})();
  options.loreScan=[task,...recent].join('\n');
 }
 busy=true;busyTask='generation';editing=false;page='create';mobilePane='result';
 controller=new AbortController();const signal=controller.signal;runId=H.uuid();let partial='';
 const record={
  id:action==='facet-replan'?previous.id:H.uuid(),mode:options.mode,
  title:action==='continue'?task.slice(0,160):(action==='revise'?'수정본 · ':'')+(action==='facet-approve'?task:previous?.title||task).slice(0,160),
  action:action==='facet-replan'?'regenerate':action==='facet-approve'?'new':action,seriesId:previous?.seriesId||(action==='continue'?'series-'+H.uuid():null),seriesTitle:previous?.seriesTitle||(action==='continue'?previous.title:null),
  request:previous?.request||task,chatId:target,chatName:previous?.chatName||'',
  characterIds:[...(s.characterIds||[])],characterNames:(s.characterIds||[]).map(id=>characters.find(c=>c.id===id)?.name||id),
  instruction:extract?undefined:task,canon:regular?canon:undefined,anchor:regular?anchor||undefined:undefined,baseAction:regular&&action==='regenerate'?baseAction:undefined,
  content:'',status:'partial',createdAt:Date.now(),favorite:false,settings:C.recordSettings(options),
  parentId:action==='facet-replan'?previous?.parentId||null:previous?.id||null,folderId:previous?.folderId||null,tags:C.cleanTags(previous?.tags)
 };
 render();
 try{
  if(['facet-replan','facet-approve'].includes(action)&&(!previous||previous.mode!=='facet'||(action==='facet-approve'&&previous.facetPhase!=='plan')))throw new Error('확인할 추출 정보가 없어요. 먼저 인물 정보를 추출해 주세요.');
  const useApprovedFacetPlan=options.mode==='facet'&&(!!selectedIdentity||!!previous?.facetPlan&&!['new','facet-replan','facet-extract'].includes(action));
  const bundle=await collect(options,target,signal,{approvedFacetPlan:useApprovedFacetPlan});
  checkTask(target,signal);record.chatName=bundle.chat.name||'';
  if(options.mode==='facet'&&!useApprovedFacetPlan){
   const selected=SideFacet.clean(options.facet).target,refs=JSON.parse(bundle.ctx.text);
   if(selected!=='user'&&!(refs.characters||[]).length)throw new Error('AU 대상으로 사용할 캐릭터 카드가 없어요. 현재 채팅에서 캐릭터를 확인해 주세요.');
   if(selected!=='character'&&!(refs.players||[]).length)throw new Error('AU 대상으로 사용할 유저 페르소나가 없어요. 현재 채팅에서 페르소나를 선택해 주세요.');
  }
  const useSTContext=bundle.cid==='st-current'&&options.mode!=='facet',prior=regular?priorChain:action==='regenerate'?null:previous;
  let fitted,messages;
  if(options.mode==='facet'){
   const facet=SideFacet.clean(options.facet);
   const previousPlan=previous?.mode==='facet'&&previous.facetPlan?previous.facetPlan:null;
   let plan,planningInput=0,planText='';
   if(selectedIdentity){plan=selectedIdentity;}else if(previousPlan&&action!=='new'&&action!=='facet-replan'&&!extract){
    plan=SideFacet.parsePlan(JSON.stringify(previousPlan),facet.target);
   }else{
    busyTask='facet-plan';if(alive)render();say('1/2 · 원본에서 인물 정보만 추출하고 있어요.');
    const review=action==='facet-replan'?{previousPlan,feedback:String(previous?.facetReviewDraft||'').trim()}:undefined;
    const planRows=SideFacet.planMessages(options,bundle.ctx,task,review);
    const planFit=await fitTokenBudget(planRows,options.inputMaxTokens,bundle.counter);
    if(planFit.tokens>options.inputMaxTokens)throw new Error('인물 추출 참고 자료가 입력 한도를 넘어요. 참고 범위나 고정 자료를 줄여 주세요.');
    planningInput=planFit.tokens;checkTask(target,signal);
    // Thinking counts toward output caps; a small safety margin prevents truncation.
    // The plan prompt requests concise JSON, and failures NEVER trigger a billable automatic retry.
    const planMaxTokens=8500;
    planText=await sendGeneration({connectionId:bundle.cid,messages:planFit.messages,parameters:{maxTokens:planMaxTokens},streaming:false,runId:runId+'-au-plan',useSillyTavernContext:false},options,'다면 · 인물 추출',()=>{},bundle.counter);
    checkTask(target,signal);planText=C.stripReasoning(planText,options.reasoningBlocks);
    try{plan=SideIdentity.parse(SideFacet.readPlanJSON(planText),facet.target,facet.relation);}
    catch(error){throw new Error(error.message+' 자동 재호출은 비용 때문에 하지 않았어요. 필요할 때 직접 다시 생성해 주세요.');}
   }
   record.facetPlan=plan;
   if(extract||action==='facet-replan'){
    record.facetPhase='plan';record.content=SideIdentity.markdown(plan);record.status='complete';record.facetReviewDraft='';record.title=('인물 추출 · '+(plan.subjects||[]).map(p=>p.name).join(' · ')).slice(0,180);
    record.outputTokens=await bundle.counter.text(planText);
    record.inputTokens=planningInput;record.tokenizer=bundle.counter.info();checkTask(target,signal);
    await saveGenerated(record,previous);
    facetIdentityDrafts.delete(record.id);facetIdentityEditors.delete(record.id);
    if(showCompletedResult(record,false,target,signal))say('핵심정보를 저장했어요. 수정한 뒤 AU 생성에서 재사용할 수 있어요.');
    return;
   }
   record.facetPhase='written';
   busyTask='facet-write';if(alive)render();say('2/2 · 승인한 정보로 새로운 AU 프로필을 작성하고 있어요.');
   const sourceProfiles=facet.degree==='preserve'?await collectFacetOriginalProfiles(options,bundle.chat,signal):null;
   // Approved identity extraction stays profile-only. Relationship history is read only
   // for source-focused AU writing when the original relationship was requested.
   const relationshipEvidence=await collectFacetRelationshipEvidence(options,bundle.chat,target,signal,bundle.counter);
   checkTask(target,signal);
   const writeRows=SideFacet.writeMessages(options,plan,task,prior,action,sourceProfiles,relationshipEvidence);
   fitted=await fitTokenBudget(writeRows,options.inputMaxTokens,bundle.counter);
   if(fitted.tokens>options.inputMaxTokens)throw new Error('승인한 정보와 이전 결과가 입력 한도를 넘어요. 입력 한도를 높이거나 이전 내용을 줄여 주세요.');
   record.inputTokens=planningInput+fitted.tokens;
  }else{
   const extra={lore:useSTContext?bundle.lore:null,regen:action==='regenerate'};
   const taskMessages=useSTContext?[{role:'user',content:C.contextualPrompt(options,task,prior,baseAction,extra)}]:C.messages(options,bundle.ctx,task,prior,baseAction,extra);
   taskMessages.push(...C.auxiliaryTurns(options,options.mode));
   fitted=await fitTokenBudget(taskMessages,options.inputMaxTokens,bundle.counter);
   if(fitted.dropped)bundle.ctx.warnings.push('전체 입력 한도에 맞춰 오래된 참고 대화 '+fitted.dropped.toLocaleString()+'개를 추가로 제외했어요.');
   if(fitted.tokens>options.inputMaxTokens)throw new Error('과거 대화를 제외해도 전체 입력이 한도를 넘어요. 입력 한도를 높이거나 고정 자료를 줄여 주세요.');
   record.inputTokens=useSTContext?undefined:fitted.tokens;
  }
  messages=fitted.messages;
  if(options.mode!=='facet')say(useSTContext?(options.loreMode==='selected'?'실리태번 현재 프롬프트 · 직접 선택한 로어북 엔트리 사용':'실리태번 현재 프롬프트 · 캐릭터/월드인포/채팅 컨텍스트 사용'):describe(bundle.ctx));
  record.tokenizer=bundle.counter.info();checkTask(target,signal);
  // ST path, continue/revise: earlier parts join the chat history itself (after the RP up to the series anchor),
  // and the final user turn is only the short request.
  const nativeConversation=useSTContext?C.nativeTurns(options,task,prior,baseAction,{lore:bundle.lore,regen:action==='regenerate'}):null;
  const history=useSTContext?{limit:options.scope==='all'?null:Number(options.scope),anchor:action!=='new'?anchor:null,exclude:options.historyExclude===true,append:nativeConversation?.turns||null}:undefined;
  let historyReport=null;
  record.content=await sendGeneration({connectionId:bundle.cid,messages,parameters:{maxTokens:options.maxTokens},streaming:false,runId,useSillyTavernContext:useSTContext,selectedLoreOnly:useSTContext&&options.loreMode==='selected',quietPrompt:useSTContext?(nativeConversation?nativeConversation.final:messages[0]?.content):undefined,auxiliaryTurns:options.mode!=='facet'?C.auxiliaryTurns(options,options.mode):[],marker:C.MARKER,history,presetName:useSTContext?options.stPreset||'':undefined,onHistory:r=>historyReport=r},options,options.mode==='facet'?'다면 · AU 프로필 작성':action,t=>partial=t,bundle.counter);
  record.content=C.stripReasoning(record.content,options.reasoningBlocks);
  if(C.RECAP_MODES.has(record.mode)){const split=C.splitRecap(record.content);record.content=split.content;if(split.recap)record.recap=split.recap;}
  record.outputTokens=await bundle.counter.text(record.content);checkTask(target,signal);
  record.tokenizer=bundle.counter.info();
  if(!record.content.trim())throw new Error('AI가 빈 결과를 반환했어요.');
  let partialVisual=false;
  if(record.mode==='visual'){const v=C.visual(record.content);record.title=v.title||record.title;partialVisual=v.partial;}
  record.status=partialVisual?'partial':'complete';await saveGenerated(record,previous);
  const anchorLost=action!=='new'&&anchor&&(useSTContext?historyReport?.anchor==='missing':options.historyCutoff===undefined)&&canon!=='exclude';
  if(showCompletedResult(record,false,target,signal))say(anchorLost?'완성했어요. 다만 시리즈 기준 메시지를 본편에서 찾지 못해(삭제·수정) 현재 본편 전체를 참고했어요.':partialVisual?'HTML이 출력 중간에서 끝났어요. 받은 범위까지 자동 복구해 표시하고 저장했어요.':'완성했어요. 아티클 화면으로 이동했어요.');
 }catch(e){
  record.content=record.content||partial;
  if(record.content)record.content=C.stripReasoning(record.content,options.reasoningBlocks);
  if(C.RECAP_MODES.has(record.mode)&&record.content){const split=C.splitRecap(record.content);record.content=split.content;if(split.recap)record.recap=split.recap;}
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
