const SideHTML=(()=>{
 const BASE=`*{box-sizing:border-box}html{overflow-wrap:anywhere;color-scheme:light}body{margin:0;padding:16px;font:16px/1.65 system-ui,sans-serif;background:#fff;color:#202924}img,svg{max-width:100%;height:auto}pre{white-space:pre-wrap}summary,label,button{touch-action:manipulation}summary{cursor:pointer;min-height:44px}table{max-width:100%} .sb-phone{max-width:410px;margin:auto;border:6px solid #28342e;border-radius:30px;overflow:hidden;background:#f4f5f7;color:#18231f}.sb-status{display:flex;justify-content:space-between;padding:12px 18px;font-size:12px;font-weight:700}.sb-contacts{padding:0 14px;background:#fff}.sb-contact{padding:14px 0;border-bottom:1px solid #e4e7e4}.sb-contact>summary{display:flex;align-items:center;gap:12px;list-style:none}.sb-contact>summary::-webkit-details-marker{display:none}.sb-contact>summary:after{content:'›';margin-left:auto;color:#66756b}.sb-contact[open]>summary:after{content:'⌄'}.sb-contact>summary>span{min-width:0}.sb-avatar{display:grid;place-items:center;flex-shrink:0;width:42px;height:42px;border-radius:50%;background:#dce9df;color:#345a43}.sb-preview{display:block;font-size:13px;color:#63716a;max-width:245px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-chat{display:flex;flex-direction:column;gap:12px;padding:18px 10px;background:#eef1f4}.sb-bubble{align-self:flex-start;max-width:86%;padding:10px 14px;border-radius:4px 17px 17px;background:#fff;color:#202924;white-space:pre-wrap;font-size:15px}.sb-self{align-self:flex-end;background:#d8efcf;border-radius:17px 4px 17px 17px}.sb-note{padding:22px;background:#fffbee;color:#332f22;white-space:pre-wrap;line-height:1.9}@media(max-width:400px){body{padding:8px}.sb-preview{max-width:180px}}`;
 // Keep native handler semantics (event, this, return false) inside an opaque sandbox.
 const hasBehavior=source=>/<script[\s>]|\son[a-z]+\s*=/i.test(source);
 const CAPTURE_CHANNEL='st-sidestory-dom-capture-v1';
 const CAPTURE_BRIDGE=`(()=>{const CHANNEL='st-sidestory-dom-capture-v1';const safeCss=v=>{const urls=String(v||'').match(/url\\(([^)]*)\\)/gi)||[];return urls.every(x=>{const inner=x.slice(x.indexOf('(')+1,-1).trim().replace(/^['\"]|['\"]$/g,'');return inner.startsWith('#');});};const styleText=el=>Array.from(getComputedStyle(el)).map(k=>{const v=getComputedStyle(el).getPropertyValue(k);return safeCss(v)?k+':'+v:'';}).filter(Boolean).join(';');const snapshot=()=>{const root=document.documentElement,body=document.body;if(!body)throw new Error('화면 본문을 찾지 못했어요.');const width=Math.ceil(Math.max(root.clientWidth,body.scrollWidth)),height=Math.ceil(Math.max(root.scrollHeight,body.scrollHeight));const clone=body.cloneNode(true),nodes=[body,...body.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];nodes.forEach((el,i)=>{const copy=copies[i];if(!copy||copy.nodeType!==1)return;copy.setAttribute('style',styleText(el));const tag=el.tagName.toUpperCase();if(tag==='INPUT'){if(el.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked');if('value'in el)copy.setAttribute('value',el.value??'');}else if(tag==='TEXTAREA'){copy.textContent=el.value??'';}else if(tag==='OPTION'){if(el.selected)copy.setAttribute('selected','');else copy.removeAttribute('selected');}else if(tag==='DETAILS'){if(el.open)copy.setAttribute('open','');else copy.removeAttribute('open');}});for(const el of [...clone.querySelectorAll('*')]){const tag=el.tagName.toUpperCase();if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','META','LINK','BASE','FRAMESET','TEMPLATE','NOSCRIPT','FOREIGNOBJECT'].includes(tag)){el.remove();continue;}for(const a of [...el.attributes]){const n=a.name.toLowerCase();if(n.startsWith('on')||['src','srcset','href','xlink:href','formaction','action'].includes(n))el.removeAttribute(a.name);}}clone.style.margin='0';clone.style.width=width+'px';clone.style.height=height+'px';clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');return{width,height,markup:new XMLSerializer().serializeToString(clone)};};addEventListener('message',e=>{const d=e.data;if(e.source!==parent||!d||d.channel!==CHANNEL||d.type!=='request'||typeof d.id!=='string')return;try{const snap=snapshot();parent.postMessage({channel:CHANNEL,type:'snapshot',id:d.id,...snap},'*');}catch(err){parent.postMessage({channel:CHANNEL,type:'error',id:d.id,error:String(err&&err.message||err).slice(0,300)},'*');}});})();`;

 // Repair only an unambiguous extra wrapper in a CSS-only radio tab selector.
 // Keep the stored source unchanged; apply the same repair to preview and export.
 function repairTabs(doc){
  for(const style of doc.querySelectorAll('style'))style.textContent=style.textContent.replace(/#([A-Za-z_][\w-]*):checked\s*~\s*([^,{}]+)(?=[,{])/g,(original,id,tail)=>{
   const radio=doc.getElementById(id);if(!radio||radio.tagName.toUpperCase()!=='INPUT'||radio.getAttribute('type')!=='radio')return original;
   const target=tail.trim();if(!target.startsWith('.'))return original;
   try{
    if(doc.querySelector('#'+id+' ~ '+target))return original;
    const candidates=[...doc.querySelectorAll('#'+id+' ~ * '+target)];
    if(candidates.length!==1)return original;
    return '#'+id+':checked ~ * '+target;
   }catch{return original;}
  });
 }
 function installDialogs(){
  window.alert=function(message){
   const show=()=>{const box=document.createElement('div'),panel=document.createElement('div'),text=document.createElement('p'),close=document.createElement('button');
    box.setAttribute('role','dialog');box.setAttribute('aria-label','알림');box.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#0006;padding:20px';
    panel.style.cssText='background:#fff;color:#222;padding:20px;border-radius:12px;max-width:460px;max-height:85vh;overflow:auto;font:15px/1.6 system-ui';
    text.textContent=String(message);text.style.whiteSpace='pre-wrap';close.textContent='확인';close.style.cssText='padding:8px 20px;cursor:pointer';const previous=document.activeElement;
    close.addEventListener('click',()=>{box.remove();previous?.focus?.();});box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close.click();}});
    panel.append(text,close);box.append(panel);document.body.append(box);close.focus();};
   if(document.body)show();else addEventListener('DOMContentLoaded',show,{once:true});
  };
 }
 function documentOf(source,interactive=false,reading=false){
 const doc=new DOMParser().parseFromString(source,'text/html');
 const tags=new Set('HTML HEAD BODY TITLE STYLE DIV SPAN P H1 H2 H3 H4 H5 H6 MAIN SECTION ARTICLE HEADER FOOTER NAV ASIDE DETAILS SUMMARY LABEL INPUT UL OL LI DL DT DD TABLE THEAD TBODY TFOOT TR TH TD CAPTION COLGROUP COL BR HR STRONG EM B I U S SMALL SUB SUP BLOCKQUOTE PRE CODE FIGURE FIGCAPTION SVG G PATH CIRCLE ELLIPSE RECT LINE POLYLINE POLYGON TEXT TSPAN DEFS MARKER LINEARGRADIENT RADIALGRADIENT STOP'.split(' '));
 const attrs=new Set('class id style title role aria-label aria-hidden aria-expanded aria-controls tabindex type checked name value hidden for open colspan rowspan scope width height viewbox xmlns d x y x1 x2 y1 y2 cx cy r rx ry points fill stroke stroke-width stroke-linecap stroke-linejoin opacity fill-opacity stroke-opacity transform text-anchor dominant-baseline font-size font-family font-weight dx dy marker-start marker-end markerwidth markerheight refx refy orient offset stop-color stop-opacity gradientunits gradienttransform'.split(' '));
 const dangerous=new Set('SCRIPT IFRAME OBJECT EMBED FORM META LINK BASE FRAMESET FRAME TEMPLATE NOSCRIPT FOREIGNOBJECT'.split(' '));
 if(interactive)for(const tag of ['SCRIPT','BUTTON','SELECT','OPTION','TEXTAREA','CANVAS'])tags.add(tag);
 if(interactive)for(const attr of ['disabled','selected','placeholder','min','max','step','rows','cols','aria-pressed'])attrs.add(attr);
 const nonce=(interactive||reading)?Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join(''):'';
 for(const el of [...doc.querySelectorAll('*')]){
  if(!el.isConnected)continue;
  const tag=el.tagName.toUpperCase();
  if(tag==='SCRIPT'&&interactive){
   const type=(el.getAttribute('type')||'').toLowerCase();
   if(el.namespaceURI!=='http://www.w3.org/1999/xhtml'||el.hasAttribute('src')||!['','text/javascript','application/javascript'].includes(type)){el.remove();continue;}
   for(const a of [...el.attributes])el.removeAttribute(a.name);
   el.setAttribute('nonce',nonce);continue;
  }
  if(dangerous.has(tag)){el.remove();continue;}
  if(!tags.has(tag)){el.replaceWith(...el.childNodes);continue;}
  if(tag==='INPUT'&&!['radio','checkbox',...(interactive?['text','search','range','number','button']:[])].includes(el.getAttribute('type'))){el.remove();continue;}
  for(const a of [...el.attributes])if(!attrs.has(a.name.toLowerCase())&&!(interactive&&(/^(?:data-|aria-)[a-z0-9-]+$/.test(a.name)||/^on[a-z]+$/.test(a.name))))el.removeAttribute(a.name);
 }

 repairTabs(doc);
 const csp=doc.createElement('meta');csp.setAttribute('http-equiv','Content-Security-Policy');csp.setAttribute('content',"default-src 'none'; "+((interactive||reading)?"script-src 'nonce-"+nonce+"'; script-src-attr "+(interactive?"'unsafe-inline'":"'none'")+"; ":"script-src 'none'; ")+"style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'");
 const viewport=doc.createElement('meta');viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';
 const charset=doc.createElement('meta');charset.setAttribute('charset','utf-8');
 const style=doc.createElement('style');style.textContent=BASE;
 if(interactive){const dialogs=doc.createElement('script');dialogs.setAttribute('nonce',nonce);dialogs.textContent='('+installDialogs.toString()+')();';doc.head.prepend(dialogs);const reporter=doc.createElement('script');reporter.setAttribute('nonce',nonce);reporter.textContent="addEventListener('error',function(e){const show=function(){const p=document.createElement('p');p.textContent='Side Story · JS 실행 오류: '+String(e.message||'알 수 없는 오류').slice(0,240);p.style.cssText='padding:12px;background:#fff0f0;color:#7c1820;font:14px sans-serif;white-space:pre-wrap';document.body.append(p);};if(document.body)show();else addEventListener('DOMContentLoaded',show,{once:true});});";const capture=doc.createElement('script');capture.setAttribute('nonce',nonce);capture.textContent=CAPTURE_BRIDGE;doc.head.prepend(capture);doc.head.prepend(reporter);}
 if(reading){const bridge=doc.createElement('script');bridge.setAttribute('nonce',nonce);bridge.textContent='('+installFrameReading.toString()+')('+installReadingSurface.toString()+');';doc.head.prepend(bridge);if(!interactive){const capture=doc.createElement('script');capture.setAttribute('nonce',nonce);capture.textContent=CAPTURE_BRIDGE;doc.head.prepend(capture);}}
 doc.head.prepend(style);doc.head.prepend(viewport);doc.head.prepend(csp);doc.head.prepend(charset);
 return doc;
 }
 function richSource(source,markdown){
  const raw=[],token=i=>'SIDESTORYRAWMARKUP'+i+'TOKEN';let text=String(source??'').trim().replace(/^\`\`\`(?:html)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  if(/^(?:<!doctype\s+html[^>]*>\s*)?<html[\s>]/i.test(text))return text;
  text=text.replace(/<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/gi,m=>{const i=raw.push(m)-1;return token(i);});
  let body=markdown(text);body=body.replace(/SIDESTORYRAWMARKUP(\d+)TOKEN/g,(_,i)=>raw[Number(i)]||'');
  return '<!doctype html><html><head><title>Side Story</title></head><body><div class="reading-copy">'+body+'</div></body></html>';
 }
 function richFragment(source,markdown){const doc=documentOf(richSource(source,markdown));for(const el of doc.querySelectorAll('style'))el.remove();return doc.body.querySelector('.reading-copy')?.innerHTML||doc.body.innerHTML;}
 function safe(source){return '<!doctype html>\n'+documentOf(source).documentElement.outerHTML;}
 function text(source){const doc=documentOf(source);for(const el of doc.querySelectorAll('head,style'))el.remove();return (doc.body.textContent||'').replace(/\s+/g,' ').trim();}
 function frame(source,options={}){const f=document.createElement('iframe');f.className='html-viewer';f.title='생성된 화면';const interactive=options.interactive===true&&hasBehavior(source);f.setAttribute('sandbox',(interactive||options.reading)?'allow-scripts':'allow-same-origin');f.dataset.interactive=String(interactive||options.reading);f.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");f.referrerPolicy='no-referrer';const doc=documentOf(source,interactive,options.reading===true);if(options.original){f.srcdoc='<!doctype html>\n'+doc.documentElement.outerHTML;return f;}const size=Math.min(28,Math.max(10,Number(options.size)||14));const font=SideExtras.FONTS[options.font]||'';for(const sheet of doc.querySelectorAll('style'))sheet.textContent=sheet.textContent.replace(/(font-size\s*:\s*)([\d.]+)px/gi,(_,prefix,n)=>prefix+(Number(n)*size/16)+'px');for(const el of doc.body.querySelectorAll('*')){if(el.closest('svg'))continue;const inline=el.style.fontSize;const n=parseFloat(inline);if(n&&/px$/.test(inline))el.style.setProperty('font-size',(n*size/16)+'px','important');}const override=doc.createElement('style');override.textContent='html,body{font-size:'+size+'px!important}'+(font?'body,body *{font-family:'+font+'!important}':'');if(options.spacing!==undefined)override.textContent+='body,body p,body div,body span,body li,body td{letter-spacing:'+Number(options.spacing)+'px!important;line-height:'+Number(options.line||1.65)+'!important}';if(options.width!==undefined){const w=Math.min(125,Math.max(75,Number(options.width)||100));override.textContent+='.reading-copy{width:'+(10000/w)+'%;transform:scaleX('+(w/100)+');transform-origin:top left}';}doc.head.append(override);f.srcdoc='<!doctype html>\n'+doc.documentElement.outerHTML;return f;}
 function exportDocument(source,interactive=true){
  if(!interactive||!hasBehavior(source))return safe(source);
  const child='<!doctype html>\n'+documentOf(source,true).documentElement.outerHTML;
  const escaped=child.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Side Story</title><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style></head><body><iframe title="Side Story artifact" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="'+escaped+'"></iframe></body></html>';
 }
 async function snapshotDirect(frame){
 const element=frame.tagName?.toUpperCase()!=='IFRAME'?frame:null,doc=element?element.ownerDocument:frame.contentDocument,win=element?doc.defaultView:frame.contentWindow,source=element||doc?.body;if(!source||!win)throw new Error('뷰어가 아직 준비되지 않았어요. 잠시 후 다시 저장해 주세요.');
 const width=Math.ceil(element?Math.max(element.clientWidth,element.scrollWidth,element.getBoundingClientRect().width):Math.max(doc.documentElement.clientWidth,doc.body.scrollWidth)),height=Math.ceil(element?Math.max(element.scrollHeight,element.getBoundingClientRect().height):Math.max(doc.documentElement.scrollHeight,doc.body.scrollHeight));if(!width||!height)throw new Error('이미지 크기를 확인하지 못했어요.');
 const safeCss=v=>{const urls=String(v||'').match(/url\(([^)]*)\)/gi)||[];return urls.every(x=>{const inner=x.slice(x.indexOf('(')+1,-1).trim().replace(/^['"]|['"]$/g,'');return inner.startsWith('#');});};
 const clone=source.cloneNode(true),nodes=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];nodes.forEach((el,i)=>{const copy=copies[i];if(!copy)return;const css=win.getComputedStyle(el);copy.setAttribute('style',Array.from(css).map(k=>{const v=css.getPropertyValue(k);return safeCss(v)?k+':'+v:'';}).filter(Boolean).join(';'));const tag=el.tagName;if(tag==='INPUT'){if(el.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked');if('value'in el)copy.setAttribute('value',el.value??'');}else if(tag==='TEXTAREA')copy.textContent=el.value??'';else if(tag==='OPTION'){if(el.selected)copy.setAttribute('selected','');else copy.removeAttribute('selected');}else if(tag==='DETAILS'){if(el.open)copy.setAttribute('open','');else copy.removeAttribute('open');}});
 for(const el of [...clone.querySelectorAll('*')]){const tag=el.tagName.toUpperCase();if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','META','LINK','BASE','FRAMESET','TEMPLATE','NOSCRIPT','FOREIGNOBJECT'].includes(tag)){el.remove();continue;}for(const a of [...el.attributes]){const n=a.name.toLowerCase();if(n.startsWith('on')||['src','srcset','href','xlink:href','formaction','action'].includes(n))el.removeAttribute(a.name);}}
 clone.style.margin='0';clone.style.width=width+'px';clone.style.height=height+'px';
 if(element){
  clone.style.boxSizing='border-box';clone.style.maxHeight='none';clone.style.maxWidth='none';clone.style.overflow='visible';
  let parent=element,background='';
  while(parent){const color=win.getComputedStyle(parent).backgroundColor;if(color&&color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'){background=color;break;}parent=parent.parentElement||parent.getRootNode?.().host;}
  clone.style.backgroundColor=background||'#ffffff';
 }
 clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');return{width,height,markup:new XMLSerializer().serializeToString(clone)};
 }
 async function snapshotInteractive(frame){
 const target=frame.contentWindow;if(!target)throw new Error('상호작용 화면이 아직 준비되지 않았어요. 잠시 후 다시 저장해 주세요.');
 const id=(crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join(''));
 return await new Promise((resolve,reject)=>{let timer;const done=()=>{removeEventListener('message',onMessage);if(timer)clearTimeout(timer);};const onMessage=e=>{if(e.source!==target)return;const d=e.data;if(!d||d.channel!==CAPTURE_CHANNEL||d.id!==id)return;if(d.type==='error'){done();reject(new Error(d.error||'현재 화면을 읽지 못했어요.'));return;}if(d.type!=='snapshot')return;const width=Math.ceil(Number(d.width)||0),height=Math.ceil(Number(d.height)||0),markup=String(d.markup||'');if(!width||!height||!markup){done();reject(new Error('현재 화면 스냅샷이 비어 있어요.'));return;}if(markup.length>30000000||/<\s*(?:script|style|iframe|object|embed|link|meta|base|form)\b/i.test(markup)||/\son[a-z0-9_-]+\s*=/i.test(markup)||/\s(?:src|srcset|href|xlink:href|formaction|action)\s*=/i.test(markup)||/url\(\s*(?:[\"'](?!#)|(?![\"'#]))/i.test(markup)){done();reject(new Error('현재 화면 스냅샷을 안전하게 변환하지 못했어요.'));return;}done();resolve({width,height,markup});};addEventListener('message',onMessage);timer=setTimeout(()=>{done();reject(new Error('현재 화면 캡처 응답이 늦어요. 잠시 후 다시 시도해 주세요.'));},10000);target.postMessage({channel:CAPTURE_CHANNEL,type:'request',id},'*');});
 }
 async function rasterize({width,height,markup}){
 const scale=Math.min(2,Math.sqrt(16000000/(width*height)),16000/width,16000/height);if(scale<.2)throw new Error('화면이 너무 길어요. 일부 내용을 접은 후 다시 저장해 주세요.');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><foreignObject width="100%" height="100%">'+markup+'</foreignObject></svg>';
 const image=new Image();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{image.onload=image.onerror=null;reject(new Error('이미지 변환이 지연되고 있어요. 다시 시도해 주세요.'));},15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('이 브라우저에서 화면 이미지 변환을 지원하지 않아요. 파일 저장을 사용해 주세요.'));};image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(width*scale));canvas.height=Math.max(1,Math.floor(height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이미지 저장용 캔버스를 만들지 못했어요.');ctx.scale(scale,scale);ctx.drawImage(image,0,0);try{return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 변환에 실패했어요.')),'image/png'));}catch{throw new Error('브라우저가 이미지 저장을 제한했어요. 파일 저장을 사용해 주세요.');}finally{canvas.width=1;canvas.height=1;}
 }
 async function png(frame){return rasterize(frame.tagName?.toUpperCase()==='IFRAME'&&frame.dataset?.interactive==='true'?await snapshotInteractive(frame):await snapshotDirect(frame));}

 return {safe,text,richSource,richFragment,frame,png,exportDocument,BASE};
})();

