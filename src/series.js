const SideSeries=(()=>{
 function groups(rows){const map=new Map();for(const r of rows){const key=r.seriesId?'series:'+r.seriesId:'record:'+r.id;if(!map.has(key))map.set(key,[]);map.get(key).push(r);}return [...map.values()];}
 function ordered(rows){const ids=new Set(rows.map(r=>r.id)),children=new Map(),seen=new Set(),out=[];for(const r of [...rows].sort((a,b)=>a.createdAt-b.createdAt)){const key=ids.has(r.parentId)?r.parentId:null;if(!children.has(key))children.set(key,[]);children.get(key).push(r);}function walk(r,depth){if(seen.has(r.id))return;seen.add(r.id);out.push({record:r,depth});for(const child of children.get(r.id)||[])walk(child,depth+1);}for(const r of children.get(null)||[])walk(r,0);for(const r of rows)walk(r,0);return out;}
 return {groups,ordered};
})();
let continuationMode=null,pngIncludeInner=false,rewriteMode='revise',rewriteNote='';
function seriesMembers(record){return record?.seriesId?records.filter(r=>r.seriesId===record.seriesId):[];}
function seriesList(rows,{actions=false}={}){const byId=new Map(records.map(r=>[r.id,r]));return `<div class="series-list">${SideSeries.ordered(rows).map(({record:r,depth})=>`<div class="series-row" style="--series-depth:${Math.min(depth,2)}"><button data-open="${E(r.id)}" aria-current="${current?.id===r.id?'true':'false'}"><small>${E(C.MODE_LABELS[r.mode])}${r.status==='partial'?' · 미완료':''}</small><b>${E(r.title)}</b><small>${r.parentId?E(byId.has(r.parentId)?'〈'+byId.get(r.parentId).title+'〉에서 '+(r.action==='continue'?'이어짐':'파생됨'):'원본 삭제됨'):'시작'}</small></button>${actions?`<div class="card-icons"><button data-fav="${E(r.id)}" aria-label="즐겨찾기" aria-pressed="${!!r.favorite}">${smallIcon('star',!!r.favorite)}</button><button data-organize="${E(r.id)}" aria-label="폴더 · 태그">${smallIcon('tag')}</button><button data-delete="${E(r.id)}" aria-label="삭제" ${busy?'disabled':''}>${smallIcon('trash')}</button></div>`:''}</div>`).join('')}</div>`;}
async function saveGenerated(record,previous){
 const source=previous&&records.find(r=>r.id===previous.id);
 if(record.action==='continue'&&source&&!source.seriesId){const rootRecord={...source,seriesId:record.seriesId,seriesTitle:record.seriesTitle};await dbOp('batch',[rootRecord,record]);records=[...records.filter(r=>r.id!==source.id&&r.id!==record.id),rootRecord,record];}
 else await save(record);
}
async function createResultChat(){if(busy||!current)return;const record=current;busy=true;try{const name=await stHost.createChatFromRecord(record);say('새 채팅을 만들었어요: '+name);globalThis.toastr?.success('원문을 첫 메시지로 새 채팅을 만들었어요.','Side Story');}finally{busy=false;if(alive)render();}}
