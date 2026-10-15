/* Shared composer controls for the original workspace and inner-life workspace. */
const workResults=new Map();
function isInner(mode=s.mode){return ['speak','write'].includes(mode);}
function switchWorkMode(mode){
 if(!C.MODES[mode])return;
 continuationMode=null;
 s.requestDrafts[s.mode]=s.request;
 if(current?.chatId===chatId)workResults.set(current.mode,current);
 s.mode=mode;s.request=s.requestDrafts[mode]||'';
 const cached=workResults.get(mode);current=cached?records.find(r=>r.id===cached.id&&r.chatId===chatId)||null:null;if(mode==='facet'&&!facetWorkspaceMatches(current,s.facetWorkspace))current=records.filter(r=>r.chatId===chatId&&facetWorkspaceMatches(r,s.facetWorkspace)).sort((a,b)=>b.createdAt-a.createdAt)[0]||null;
 page='create';viewEpoch++;mobilePane='compose';raw=false;editing=false;translationDraft=null;translationShown=false;
 persist();render();
}
function userName(){const p=personas.find(p=>s.personaIds?.includes(p.id)||s.personaIds?.includes('persona:'+p.id));return p?H.character(p).name:'{{user}}';}
function knobSelect(label,key,items){return `<label class="knob" title="${label}"><span>${label}</span><select data-setting="${key}" aria-label="${label}">${items.map(x=>opt(x[0],x[1],s[key])).join('')}</select></label>`;}
function innerKnobs(){
 const honesty=[['character','캐릭터답게'],['honest','솔직하게']];
 if(s.mode==='speak')return knobSelect('묻는 사람','speakAsker',[['user',userName()],['outsider','이야기 속 제3자'],['author','작가']])+knobSelect('말하는 방식','innerHonesty',honesty);
 if(s.mode==='write')return knobSelect('쓰는 방식','writeHonesty',honesty);
 return '';
}
function innerOptions(){return '';}
function inputHistoryMatchesCurrent(r){return C.matchesCharacter(r,s.characterIds,chatId);}


