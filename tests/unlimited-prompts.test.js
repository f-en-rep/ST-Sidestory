import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const {C,F}=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return {C:SideCore,F:SideFacet};')();
const long='긴 지침과 조건.\n'.repeat(6000)+'END_OF_PROMPT';

test('long regular, translation and AU instructions survive settings, snapshots and backup restore',()=>{
 const raw={mode:'story',request:long,tone:long,notes:long,
  instructionPresets:Object.keys(C.PROMPTS).map(mode=>({id:mode,mode,name:mode,prompt:long})),
  activeInstructionPresetIds:Object.fromEntries(Object.keys(C.PROMPTS).map(mode=>[mode,mode])),
  translationPresets:[{id:'tr',name:'translation',prompt:long}],activeTranslationPresetId:'tr',
  facet:{...F.defaults,au:long,cautions:long,relationInput:long,prompt:long,extractionPrompt:long,phrases:Object.fromEntries(Object.keys(F.defaults.phrases).map(key=>[key,long]))}};
 const s=C.settings(raw),again=C.settings(JSON.parse(JSON.stringify(s))),snapshot=C.recordSettings(s);
 for(const value of [s,again,snapshot]){
  assert.equal(value.translationPrompt,long);
  for(const mode of Object.keys(C.PROMPTS))assert.equal(value.prompts[mode],long);
  for(const key of ['au','cautions','relationInput','prompt','extractionPrompt'])assert.equal(value.facet[key],long);
  for(const phrase of Object.values(value.facet.phrases))assert.equal(phrase,long);
 }
 for(const key of ['request','tone','notes'])assert.equal(again[key],long);
 assert.equal(C.settings({translationPrompt:long}).translationPrompt,long);
 const restored=C.backup({kind:'st-sidestory-backup',version:2,records:[{id:'r',mode:'story',content:'Result',title:'Title',request:long,settings:s,createdAt:1}]});
 assert.equal(restored[0].request,long);assert.equal(restored[0].settings.translationPrompt,long);
 C.rememberInput(s,long);assert.equal(s.inputHistory[0].text,long);
 assert.equal(C.translationPrompt(snapshot),long);
 assert(C.messages(s,{text:'{}'},long)[0].content.includes(long));
});

test('instruction editors no longer impose maxlength and preset save handlers retain full text',async()=>{
 for(const [file,selector] of [['extras-ui.js','id="translation-prompt-editor"'],['shell.js','data-prompt='],['facet.js','data-facet="prompt"'],['facet.js','data-facet="extractionPrompt"'],['facet.js','data-facet-phrase=']]){
  const tag=read(file).match(new RegExp('<textarea[^>]*'+selector+'[^>]*>'))?.[0];
  assert(tag,selector);assert(!tag.includes('maxlength'),selector);
 }
 const source=read('extension.js');
 for(const [action,next] of [['instruction-preset-save','instruction-preset-rename'],['translation-preset-save','translation-preset-cancel']]){
  const block=source.split(`case '${action}':`)[1].split(`case '${next}':`)[0];
  const item={name:'Test'},s={prompts:{}},AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction('item','s','text',`const promptTab='story',C={MODES:{story:'Story'}},promptDrafts={story:text},activeInstructionPreset=()=>item,activeTranslationPreset=()=>item,translationPresetText=()=>text,translationPresetDrafts=new Map(),persist=()=>{},flushSettings=()=>{},say=()=>{},render=()=>{},saveQueue=Promise.resolve();switch('save'){case 'save':${block}}`);
  await run(item,s,long);assert.equal(item.prompt,long);
 }
});
