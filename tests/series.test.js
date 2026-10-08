import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const series=new Function(read('series.js')+';return SideSeries;')();
const C=new Function(read('replacement.js')+read('core.js')+';return SideCore;')();
test('mixed-mode siblings stay in one series; missing parents and cyclic imports remain navigable',()=>{
 const rows=[{id:'a',seriesId:'s',createdAt:1},{id:'b',seriesId:'s',parentId:'a',createdAt:2},{id:'c',seriesId:'s',parentId:'b',mode:'story',createdAt:3},{id:'d',seriesId:'s',parentId:'b',mode:'visual',createdAt:4}];
 assert.equal(series.groups(rows).length,1);assert.deepEqual(series.ordered(rows).map(x=>[x.record.id,x.depth]),[['a',0],['b',1],['c',2],['d',2]]);
 assert.equal(series.groups(rows.slice(2)).length,1);assert.equal(series.ordered(rows.slice(2)).length,2);
 assert.equal(series.ordered([{id:'a',parentId:'b'},{id:'b',parentId:'a'}]).length,2);
 assert.equal(series.groups([{id:'a'},{id:'b',parentId:'a'}]).length,2);
 const backup=C.backup({kind:'st-sidestory-backup',version:2,records:[{...rows[2],seriesTitle:'제목',action:'continue',title:'C',content:'text',mode:'story'}]});assert.equal(backup[0].seriesId,'s');assert.equal(backup[0].parentId,'b');assert.equal(backup[0].action,'continue');
 const prompt=C.contextualPrompt(C.settings({mode:'visual'}),'다음 장면',{content:'PRIOR',request:'ORIGINAL'},'continue');assert(prompt.includes('PRIOR'));assert(prompt.includes('ORIGINAL'));assert(prompt.includes('requested target mode'));assert(!prompt.includes('in the same mode'));
});
test('new chat writes original as sole character message, opens correct avatar, never replaces old messages',async()=>{
 let payload,opened;const old=[{mes:'original chat'}];
 const c={chatId:'old',characterId:1,groupId:null,chat:old,characters:[{avatar:'a.png',name:'Same'},{avatar:'b.png',name:'Same'}],getRequestHeaders:()=>({}),saveChat:async()=>{},selectCharacterById:async id=>{c.characterId=id;},openCharacterChat:async name=>{opened=name;}};
 const host=createSTHost({context:()=>c,fetcher:async(url,args)=>{assert.equal(url,'/api/chats/save');payload=JSON.parse(args.body);return {ok:true,json:async()=>({ok:true})};}});
 const record={id:'r',chatId:JSON.stringify(['character:a.png','origin']),title:'Story',content:'ORIGINAL',translationView:{content:'TRANSLATION'}};
 await host.createChatFromRecord(record);assert.equal(payload.avatar_url,'a.png');assert.equal(payload.chat.length,2);assert.equal(payload.chat[1].mes,'ORIGINAL');assert.equal(payload.chat[1].is_user,false);assert.equal(opened,payload.file_name);assert.equal(c.characterId,0);assert.deepEqual(old,[{mes:'original chat'}]);assert.equal(payload.force,false);
});
test('failed save or chat switch during creation never opens another chat',async()=>{
 let opened=false,resolve;const c={chatId:'old',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A'}],getRequestHeaders:()=>({}),selectCharacterById:async()=>{},openCharacterChat:async()=>{opened=true;}};
 const record={id:'r',chatId:JSON.stringify(['character:a.png','old']),content:'text'};
 const failed=createSTHost({context:()=>c,fetcher:async()=>({ok:false,status:500})});await assert.rejects(failed.createChatFromRecord(record),/저장 실패/);assert(!opened);
 const h=createSTHost({context:()=>c,fetcher:async()=>new Promise(r=>resolve=r)});const job=h.createChatFromRecord(record);c.chatId='different';resolve({ok:true,json:async()=>({ok:true})});await assert.rejects(job,/저장했지만/);assert(!opened);
});
test('PNG choice hides or expands inner thoughts during capture and restores them on errors',async()=>{
 const {document}=parseHTML('<div id="result"><details class="speak-inner"><summary>속마음</summary><div>SECRET</div></details></div><button id="save-image"></button>');
 const result=document.getElementById('result'),inner=result.querySelector('details');inner.open=false;
 let source=read('enhancements.js');source=source.slice(source.indexOf('async function saveImage()'));
 const make=(include,fail)=>new Function('$','SideHTML',`let savingImage=false,current={mode:'speak',title:'test'},raw=false,editing=false,pngIncludeInner=${include};const C={},displayRecord=()=>({}),flushReading=async()=>{},download=()=>{},say=()=>{};${source};return saveImage;`)(id=>document.getElementById(id),{png:async()=>{assert.equal(inner.open,include);if(!include)assert.equal(inner.style.display,'none');if(fail)throw Error('capture failed');return new Blob();}});
 await make(false,false)();assert.equal(inner.open,false);assert.equal(inner.getAttribute('style'),null);
 await assert.rejects(make(true,true)(),/capture failed/);assert.equal(inner.open,false);assert.equal(inner.getAttribute('style'),null);assert.equal(document.getElementById('save-image').disabled,false);
});
