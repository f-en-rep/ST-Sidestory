import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSTHost} from '../src/st-host.js';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();
const H=new Function('SideExtras',read('transport.js')+';return HostCore;')({tokens:t=>String(t||'').length});

const part=(id,props)=>({id,mode:'story',chatId:'c',createdAt:1,...props});

test('continuation turn: earlier parts with their own requests, full previous part, resume point, request last',()=>{
 const records=[
  part('p1',{action:'new',request:'두 사람이 싸운 이야기',instruction:'두 사람이 싸운 이야기',content:'싸움이 시작됐다.\n\n문이 쾅 닫혔다.',recap:'둘은 크게 싸웠다.'}),
  part('p2',{action:'continue',parentId:'p1',request:'두 사람이 싸운 이야기',instruction:'화해까지',content:'초안'}),
  part('p2b',{action:'revise',parentId:'p2',request:'두 사람이 싸운 이야기',instruction:'더 천천히',content:'며칠이 지났다.\n\n그가 먼저 문을 두드렸다.'})
 ];
 const chain=C.seriesChain(records,records[2]);
 assert.deepEqual(chain.map(r=>r.id),['p1','p2b']);
 const s=C.settings({mode:'story'});
 const text=C.contextualPrompt(s,'그 다음날 아침',chain,'continue');
 assert(text.startsWith('<SIDESTORY>'));assert(text.trim().endsWith('</SIDESTORY>'));
 assert(text.includes('<part n="1">\n싸움이 시작됐다.'));assert(!text.includes('두 사람이 싸운 이야기'));
 assert(text.includes('<previous_part n="2">'));
 assert(text.includes('<resume_point>\n며칠이 지났다.\n\n그가 먼저 문을 두드렸다.\n</resume_point>'));
 assert(text.includes('Part 3 of an ongoing side story'));
 assert(!text.includes('초안'),'superseded draft never reaches the prompt');
 assert(!/standalone episode/i.test(text));
 const order=['<preset_scope>\n','<mode name="story">\n','<timeline>\n','<story_so_far>\n','<previous_part n','<resume_point>\n','<user_request>\n','<task>\n','<output>\n'].map(tag=>text.indexOf(tag));
 assert(order.every((v,i)=>v>=0&&(i===0||v>order[i-1])),'blocks keep their order with the request near the end');
 assert(text.includes('This counts the new part only.'));
});

test('long series falls back to recaps for earlier parts; revise sends the draft with earlier context',()=>{
 const big='가'.repeat(13000);
 const chain=[part('a',{action:'new',instruction:'A',content:big,recap:'RECAP_A'}),part('b',{action:'continue',parentId:'a',instruction:'B',content:'B 본문'}),part('c',{action:'continue',parentId:'b',instruction:'C',content:'C 본문'})];
 const s=C.settings({mode:'story'});
 const cont=C.contextualPrompt(s,'D',chain,'continue');
 assert(cont.includes('RECAP_A'));assert(!cont.includes(big));
 const rev=C.contextualPrompt(s,'고쳐줘',chain,'revise');
 assert(rev.includes('<draft_to_revise>\nC 본문'));assert(rev.includes('<previous_part n="2">'));
 assert(!rev.includes('<resume_point>'));assert(!rev.includes('<timeline>'),'a revision keeps the original timing');
 assert(rev.includes('Revise <draft_to_revise>'));
});

test('new pieces carry the selected timeline only in creative modes; regenerate asks for a fresh attempt',()=>{
 for(const [timeline,text] of Object.entries(C.TIMELINES)){
  assert(C.contextualPrompt(C.settings({mode:'story',timeline}),'X').includes(text));
 }
 assert(!C.contextualPrompt(C.settings({mode:'analysis',timeline:'past'}),'X').includes('<timeline>'));
 assert(C.contextualPrompt(C.settings({mode:'story'}),'X',null,'regenerate').includes('fresh attempt'));
 assert.equal(C.settings({timeline:'bogus'}).timeline,'auto');
});

test('preset scope is editable, removable, and never sent on a separate connection',()=>{
 assert(C.contextualPrompt(C.settings({mode:'story'}),'X').includes(C.PRESET_SCOPE));
 assert(C.contextualPrompt(C.settings({mode:'story',presetScope:'MY SCOPE'}),'X').includes('<preset_scope>\nMY SCOPE\n</preset_scope>'));
 assert(!C.contextualPrompt(C.settings({mode:'story',presetScope:'  '}),'X').includes('<preset_scope>'));
 const rows=C.messages(C.settings({mode:'story'}),{text:'{"dialogue":[]}'},'X');
 assert(!rows[1].content.includes('<preset_scope>'));assert(rows[1].content.includes('<SIDESTORY>'));
});

test('recap is split off generated text; message count accepts free numbers',()=>{
 assert.deepEqual(C.splitRecap('본문\n\n<recap>요약입니다.</recap>'),{content:'본문',recap:'요약입니다.'});
 assert.deepEqual(C.splitRecap('본문만'),{content:'본문만',recap:''});
 assert.equal(C.splitRecap('본문\n<recap>잘림').content,'본문');
 for(const [input,expected] of [['','all'],['all','all'],['0','0'],['25','25'],['abc','all'],[' 7 ','7'],['20','20']])assert.equal(C.settings({scope:input}).scope,expected);
});

test('raw-path context honors a series cutoff, exclusion and a zero count',async()=>{
 const counter={text:async v=>String(v).length};
 const messages=[0,1,2,3,4].map(i=>({id:String(i),role:i%2?'user':'A',content:'M'+i,extra:{}}));
 const base={chat:{metadata:{}},cards:[],personas:[],messages,lore:[]};
 const run=async extra=>JSON.parse((await H.context(base,{...C.settings({}),contextBudget:100000,...extra},counter)).text).dialogue.map(d=>d.text);
 assert.deepEqual(await run({}),['M0','M1','M2','M3','M4']);
 assert.deepEqual(await run({historyCutoff:2}),['M0','M1','M2']);
 assert.deepEqual(await run({historyCutoff:2,scope:'2'}),['M1','M2']);
 assert.deepEqual(await run({scope:'0'}),[]);
 assert.deepEqual(await run({historyExclude:true}),[]);
});

function stContext(){
 const handlers=new Map();
 const c={name1:'유저',chat:[{name:'A',mes:'m0',send_date:'d0'},{name:'유저',mes:'m1',is_user:true,send_date:'d1'},{name:'A',mes:'hidden',is_system:true,send_date:'dh'},{name:'A',mes:'m3',send_date:'d3'},{name:'유저',mes:'m4',is_user:true,send_date:'d4'},{name:'A',mes:'m5',send_date:'d5'}],
  eventTypes:{CHAT_COMPLETION_PROMPT_READY:'ready'},
  eventSource:{on:(k,f)=>handlers.set(k,f),removeListener:k=>handlers.delete(k)},extensionSettings:{}};
 return {c,handlers};
}

test('anchors track the latest visible message and survive index shifts',()=>{
 const {c}=stContext(),host=createSTHost({context:()=>c});
 const anchor=host.currentAnchor();assert.deepEqual(anchor,{index:5,sendDate:'d5',name:'A'});
 c.chat.splice(0,1);assert.equal(host.resolveAnchor(anchor),4);
 c.chat.pop();assert.equal(host.resolveAnchor(anchor),-1);
 host.cleanup();
});

test('ST prompt: squashed quiet prompt is split into a final user turn; history is trimmed only for Side Story',async()=>{
 const {c,handlers}=stContext(),host=createSTHost({context:()=>c});
 const interceptor=globalThis.sideStoryGenerateInterceptor;assert.equal(typeof interceptor,'function');
 const coreChat=()=>c.chat.filter(m=>!m.is_system).map(m=>({...m}));
 // Outside a Side Story generation the interceptor never touches the chat.
 const untouched=coreChat();await interceptor(untouched,0,()=>{},'quiet');assert.equal(untouched.length,5);
 let seenHistory,ready,args;
 c.generateQuietPrompt=async a=>{
  args=a;
  const chat=coreChat();await interceptor(chat,0,()=>{},'quiet');seenHistory=chat.map(m=>m.mes);
  ready={chat:[{role:'system',content:'MAIN'},{role:'user',content:'m4'},{role:'system',content:'POST HISTORY\n'+a.quietPrompt}],dryRun:false};
  handlers.get('ready')?.({chat:[{role:'system',content:'dry'}],dryRun:true});
  handlers.get('ready')(ready);
  return 'RESULT';
 };
 let info;
 const quiet='<SIDESTORY>\nASK\n</SIDESTORY>';
 const out=await host.generate({useSillyTavernContext:true,quietPrompt:quiet,parameters:{maxTokens:10},history:{limit:2,anchor:{index:3,sendDate:'d3',name:'A'},exclude:false},onPromptReady:x=>info=x});
 assert.equal(out,'RESULT');assert.equal(args.quietName,'유저');
 assert.deepEqual(seenHistory,['m1','m3'],'cut at the series anchor, then the last two');
 assert.deepEqual(ready.chat.map(m=>m.role),['system','user','system','user']);
 assert.equal(ready.chat[2].content,'POST HISTORY');assert.equal(ready.chat.at(-1).content,quiet);
 assert.equal(info.messages.at(-1).role,'user');assert.deepEqual(info.history,{before:5,anchor:'applied',after:2});
 assert.equal(handlers.size,0,'listeners are removed after the run');
 // Excluding canon removes every chat message; zero limit does the same.
 for(const history of [{exclude:true},{limit:0}]){
  await host.generate({useSillyTavernContext:true,quietPrompt:quiet,history});assert.deepEqual(seenHistory,[]);
 }
 host.cleanup();assert.equal(globalThis.sideStoryGenerateInterceptor,undefined);
});

test('structure report carries roles, sizes and tag names but no prompt text',()=>{
 const X=new Function(read('extras.js')+';return SideExtras;')();
 const report=X.structureReport({connectionMeta:{api:'openai',source:'claude',model:'m',squash:true,prefillChars:12,promptReadyEvent:true},
  finalPrompt:[{role:'system',content:'<rules>SECRET_TEXT</rules>'},{role:'user',content:'<SIDESTORY>\nSECRET_REQUEST'},{role:'assistant',content:'SECRET_PREFILL'}],
  responseShape:{chars:10,tags:['thinking'],recap:false,startsWithTag:'thinking'}});
 assert(!/SECRET/.test(report));assert(report.includes('#2 user'));assert(report.includes('★SIDESTORY'));assert(report.includes('태그: rules'));
 assert(report.includes('SIDESTORY 뒤에 메시지 1개'));assert(report.includes('source=claude'));
});

test('continuation on the ST path: earlier parts become chat history, final turn is a short request',async()=>{
 const chain=[part('a',{action:'new',instruction:'싸운 이야기',content:'싸웠다.\n\n문이 닫혔다.'}),part('b',{action:'continue',parentId:'a',instruction:'그 다음 날',content:'아침이 왔다.'})];
 const conv=C.nativeTurns(C.settings({mode:'story'}),'화해까지',chain,'continue');
 assert.deepEqual(conv.turns.map(t=>t.role),['user','assistant','user','assistant']);
 assert.equal(conv.turns[0].content,'OOC: Side Story — part 1');assert.equal(conv.turns[3].content,'아침이 왔다.');
 assert(!conv.final.includes('<previous_part'));assert(!conv.final.includes('싸웠다.'),'parts are not repeated in the request');
 assert(conv.final.includes('<resume_point>\n아침이 왔다.'));assert(conv.final.includes('Part 3 of an ongoing side story'));
 assert.equal(C.nativeTurns(C.settings({mode:'story'}),'X',null,'new'),null);
 const rev=C.nativeTurns(C.settings({mode:'story'}),'고쳐줘',chain,'revise');
 assert.equal(rev.turns.at(-1).content,'아침이 왔다.');assert(rev.final.includes('The draft to revise is the last message of the chat history'));

 const {c}=stContext();c.name2='A';const host=createSTHost({context:()=>c});
 let seen;c.generateQuietPrompt=async()=>{const chat=c.chat.filter(m=>!m.is_system).map(m=>({...m}));await globalThis.sideStoryGenerateInterceptor(chat,0,()=>{},'quiet');seen=chat;return 'ok';};
 let info;
 await host.generate({useSillyTavernContext:true,quietPrompt:conv.final,history:{limit:2,anchor:null,exclude:false,append:conv.turns},onPromptReady:x=>info=x});
 assert.deepEqual(seen.map(m=>[!!m.is_user,m.mes]),[[true,'m4'],[false,'m5'],[true,conv.turns[0].content],[false,'싸웠다.\n\n문이 닫혔다.'],[true,conv.turns[2].content],[false,'아침이 왔다.']]);
 assert.equal(seen[3].name,'A');assert.equal(seen[2].name,'유저');assert.equal(info.history.appended,4);
 await host.generate({useSillyTavernContext:true,quietPrompt:conv.final,history:{exclude:true,append:conv.turns}});
 assert.equal(seen.length,4,'series only when the RP is excluded');
 host.cleanup();
});

test('reasoning blocks: built-ins stay (switchable), custom names add, removal handles prefill and truncation',()=>{
 const blocks=C.settings({}).reasoningBlocks;
 assert.deepEqual(blocks.map(b=>[b.name,b.enabled,b.builtin]),[['thinking',true,true],['think',true,true]]);
 const cleaned=C.cleanReasoningBlocks([{name:'think',enabled:false},{name:'<cot>'},{name:'bad name'},{name:'COT'}]);
 assert.deepEqual(cleaned.map(b=>[b.name,b.enabled,b.builtin]),[['thinking',true,true],['think',false,true],['cot',true,false]],'built-ins cannot be removed; duplicates and invalid names drop');
 assert.equal(C.stripReasoning('<thinking>계획</thinking>\n\n본문',blocks),'본문');
 assert.equal(C.stripReasoning('프리필로 시작된 추론\n</thinking>\n본문',blocks),'본문');
 assert.equal(C.stripReasoning('본문\n<think>잘린 추론',blocks),'본문');
 assert.equal(C.stripReasoning('<Thinking mode="x">a</Thinking>본문<think>b</think>끝',blocks),'본문끝');
 assert.equal(C.stripReasoning('<thinking>only</thinking>',blocks),'<thinking>only</thinking>','never empties a result');
 assert.equal(C.stripReasoning('<thinking>a</thinking>본문',cleaned.map(b=>({...b,enabled:false}))),'<thinking>a</thinking>본문');
 assert.equal(C.stripReasoning('<cot>x</cot>본문',cleaned),'본문');
});

test('RP preset: switched only for the Side Story generation, restored on success and failure, sending blocked meanwhile',async()=>{
 const log=[];let selected='main';
 const pm={getAllPresets:()=>['main','side'],getSelectedPresetName:()=>selected,getSelectedPreset:()=>selected,findPreset:n=>['main','side'].includes(n)?n:undefined,selectPreset:async v=>{selected=v;log.push('select:'+v);}};
 const c={getPresetManager:()=>pm,deactivateSendButtons:()=>log.push('block'),activateSendButtons:()=>log.push('unblock'),extensionSettings:{},
  generateQuietPrompt:async()=>{log.push('generate@'+selected);return 'ok';}};
 const host=createSTHost({context:()=>c});
 assert.deepEqual(host.presetNames(),['main','side']);assert.equal(host.currentPresetName(),'main');
 assert.equal(await host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>x',presetName:'side'}),'ok');
 assert.deepEqual(log,['block','select:side','generate@side','select:main','unblock']);
 log.length=0;c.generateQuietPrompt=async()=>{log.push('generate@'+selected);throw new Error('boom');};
 await assert.rejects(host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>x',presetName:'side'}),/boom/);
 assert.equal(selected,'main');assert.deepEqual(log,['block','select:side','generate@side','select:main','unblock']);
 log.length=0;c.generateQuietPrompt=async()=>{log.push('generate@'+selected);return 'ok';};
 await host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>x',presetName:''});assert.deepEqual(log,['generate@main'],'no preset means no switching');
 await assert.rejects(host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>x',presetName:'gone'}),/찾지 못했어요/);assert.equal(selected,'main');
 host.cleanup();
});

test('ST prompt: a request dropped by another prompt rewriter is put back as the last user turn, and our listener runs last',async()=>{
 const {c,handlers}=stContext();let last=false;c.eventSource.makeLast=(k,f)=>{last=true;handlers.set(k,f);};
 const host=createSTHost({context:()=>c});let ready,info;
 c.generateQuietPrompt=async()=>{ready={chat:[{role:'system',content:'MAIN'},{role:'system',content:'HISTORY'},{role:'system',content:'POST'}],dryRun:false};handlers.get('ready')(ready);return 'RESULT';};
 const quiet='<SIDESTORY>\nASK\n</SIDESTORY>';
 await host.generate({useSillyTavernContext:true,quietPrompt:quiet,parameters:{maxTokens:10},onPromptReady:x=>info=x});
 assert.equal(last,true);
 assert.deepEqual(ready.chat.at(-1),{role:'user',content:quiet});
 assert.equal(info.meta.reinserted,true);
 host.cleanup();
});

test('ST prompt: chat history dropped by another prompt rewriter is put back right before the request',async()=>{
 const {c,handlers}=stContext();c.chat=[{name:'A',mes:'첫 번째 대사가 여기에 길게 들어가 있어요',send_date:'d0'},{name:'유저',mes:'두 번째 대사도 충분히 길게 적어 둡니다',is_user:true,send_date:'d1'}];
 const host=createSTHost({context:()=>c});let ready,info;
 c.generateQuietPrompt=async a=>{const chat=c.chat.map(m=>({...m}));await globalThis.sideStoryGenerateInterceptor(chat,0,()=>{},'quiet');ready={chat:[{role:'system',content:'MAIN'},{role:'system',content:'POST\n'+a.quietPrompt}],dryRun:false};handlers.get('ready')(ready);return 'RESULT';};
 const quiet='<SIDESTORY>\nASK\n</SIDESTORY>';
 await host.generate({useSillyTavernContext:true,quietPrompt:quiet,parameters:{maxTokens:10},history:{limit:null,anchor:null,exclude:false},onPromptReady:x=>info=x});
 assert.deepEqual(ready.chat.map(m=>m.role),['system','system','assistant','user','user']);
 assert.equal(ready.chat.at(-1).content,quiet);assert.equal(info.meta.historyRestored,2);
 // When the history is present, nothing is added.
 c.generateQuietPrompt=async a=>{const chat=c.chat.map(m=>({...m}));await globalThis.sideStoryGenerateInterceptor(chat,0,()=>{},'quiet');ready={chat:[{role:'system',content:'MAIN'},...chat.map(m=>({role:m.is_user?'user':'assistant',content:m.mes})),{role:'system',content:a.quietPrompt}],dryRun:false};handlers.get('ready')(ready);return 'RESULT';};
 await host.generate({useSillyTavernContext:true,quietPrompt:quiet,parameters:{maxTokens:10},history:{limit:null,anchor:null,exclude:false},onPromptReady:x=>info=x});
 assert.equal(ready.chat.length,4);assert.equal(info.meta.historyRestored,undefined);
 host.cleanup();
});

test('ST prompt: the context is widened by the extra reply length only while generating',async()=>{
 const {c}=stContext();c.mainApi='openai';c.chatCompletionSettings={openai_max_context:64000,openai_max_tokens:5000};
 const host=createSTHost({context:()=>c});let during,info;
 c.generateQuietPrompt=async()=>{during=c.chatCompletionSettings.openai_max_context;return 'RESULT';};
 await host.generate({useSillyTavernContext:true,quietPrompt:'<SIDESTORY>\nASK\n</SIDESTORY>',parameters:{maxTokens:30000},onPromptReady:x=>info=x});
 assert.equal(during,89000);assert.equal(c.chatCompletionSettings.openai_max_context,64000);
 assert.equal(info.meta.contextWidened,25000);assert.equal(info.meta.contextSize,64000);
 host.cleanup();
});
