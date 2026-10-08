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
 // ST themes can make body a containing block for fixed descendants.
 await page.setViewportSize({width:390,height:780});
 await page.evaluate(()=>{document.documentElement.style.transform='translateZ(0)';document.body.style.cssText='height:50vh;transform:translateY(-120px);filter:blur(0);overflow:hidden';});
 const bounds=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const r=await page.locator('.window').boundingBox();assert(Math.abs(r.x)<1&&Math.abs(r.y)<1,JSON.stringify(r));assert(Math.abs(r.height-(await page.evaluate(()=>visualViewport.height)))<2,JSON.stringify({r,view:await page.evaluate(()=>({h:visualViewport.height,host:document.getElementById("st-sidestory-root").style.cssText}))}));for(const id of ['#close','#generate']){const b=await page.locator(id).boundingBox();assert(b.y>=0&&b.y+b.height<=r.height+1,id);}};
 await bounds();await page.screenshot({path:'/tmp/st-sidestory-mobile-compose.png'});await page.locator('#request').fill('모바일 입력');await page.setViewportSize({width:390,height:430});await bounds();
 await page.locator('#close').click();assert(await page.locator('#st-sidestory-root').isHidden());
 await page.evaluate(()=>document.body.style.cssText='');await page.locator('#side-story-wand').click();await bounds();
 await page.setViewportSize({width:1280,height:850});

 // Use story to verify end-to-end raw generation and archive without modifying chat.
 await page.locator('[data-mode="story"]').first().click();
 await page.locator('#request').fill('두 사람이 카페에서 만나는 외전');await page.locator('#generate').click();
 await page.waitForFunction(()=>window.lastArgs);
 await page.locator('#result').getByText('두 사람은 카페에서 다시 만났다.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>fixture.chat.length),1);
 assert((await page.evaluate(()=>JSON.stringify(lastArgs.prompt))).includes('A quiet character'));
 assert((await page.evaluate(()=>JSON.stringify(lastArgs.prompt))).includes('Let us meet'));
 await page.locator('[data-page="archive"]').first().click();await page.getByText('두 사람이 카페에서 만나는 외전',{exact:true}).first().waitFor();
 await page.screenshot({path:path.join(process.env.SIDE_STORY_TEST_OUTPUT||'/tmp','side-story-desktop-test.png')});
 await page.locator('[data-page="create"]').first().click();
 await page.locator('[data-mode="visual"]').first().click();
 await page.evaluate(()=>window.nextResult='<!doctype html><html><head><title>Cafe</title></head><body><h1>CAFE</h1><button id="demo">메뉴 보기</button><p id="menu" hidden>커피 4,000원</p><script>document.getElementById("demo").addEventListener("click",()=>document.getElementById("menu").hidden=false);<\/script></body></html>');
 await page.locator('#request').fill('카페 메뉴판');await page.locator('#generate').click();
 const frame=page.frameLocator('iframe');await frame.locator('#demo').click();assert(await frame.locator('#menu').isVisible());
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(process.env.SIDE_STORY_TEST_OUTPUT||'/tmp','side-story-mobile-test.png')});
 assert.deepEqual(errors,[]);
 // New inner workspace: structured cards, PNG, drafts and chat isolation.
 await page.setViewportSize({width:1280,height:850});
 await page.locator('[data-page="inner"]').click();
 await page.locator('[data-setting="showInnerThoughts"]').check();
 await page.evaluate(()=>window.nextResult='<sideb-response><request>첫 질문</request><spoken>첫 답변</spoken><inner>숨긴 마음</inner></sideb-response><sideb-response><request>두번째 질문</request><spoken>두번째 답변</spoken></sideb-response>');
 await page.locator('#request').fill('내면 질문');await page.locator('#generate').click();
 await page.locator('.speak-request').first().waitFor();
 assert(await page.locator('.speak-inner').isVisible());
 await page.locator('[data-speak-next]').click();assert(await page.getByText('두번째 답변',{exact:true}).isVisible());
 await page.locator('[data-speak-prev]').click();
 await page.locator('[data-speak-stage]').dispatchEvent('pointerdown',{pointerId:1,clientX:200,clientY:100});
 await page.locator('[data-speak-stage]').dispatchEvent('pointerup',{pointerId:1,clientX:100,clientY:100});
 assert(await page.getByText('두번째 답변',{exact:true}).isVisible());
 await page.locator('#reader-tools summary').first().click();
 const download=page.waitForEvent('download');await page.locator('#save-image').click();const file=await download;const png=fs.readFileSync(await file.path());assert.equal(png.subarray(1,4).toString(),'PNG');assert(png.length>1000);
 await page.locator('[data-mode="write"]').click();await page.locator('#request').fill('편지 초안');
 await page.locator('[data-mode="speak"]').click();assert.equal(await page.locator('#request').inputValue(),'내면 질문');
 await page.locator('[data-history-toggle]').click();assert(await page.locator('[data-input-load]').isVisible());
 await page.locator('[data-input-pin]').click();
 await page.evaluate(()=>{fixture.chatId='Other chat';chatChanged();});
 await page.locator('#side-story-wand').click();assert.equal(await page.locator('#request').inputValue(),'');
 await page.locator('[data-history-toggle]').click();assert.equal(await page.locator('[data-input-load]').count(),0);
 await page.evaluate(()=>{fixture.chatId='Test chat';chatChanged();});
 await page.locator('#side-story-wand').click();assert.equal(await page.locator('#request').inputValue(),'내면 질문');
 await page.locator('[data-mode="write"]').click();assert.equal(await page.locator('#request').inputValue(),'편지 초안');
 assert.deepEqual(errors,[]);
 await page.reload();await page.locator('#side-story-wand').click();await page.locator('[data-page="archive"]').first().click();await page.getByText('두 사람이 카페에서 만나는 외전',{exact:true}).first().waitFor();
 console.log('PASS browser: startup, linked references, raw generation, original chat unchanged, archive/reload, interactive HTML, mobile viewport.');
} finally {await browser.close();}
