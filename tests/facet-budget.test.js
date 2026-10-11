import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const F=new Function(fs.readFileSync(new URL('../src/facet.js',import.meta.url),'utf8')+';return SideFacet;')();
const ctx={text:JSON.stringify({characters:[{name:'A'}],players:[]})};
const options=degree=>({facet:F.clean({...F.defaults,degree,au:'Fantasy'}),lengthPreset:'normal',language:'한국어'});
const plan={world:'A court society',subjects:[{kind:'character',name:'A',au_name:'A',core_identity:['curious','competitive','cautious','proud'],au_life:['rural childhood','schooling','court service'],sheet_layout:['Name'],retained_constraints:['Keep the specified name']}],relationship:'none'};
test('legacy rebuild blueprints keep their validation; archived and preserve plans stay readable',()=>{
 assert.throws(()=>F.parsePlan(JSON.stringify(plan),'character','rebuild'),/3개를 초과/);
 assert.equal(F.parsePlan(JSON.stringify(plan),'character','preserve').subjects[0].core_identity.length,4);
 assert.equal(F.parsePlan(JSON.stringify(plan),'character').subjects[0].core_identity.length,4);
 const limited=structuredClone(plan);limited.subjects[0].core_identity.pop();
 const parsed=F.parsePlan(JSON.stringify(limited),'character','rebuild');
 assert.equal(parsed.subjects[0].core_identity.length,3);
 assert.deepEqual(parsed.subjects[0].retained_constraints,['Keep the specified name']);
 assert(F.writeMessages(options('rebuild'),parsed,'Fantasy',null)[1].content.includes('Keep the specified name'));
});
const oldRebuild="ESSENCE-ONLY CONTINUITY\n\nPreserve the character's distinctive foundational temperament, psychological inclinations, underlying motivations, and ways of perceiving and responding. Let substantially different upbringing, relationships, and circumstances reshape their developed personality, values, confidence, fears, emotional defenses, ambitions, and outward expression.\n\nProminent source-world psychological traits may change or disappear when the experiences behind them do not occur. The result should be a plausible alternative development of the same individual, not an unrelated person or an artificially inverted original.";
test('v8 default rebuild macro updates while customized macros remain intact',()=>{
 const migrated=F.clean({promptRevision:8,prompt:F.defaults.prompt,phrases:{rebuild:oldRebuild}});
 assert.equal(migrated.phrases.rebuild,F.defaults.phrases.rebuild);
 assert.notEqual(migrated.phrases.rebuild,oldRebuild);
 const custom=F.clean({promptRevision:8,prompt:'MY PROMPT',phrases:{rebuild:'MY CORE RULE'}});
 assert.equal(custom.prompt,'MY PROMPT');assert.equal(custom.phrases.rebuild,'MY CORE RULE');
 assert.deepEqual(F.clean(custom),custom);
});
