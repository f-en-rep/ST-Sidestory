import test from 'node:test';
import assert from 'node:assert/strict';
import {createSTHost} from '../src/st-host.js';
function fixture() {
 const c={chatId:'shared-title',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:'Card',extensions:{world:'Book'}}},{avatar:'b.png',name:'B',data:{name:'B'}}],chat:[{mes:'hello',name:'A',is_user:false},{mes:'private system',is_system:true},{mes:'reply',name:'User',is_user:true}],chatMetadata:{},powerUserSettings:{personas:{'user.png':'User'},persona_descriptions:{'user.png':{description:'Player'}}},name1:'User',extensionSettings:{},saveSettingsDebounced(){c.saved=true;},generateRaw:async args=>{c.args=args;return 'result';}};
 const world={world_names:['Book'],selected_world_info:[],loadWorldInfo:async()=>({entries:{0:{uid:0,comment:'Enabled',content:'World',disable:false},1:{uid:1,content:'Disabled',disable:true}}})};
 return {c,h:createSTHost({context:()=>c,world}),world};
}
test('read-only current chat, cards, persona and linked world data',async()=>{
 const {c,h}=fixture(),before=JSON.stringify(c.chat),id=h.currentChatId();
 const chat=await h.request('/chats/'+encodeURIComponent(id));assert.deepEqual(chat.characterIds,['a.png']);assert.deepEqual(chat.metadata.activeLorebookIds,['Book']);
 const msgs=await h.request('/chats/'+encodeURIComponent(id)+'/messages');assert.equal(msgs.length,2);assert.equal(msgs[0].role,'A');assert.equal(msgs[1].role,'user');assert.equal(JSON.stringify(c.chat),before);
 assert.equal((await h.request('/characters/personas/user.png')).data.description,'Player');
 const entries=await h.request('/lorebooks/Book/entries');assert.deepEqual(entries.map(x=>[x.id,x.enabled]),[['0',true],['1',false]]);
});
test('same chat title on another character cannot leak into old regeneration',async()=>{const {c,h}=fixture();const id=h.currentChatId();c.characterId=1;assert.notEqual(h.currentChatId(),id);await assert.rejects(h.request('/chats/'+encodeURIComponent(id)),/참고 채팅이 바뀌/);});
test('settings saved through host and raw generation preserves prompt roles and requested length',async()=>{const {c,h}=fixture();await h.storage.patch({sideStory:{request:'q'}});assert.equal(c.saved,true);const payload={messages:[{role:'system',content:'System'},{role:'user',content:'Request'}],parameters:{maxTokens:20000}};assert.equal(await h.generate(payload,new AbortController().signal),'result');assert.deepEqual(c.args.prompt,payload.messages);assert.equal(c.args.responseLength,20000);assert.equal(c.args.trimNames,false);});
test('cancel discards late result and keeps pending-call lock until request finishes',async()=>{const {c,h}=fixture();let finish;c.generateRaw=()=>new Promise(r=>finish=r);const ctrl=new AbortController(),payload={messages:[]};const task=h.generate(payload,ctrl.signal);await Promise.resolve();ctrl.abort();await assert.rejects(task,{name:'AbortError'});await assert.rejects(h.generate(payload),/이전 API/);finish('late output');await Promise.resolve();await Promise.resolve();c.generateRaw=async()=> 'next';assert.equal(await h.generate(payload),'next');});
test('already aborted requests and host failures do not send/retry silently',async()=>{const {c,h}=fixture();const ctrl=new AbortController();ctrl.abort();await assert.rejects(h.generate({messages:[]},ctrl.signal),{name:'AbortError'});assert.equal(c.args,undefined);c.generateRaw=async()=>{throw new Error('provider failure');};await assert.rejects(h.generate({messages:[]}),/provider failure/);});
test('group reference uses only group members',async()=>{const {c,h}=fixture();c.groupId='group';c.groups=[{id:'group',members:['b.png']}];assert.deepEqual(h.linked(),['b.png']);});
test('connection profiles are listed and dispatch generation with selected profile, limit and cancellation signal',async()=>{
 const {c}=fixture();const sent=[];
 c.extensionSettings.connectionManager={selectedProfile:'p1',profiles:[{id:'p1',name:'Writing',model:'model-a',api:'test'},{id:'p2',name:'Translation',model:'model-b',api:'test'}]};
 c.ConnectionManagerRequestService={isProfileSupported:()=>true,sendRequest:async(...args)=>{sent.push(args);return {content:'profile result'};}};
 const h=createSTHost({context:()=>c});assert.deepEqual((await h.request('/connections')).map(x=>x.id),['st-current','p1','p2']);
 const controller=new AbortController();assert.equal(await h.generate({connectionId:'p2',messages:[{role:'user',content:'translate'}],parameters:{maxTokens:2345}},controller.signal),'profile result');
 assert.equal(sent[0][0],'p2');assert.equal(sent[0][2],2345);assert.equal(sent[0][3].signal,controller.signal);assert.equal(sent[0][3].includePreset,true);assert.equal(c.args,undefined);assert.equal(c.extensionSettings.connectionManager.selectedProfile,'p1');
 await assert.rejects(h.generate({connectionId:'deleted',messages:[]}),/연결 프로필/);
});
test('profile transport receives abort and rejected profile calls never fall back to another model',async()=>{
 const {c}=fixture();let aborted=false;
 c.extensionSettings.connectionManager={profiles:[{id:'p',api:'test'}]};c.ConnectionManagerRequestService={isProfileSupported:()=>true,sendRequest:async(id,prompt,n,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('stop','AbortError'));}))};
 const h=createSTHost({context:()=>c}),ctrl=new AbortController();const job=h.generate({connectionId:'p',messages:[]},ctrl.signal);await Promise.resolve();ctrl.abort();await assert.rejects(job,{name:'AbortError'});assert(aborted);assert.equal(c.args,undefined);
});
test('token counter calls ST API, memoizes repeated text and discloses model mismatch/fallback',async()=>{
 const {c}=fixture();let calls=0;c.getTokenCountAsync=async()=>{calls++;return 17;};c.getTokenizerModel=()=> 'tokenizer-a';c.extensionSettings.connectionManager={selectedProfile:'p1'};
 const h=createSTHost({context:()=>c}),counter=h.tokenCounter('p2');assert.equal(await counter.text('한국어'),17);assert.equal(await counter.text('한국어'),17);assert.equal(calls,1);assert.equal(counter.info().source,'sillytavern');assert.equal(counter.info().profileMatched,false);assert.equal(await counter.messages([{role:'user',content:'한국어'}]),28);
 c.getTokenCountAsync=async()=>{throw new Error('unavailable');};const fallback=h.tokenCounter();assert((await fallback.text('한국어'))>0);assert.equal(fallback.info().source,'estimate');
});
test('duplicate character names are resolved by current avatar ID, not first name match',async()=>{const {c,h}=fixture();c.characters.forEach(x=>{x.name='Same';x.data.name='Same';});c.characterId=1;assert.deepEqual((await h.request('/characters')).map(x=>x.id),['b.png']);});
test('input fitting uses provided tokenizer, keeps fixed reference fields and trims oldest dialogue only',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../src/token-budget.js',import.meta.url),'utf8');const fit=new Function(source+';return fitTokenBudget;')();
 const rows=[{role:'system',content:'FIXED'},{role:'user',content:JSON.stringify({reference:{characters:['KEEP'],dialogue:[{text:'OLD'.repeat(30)},{text:'NEW'}]},request:'KEEP_REQUEST'})}];
 const before=JSON.stringify(rows),counter={messages:async m=>m.reduce((n,x)=>n+x.content.length,0)};
 const result=await fit(rows,140,counter);assert(result.tokens<=140);assert.equal(result.dropped,1);assert.equal(result.messages[0].content,'FIXED');const data=JSON.parse(result.messages[1].content);assert.deepEqual(data.reference.characters,['KEEP']);assert.equal(data.reference.dialogue[0].text,'NEW');assert.equal(data.request,'KEEP_REQUEST');assert.equal(JSON.stringify(rows),before);
});
test('additional character World Info books follow avatar filename, not display name',async()=>{
 const {c,h,world}=fixture();c.characters[1].data.name='A';world.world_names=['Book','ExtraA','ExtraB'];world.world_info={charLore:[{name:'a',extraBooks:['ExtraA']},{name:'b',extraBooks:['ExtraB']}]};
 assert.deepEqual(h.currentChat().metadata.activeLorebookIds,['Book','ExtraA']);c.characterId=1;assert.deepEqual(h.currentChat().metadata.activeLorebookIds,['ExtraB']);
});
test('shallow character is hydrated through ST before using reference data; switching chat discards pending hydration',async()=>{
 const {c,h}=fixture();c.characters[0].shallow=true;c.unshallowCharacter=async i=>{c.characters[i].data.description='FULL_CARD';c.characters[i].shallow=false;};assert.equal((await h.request('/characters'))[0].data.description,'FULL_CARD');
 c.characters[0].shallow=true;let finish;c.unshallowCharacter=()=>new Promise(r=>finish=r);const pending=h.request('/characters');c.characterId=1;finish();await assert.rejects(pending,{name:'AbortError'});
});
