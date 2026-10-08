/* Display-only replacement. Untrusted regexes run in a disposable worker. */
const SideReplace=(()=>{
 function clean(rows){return (Array.isArray(rows)?rows:[]).slice(0,80).filter(r=>r&&typeof r==='object').map((r,i)=>({id:String(r.id||i),name:String(r.name||'치환 '+(i+1)).slice(0,80),find:String(r.find||'').slice(0,2000),replace:String(r.replace??'').slice(0,4000),regex:r.regex===true,flags:String(r.flags??'g').slice(0,8),enabled:r.enabled!==false}));}
 function compute(values,rules){
  const errors=[],compiled=[];
  for(const r of rules){if(!r.enabled||!r.find)continue;try{compiled.push({...r,re:r.regex?new RegExp(r.find,r.flags):new RegExp(r.find.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g')});}catch(e){errors.push(r.name+': '+e.message);}}
  const items=values.map(raw=>{let text=String(raw),map=null;
   for(const r of compiled){let cursor=0,out='',next=[],changed=false;const position=i=>map?map[i]:i;
    r.re.lastIndex=0;text.replace(r.re,(match,...args)=>{const groups=typeof args.at(-1)==='object'?args.pop():undefined;const input=args.pop(),offset=args.pop();const replacement=r.regex?r.replace.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g,(token,key)=>{if(key==='$')return '$';if(key==='&')return match;if(key==='`')return input.slice(0,offset);if(key==="'")return input.slice(offset+match.length);if(key[0]==='<')return groups?groups[key.slice(1,-1)]??'':token;const n=Number(key);if(n>0&&n<=args.length)return args[n-1]??'';if(key.length===2&&Number(key[0])>0&&Number(key[0])<=args.length)return (args[Number(key[0])-1]??'')+key[1];return token;}):r.replace;
     out+=text.slice(cursor,offset)+replacement;for(let i=cursor;i<offset;i++)next.push(position(i));const a=position(offset),b=position(offset+match.length);for(let i=0;i<replacement.length;i++)next.push(a+Math.floor((b-a)*i/Math.max(1,replacement.length)));cursor=offset+match.length;changed=true;if(out.length>2000000)throw Error('치환 결과가 너무 커요.');return match;});
    if(changed){out+=text.slice(cursor);for(let i=cursor;i<=text.length;i++)next.push(position(i));text=out;map=next;}
   }return {raw,text,map};});return {items,errors};
 }
 let workers=new Set();
 async function run(values,rules){rules=clean(rules);if(!rules.some(r=>r.enabled&&r.find))return {items:values.map(raw=>({raw,text:raw,map:null})),errors:[]};
  if(typeof Worker==='undefined')throw Error('이 브라우저에서 안전한 정규식 처리를 지원하지 않아요.');
  const url=URL.createObjectURL(new Blob(['onmessage=e=>{try{postMessage(('+compute.toString()+')(...e.data))}catch(e){postMessage({failure:e.message})}}'],{type:'text/javascript'}));
  return new Promise((resolve,reject)=>{let worker,timer;const done=()=>{clearTimeout(timer);worker?.terminate();workers.delete(worker);URL.revokeObjectURL(url);};try{worker=new Worker(url);workers.add(worker);timer=setTimeout(()=>{done();reject(Error('치환 시간이 초과됐어요. 복잡한 정규식을 끄거나 줄여 주세요.'));},1200);worker.onmessage=e=>{done();e.data.failure?reject(Error(e.data.failure)):resolve(e.data);};worker.onerror=()=>{done();reject(Error('치환 작업을 실행하지 못했어요. 규칙을 확인해 주세요.'));};worker.postMessage([values,rules]);}catch(e){done();reject(e);}});
 }
 return {clean,run,compute,cleanup(){for(const w of workers)w.terminate();workers.clear();}};
})();
