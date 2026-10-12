import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const {C,F}=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return {C:SideCore,F:SideFacet};')();

test('four length choices survive settings and assemble distinct instructions in every regular mode',()=>{
 for(const mode of ['analysis','story','visual','speak','write'])for(const level of ['short','middle','long','flexible']){
  const s=C.settings({mode,lengthPreset:level}),key=['speak','write'].includes(mode)?'inner'+level[0].toUpperCase()+level.slice(1):level;
  assert.equal(s.lengthPreset,level);assert.equal(C.settings(s).lengthPreset,level);
  for(const text of [C.messages(s,{text:'{}'},'ASK')[1].content,C.contextualPrompt(s,'ASK')]){
   assert(text.includes(C.SIDE_LENGTH[key]));
   if(level==='flexible')assert(!/Target ~[\d,]+ tokens/.test(text));
  }
 }
 for(const [old,value] of Object.entries({brief:'short',normal:'middle',detailed:'long'})){
  const s=C.settings({lengthPreset:old,facet:{detail:'detailed'}});
  assert.equal(s.lengthPreset,value);assert.equal(s.facet.detail,'detailed');
 }
 assert.equal(C.settings({}).lengthPreset,'middle');
 for(const detail of ['brief','normal','detailed']){
  const texts=['short','middle','long','flexible'].map(lengthPreset=>F.input(C.settings({mode:'facet',lengthPreset,facet:{detail,au:'AU'}}).facet));
  assert(texts.every(text=>text===texts[0]&&text.includes(F.DETAIL_HINTS[detail])));
  assert(!/Target ~[\d,]+ tokens/.test(texts[0]));
 }
});

test('all regular modes assemble inputs once and keep free text out of system instructions',()=>{
 for(const mode of ['analysis','story','visual','speak','write']){
  const s=C.settings({mode,tone:'로코 분위기로 {{sidelength}} $&',notes:'NOTE {{sidetone}}',pcControl:false,showInnerThoughts:true});
  const rows=C.messages(s,{text:'{"summary":"REFERENCE"}'},'REQUEST {{sidenotes}}');
  assert.deepEqual(rows.map(r=>r.role),['system','user']);
  for(const text of ['REQUEST {{sidenotes}}',s.tone,s.notes,C.SIDE_LENGTH[['speak','write'].includes(mode)?'innerMiddle':'middle'],'Write in 한국어.','Do not invent PC']){
   assert(rows[1].content.includes(text));assert(!rows[0].content.includes(text));
  }
  assert.equal(rows[1].content.split(s.tone).length-1,1);
  if(mode==='speak')assert(rows[1].content.includes('add an <inner>'));
  assert(!Object.values(C.PROMPTS).some(p=>/\{\{side[a-z]+}}/.test(p)));
 }
});

test('blank optional inputs disappear in raw and current-ST-preset requests',()=>{
 const s=C.settings({mode:'story',tone:' \n ',notes:'',manualSummary:'MANUAL',lengthPreset:'brief'});
 for(const text of [C.messages(s,{text:'{}'},'ASK')[1].content,C.contextualPrompt(s,'ASK')]){
  assert(!text.includes('Maintain this tone'));assert(!text.includes('Follow these additional requirements'));
  assert(text.includes(C.SIDE_LENGTH.short));assert(text.includes('ASK'));
 }
 assert(C.contextualPrompt(s,'ASK').includes('MANUAL'));
});

test('revision 11 custom AU instructions migrate once while protected inputs remain complete',()=>{
 const f=F.clean({promptRevision:11,prompt:'MY RULE {{설정된AU}} {{관계설정}} {{sideau}}',au:'헌터 {{sidelanguage}}',relation:'custom',relationInput:'새 관계 {{sideau}}',cautions:'CAUTION',phrases:{rebuild:'MY REBUILD'},degree:'rebuild'});
 assert.equal(f.prompt,'MY RULE');assert.equal(f.phrases.rebuild,'MY REBUILD');assert.deepEqual(F.clean(f),f);
 const text=F.input(f,{char:'A',user:'B',tone:'TONE',notes:'NOTES',language:'English',action:'revise',task:'CHANGE'});
 for(const value of [f.au,f.relationInput,'CAUTION','MY REBUILD','TONE','NOTES','Write in English.','Revision request:\nCHANGE'])assert(text.includes(value));
 assert(!text.includes('SOURCE-FOCUSED CONTINUITY'));
 assert.deepEqual(F.clean(F.clean({...F.defaults,prompt:'{{sideau}}'})),F.clean({...F.defaults,prompt:'{{sideau}}'}));
});

test('AU reference path places the previous artifact before one complete revision request',()=>{
 const f=F.clean({target:'both',au:'AU',detail:'detailed'});
 const rows=F.messages({facet:f,language:'English'},{text:'{"characters":[{"name":"A"}],"players":[{"name":"B"}]}'},'CHANGE',{content:'PRIOR'},'revise');
 assert.deepEqual(rows.map(r=>r.role),['system','assistant','user']);
 assert.equal(rows[1].content,'PRIOR');assert(rows[2].content.includes('Revision request:\nCHANGE'));
 assert(rows[2].content.includes(F.DETAIL_HINTS.detailed));assert(rows[0].content.includes('SIDESTORY_CHARACTER_PROFILE'));
});
