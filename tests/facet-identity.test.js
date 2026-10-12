import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const {I,F}=new Function(read('facet.js')+';return {I:SideIdentity,F:SideFacet};')();
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();
const identity=()=>({schema:I.SCHEMA,subjects:['character','user'].map(kind=>({kind,name:kind==='character'?'A':'B',gender:'female',age:'adult',relative_age:kind==='character'?'older':'younger',alignment:'善',hair:'silver',eyes:'blue',height:'tall',build:'slender',design:'quiet',temperament:['proud','sensitive','guarded','playful'],speech:'soft',interpersonal:['teasing affection'],sheet_layout:['Name','Skills','History'],occupation:'FORBIDDEN_OCCUPATION',au_life:['FORBIDDEN_PAST'],raw_card:'FORBIDDEN_CARD'})),relationship:'siblings',world:'FORBIDDEN_WORLD',counterpart:null});
const options=(relation='none',target='both')=>({facet:F.clean({...F.defaults,au:'Mafia AU',relation,relationInput:'estranged siblings',target}),language:'한국어',lengthPreset:'normal'});
test('extraction only receives references; AU construction receives only allowlisted reviewed fields',()=>{
 const o=options(),ctx={text:JSON.stringify({characters:[{name:'A',description:'FORBIDDEN_CARD'}],players:[{name:'B',description:'FORBIDDEN_OCCUPATION'}],dialogue:['FORBIDDEN_DIALOGUE'],world:['FORBIDDEN_WORLD']})};
 const first=F.planMessages(o,ctx,'Mafia AU');assert.equal(first.length,2);assert(first[1].content.includes('FORBIDDEN_CARD'));
 assert(!first[1].content.includes('Mafia AU'),'extraction must not design an AU');
 const clean=I.parse(identity(),'both','none');assert.equal(clean.subjects[0].temperament.length,4);assert.equal(clean.relationship,'');
 const second=F.writeMessages(o,clean,'Mafia AU');assert.equal(second.length,2);
 for(const row of second)assert(!row.content.includes('FORBIDDEN_'));
 assert(second[1].content.includes('Mafia AU'));assert(second[1].content.includes('silver'));
 assert(second[0].content.includes('SIDESTORY_CHARACTER_PROFILE'));
});
test('all four relationship modes survive settings and only original receives the extracted bond',()=>{
 for(const mode of ['none','original','custom','new']){
  const o=options(mode),rows=F.writeMessages(o,identity(),'AU');
  const data=JSON.parse(rows[1].content.split('reference\n')[1].split('\n\nAU REQUEST')[0]);
  assert.equal(data.relationship,mode==='original'?'siblings':'');
  const request=rows[1].content.split('AU REQUEST\n')[1];
  assert(request.includes(o.facet.phrases[mode==='none'?'relationOff':mode==='original'?'originalOn':'originalOff']));assert.equal(request.includes('estranged siblings'),mode==='custom');
  assert.equal(C.recordSettings(o).facet.relation,mode);
 }
 assert.equal(F.clean({relationship:true,originalRelationship:false}).relation,'new');
});
test('missing values stay empty, arrays are sanitized, source fields cannot cross through counterpart',()=>{
 const input=identity();input.subjects[0].hair=undefined;input.subjects[0].temperament.push({raw:'FORBIDDEN_NESTED'});
 input.counterpart={name:'B',gender:'female',age:'adult',occupation:'FORBIDDEN_COUNTERPART'};
 const clean=I.parse(input,'character','none');assert.equal(clean.subjects.length,1);assert.equal(clean.subjects[0].hair,'');
 assert(!JSON.stringify(clean).includes('FORBIDDEN'));assert.equal(clean.counterpart.name,'B');
 assert.throws(()=>I.parse({...input,schema:'old'},'character'),/형식/);
 assert.throws(()=>I.parse({...input,subjects:[]},'character'),/누락/);
});
test('manual field edits survive review, writing, export and archive backup',()=>{
 const o=options('original'),plan=I.parse(identity(),'both','original');plan.subjects[1].temperament=['USER EDIT'];plan.subjects[1].hair='green';
 const record={id:'id',mode:'facet',title:'Extracted',content:I.markdown(plan),createdAt:1,status:'complete',settings:o,facetPlan:plan,facetPhase:'plan'};
 const restored=C.backup({kind:'st-sidestory-backup',version:2,records:[record]})[0];
 assert.equal(restored.facetPhase,'plan');assert.equal(restored.facetPlan.subjects[1].hair,'green');
 const rows=F.writeMessages(o,restored.facetPlan,'AU');assert(rows[1].content.includes('USER EDIT'));assert(I.markdown(restored.facetPlan).includes('USER EDIT'));
 assert.deepEqual(restored.facetPlan,plan);
});
test('re-extraction feedback does not reintroduce rejected AU biographies',()=>{
 const rows=F.planMessages(options(),{text:'{}'},'AU',{previousPlan:{world:'FORBIDDEN_OLD_WORLD',subjects:[{au_life:['FORBIDDEN_OLD_LIFE']}]},feedback:'correct eye color'});
 assert.equal(rows.length,3);assert(rows[2].content.includes('correct eye color'));assert(!JSON.stringify(rows).includes('FORBIDDEN'));
});
test('generation bypasses source collection after review and never uses ST context for facet',()=>{
 const code=read('generation.js');assert(code.includes('approvedFacetPlan:useApprovedFacetPlan'));
 assert(code.includes("bundle.cid==='st-current'&&options.mode!=='facet'"));
 assert(code.includes('SideIdentity.parse(SideFacet.readPlanJSON(planText),facet.target,facet.relation)'));
});

test('both AU writer paths enforce canonical names and avoid crude default mannerisms',()=>{
 const o=options('new');
 const reviewed=I.parse(identity(),'both','new');
 const actual=F.writeMessages(o,reviewed,'무협 AU');
 const sys=actual[0].content;
 assert(sys.includes('NAME CONSISTENCY:'));
 assert(sys.includes('Source identity names are reference labels'));
 assert(sys.includes('relationship sections, dialogue examples, schedules'));
 assert(sys.includes('CHARACTER PRESENTATION:'));
 assert(sys.includes('spitting, hawking'));
 assert(!sys.includes('{{변경정도}}'));
 assert.equal(actual.length,2);
 const legacy=F.parsePlan(JSON.stringify({world:'무림',subjects:[
  {kind:'character',name:'A',au_name:'반사뢰',core_identity:['당당함'],au_life:['무가 출신','전국을 유람','무림의 낭인'],sheet_layout:['기본 정보']},
  {kind:'user',name:'B',au_name:'반세린',core_identity:['신중함'],au_life:['약학 수련','약방 개원','진료'],sheet_layout:['기본 정보']}
 ]}),'both');
 const prior=F.writeMessages(o,legacy,'무협 AU');
 assert(prior[0].content.includes('NAME CONSISTENCY:'));
 assert(prior[0].content.includes('CHARACTER PRESENTATION:'));
 assert.equal(prior.length,2);
});

test('one-line socioeconomic/family background survives identity review and is not a mandatory AU biography',()=>{
 const field=I.FIELDS.find(([key])=>key==='background_context');
 assert.equal(field[1],'원본 성장 환경 · 한 줄');
 const raw=identity();
 raw.subjects[0].background_context='유복한 집안 \n 가족 분위기 엄격함';
 raw.subjects[1].background_context='가정 형편 보통 · 가족 화목';
 const approved=I.parse(raw,'both','none');
 assert.equal(approved.subjects[0].background_context,'유복한 집안 가족 분위기 엄격함');
 assert(I.markdown(approved).includes('원본 성장 환경 · 한 줄'));
 const rows=F.writeMessages(options(),approved,'무협 AU');
 assert.equal(rows.length,2);
 assert(rows[1].content.includes('유복한 집안'));
 assert(rows[0].content.includes('SOFT cue'));
 assert(rows[0].content.includes('PROSE RESTRAINT'));
 assert(rows[0].content.includes('Do not infer poor'));
 const former=I.parse(identity(),'both','none');
 assert.equal(former.subjects[0].background_context,'');
});
test('identity extraction constrains backdrop to a grounded clause and avoids intensifier inflation',()=>{
 const rows=F.planMessages(options(),{text:'{}'},'무협 AU');
 assert.equal(rows.length,2);
 assert(rows[0].content.includes('background_context'));
 assert(rows[0].content.includes('ONE short, grounded clause'));
 assert(rows[0].content.includes('Use restrained and factual descriptions'));
});

test('saved identity records are reusable for multiple AUs without another extraction',()=>{
 const source=identity(),character={id:'char',facetPlan:I.parse(source,'character','none')},persona={id:'persona',facetPlan:I.parse(source,'user','none')};
 const reviewed=I.combineSources({character,user:persona},'both','new');
 assert.deepEqual(reviewed.subjects.map(x=>x.name),['A','B']);
 assert.equal(reviewed.relationship,'');
 for(const au of ['무협 AU','로판 AU','헌터 AU']){
  const opts=options('new');opts.facet.au=au;
  const messages=F.writeMessages(opts,reviewed,au);
  assert.equal(messages.length,2);
  assert(messages[1].content.includes(au));
  assert(!messages.some(x=>x.content.includes('EXTRACT IDENTITY ONLY')));
 }
 const paired=I.parse(source,'both','original');
 assert.equal(I.combineSources({character:{id:'same',facetPlan:paired},user:{id:'same',facetPlan:paired}},'both','original').relationship,'siblings');
 assert.equal(I.combineSources({character,user:persona},'both','original').relationship,''); // relationship can be sourced from RP history later
});
test('Facet workspaces retain identity selections and default to AU',()=>{
 const base=C.settings({});
 assert.equal(base.facetWorkspace,'au');
 assert.equal(base.facetIdentityTarget,'character');
 const saved=C.settings({...base,facetWorkspace:'identity',facetIdentityTarget:'both',facetIdentitySelections:{'character:a.png':'record1'}});
 assert.equal(saved.facetWorkspace,'identity');
 assert.equal(saved.facetIdentityTarget,'both');
 assert.equal(saved.facetIdentitySelections['character:a.png'],'record1');
 assert.equal(saved.facet.prompt,base.facet.prompt);
});

test('source-focused AU writing adds original sheets without mixing the separately selected relationships',()=>{
 const cards=[{kind:'character',name:'A',description:'FULL_ORIGINAL_CHARACTER_SHEET',personality:'BOASTFUL'},{kind:'user',name:'B',description:'FULL_ORIGINAL_PERSONA_SHEET'}];
 for(const relation of ['none','original','new','custom']){
  const preserving=options(relation);preserving.facet.degree='preserve';
  const result=F.writeMessages(preserving,identity(),'로판 AU',null,'new',cards);
  assert(result[1].content.includes('FULL_ORIGINAL_CHARACTER_SHEET'));
  assert(result[1].content.includes('FULL_ORIGINAL_PERSONA_SHEET'));
  assert(result[0].content.includes('RELATIONSHIP FIREWALL'));
  assert(result[1].content.includes(preserving.facet.phrases[relation==='none'?'relationOff':relation==='original'?'originalOn':'originalOff']));
  const remaking=options(relation);remaking.facet.degree='rebuild';
  const other=F.writeMessages(remaking,identity(),'로판 AU',null,'new',cards);
  assert(!JSON.stringify(other).includes('FULL_ORIGINAL_CHARACTER_SHEET'));
  assert(!JSON.stringify(other).includes('FULL_ORIGINAL_PERSONA_SHEET'));
 }
});
test('only source-focused AU writing fetches original sheets, never the extraction phase',()=>{
 const code=read('generation.js');
 assert(code.includes("if(options.mode!=='facet'||f.degree!=='preserve')return []"));
 assert(code.includes("const sourceProfiles=facet.degree==='preserve'?await collectFacetOriginalProfiles(options,bundle.chat,signal):null"));
 assert(code.includes("SideFacet.writeMessages(options,plan,task,prior,action,sourceProfiles,relationshipEvidence)"));
 assert(code.indexOf("if(extract||action==='facet-replan')")<code.indexOf("const sourceProfiles=facet.degree"));
});

test('facet identity aliases are independently stored per subject and survive backup normalization',()=>{
 const record={id:'alias-test',mode:'facet',facetPhase:'plan',title:'인물 추출 · A · B',content:'source',request:'',chatId:'test',createdAt:Date.now(),
  settings:{facet:options().facet},facetPlan:I.parse(identity(),'both','none'),facetLabels:{character:'A · 원본성격',user:'B · 다듬은 버전'}};
 const cleaned=C.backup({kind:'st-sidestory-backup',version:2,records:[record]})[0];
 assert.deepEqual(cleaned.facetLabels,{character:'A · 원본성격',user:'B · 다듬은 버전'});
 assert.equal(cleaned.facetPlan.subjects[0].name,'A');
 assert.equal(cleaned.facetPlan.subjects[1].name,'B');
 assert.equal(cleaned.title,'인물 추출 · A · B');
 const oldRecord={...record};delete oldRecord.facetLabels;
 assert.equal(C.backup({kind:'st-sidestory-backup',version:2,records:[oldRecord]})[0].facetLabels,undefined);
});
