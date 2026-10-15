/* Patches live DOM toward an HTML string instead of replacing it, so sheets do not replay their
   opening animation, scroll positions and focus survive, and iframes are not reloaded.
   Matching: same tag and the same id / data-ui-scroll / data-key. Children of [data-own] are
   managed by code (paint, badges) and left alone; [data-keep] nodes appended by code survive. */
const SideMorph=(()=>{
 const key=n=>n.nodeType===1?n.id||n.getAttribute('data-ui-scroll')||n.getAttribute('data-key')||'':'';
 const same=(a,b)=>a.nodeType===b.nodeType&&a.nodeName===b.nodeName&&key(a)===key(b);
 const kept=n=>n.nodeType===1&&n.hasAttribute('data-keep');
 const focused=n=>n.getRootNode?.().activeElement===n;
 function attributes(from,to){
  for(const a of [...from.attributes]){
   if(to.hasAttribute(a.name))continue;
   // User-opened <details> and code-set inline styles stay unless the template says otherwise.
   if(a.name==='style'||(a.name==='open'&&from.nodeName==='DETAILS'))continue;
   from.removeAttribute(a.name);
  }
  for(const a of to.attributes)if(from.getAttribute(a.name)!==a.value)from.setAttribute(a.name,a.value);
 }
 function update(from,to){
  if(from.nodeType!==1){if(from.nodeValue!==to.nodeValue)from.nodeValue=to.nodeValue;return;}
  if(from.nodeName==='IFRAME')return;
  if(from.hasAttribute('data-own'))return;
  attributes(from,to);
  const tag=from.nodeName;
  if(tag==='TEXTAREA'){if(from.value!==to.textContent&&!focused(from))from.value=to.textContent;return;}
  // Read before children() moves the template's options into the live select.
  const choice=tag==='SELECT'?([...to.options].find(o=>o.hasAttribute('selected'))||to.options[0])?.value??'':null;
  children(from,to);
  // Template elements are compared by attribute; live ones by property, which is what the user sees.
  if(tag==='INPUT'){if(['checkbox','radio'].includes(from.type)){const on=to.hasAttribute('checked');if(from.checked!==on)from.checked=on;}else{const v=to.getAttribute('value')??'';if(from.value!==v&&!focused(from))from.value=v;}}
  else if(choice!==null&&from.value!==choice)from.value=choice;
 }
 function children(from,to){
  let cur=from.firstChild;
  for(const want of [...to.childNodes]){
   while(cur&&kept(cur))cur=cur.nextSibling;
   let match=cur&&same(cur,want)?cur:null;
   if(!match&&key(want))for(let n=cur?.nextSibling;n;n=n.nextSibling)if(same(n,want)){match=n;break;}
   if(!match){from.insertBefore(want,cur);continue;}
   if(match===cur)cur=cur.nextSibling;else from.insertBefore(match,cur);
   update(match,want);
  }
  while(cur){const next=cur.nextSibling;if(!kept(cur))cur.remove();cur=next;}
 }
 function patch(target,html){const t=document.createElement('template');t.innerHTML=html;children(target,t.content);}
 return {patch};
})();
