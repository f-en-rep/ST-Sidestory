/* Shared composer controls for the original workspace and inner-life workspace. */
let inputPanelOpen=false,inputPanelTab='history',inputPanelScope='all';
let lastOuterMode='visual',lastInnerMode='speak';
const workResults=new Map();
function isInner(mode=s.mode){return ['speak','write'].includes(mode);}
function switchWorkMode(mode){
 if(!C.MODES[mode])return;
 continuationMode=null;
 s.requestDrafts[s.mode]=s.request;
 if(current?.chatId===chatId)workResults.set(current.mode,current);
 s.mode=mode;s.request=s.requestDrafts[mode]||'';
 if(isInner(mode))lastInnerMode=mode;else if(mode!=='facet')lastOuterMode=mode;
 const cached=workResults.get(mode);current=cached?records.find(r=>r.id===cached.id&&r.chatId===chatId)||null:null;
 page='create';viewEpoch++;expanded=false;mobilePane='compose';raw=false;editing=false;translationDraft=null;translationShown=false;referencesOpen=false;
 persist();render();
}
function switchWorkSection(inner){
 if(isInner())lastInnerMode=s.mode;else if(s.mode!=='facet')lastOuterMode=s.mode;
 if(s.mode!=='facet'&&inner===isInner()){page='create';viewEpoch++;render();return;}
 switchWorkMode(inner?lastInnerMode:lastOuterMode);
}
function innerOptions(){
 const honesty=[['character','캐릭터답게'],['honest','솔직하게']];
 if(s.mode==='speak')return `<div class="inner-options">${field('말하는 방식',select('innerHonesty',honesty))}<label class="check"><input type="checkbox" data-setting="showInnerThoughts" ${s.showInnerThoughts?'checked':''}>속마음 함께 보기</label><p class="hint">켜면 각 응답 카드 아래에 접어 둔 <b>속마음</b>을 함께 만들어요. 필요한 항목만 펼쳐 볼 수 있어요.</p></div>`;
 if(s.mode==='write')return `<div class="inner-options">${field('쓰는 방식',select('writeHonesty',honesty))}</div>`;
 return '';
}
function inputHistoryMatchesCurrent(r){return C.matchesCharacter(r,s.characterIds,chatId);}
function inputShelf(){
 const modeRows=s.inputHistory.map((r,i)=>({r,i})).filter(x=>x.r.mode===s.mode).sort((a,b)=>b.r.usedAt-a.r.usedAt),scoped=inputPanelScope==='current'?modeRows.filter(x=>inputHistoryMatchesCurrent(x.r)):modeRows,rows=inputPanelTab==='favorites'?scoped.filter(x=>x.r.favorite):scoped;
 return `<div class="input-shelf"><button class="history-toggle" data-history-toggle="true" aria-expanded="${inputPanelOpen}" aria-controls="input-history-panel">입력 히스토리 <small>${scoped.length}</small></button><section id="input-history-panel" class="history-panel" aria-label="입력 기록" ${inputPanelOpen?'':'hidden'}><nav class="history-tabs" aria-label="입력 기록 범위"><button data-history-scope="all" aria-pressed="${inputPanelScope==='all'}">전체 <small>${modeRows.length}</small></button><button data-history-scope="current" aria-pressed="${inputPanelScope==='current'}">현재 캐릭터 <small>${modeRows.filter(x=>inputHistoryMatchesCurrent(x.r)).length}</small></button></nav><nav class="history-tabs" aria-label="입력 기록 분류"><button data-history-tab="history" aria-pressed="${inputPanelTab==='history'}">히스토리 <small>${scoped.length}</small></button><button data-history-tab="favorites" aria-pressed="${inputPanelTab==='favorites'}">즐겨찾기 <small>${scoped.filter(x=>x.r.favorite).length}</small></button></nav><div class="input-history-list">${rows.map(({r,i})=>`<div class="input-history-row"><button data-input-load="${i}" class="input-history-text" title="${E(r.text)}">${E(r.text)}</button><button data-input-pin="${i}" title="${r.favorite?'즐겨찾기 해제':'즐겨찾기 추가'}" aria-label="${r.favorite?'즐겨찾기 해제':'즐겨찾기 추가'}" aria-pressed="${r.favorite}">${smallIcon('star',r.favorite)}</button><button data-input-delete="${i}" title="입력 기록 삭제" aria-label="입력 기록 삭제">${smallIcon('trash')}</button></div>`).join('')||`<p class="hint">${inputPanelTab==='favorites'?'히스토리에서 별을 눌러 자주 쓰는 요청을 모아보세요.':'생성에 사용한 요청이 여기에 남아요.'}</p>`}</div></section></div>`;
}
function refreshInputShelf(){
 const shelf=root.querySelector('.input-shelf');if(shelf)shelf.outerHTML=inputShelf();
}
function handleInputShelf(d){
 if(d.historyToggle!==undefined){inputPanelOpen=!inputPanelOpen;refreshInputShelf();root.querySelector('[data-history-toggle]')?.focus();return true;}
 if(d.historyScope!==undefined){inputPanelScope=d.historyScope==='current'?'current':'all';refreshInputShelf();root.querySelector(`[data-history-scope="${inputPanelScope}"]`)?.focus();return true;}
 if(d.historyTab!==undefined){inputPanelTab=d.historyTab==='favorites'?'favorites':'history';refreshInputShelf();root.querySelector(`[data-history-tab="${inputPanelTab}"]`)?.focus();return true;}
 const action=['inputLoad','inputPin','inputDelete'].find(k=>d[k]!==undefined);if(!action)return false;
 const index=Number(d[action]);if(!Number.isInteger(index)||index<0)return true;
 const r=s.inputHistory[index];if(!r||r.mode!==s.mode)return true;
 if(action==='inputLoad'){
  s.request=r.text;s.requestDrafts[s.mode]=r.text;Object.assign(s,r.options);persist();
  $('request').value=r.text;
  for(const key of ['innerHonesty','writeHonesty','showInnerThoughts']){const el=root.querySelector(`[data-setting="${key}"]`);if(el){if(el.type==='checkbox')el.checked=!!s[key];else if(el.tagName==='SELECT'){for(const option of el.options)option.selected=option.value===s[key];}else el.value=s[key];}}
  $('request').focus();
 }else{if(action==='inputPin')r.favorite=!r.favorite;else s.inputHistory.splice(index,1);persist();refreshInputShelf();}
 return true;
}


