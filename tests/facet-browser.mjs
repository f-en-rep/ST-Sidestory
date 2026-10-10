import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const dir=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({headless:true,executablePath:process.env.SIDE_STORY_BROWSER||undefined,args:['--no-sandbox']});
try {
 const created=[],uploadedPersonas=[];
 const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8aAAAAABJRU5ErkJggg==','base64');
 const page=await browser.newPage({viewport:{width:1280,height:850}});const errors=[];page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://sideb.test/**', async r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="extensionsMenu"></div><script type="module" src="/scripts/extensions/third-party/ST-Sidestory/index.js"></script></body></html>'});
  if(p==='/scripts/world-info.js')return r.fulfill({contentType:'text/javascript',body:'export const world_names=["Book"];export const selected_world_info=["Book"];export async function loadWorldInfo(){return {entries:{0:{uid:0,comment:"Place",content:"A quiet cafe",disable:false}}}}'});
  if(p==='/scripts/extensions/shared.js')return r.fulfill({contentType:'text/javascript',body:'export {};'});
  if(p==='/script.js')return r.fulfill({contentType:'text/javascript',body:'export const user_avatar="user.png";export const default_user_avatar="img/user-default.png";export function isGenerating(){return false;}'});
  if(p==='/scripts/personas.js')return r.fulfill({contentType:'text/javascript',body:'export async function initPersona(id,name,description,title){window.createdPersonas.push({id,name,description,title});} export async function getUserAvatars(){}'});
  if(['/characters/a.png','/User%20Avatars/user.png','/img/user-default.png'].includes(p))return r.fulfill({contentType:'image/png',body:tinyPng});
  const rel=p.replace('/scripts/extensions/third-party/ST-Sidestory/','');
  if(!rel.startsWith('/')&&!rel.includes('..')&&fs.existsSync(path.join(dir,rel)))return r.fulfill({contentType:rel.endsWith('.js')?'text/javascript':'application/octet-stream',body:fs.readFileSync(path.join(dir,rel))});
  if(p==='/api/characters/create'){
   const request=r.request(),payload=request.postData()||'';
   const entry=name=>payload.split('name="'+name+'"\r\n\r\n')[1]?.split('\r\n')[0]||'';
   created.push(request.headers()['content-type']?.includes('multipart/form-data')?{ch_name:entry('ch_name'),description:entry('description'),avatarAttached:payload.includes('name="avatar"')}:request.postDataJSON());
   return r.fulfill({body:'A AU.png'});
  }
  if(p==='/api/avatars/upload'){
   const payload=r.request().postData()||'',avatarId=payload.split('name="overwrite_name"\r\n\r\n')[1]?.split('\r\n')[0];
   assert(avatarId&&payload.includes('name="avatar"'));uploadedPersonas.push(avatarId);
   return r.fulfill({contentType:'application/json',body:JSON.stringify({path:avatarId})});
  }
  if(p==='/thumbnail')return r.fulfill({status:404,body:''});throw new Error('Unexpected request '+p);
 });
 await page.addInitScript(()=>{
  window.createdPersonas=[];
  window.fixture={chatId:'Test chat',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:'A quiet character',extensions:{world:'Book'}}}],chat:[{mes:'Let us meet at the cafe',name:'A',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'user.png':'User'},persona_descriptions:{'user.png':{description:'A friend'}}},name1:'User',mainApi:'openai',extensionSettings:{},saveSettingsDebounced(){},getRequestHeaders:({omitContentType}={})=>omitContentType?{}:({'Content-Type':'application/json'}),getTokenCountAsync:async text=>Math.ceil(text.length/3),getCurrentChatId(){return this.chatId;},generateRaw:async function(args){window.lastArgs=args;return window.nextResult||'두 사람은 카페에서 다시 만났다.';},eventSource:{on(name,fn){window.chatChanged=fn;},removeListener(){}},eventTypes:{CHAT_CHANGED:'chat_changed'}};
  window.SillyTavern={getContext:()=>window.fixture};
 });
 await page.goto('https://sideb.test/');
 await page.locator('#side-story-wand').click();await page.locator('#open-references').click();
 await page.locator('#close-references-done').click();


 await page.locator('[data-mode="facet"]').click();
 await page.locator('[data-facet="au"]').fill('Sentinel AU');
 await page.locator('.facet-prompt > summary').click();const defaultPrompt=await page.locator('[data-facet="prompt"]').inputValue();assert(defaultPrompt.includes('GENRE'));assert(defaultPrompt.includes('{{설정된AU}}'));
 await page.locator('[data-facet="prompt"]').fill('{{char}} / {{user}} / {{설정된AU}} / {{변경정도}} / {{유저관계설정}} / {{원본관계반영}} / {{유의사항}}');
 await page.locator('[data-facet="cautions"]').fill('Keep the original headings');
 await page.locator('[data-facet-choice="relationship"][data-value="true"]').click();assert(await page.locator('[data-facet-choice="originalRelationship"]').first().isVisible());
 await page.locator('[data-facet-choice="relationship"][data-value="false"]').click();assert.equal(await page.locator('[data-facet-choice="originalRelationship"]').count(),0);
 await page.evaluate(()=>window.nextResult='Name: A\nAbility: Sentinel');await page.locator('#generate').click();await page.frameLocator('#result iframe').getByText('Ability: Sentinel',{exact:false}).waitFor();
 const args=await page.evaluate(()=>window.lastArgs.prompt);assert(args[0].content.includes('A / User / Sentinel AU'));assert(args[0].content.includes('Keep the original headings'));assert(!args[0].content.includes('원본의 유저와의 관계'));assert(args[1].content.includes('A quiet character'));assert(args[1].content.includes('Let us meet at the cafe'));
 await page.locator('#reader-tools > summary').click();await page.locator('#edit').click();await page.locator('#edit-source').fill('Name: A\nAbility: Edited Sentinel');await page.locator('#save-edit').click();await page.frameLocator('#result iframe').getByText('Edited Sentinel',{exact:false}).waitFor();
 await page.locator('#reader-tools > summary').click();assert.equal(await page.locator('#continue').count(),0);assert.equal(await page.locator('[data-continuation-mode]').count(),0);
 await page.locator('.followup > summary').click();await page.locator('#followup').fill('Make the ability weaker');await page.evaluate(()=>window.nextResult='Name: A\nAbility: Weak Sentinel');await page.locator('#revise').click();await page.frameLocator('#result iframe').getByText('Ability: Weak Sentinel',{exact:false}).waitFor();assert((await page.evaluate(()=>window.lastArgs.prompt)).some(x=>x.content.includes('Make the ability weaker')));
 await page.locator('#reader-tools > summary').click();await page.locator('#facet-save-character').click();await page.locator('#side-dialog-input').fill('A Sentinel');await page.locator('#side-dialog-confirm').click();await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('notice').textContent.includes('새 캐릭터로 저장'));
 assert.equal(created.length,1);assert.equal(created[0].description,'Name: A\nAbility: Weak Sentinel');assert.equal(created[0].ch_name,'A Sentinel');assert(created[0].avatarAttached);assert.equal(await page.evaluate(()=>fixture.characters[0].data.description),'A quiet character');
 await page.locator('#reader-tools > summary').click();await page.locator('#facet-save-persona').click();await page.locator('#side-dialog-input').fill('User Sentinel');await page.locator('#side-dialog-confirm').click();await page.waitForFunction(()=>window.createdPersonas.length===1);
 const persona=await page.evaluate(()=>window.createdPersonas[0]);assert.equal(persona.name,'User Sentinel');assert.equal(persona.description,'Name: A\nAbility: Weak Sentinel');assert.equal(uploadedPersonas[0],persona.id);assert.equal(await page.evaluate(()=>fixture.powerUserSettings.persona_descriptions['user.png'].description),'A friend');
 await page.evaluate(()=>fixture.generateRaw=async args=>JSON.stringify({items:JSON.parse(args.prompt[1].content).items.map(i=>({...i,text:'번역 '+i.text}))}));await page.locator('#translate').click();await page.frameLocator('#result iframe').getByText('번역',{exact:false}).first().waitFor();
 await page.locator('#reader-tools > summary').click();await page.locator('#facet-save-character').click();await page.locator('#side-dialog-confirm').click();await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('notice').textContent.includes('새 캐릭터로 저장'));assert.equal(created.length,2);assert(created[1].description.includes('번역'));
 await page.locator('#reader-tools > summary').click();const pngDownload=page.waitForEvent('download');await page.locator('#save-image').click();const png=fs.readFileSync(await (await pngDownload).path());assert.equal(png.toString('ascii',1,4),'PNG');
 await page.locator('.work-folder-tabs [data-page="create"]').click();await page.locator('[data-facet="au"]').waitFor({state:'detached'});await page.locator('[data-mode="facet"]').click();assert.equal(await page.locator('[data-facet="au"]').inputValue(),'Sentinel AU');
 await page.setViewportSize({width:390,height:780});const width=await page.locator('.window').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert(width.scroll<=width.client+1);await page.screenshot({path:'/tmp/facet-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS facet: default English prompt, macros/context, revise, no continuation, character/avatar and persona/avatar saving, translation save, tab isolation, mobile layout');
}finally{await browser.close();}
