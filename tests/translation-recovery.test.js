import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(new URL('../src/'+f,import.meta.url),'utf8');
const X=new Function(read('extras.js')+';return SideExtras;')();
const C=new Function(read('replacement.js')+read('facet.js')+read('core.js')+';return SideCore;')();
test('stray text outside a JSON string fails explicitly, while escaped TeX is preserved',()=>{
 const items=[{id:76,text:'source'}];
 assert.throws(()=>X.parseTranslation('{"items":[{"id":76,"text":"맥박:*"自我"}]}',items),/JSON 형식 오류/);
 const text=String.raw`$$\text{A} \longrightarrow \text{B}$$`;
 assert.equal(X.parseTranslation(JSON.stringify({items:[{id:76,text}]}),items).get(76),text);
 assert.throws(()=>X.parseTranslation('null',items),/항목 수/);
 assert.throws(()=>X.parseTranslation('{"items":[{"id":75,"text":"wrong"}]}',items),/누락/);
 assert(C.FIXED_MODE_RULES.analysis.includes('do not use LaTeX'));
});
test('backup retains failed response and independent repair draft',()=>{
 const record={id:'r',title:'A',mode:'analysis',content:'source',translationRecovery:{source:'source',chunks:[[{id:0,text:'source'}]],responses:['broken'],edits:{0:'fixed'},failed:0,error:'position 20',options:C.settings({translationLanguage:'한국어'})}};
 const restored=C.backup({kind:'st-sidestory-backup',version:2,records:[record]})[0];
 assert.equal(restored.translationRecovery.responses[0],'broken');assert.equal(restored.translationRecovery.edits[0],'fixed');
 record.translationRecovery.source='outdated';assert(!C.backup({kind:'st-sidestory-backup',version:2,records:[record]})[0].translationRecovery);
});
