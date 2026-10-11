import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createSTHost} from '../src/st-host.js';
const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const F=new Function(read('facet.js')+';return SideFacet;')();
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();
test('facet supplies a revised English prompt and migrates prior prompt settings once',()=>{const preset=C.settings({}).facet.prompt;assert(preset.includes('GENRE'));assert(preset.includes('{{설정된AU}}'));assert(preset.includes('{{AU대상}}'));assert(preset.includes('{{관계설정}}'));assert(preset.includes('{{상세도}}'));assert.equal(F.clean({prompt:''}).prompt,preset);assert.equal(F.clean({prompt:'   '}).prompt,preset);const f=F.clean({...F.defaults,au:'Sentinel',prompt:'{{설정된AU}}',relationship:true});assert.deepEqual(C.recordSettings({mode:'facet',facet:f}).facet,f);assert.equal(C.settings({mode:'facet'}).mode,'facet');assert.equal(F.clean({prompt:'custom'}).prompt,preset);assert.equal(F.clean({...F.defaults,prompt:'custom'}).prompt,'custom');});
test('macros use selected phrases once, hide inactive relationship and preserve inserted literals',()=>{let f=F.clean({promptRevision:F.defaults.promptRevision,au:'{{char}} $&',prompt:'{{char}}|{{user}}|{{설정된AU}}|{{변경정도}}|{{유저관계설정}}|{{원본관계반영}}|{{유의사항}}',cautions:'keep name',degree:'rebuild',phrases:{rebuild:'CORE',relationOff:'NO'}});assert.equal(F.expand(f,{char:'A',user:'B'}),'A|B|{{char}} $&|CORE|NO||keep name');f.relation='new';assert(F.expand(f,{char:'A',user:'B'}).includes(f.phrases.originalOff));});
test('new character receives profile in description without modifying original card',async()=>{const original={avatar:'a.png',name:'A',description:'original'};let sent;const host=createSTHost({context:()=>({characters:[original],getRequestHeaders:()=>({'Content-Type':'application/json'})}),fetcher:async(url,opts)=>{sent={url,body:JSON.parse(opts.body)};return {ok:true,text:async()=> 'A AU.png'};}});assert.equal(await host.createCharacterFromProfile({name:'A AU',description:'edited profile'}),'A AU.png');assert.equal(sent.url,'/api/characters/create');assert.equal(sent.body.description,'edited profile');assert.equal(sent.body.first_mes,'');assert.equal(original.description,'original');host.cleanup();});

test('English default prompt expands AU, scope, degree and relationship macros',()=>{
 const f=F.clean({au:'Suggest powers',degree:'rebuild',relationship:true,originalRelationship:false,cautions:'No forced symbolism'});
 const result=F.expand(f,{char:'Serena',user:'Slade'});
 for(const v of ['Suggest powers','Serena','Slade','No forced symbolism','ESSENCE-ONLY CONTINUITY','RECONSTRUCT THE RELATIONSHIP'])assert(result.includes(v),v);
 assert(!result.includes('{{설정된AU}}'));
 assert(!result.includes('{{원본관계반영}}'));
});
test('six degree and relationship macro instructions remain independent and general',()=>{
 const f=F.clean();
 for(const [key,value] of Object.entries(f.phrases)){
  assert(value.length>200,key);
  assert(!/[가-힣]/.test(value),key+' must be English');
 }
 assert(f.phrases.preserve.includes('psychological continuity'));
 assert(f.phrases.rebuild.includes('substantially different upbringing'));
 assert(f.phrases.relationOn.includes('selected relationship option'));
 assert(f.phrases.relationOff.includes('Do not create'));
 assert(f.phrases.originalOn.includes('family ties'));
 assert(f.phrases.originalOff.includes('independent'));
});
test('legacy custom phrases are replaced once and updated custom phrases can be edited',()=>{const ko={"preserve":"원본 설정을 최대한 유지하고 AU에 필요한 부분만 수정합니다.","rebuild":"캐릭터의 핵심 정체성을 유지하되 AU에 맞게 설정을 폭넓게 재구성합니다.","relationOn":"유저와의 관계를 설정합니다.","relationOff":"유저와의 관계는 설정하지 않습니다.","originalOn":"원본의 유저와의 관계를 반영합니다.","originalOff":"원본 관계에 얽매이지 않고 새로운 관계를 설정합니다."};const en={"preserve":"Preserve the original character settings as much as possible, adding or changing only what the request requires.","rebuild":"Keep the character’s recognizable core identity, but allow broad reinterpretation of background, roles, abilities, and other details where suitable.","relationOn":"Define a relationship involving the user when relevant to the request.","relationOff":"Do not create or specify a relationship with the user.","originalOn":"Reflect the established relationship with the user.","originalOff":"The relationship need not follow the original dynamic; create a fitting alternative if the request calls for one."};const defaults=F.clean().phrases;for(const key of Object.keys(defaults)){assert.equal(F.clean({phrases:{[key]:ko[key]}}).phrases[key],defaults[key]);assert.equal(F.clean({phrases:{[key]:en[key]}}).phrases[key],defaults[key]);assert.equal(F.clean({phrases:{[key]:'Custom '+key}}).phrases[key],defaults[key]);assert.equal(F.clean({...F.defaults,phrases:{...defaults,[key]:'Custom '+key}}).phrases[key],'Custom '+key);}});
test('full macro matrix selects exactly the relevant instructions',()=>{for(const degree of ['preserve','rebuild'])for(const relationship of [false,true])for(const originalRelationship of [false,true]){const f=F.clean({au:'Romance fantasy AU',degree,relationship,originalRelationship,cautions:'Avoid forced symbolism'});const expanded=F.expand(f,{char:'Character A',user:'Player B'});assert(expanded.includes(f.phrases[degree]));assert(expanded.includes(f.phrases[relationship?'relationOn':'relationOff']));assert.equal(expanded.includes(f.phrases[originalRelationship?'originalOn':'originalOff']),relationship);assert(expanded.includes('Avoid forced symbolism'));assert(expanded.includes('Character A'));assert(expanded.includes('Player B'));assert(!expanded.includes('{{설정된AU}}'));}});

test('compact default prompt retains genre, non-graphic profile and anti-mechanical adaptation rules',()=>{
 const p=F.clean().prompt;
 assert(p.includes('# WORLD AND GENRE'));
 assert(p.includes('non-graphic'));
 assert(p.includes('recognizable genre conventions'));
 assert(p.includes('coherent independent life'));
 assert(p.includes('jobs')===false); // no long profession-specific checklist
 assert(p.length<8500);
 const saved=F.clean({...F.defaults,prompt:'My own prompt'});
 assert.equal(saved.prompt,'My own prompt');
});
test('new target switch and three relationship modes follow character and persona roles',()=>{
 for(const target of ['character','user','both']){
  const f=F.clean({target,relation:'original',au:'Hunter AU'});
  const expanded=F.expand(f,{char:'Character',user:'Persona',detail:'detailed'});
  assert(expanded.includes('Character'));assert(expanded.includes('Persona'));
  assert(expanded.includes(f.phrases.originalOn));
  assert(expanded.includes(F.DETAIL_HINTS.detailed));
  assert.equal(f.target,target);
 }
 const user=F.expand({target:'user',relation:'none'},{char:'Slade',user:'Serena'});
 assert(user.includes('USER PERSONA ONLY'));
 const fresh=F.expand({target:'both',relation:'new'},{char:'Slade',user:'Serena'});
 assert(fresh.includes('BOTH:'));assert(fresh.includes(F.clean().phrases.originalOff));
 const missing=F.expand({target:'user',relation:'new'},{char:'',user:'Serena'});
 assert(!missing.includes(F.clean().phrases.originalOff));
});
test('legacy relationship fields and custom prompt remain valid',()=>{
 assert.equal(F.clean({relationship:true,originalRelationship:true}).relation,'original');
 assert.equal(F.clean({relationship:true,originalRelationship:false}).relation,'new');
 assert.equal(F.clean({relationship:false}).relation,'none');
 assert.equal(F.clean({...F.defaults,target:'user',relation:'original',prompt:'custom {{AU대상}}'}).prompt,'custom {{AU대상}}');
 assert.equal(C.settings({lengthPreset:'short'}).lengthPreset,'brief');
 assert.equal(C.settings({lengthPreset:'middle'}).lengthPreset,'normal');
 assert.equal(C.settings({lengthPreset:'long'}).lengthPreset,'detailed');
 assert.equal(C.settings({lengthPreset:'flexible'}).lengthPreset,'normal');
 const prompt=C.contextualPrompt(C.settings({mode:'story',lengthPreset:'detailed'}),'scene');
 assert(prompt.includes('Detail level (not a token target)'));
 assert(!prompt.includes('Aim for roughly 10,000'));
});
test('dual-target output can save each complete source sheet independently',()=>{
 const full='<!-- SIDESTORY_CHARACTER_PROFILE -->\nName: A\nPower: Sentinel\n<!-- SIDESTORY_USER_PROFILE -->\nName: B\nPower: Guide';
 assert.equal(F.profileForSave(full,{target:'both'},'character'),'Name: A\nPower: Sentinel');
 assert.equal(F.profileForSave(full,{target:'both'},'user'),'Name: B\nPower: Guide');
 assert.throws(()=>F.profileForSave('no section markers',{target:'both'},'user'),/구분 표시/);
 assert.throws(()=>F.profileForSave('text',{target:'user'},'character'),/일치하지/);
 assert.equal(F.profileForSave('Name: B',{target:'user'},'user'),'Name: B');
 const messages=F.messages({facet:{target:'both',relation:'original',detail:'detailed',au:'Hunter'},lengthPreset:'normal',language:'한국어'},
 {text:JSON.stringify({characters:[{name:'A'}],players:[{name:'B'}]})},'Hunter',null,'new');
 assert(messages[0].content.includes('SIDESTORY_CHARACTER_PROFILE'));
 assert(messages[0].content.includes('SIDESTORY_USER_PROFILE'));
 assert(messages[0].content.includes(F.DETAIL_HINTS.detailed));
});

test('previously saved editor prompt and degree phrases reset exactly once on upgrade',()=>{
 const old=F.clean({target:'user',degree:'rebuild',relation:'new',au:'Guide AU',cautions:'No role swapping',
  prompt:'OLD CUSTOM PROMPT',phrases:{preserve:'OLD CUSTOM A',rebuild:'OLD CUSTOM B'}});
 assert.equal(old.prompt,F.defaults.prompt);
 assert.equal(old.phrases.rebuild,F.defaults.phrases.rebuild);
 assert.equal(old.target,'user');assert.equal(old.degree,'rebuild');
 assert.equal(old.au,'Guide AU');assert.equal(old.cautions,'No role swapping');
 assert.equal(old.promptRevision,F.defaults.promptRevision);
 const edited=F.clean({...old,prompt:'NEW CUSTOM PROMPT',phrases:{...old.phrases,rebuild:'MY NEW WORKFLOW'}});
 assert.equal(edited.prompt,'NEW CUSTOM PROMPT');
 assert.equal(edited.phrases.rebuild,'MY NEW WORKFLOW');
 assert.deepEqual(F.clean(edited),edited);
});

test('two-stage AU planning passes original references only to stage one',()=>{
 for(const degree of ['preserve','rebuild']){
  const f=F.clean({...F.defaults,target:'both',degree,relation:'original',au:'romance fantasy'});
  const options={facet:f,lengthPreset:'normal',language:'한국어'};
  const context={text:JSON.stringify({characters:[{name:'Slade',description:'OLD_SNIPER_123'}],players:[{name:'Serena',description:'OLD_ACCOUNTANT_456'}],dialogue:[{text:'OLD_DIALOGUE_789'}]})};
  const planning=F.planMessages(options,context,'romance fantasy');
  assert(planning[1].content.includes('OLD_SNIPER_123'));
  const json={world:'Romance fantasy city with guilds and salons',subjects:[
   {kind:'character',name:'Slade',au_name:'에드리안 발렌',core_identity:['competitive','witty'],au_life:['travelling scholar','diplomat','provincial childhood'],sheet_layout:['BASICS: Name, Occupation'],relationships:['trusted person']},
   {kind:'user',name:'Serena',au_name:'세레나 에르만',core_identity:['reserved','perceptive'],au_life:['small merchant family','naturalist','independent researcher'],sheet_layout:['BASICS: Name, Occupation'],relationships:['trusted person']}
  ],relationship:'trusted friends',genre_checks:['no modern broadcasts']};
  const plan=F.parsePlan(JSON.stringify(json),'both');
  const writer=F.writeMessages(options,plan,'romance fantasy',null,'new');
  assert.equal(writer.length,2);
  assert(writer[0].content.includes('SIDESTORY_CHARACTER_PROFILE'));
  assert(writer[0].content.includes('SIDESTORY_USER_PROFILE'));
  assert(writer[1].content.includes('APPROVED AU DESIGN'));
  for(const row of writer)for(const word of ['OLD_SNIPER_123','OLD_ACCOUNTANT_456','OLD_DIALOGUE_789'])assert(!row.content.includes(word));
 }
});
test('validated AU blueprint reuse and revisions omit unwanted prior input',()=>{
 const options={facet:F.clean({...F.defaults,target:'character',degree:'rebuild',au:'Hunter'}),lengthPreset:'normal',language:'한국어'};
 const plan=F.parsePlan(JSON.stringify({world:'Hunter world',subjects:[{kind:'character',name:'A',au_name:'AU A',core_identity:['bold'],au_life:['scholar','wanderer','guild negotiator'],sheet_layout:['BASICS: Occupation']}]}),'character');
 const prev={content:'PREVIOUS_PROFILE'};
 const revised=F.writeMessages(options,plan,'Change occupation',prev,'revise');
 assert.equal(revised.length,4);assert(revised[2].content.includes('PREVIOUS_PROFILE'));
 const regen=F.writeMessages(options,plan,'Hunter',prev,'regenerate');
 assert.equal(regen.length,2);assert(!regen[1].content.includes('PREVIOUS_PROFILE'));
 assert.throws(()=>F.parsePlan('NOT JSON','character'),/JSON/);
 assert.throws(()=>F.parsePlan(JSON.stringify({world:'x',subjects:[]}), 'character'),/누락/);
 assert.throws(()=>F.parsePlan(JSON.stringify({world:'x',subjects:[{kind:'character',core_identity:['a'],au_life:['b'],sheet_layout:['C']}]}),'character'),/부족/);
});

test('saved AU designs survive backup import and are reusable',()=>{
 const plan=F.parsePlan(JSON.stringify({world:'Fantasy scholarly city',subjects:[{kind:'character',name:'A',au_name:'AU A',core_identity:['witty'],au_life:['book publisher','traveler','academy mentor'],sheet_layout:['BASICS: Occupation']}],relationship:'none'}),'character');
 const record={id:'r1',mode:'facet',facetPhase:'plan',title:'AU',content:'',request:'Academy AU',chatId:'c',createdAt:Date.now(),settings:C.settings({mode:'facet',facet:{target:'character'}}),facetPlan:plan};
 const [loaded]=C.backup({kind:'st-sidestory-backup',version:2,records:[record]});
 assert.deepEqual(loaded.facetPlan,plan);
 assert.equal(loaded.facetPhase,'plan');
 const rows=F.writeMessages({facet:loaded.settings.facet,language:'한국어',lengthPreset:'normal'},loaded.facetPlan,'Academy AU',null,'regenerate');
 assert(rows[1].content.includes('academy mentor'));
});

test('cultural AU naming applies to Japanese, wuxia and original family ties',()=>{
 const f=F.clean({...F.defaults,target:'both',relation:'original',au:'일본 고등학교 AU'});
 const opts={facet:f,lengthPreset:'normal',language:'한국어'};
 const planning=F.planMessages(opts,{text:JSON.stringify({characters:[{name:'Slade'}],players:[{name:'Serena'}],dialogue:[]})},'일본 고등학교 AU');
 assert(planning[0].content.includes('EXTRACT IDENTITY ONLY'));
 assert(planning[0].content.includes('EXTRACT IDENTITY ONLY'));
 assert(planning[1].content.includes('original'));
 const blueprint=F.parsePlan(JSON.stringify({world:'현대 일본 고등학교',subjects:[
   {kind:'character',name:'Slade',au_name:'사토 렌 (佐藤 蓮)',name_reason:'일본 고등학교',core_identity:['자신만만함'],au_life:['학생','학생회 대립','동아리'],sheet_layout:['BASICS: Name']},
   {kind:'user',name:'Serena',au_name:'사토 유이 (佐藤 結衣)',name_reason:'쌍둥이 남매',core_identity:['예리함'],au_life:['학생','도서위원','쌍둥이 오빠'],sheet_layout:['BASICS: Name']}
 ]}), 'both');
 const writer=F.writeMessages(opts,blueprint,'일본 고등학교 AU',null,'new');
 assert(writer[0].content.includes('사토 렌'));
 assert(writer[1].content.includes('사토 유이'));
 assert(!writer[1].content.includes('OLD_SNIPER_123'));
 assert.throws(()=>F.parsePlan(JSON.stringify({world:'Wuxia',subjects:[{kind:'character',name:'Slade',core_identity:['brash'],au_life:['merchant','academy','traveler'],sheet_layout:['BASICS: Name']}]}),'character'),/부족/);
});

test('stage-one preview renders culturally adapted names and approval / regenerate controls safely',()=>{
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const preview=new Function('E','smallIcon',read('facet.js')+';return facetPlanPreview;')(escape,()=>'<svg></svg>');
 const plan=F.parsePlan(JSON.stringify({world:'Tokyo <script>alert(1)</script>',subjects:[{kind:'character',name:'Slade Vance',au_name:'사토 렌 (佐藤 蓮)',name_reason:'일본 학생 이름',core_identity:['재치 있음'],au_life:['학생','친구들과의 경쟁','방과후 동아리'],sheet_layout:['BASICS: Name']}]}),'character');
 const html=preview({facetPhase:'plan',facetPlan:plan});
 assert(html.includes('사토 렌 (佐藤 蓮)'));
 assert(html.includes('facet-plan-regenerate'));
 assert(html.includes('facet-plan-approve'));
 assert(html.includes('Tokyo &lt;script&gt;'));
 assert(!html.includes('Tokyo <script>'));
});

test('Vertex thoughts, fenced JSON and final JSON are parsed without mistaking prefatory braces',()=>{
 const thought={world:'earlier draft',subjects:[{kind:'character',name:'Slade',au_name:'반슬레이드',core_identity:['rash'],au_life:['old job','old setting','old room'],sheet_layout:['BASICS: Name']}]};
 const final={world:'낙양의 독립 낭인과 상단',subjects:[{kind:'character',name:'Slade',au_name:'백서혁',core_identity:['자신만만함'],au_life:['강호 탐방','표국 경영','의형제 결성'],sheet_layout:{'## BASICS':'## 인적 사항','## BACKGROUND':'## 내력'}}]};
 const fence=String.fromCharCode(96).repeat(3);
 const combined='**AU Adaptation Plan**\n\n'+fence+'json\n'+JSON.stringify(thought)+'\n'+fence+'\n\n'+JSON.stringify(final)+'\n';
 const parsed=F.parsePlan(combined,'character');
 assert.equal(parsed.world,final.world);
 assert.equal(parsed.subjects[0].au_name,'백서혁');
 assert.deepEqual(parsed.subjects[0].sheet_layout,['## BASICS → ## 인적 사항','## BACKGROUND → ## 내력']);
});
test('incomplete model JSON gives an actionable failure instead of silent acceptance',()=>{
 const valid=JSON.stringify({world:'무협',subjects:[{kind:'character',name:'Slade',au_name:'백서혁',core_identity:['bold'],au_life:['traveler','student','swordsman'],sheet_layout:['BASICS']}]});
 assert.throws(()=>F.parsePlan(valid.slice(0,-20),'character'),/중간에 잘렸어요/);
 assert.throws(()=>F.parsePlan('I cannot output JSON','character'),/JSON/);
});

test('AU reconstruction degree changes psychological continuity, never requiring the old life path',()=>{
 const a=F.clean({...F.defaults,target:'both',degree:'preserve',relation:'original',au:'무협'});
 const b=F.clean({...F.defaults,target:'both',degree:'rebuild',relation:'original',au:'무협'});
 for(const cfg of [a,b]){
  const prompt=F.expand(cfg,{char:'Slade',user:'Serena'});
  assert(prompt.includes('Create plausible origins'));
  assert(prompt.includes('distinctive ways of perceiving'));
  assert(prompt.includes('verified family ties'));
  assert(prompt.includes('AU')||prompt.includes('무협'));
 }
 assert(a.phrases.preserve.includes('psychological'));
 assert(a.phrases.preserve.includes('psychological continuity'));
 assert(b.phrases.rebuild.includes('substantially different upbringing'));
 assert(b.phrases.rebuild.includes('outward expression'));
});
test('updated default prompts migrate v6 without destroying custom prompt edits',()=>{
 const legacy={promptRevision:6,prompt:'{{설정된AU}} - KEEP MY CUSTOM PROMPT',phrases:{rebuild:'MY PERSONAL REBUILD RULES'}};
 const f=F.clean(legacy);
 assert.equal(f.prompt,legacy.prompt);
 assert.equal(f.phrases.rebuild,legacy.phrases.rebuild);
 assert.equal(F.clean({promptRevision:6,prompt:''}).prompt,F.defaults.prompt);
 assert.equal(F.clean({prompt:'SOME UNVERSIONED PROMPT'}).prompt,F.defaults.prompt);
});
test('AU plan preview keeps regeneration and approval reachable without an inline feedback editor',()=>{
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const preview=new Function('E','smallIcon',read('facet.js')+';return facetPlanPreview;')(escape,()=>'<svg></svg>');
 const p=F.parsePlan(JSON.stringify({world:'중원',subjects:[{kind:'character',name:'Slade',au_name:'백서혁',core_identity:['경쟁심'],au_life:['가문의 장남','협객','독립적인 삶'],sheet_layout:['BASICS']}]}),'character');
 const html=preview({facetPhase:'plan',facetPlan:p,facetReviewDraft:'쌍둥이 유지 <script>alert(1)</script>'});
 assert(html.includes('facet-plan-regenerate'));
 assert(html.includes('facet-plan-approve'));
 assert(!html.includes('facet-plan-feedback'));
 assert(!html.includes('side-dialog-textarea'));
 assert(!html.includes('쌍둥이 유지'));
});
