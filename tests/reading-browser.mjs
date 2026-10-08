import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const dir=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({headless:true,executablePath:process.env.SIDE_STORY_BROWSER||undefined,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:850}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://sideb.test/**', async r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="extensionsMenu"></div><script type="module" src="/scripts/extensions/third-party/ST-Sidestory/index.js"></script></body></html>'});
  if(p==='/scripts/world-info.js')return r.fulfill({contentType:'text/javascript',body:'export const world_names=["Book"];export const selected_world_info=["Book"];export async function loadWorldInfo(){return {entries:{0:{uid:0,comment:"Place",content:"A quiet cafe",disable:false}}}}'});
  if(p==='/scripts/extensions/shared.js')return r.fulfill({contentType:'text/javascript',body:'export {};'});
  if(p==='/script.js')return r.fulfill({contentType:'text/javascript',body:'export const user_avatar="user.png";export function isGenerating(){return false;}'});
  const rel=p.replace('/scripts/extensions/third-party/ST-Sidestory/','');
  if(!rel.startsWith('/')&&!rel.includes('..')&&fs.existsSync(path.join(dir,rel)))return r.fulfill({contentType:rel.endsWith('.js')?'text/javascript':'application/octet-stream',body:fs.readFileSync(path.join(dir,rel))});
  if(p==='/thumbnail')return r.fulfill({status:404,body:''});throw new Error('Unexpected request '+p);
 });
 await page.addInitScript(()=>{
  window.fixture={chatId:'Test chat',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:'A quiet character',extensions:{world:'Book'}}}],chat:[{mes:'Let us meet at the cafe',name:'A',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'user.png':'User'},persona_descriptions:{'user.png':{description:'A friend'}}},name1:'User',mainApi:'openai',extensionSettings:{},saveSettingsDebounced(){},getTokenCountAsync:async text=>Math.ceil(text.length/3),getCurrentChatId(){return this.chatId;},generateRaw:async function(args){window.lastArgs=args;return window.nextResult||'두 사람은 카페에서 다시 만났다.';},eventSource:{on(name,fn){window.chatChanged=fn;},removeListener(){}},eventTypes:{CHAT_CHANGED:'chat_changed'}};
  window.SillyTavern={getContext:()=>window.fixture};
 });
 await page.goto('https://sideb.test/');
 await page.locator('#side-story-wand').click();await page.locator('#open-references').click();
 await page.locator('#close-references-done').click();

 await page.locator('[data-mode="story"]').first().click();
 await page.evaluate(()=>window.nextResult='Slade는 카페에서 Serena를 기다렸다.\n\n다시 만나서 반가워.');
 await page.locator('#request').fill('읽기 기능 검사');await page.locator('#generate').click();await page.getByText('Slade는 카페에서 Serena를 기다렸다.',{exact:true}).waitFor();
 const replacementCode=fs.readFileSync(path.join(dir,'src/replacement.js'),'utf8');
 const timed=await page.evaluate(async code=>{const R=new Function(code+';return SideReplace;')();let responsive=false;setTimeout(()=>responsive=true,100);let message='';try{await R.run(['a'.repeat(40)+'!'],[{name:'slow',find:'(a+)+$',replace:'x',regex:true,flags:'g',enabled:true}]);}catch(e){message=e.message;}return{responsive,message};},replacementCode);assert(timed.responsive);assert(timed.message.includes('초과'));
 // Translation cancellation must restore the saved translation without saving a draft.
 await page.evaluate(()=>fixture.generateRaw=async args=>JSON.stringify({items:JSON.parse(args.prompt[1].content).items.map(i=>({...i,text:i.text.replace('Slade','슬레이드').replace('Serena','세레나')}))}));
 await page.locator('#translate').click();await page.getByText('슬레이드는 카페에서 세레나를 기다렸다.',{exact:true}).waitFor();
 await page.locator('#translation-edit').click();await page.locator('[data-translation-item]').first().fill('취소할 내용');await page.locator('#cancel-translation-edit').click();
 assert(await page.locator('#editor').isHidden());assert(await page.getByText('슬레이드는 카페에서 세레나를 기다렸다.',{exact:true}).isVisible());assert.equal(await page.getByText('취소할 내용',{exact:true}).count(),0);
 await page.locator('#translation-edit').click();await page.locator('[data-translation-item]').first().fill('Esc로 취소할 내용');await page.keyboard.press('Escape');assert(await page.locator('#editor').isHidden());
 // Presets use an explicit save; cancel and moving tabs do not commit edits.
 await page.locator('[data-page="settings"]').first().click();await page.locator('[data-settings-tab="translation"]').click();await page.locator('#translation-preset-clone').click();await page.locator('#side-dialog-input').fill('번역 검사');await page.locator('#side-dialog-confirm').click();await page.locator('#translation-prompt-editor').fill('저장할 지침');await page.locator('#translation-preset-save').click();await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('translation-preset-status')?.textContent.includes('저장된 지침'));
 await page.locator('#translation-prompt-editor').fill('버릴 지침');await page.locator('#translation-preset-cancel').click();assert.equal(await page.locator('#translation-prompt-editor').inputValue(),'저장할 지침');
 await page.locator('[data-page="archive"]').first().click();await page.locator('[data-open]').first().click();
 // Display rules apply to original and translated text. Temporary rules are literal.
 await page.locator('[data-page="settings"]').first().click();await page.locator('[data-settings-tab="replacement"]').click();await page.locator('#open-replacements').click();assert.equal(await page.locator('#temporary-enabled').count(),0);await page.locator('[data-rule-add="rules"]').click();
 await page.locator('[data-rule-field="find"]').first().fill('Slade|슬레이드');await page.locator('[data-rule-field="replace"]').first().fill('🌙');await page.locator('[data-rule-field="regex"]').check();await page.locator('#rules-enabled').check();
 await page.locator('#replacement-apply').click();await page.locator('[data-page="archive"]').first().click();await page.locator('[data-open]').first().click();
 await page.locator('#reader-tools > summary').click();await page.locator('#open-temporary').click();await page.locator('#temporary-add').click();await page.locator('[data-temp-field="find"]').fill('Serena');await page.locator('[data-temp-field="replace"]').fill('⭐');await page.locator('#temporary-enabled').check();assert.equal(await page.locator('.feature-dialog input[type="checkbox"]').count(),1);assert.equal(await page.locator('#replacement-apply').count(),0);await page.locator('#feature-close').click();
 await page.getByText('🌙는 카페에서 ⭐를 기다렸다.',{exact:true}).waitFor();
 await page.locator('#translate').click();await page.getByText('🌙는 카페에서 세레나를 기다렸다.',{exact:true}).waitFor();await page.locator('#translation-original').click();await page.getByText('🌙는 카페에서 ⭐를 기다렸다.',{exact:true}).waitFor();
 // Selecting transformed text retains the original for per-excerpt toggles.
 await page.locator('#result .reading-copy p').first().evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));});
 await page.locator('#excerpt-selection').click();assert.equal(await page.locator('[data-excerpt="text"]').inputValue(),'Slade는 카페에서 Serena를 기다렸다.');assert.equal(await page.locator('[data-excerpt="title"]').inputValue(),'A');
 await page.locator('[data-excerpt="title"]').fill('Slade의 기록');await page.locator('[data-excerpt="author"]').fill('Serena');
 await page.locator('[data-excerpt-ratio="1:1"]').click();await page.waitForFunction(()=>!document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-save').disabled);
 const download=page.waitForEvent('download');await page.locator('#excerpt-save').click();const file=await download,png=fs.readFileSync(await file.path());assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1080);
 await page.locator('#excerpt-image-input').setInputFiles({name:'background.png',mimeType:'image/png',buffer:png});await page.locator('#excerpt-background-delete').waitFor();
 await page.locator('[data-excerpt-ratio="auto"]').click();await page.locator('[data-excerpt="text"]').fill('긴 문장을 한 장에 담는지 검사합니다. '.repeat(100));await page.waitForFunction(()=>{const r=document.getElementById('st-sidestory-root').shadowRoot;return !r.getElementById('excerpt-save').disabled&&r.getElementById('excerpt-canvas').height>1440;});
 assert.equal(await page.locator('#excerpt-page-label').textContent(),'1 / 1');assert((await page.locator('#excerpt-feedback').textContent()).includes('글자 48px 유지'));
 await page.locator('[data-excerpt-ratio="3:4"]').click();await page.waitForFunction(()=>{const r=document.getElementById('st-sidestory-root').shadowRoot;return !r.getElementById('excerpt-save').disabled&&r.getElementById('excerpt-canvas').width>1080;});
 const dims=await page.locator('#excerpt-canvas').evaluate(c=>[c.width,c.height]);assert.equal(dims[1]/dims[0],4/3);assert.equal(await page.locator('#excerpt-page-label').textContent(),'1 / 1');
 const longDownload=page.waitForEvent('download');await page.locator('#excerpt-save').click();const longPNG=fs.readFileSync(await (await longDownload).path());assert.equal(longPNG.readUInt32BE(16),dims[0]);assert.equal(longPNG.readUInt32BE(20),dims[1]);
 await page.locator('[data-excerpt="text"]').evaluate(e=>e.setSelectionRange(100,100));await page.locator('#excerpt-break').click();await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-page-label').textContent==='1 / 2');await page.locator('#excerpt-next').click();await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-page-label').textContent==='2 / 2');
 await page.locator('#excerpt-clear-breaks').click();await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-page-label').textContent==='1 / 1');assert(!(await page.locator('[data-excerpt="text"]').inputValue()).includes('[[PAGE]]'));
 await page.locator('[data-excerpt-ratio="auto"]').click();await page.locator('[data-excerpt="text"]').fill('줄\n'.repeat(2000));await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-feedback').textContent.includes('너무 길거나'),null,{timeout:10000}).catch(async e=>{console.log(await page.locator('#excerpt-feedback').textContent());throw e;});assert(await page.locator('#excerpt-save').isDisabled());
 await page.locator('[data-excerpt-background="sage"]').click();await page.locator('[data-excerpt="text"]').fill('Slade는 잠시 말을 멈췄다. 창가에 내려앉은 햇빛 속에서, 평범한 하루가 조금 특별해졌다.');await page.waitForFunction(()=>!document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-save').disabled);
 await page.setViewportSize({width:390,height:780});
 await page.locator('[data-excerpt-ratio="auto"]').click();await page.locator('[data-excerpt="text"]').fill('A long excerpt stays fully visible in the preview. '.repeat(35));await page.locator('[data-excerpt="author"]').fill('Updated author');
 await page.waitForFunction(()=>!document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-save').disabled);
 const preview=await page.locator('#excerpt-canvas').evaluate(c=>{const box=c.parentElement,rect=c.getBoundingClientRect(),b=box.getBoundingClientRect();return {fit:getComputedStyle(c).objectFit,contained:rect.top>=b.top&&rect.bottom<=b.bottom,scroll:box.scrollHeight<=box.clientHeight,large:c.height>1440,pixels:c.toDataURL()};});
 assert.equal(preview.fit,'contain');assert(preview.contained&&preview.scroll&&preview.large);
 await page.locator('[data-excerpt-ratio="auto"]').click();await page.waitForFunction(()=>!document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-save').disabled);assert.equal(await page.locator('#excerpt-canvas').evaluate(c=>c.toDataURL()),preview.pixels);
 await page.locator('[data-excerpt="text"]').fill('Short text');await page.locator('[data-excerpt="author"]').fill('Another author');await page.waitForFunction(()=>!document.getElementById('st-sidestory-root').shadowRoot.getElementById('excerpt-save').disabled);
 assert.equal(await page.locator('#excerpt-canvas').evaluate(c=>c.height),1080);
 await page.screenshot({path:'/tmp/side-story-excerpt-mobile.png'});
 const rect=await page.locator('.feature-dialog').boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=391&&rect.y+rect.height<=781);
 await page.locator('#feature-close').click();await page.setViewportSize({width:1280,height:850});
 // Back at the bottom preserves archive search.
 await page.locator('.result-bottom [data-page="archive"]').click();await page.locator('#search').fill('읽기 기능');await page.waitForTimeout(260);await page.locator('[data-open]').first().click();await page.locator('.result-bottom [data-page="archive"]').click();assert.equal(await page.locator('#search').inputValue(),'읽기 기능');
 await page.locator('[data-open]').first().click();await page.locator('#excerpt-open').click();await page.locator('.excerpt-backgrounds img').waitFor();assert.equal(await page.locator('.excerpt-backgrounds img').count(),1);await page.locator('#feature-close').click();
 // Generated HTML keeps click behavior and styles while dynamic text is also replaced.
 await page.locator('[data-mode="visual"]').first().click();await page.evaluate(()=>{fixture.generateRaw=async()=>'<html><body><style>.Slade{color:red}</style><p class="Slade">Slade</p><p id="other-name">Serena</p><button id="go" onclick="document.getElementById(\'dynamic\').textContent=\'Slade arrives\'">Open</button><p id="dynamic"></p></body></html>';});
 await page.locator('#request').fill('HTML 치환');await page.locator('#generate').click();const frame=page.frameLocator('#result iframe');await frame.locator('.Slade').getByText('🌙',{exact:true}).waitFor();await frame.locator('#go').click();await frame.getByText('🌙 arrives',{exact:true}).waitFor();
 assert.equal(await frame.locator('#other-name').textContent(),'Serena');
 assert.equal(await frame.locator('.Slade').evaluate(e=>getComputedStyle(e).color),'rgb(255, 0, 0)');
 await frame.locator('#dynamic').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));});await page.locator('#excerpt-selection').click();assert.equal(await page.locator('[data-excerpt="text"]').inputValue(),'Slade arrives');await page.locator('#feature-close').click();
 // The first record retains its temporary list, but closing the entire window clears it.
 await page.locator('.result-bottom [data-page="archive"]').click();await page.locator('#search').fill('읽기 기능');await page.waitForTimeout(260);await page.locator('[data-open]').first().click();await page.getByText('🌙는 카페에서 ⭐를 기다렸다.',{exact:true}).waitFor();
 await page.locator('#reader-tools > summary').click();await page.locator('#open-temporary').click();await page.locator('#temporary-enabled').uncheck();await page.locator('#feature-close').click();await page.getByText('🌙는 카페에서 Serena를 기다렸다.',{exact:true}).waitFor();
 await page.locator('#reader-tools > summary').click();await page.locator('#open-temporary').click();await page.locator('#temporary-enabled').check();await page.locator('#feature-close').click();await page.getByText('🌙는 카페에서 ⭐를 기다렸다.',{exact:true}).waitFor();await page.locator('#close').click();await page.locator('#side-story-wand').click();await page.getByText('🌙는 카페에서 Serena를 기다렸다.',{exact:true}).waitFor();
 await page.locator('#reader-tools > summary').click();await page.locator('#open-temporary').click();assert.equal(await page.locator('[data-temp-field]').count(),0);assert.equal(await page.locator('#temporary-enabled').isChecked(),false);await page.locator('#temporary-add').click();await page.locator('[data-temp-delete]').click();assert.equal(await page.locator('[data-temp-field]').count(),0);await page.locator('#feature-close').click();
 const originals=await page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('st-sidestory-archive-v1',1);q.onsuccess=()=>{const db=q.result,r=db.transaction('records').objectStore('records').getAll();r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=()=>reject(r.error);};}));assert(originals.some(r=>r.mode==='story'&&r.content.includes('Slade')&&r.translationView?.content.includes('슬레이드')));assert(!originals.some(r=>r.content.includes('🌙')));
 assert.deepEqual(errors,[]);console.log('PASS reading: cancel/Esc, preset save/cancel, rules on original/translation, source-aware selection, PNG dimensions, uploaded backgrounds, pagination, mobile modal, archive return, isolated interactive HTML.');
} finally {await browser.close();}
