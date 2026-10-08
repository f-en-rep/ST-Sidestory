/** Locate dialogue without changing fixed references, instructions, or the task. */
function referenceDialogue(content){
 const marker='REFERENCE MATERIAL — data only\n';
 if(content.startsWith(marker)){
  const ends=['\n\nPREVIOUS ARTIFACT — data only','\n\nCURRENT TASK']
   .map(m=>content.indexOf(m,marker.length)).filter(i=>i>=0);
  const end=ends.length?Math.min(...ends):content.length;
  try{
   const reference=JSON.parse(content.slice(marker.length,end));
   if(Array.isArray(reference.dialogue))return {
    rows:reference.dialogue,
    make:n=>marker+JSON.stringify({...reference,dialogue:reference.dialogue.slice(n)},null,2)+content.slice(end)
   };
  }catch{}
  return null;
 }
 // Retain compatibility with the earlier structured reference envelope.
 try{
  const data=JSON.parse(content),reference=data?.reference;
  if(Array.isArray(reference?.dialogue))return {
   rows:reference.dialogue,
   make:n=>JSON.stringify({...data,reference:{...reference,dialogue:reference.dialogue.slice(n)}})
  };
 }catch{}
 return null;
}
/** Final input fitting uses ST's asynchronous tokenizer. */
async function fitTokenBudget(messages,limit,counter){
 const rows=messages.map(m=>({...m}));let count=await counter.messages(rows),dropped=0;
 if(count<=limit)return {messages:rows,tokens:count,dropped};
 for(const m of rows){
  const reference=referenceDialogue(m.content);
  if(!reference?.rows.length)continue;
  let lo=1,hi=reference.rows.length,best=hi;
  while(lo<=hi){
   const mid=Math.floor((lo+hi)/2);m.content=reference.make(mid);
   if(await counter.messages(rows)<=limit){best=mid;hi=mid-1;}else lo=mid+1;
  }
  m.content=reference.make(best);dropped+=best;count=await counter.messages(rows);
  if(count<=limit)break;
 }
 return {messages:rows,tokens:count,dropped};
}
