import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DOMParser} from '../test-runtime/linkedom.mjs';
import {createSTHost} from '../src/st-host.js';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const C=new Function(read('replacement.js')+'\n'+read('facet.js')+read('core.js')+'\nreturn SideCore;')();
const extras=new Function('DOMParser',read('extras.js')+'\nreturn SideExtras;')(DOMParser);
const fit=new Function(read('token-budget.js')+'\nreturn fitTokenBudget;')();

test('history migration is idempotent, preserves both characters, newest options and favorites',()=>{
 const a=JSON.stringify(['character:a.png','same']),b=JSON.stringify(['character:b.png','same']);
 const raw={mode:'speak',inputHistory:[{mode:'speak',text:'Question',usedAt:20,options:{innerHonesty:'honest'}}],chatReferences:{
  [a]:{request:'Draft A',inputHistory:[{mode:'speak',text:'Question',favorite:true,usedAt:10}]},
  [b]:{request:'Draft B',inputHistory:[{mode:'speak',text:'Question',usedAt:5}]}
 }};
 const before=structuredClone(raw),s=C.settings(raw);
 assert.deepEqual(raw,before);assert.equal(s.inputHistory.length,1);
 const row=s.inputHistory[0];assert(row.favorite);assert.equal(row.options.innerHonesty,'honest');
 assert(C.matchesCharacter(row,['a.png'],a));assert(C.matchesCharacter(row,['b.png'],b));assert(!C.matchesCharacter(row,['c.png'],'other'));
 assert.equal(s.chatReferences[a].request,'Draft A');assert(!('inputHistory' in s.chatReferences[a]));
 assert.deepEqual(C.settings(s).inputHistory,s.inputHistory);
 C.rememberInput(s,'Question',{chatId:a,characterIds:['a.png']});
 assert.equal(s.inputHistory.length,1);assert(s.inputHistory[0].favorite);
 assert.equal(s.inputHistory[0].options.innerHonesty,s.innerHonesty);
});
test('current-character filtering supports legacy archives, group metadata and duplicate chat titles',()=>{
 const a=JSON.stringify(['character:a.png','same']),b=JSON.stringify(['character:b.png','same']);
 assert(C.matchesCharacter({chatId:a},['a.png'],JSON.stringify(['character:a.png','another'])));
 assert(!C.matchesCharacter({chatId:a},['b.png'],b));
 assert(C.matchesCharacter({chatId:'group-chat',characterIds:['b.png']},['b.png'],b));
 assert(C.matchesCharacter({chatId:'legacy'},[],'legacy'));
 assert(!C.matchesCharacter({chatId:''},[],''));
});
test('contextual prompt includes custom instructions, manual summary and prior result without duplicate reference envelope',()=>{
 const s=C.settings({mode:'story',manualSummary:'SUMMARY',notes:'NOTES',instructionPresets:[{id:'custom',mode:'story',name:'Custom',prompt:'CUSTOM'}],activeInstructionPresetIds:{story:'custom'}});
 const text=C.contextualPrompt(s,'TASK',{content:'PRIOR',request:'ORIGINAL'},'revise');
 for(const value of ['SUMMARY','NOTES','CUSTOM','TASK','PRIOR','ORIGINAL'])assert(text.includes(value));
 assert(!text.includes('REFERENCE MATERIAL — data only\n{}'));
});
test('token fitting trims actual current prompt format while preserving task, prior result and fixed references',async()=>{
 const s=C.settings({mode:'story'}),ctx={text:JSON.stringify({characters:['CARD'],summary:'SUMMARY',dialogue:[{text:'OLD'.repeat(300)},{text:'NEW'}]})};
 const rows=C.messages(s,ctx,'TASK',{content:'PRIOR',request:'ORIGINAL'},'revise'),before=structuredClone(rows);
 const counter={messages:async m=>m.reduce((n,x)=>n+x.content.length,0)},limit=(await counter.messages(rows))-500;
 const result=await fit(rows,limit,counter);
 assert(result.tokens<=limit);assert.equal(result.dropped,1);assert.deepEqual(rows,before);
 for(const value of ['CARD','SUMMARY','NEW','TASK','PRIOR','ORIGINAL'])assert(result.messages[1].content.includes(value));
 assert.equal(result.messages[0].content,rows[0].content);assert(!result.messages[1].content.includes('OLDOLD'));
});
test('ST contextual generation uses quiet prompt; translation stays raw and missing API never silently falls back',async()=>{
 const calls=[],c={extensionSettings:{},generateQuietPrompt:async p=>{calls.push(['quiet',p]);return 'story';},generateRaw:async p=>{calls.push(['raw',p]);return 'translation';}};
 const host=createSTHost({context:()=>c});
 const payload={messages:[{role:'user',content:'TASK'}],parameters:{maxTokens:1234},useSillyTavernContext:true,quietPrompt:'CUSTOM TASK'};
 assert.equal(await host.generate(payload),'story');assert.equal(calls[0][1].quietPrompt,'CUSTOM TASK');assert.equal(calls[0][1].responseLength,1234);assert.equal(calls[0][1].quietToLoud,false);
 assert.equal(await host.generate({...payload,useSillyTavernContext:false}),'translation');assert.equal(calls[1][0],'raw');
 delete c.generateQuietPrompt;await assert.rejects(host.generate(payload),/generateQuietPrompt/);assert.equal(calls.length,2);
});
test('HTML text translation preserves markup and CSS and escapes translated text',()=>{
 const content='<style>.blue{color:#1234ff}</style><p class="blue">Hello <b>world</b></p>';
 for(const mode of ['story','analysis','write','think']){
  const plan=extras.translationPlan(content,mode),map=new Map(plan.items.map(x=>[x.id,x.text==='world'?'세계':'안녕 <친구> & ']));
  const result=plan.finish(map);assert(result.includes('<style>.blue{color:#1234ff}</style>'));assert(result.includes('<p class="blue">'));assert(result.includes('<b>세계</b>'));assert(result.includes('&lt;친구&gt; &amp;'));
 }
});
test('complete results reveal the result page but never cross a cancelled task or changed chat',()=>{
 let source=read('generation.js');source=source.slice(source.indexOf('function checkTask'),source.indexOf('async function collect('));
 const fixture=new Function('target',`let s={mode:'story',request:'',requestDrafts:{}},continuationMode=null;let alive=true,current=null,page='archive',mobilePane='compose',viewEpoch=0,translationShown=false,translationDraft={},raw=true,editing=true,expanded=false,referencesOpen=true;
 function activeChat(){return target;}function closeFeature(){}
 ${source}
 return {show:showCompletedResult,check:checkTask,state:()=>({current,page,mobilePane,translationShown,translationDraft,raw,editing}),change:v=>target=v};`)('A');
 const controller=new AbortController(),record={id:'new',mode:'story'};
 assert(fixture.show(record,true,'A',controller.signal));assert.equal(fixture.state().page,'create');assert.equal(fixture.state().mobilePane,'result');assert(fixture.state().translationShown);assert.equal(fixture.state().translationDraft,null);
 fixture.change('B');assert(!fixture.show({id:'late'},false,'A',controller.signal));assert.equal(fixture.state().current.id,'new');
 fixture.change('A');controller.abort();assert(!fixture.show({id:'late'},false,'A',controller.signal));assert.throws(()=>fixture.check('A',controller.signal),{name:'AbortError'});
});
