/* Runs both in the host shadow root and the opaque generated-document frame. */
function installReadingSurface(container,run,onSelection,onStatus){
 const doc=container.ownerDocument,win=doc.defaultView,originals=new WeakMap();let disposed=false,pending=Promise.resolve(),timer;
 const textNodes=()=>{const a=[],w=doc.createTreeWalker(container,4);let n;while(n=w.nextNode()){if(n.parentElement?.closest('script,style,textarea,select,.speak-news-nav,.speak-copy'))continue;a.push(n);}return a;};
 async function refresh(){const nodes=textNodes(),before=nodes.map(n=>n.nodeValue),values=nodes.map(n=>{const old=originals.get(n);return old&&old.text===n.nodeValue?old.raw:n.nodeValue;});onStatus?.('pending');
  try{const result=await run(values);if(disposed)return;observer?.disconnect();nodes.forEach((n,i)=>{if(!container.contains(n))return;if(n.nodeValue!==before[i]){schedule();return;}const item=result.items[i];if(!item)return;originals.set(n,item);if(n.nodeValue!==item.text)n.nodeValue=item.text;});observe();onStatus?.('ready',result.errors);}catch(e){onStatus?.('error',[e.message]);}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{pending=pending.then(refresh);},40);}
 const observer=typeof win.MutationObserver==='function'?new win.MutationObserver(schedule):null;
 function observe(){if(!disposed)observer?.observe(container,{subtree:true,childList:true,characterData:true});}
 function selection(){const sel=container.getRootNode()?.getSelection?.()||win.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount){onSelection(null);return;}const range=sel.getRangeAt(0);if(!container.contains(range.startContainer)||!container.contains(range.endContainer)){onSelection(null);return;}let raw='',lastBlock=null;
  for(const node of textNodes()){if(!range.intersectsNode(node))continue;let a=node===range.startContainer?range.startOffset:0,b=node===range.endContainer?range.endOffset:node.length;if(a===b)continue;const old=originals.get(node),block=node.parentElement?.closest('p,div,li,h1,h2,h3,blockquote,article,section');if(lastBlock&&lastBlock!==block&&raw&&!raw.endsWith('\n'))raw+='\n';lastBlock=block;raw+=old&&old.text===node.nodeValue?old.raw.slice(old.map?old.map[a]:a,old.map?old.map[b]:b):node.nodeValue.slice(a,b);}
  const rect=range.getBoundingClientRect();onSelection({text:sel.toString(),raw:raw||sel.toString(),rect:{x:rect.x,y:rect.y,bottom:rect.bottom,width:rect.width,height:rect.height}});
 }
 doc.addEventListener('selectionchange',selection);container.addEventListener('pointerup',selection);container.addEventListener('keyup',selection);observe();pending=refresh();
 return {refresh(){pending=pending.then(refresh);return pending;},flush(){clearTimeout(timer);pending=pending.then(refresh);return pending;},dispose(){disposed=true;clearTimeout(timer);observer?.disconnect();doc.removeEventListener('selectionchange',selection);container.removeEventListener('pointerup',selection);container.removeEventListener('keyup',selection);}};
}
function installFrameReading(surface){
 const channel='st-sidestory-reading-v1',requests=new Map();let seq=0,reader;
 const emit=(type,data)=>parent.postMessage({channel,type,...data},'*');
 const run=values=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{requests.delete(id);reject(Error('치환 응답을 받지 못했어요.'));},4000);requests.set(id,{resolve,reject,timer});emit('transform',{id,values});});
 addEventListener('message',async e=>{if(e.source!==parent||e.data?.channel!==channel)return;const d=e.data;if(d.type==='transformed'){const p=requests.get(d.id);if(p){clearTimeout(p.timer);requests.delete(d.id);d.error?p.reject(Error(d.error)):p.resolve(d.result);}}if(d.type==='flush'&&reader){await reader.flush();emit('flushed',{id:d.id});}});
 const start=()=>{reader=surface(document.body,run,value=>emit('selection',{value}), (status,errors)=>emit('status',{status,errors}));};
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',start,{once:true});else start();
}
