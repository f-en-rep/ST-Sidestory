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
   const entry=name=>payload.split('name="'+name+'"\r\n\r\n')[1]?.split('\r\n--')[0]?.replace(/\r\n/g,'\n')||'';
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
  window.createdPersonas=[];window.generatedArgs=[];
  window.fixture={chatId:'Test chat',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:'A quiet character',extensions:{world:'Book'}}}],chat:[{mes:'Let us meet at the cafe',name:'A',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'user.png':'User'},persona_descriptions:{'user.png':{description:'A friend'}}},name1:'User',mainApi:'openai',extensionSettings:{},saveSettingsDebounced(){},getRequestHeaders:({omitContentType}={})=>omitContentType?{}:({'Content-Type':'application/json'}),getTokenCountAsync:async text=>Math.ceil(text.length/3),getCurrentChatId(){return this.chatId;},generateRaw:async function(args){window.lastArgs=args;window.generatedArgs.push(args);
    if(args.prompt?.[0]?.content.includes('# EXTRACT IDENTITY ONLY')){
      const task=JSON.parse(args.prompt[1].content.split('CURRENT TASK\n')[1]);
      const kinds=task.target==='both'?['character','user']:[task.target];
      return JSON.stringify({schema:'sidestory-identity-v1',subjects:kinds.map(kind=>({kind,name:kind==='character'?'A':'User',gender:'female',age:'adult',relative_age:'same age',alignment:'neutral',hair:'silver',eyes:'blue',height:'tall',build:'slender',design:'quiet impression',temperament:['reserved','kind','proud','curious'],speech:'soft voice',interpersonal:['guarded'],sheet_layout:['Name','Ability']})),relationship:task.relationshipMode==='original'?'friends':'',counterpart:task.target==='both'?null:{name:task.target==='character'?'User':'A',gender:'female',age:'adult'}});
    }
    return window.nextResult||'두 사람은 카페에서 다시 만났다.';},eventSource:{on(name,fn){window.chatChanged=fn;},removeListener(){}},eventTypes:{CHAT_CHANGED:'chat_changed'}};
  window.SillyTavern={getContext:()=>window.fixture};
 });
 await page.goto('https://sideb.test/');
 await page.locator('#side-story-wand').click();await page.locator('#open-references').click();
 await page.locator('#close-references-done').click();


 await page.locator('[data-mode="facet"]').click();
 await page.locator('[data-facet="au"]').fill('Sentinel AU');
 await page.locator('[data-facet-choice="degree"][data-value="rebuild"]').click();assert.equal(await page.locator('[data-facet-choice="degree"][data-value="rebuild"]').getAttribute('aria-pressed'),'true');
 await page.locator('.facet-prompt > summary').click();const defaultPrompt=await page.locator('[data-facet="prompt"]').inputValue();assert(defaultPrompt.includes('GENRE'));assert(defaultPrompt.includes('{{설정된AU}}'));assert(defaultPrompt.includes('distinctive ways of perceiving'));assert(defaultPrompt.includes('neutral sheet headings'));
 await page.locator('[data-facet="prompt"]').fill('{{char}} / {{user}} / {{설정된AU}} / {{변경정도}} / {{유저관계설정}} / {{원본관계반영}} / {{유의사항}}');
 await page.locator('[data-facet="cautions"]').fill('Keep the original headings');
 await page.locator('[data-facet-choice="relation"][data-value="original"]').click();assert.equal(await page.locator('[data-facet-choice="relation"][aria-pressed="true"]').getAttribute('data-value'),'original');
 await page.locator('[data-facet-choice="relation"][data-value="none"]').click();assert.equal(await page.locator('[data-facet-choice="relation"][aria-pressed="true"]').getAttribute('data-value'),'none');assert.equal(await page.locator('[data-setting="lengthPreset"]').count(),1);
 await page.locator('[data-facet-choice="relation"][data-value="custom"]').click();await page.locator('[data-facet="relationInput"]').fill('estranged siblings');assert.equal(await page.locator('[data-facet="relationInput"]').inputValue(),'estranged siblings');await page.locator('[data-facet-choice="relation"][data-value="none"]').click();assert.equal(await page.locator('[data-facet="relationInput"]').count(),0);
 await page.locator('[data-facet-work="identity"]').click();await page.evaluate(()=>window.nextResult='Name: A\nAbility: Sentinel');await page.locator('#generate').click();await page.locator('#facet-use-identity').waitFor();assert(await page.locator('.facet-plan-preview').getByText('캐릭터 · A',{exact:false}).count());
 // Review tools never call the model; edited identity is the source of the next request.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{window.copiedIdentity=t;}}}));
 await page.locator('#facet-identity-edit').click();
 await page.locator('[data-identity-subject="0"][data-identity-field="hair"]').fill('green');
 await page.locator('[data-identity-subject="0"][data-identity-field="temperament"]').fill('USER_EDITED_TRAIT\nsecond\nthird\nfourth');
 await page.locator('#facet-identity-copy').click();assert((await page.evaluate(()=>window.copiedIdentity)).includes('USER_EDITED_TRAIT'));
 const textDownload=page.waitForEvent('download');await page.locator('#facet-identity-export').click();assert((await textDownload).suggestedFilename().endsWith('.md'));
 const jsonDownload=page.waitForEvent('download');await page.locator('#facet-identity-json').click();assert((await jsonDownload).suggestedFilename().endsWith('.json'));
 await page.locator('#facet-identity-save').click();await page.locator('[data-identity-field="hair"]').waitFor({state:'detached'});
 await page.locator('#facet-identity-edit').click();await page.locator('[data-identity-subject="0"][data-identity-field="hair"]').fill('CANCELLED_RED');await page.locator('#facet-identity-cancel').click();assert(!(await page.locator('.identity-preview').textContent()).includes('CANCELLED_RED'));
 const identityPngDownload=page.waitForEvent('download');await page.locator('#facet-identity-png').click();const identityPng=await identityPngDownload;await identityPng.saveAs('/tmp/facet-identity.png');assert(fs.statSync('/tmp/facet-identity.png').size>1000);
 const imageData='data:image/png;base64,'+fs.readFileSync('/tmp/facet-identity.png').toString('base64');
 assert(await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let dark=0,light=0;for(let i=0;i<d.length;i+=4){if(d[i+3]===255){if(d[i]<150)dark++;if(d[i]>240)light++;}}return dark>100&&light>1000;},imageData),'PNG must contain visible text and background');
 assert.equal(await page.evaluate(()=>window.generatedArgs.length),1);
 // Opening an archived stage-one design must still allow switching to the composer.
 await page.locator('.top-actions [data-page="archive"]').click();
 await page.locator('.card-open').first().click();
 await page.locator('#facet-plan-regenerate').waitFor();
 await page.setViewportSize({width:390,height:780});
 await page.locator('[data-pane="compose"]').click();
 assert(await page.locator('.composer').isVisible(),'archive-opened plan should show composer on mobile');
 assert(!await page.locator('.reader.facet-plan-reader').isVisible(),'archive-opened plan must hide the reader on composer tab');
 assert(await page.locator('[data-facet-extract-target="character"]').isVisible(),'extraction form should be visible');
 await page.locator('[data-pane="result"]').click();
 assert(await page.locator('#facet-plan-regenerate').isVisible(),'result tab restores archived plan');
 await page.screenshot({path:'/tmp/facet-review-mobile.png'});
 const scrollBox=page.locator('.facet-plan-scroll');
 await scrollBox.evaluate(el=>{el.querySelector('.identity-field>div').textContent+=' 긴 설계 내용이 이어집니다.'.repeat(500);el.scrollTop=el.scrollHeight;});
 const scrollState=await scrollBox.evaluate(el=>({scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}));
 assert(scrollState.scrollTop>0&&scrollState.scrollHeight>scrollState.clientHeight,'AU plan should scroll on mobile');
 assert(await page.locator('#facet-use-identity').isVisible(),'saved identity action remains reachable outside scrolling content');
 await page.setViewportSize({width:1280,height:850});
 assert.equal(await page.evaluate(()=>window.generatedArgs.length),1);
 assert.equal(await page.locator('#facet-plan-feedback').count(),0,'long plan should not include feedback at bottom');
 await page.locator('#facet-plan-regenerate').click();
 await page.locator('#side-dialog-textarea').waitFor();
 assert.equal(await page.evaluate(()=>window.generatedArgs.length),1,'opening the feedback dialog must not call AI');
 await page.locator('#side-dialog-cancel').click();
 assert.equal(await page.evaluate(()=>window.generatedArgs.length),1,'cancelling feedback must not call AI');
 await page.locator('#facet-plan-regenerate').click();
 await page.locator('#side-dialog-textarea').fill('이름과 쌍둥이 관계만 유지하고 성장 배경은 새롭게');
 await page.locator('#side-dialog-confirm').click();
 await page.locator('#facet-use-identity').waitFor();assert.equal(await page.evaluate(()=>window.generatedArgs.length),2);const feedbackSent=await page.evaluate(()=>window.generatedArgs[1].prompt.some(row=>row.content.includes('이름과 쌍둥이 관계만 유지하고 성장 배경은 새롭게')));assert(feedbackSent,'User review feedback must reach stage-one replan request');await page.locator('#facet-identity-edit').click();await page.locator('[data-identity-subject="0"][data-identity-field="hair"]').fill('REVIEWED_GREEN');await page.locator('#facet-use-identity').click();await page.locator('[data-facet-work="au"][aria-pressed="true"]').waitFor();
 await page.locator('.facet-source-active').first().waitFor();
 await page.locator('[data-ui-persist-open="facet-selected-character"] summary').click();
 assert((await page.locator('[data-ui-persist-open="facet-selected-character"]').textContent()).includes('REVIEWED_GREEN'),'selected full preview shows edited fields');
 await page.locator('[data-ui-persist-open="facet-picker-character"] summary').click();
 assert(await page.locator('.facet-source-version').count()>0,'version comparison visible');
 await page.locator('.facet-source-active [data-facet-rename-kind="character"]').click();
 await page.locator('#side-dialog-input').fill('A · 수정한 핵심정보');
 await page.locator('#side-dialog-confirm').click();
 assert((await page.locator('.facet-source-active .facet-source-name strong').textContent()).includes('A · 수정한 핵심정보'),'alias must show in selected version title');
 assert((await page.locator('.facet-source-version.selected .facet-source-name strong').first().textContent()).includes('A · 수정한 핵심정보'),'alias must appear in version list');

 await page.setViewportSize({width:390,height:780});
 const scrollBefore=await page.locator('.compose-scroll').evaluate(el=>{el.scrollTop=245;return el.scrollTop;});
 assert(scrollBefore>20,'mobile AU composer should scroll');
 await page.locator('[data-facet-choice="degree"][data-value="rebuild"]').evaluate(el=>el.click());
 const scrollAfter=await page.locator('.compose-scroll').evaluate(el=>el.scrollTop);
 assert(scrollAfter>=scrollBefore-5,'same-view rerender preserves composer scroll');
 assert(await page.locator('[data-ui-persist-open="facet-picker-character"]').evaluate(el=>el.open),'source comparison stays open after rerender');
 await page.setViewportSize({width:1280,height:850});
 await page.locator('#generate').click();await page.frameLocator('#result iframe').getByText('Ability: Sentinel',{exact:false}).waitFor();
 const pair=await page.evaluate(()=>window.generatedArgs.slice(1,3).map(x=>x.prompt));const args=pair[1];assert.equal(pair.length,2);assert(pair[0][1].content.includes('A quiet character'));assert(pair[0][1].content.includes('Let us meet at the cafe'));assert(args[0].content.includes('ESSENCE-ONLY CONTINUITY'));assert(args[1].content.includes('REVIEWED IDENTITY'));assert(args[1].content.includes('REVIEWED_GREEN'));assert(!args[1].content.includes('A quiet character'));assert(!args[1].content.includes('Let us meet at the cafe'));assert(args[0].content.includes('Keep the original headings'));
 await page.locator('#reader-tools > summary').click();await page.locator('#edit').click();await page.locator('#edit-source').fill('Name: A\nAbility: Edited Sentinel');await page.locator('#save-edit').click();await page.frameLocator('#result iframe').getByText('Edited Sentinel',{exact:false}).waitFor();
 await page.locator('#reader-tools > summary').click();assert.equal(await page.locator('#continue').count(),0);assert.equal(await page.locator('[data-continuation-mode]').count(),0);
 await page.locator('.followup > summary').click();await page.locator('#followup').fill('Make the ability weaker');await page.evaluate(()=>window.nextResult='Name: A\nAbility: Weak Sentinel');await page.locator('#revise').click();await page.frameLocator('#result iframe').getByText('Ability: Weak Sentinel',{exact:false}).waitFor();assert((await page.evaluate(()=>window.lastArgs.prompt)).some(x=>x.content.includes('Make the ability weaker')));
 await page.locator('#reader-tools > summary').click();await page.locator('#facet-save-character').click();await page.locator('#side-dialog-input').fill('A Sentinel');await page.locator('#side-dialog-confirm').click();await page.waitForFunction(()=>document.getElementById('st-sidestory-root').shadowRoot.getElementById('notice').textContent.includes('새 캐릭터로 저장'));
 assert.equal(created.length,1);assert.equal(created[0].description,'Name: A\nAbility: Weak Sentinel');assert.equal(created[0].ch_name,'A Sentinel');assert(created[0].avatarAttached);assert.equal(await page.evaluate(()=>fixture.characters[0].data.description),'A quiet character');
 await page.locator('[data-facet-choice="target"][data-value="user"]').click();await page.evaluate(()=>window.nextResult='Name: User\nAbility: Guide');await page.locator('#generate').click();await page.locator('[data-facet-work="identity"][aria-pressed="true"]').waitFor();await page.locator('#generate').click();await page.locator('#facet-use-identity').waitFor();await page.locator('#facet-use-identity').click();await page.locator('#generate').click();await page.frameLocator('#result iframe').getByText('Ability: Guide',{exact:false}).waitFor();assert.equal(await page.locator('#facet-save-character').count(),0);
 await page.locator('#reader-tools > summary').click();await page.locator('#facet-save-persona').click();await page.locator('#side-dialog-input').fill('User Sentinel');await page.locator('#side-dialog-confirm').click();await page.waitForFunction(()=>window.createdPersonas.length===1);
 const persona=await page.evaluate(()=>window.createdPersonas[0]);assert.equal(persona.name,'User Sentinel');assert.equal(persona.description,'Name: User\nAbility: Guide');assert.equal(uploadedPersonas[0],persona.id);assert.equal(await page.evaluate(()=>fixture.powerUserSettings.persona_descriptions['user.png'].description),'A friend');
 await page.evaluate(()=>fixture.generateRaw=async args=>JSON.stringify({items:JSON.parse(args.prompt[1].content).items.map(i=>({...i,text:'번역 '+i.text}))}));await page.locator('#translate').click();await page.frameLocator('#result iframe').getByText('번역',{exact:false}).first().waitFor();
 await page.locator('#reader-tools > summary').click();await page.locator('#facet-save-persona').click();await page.locator('#side-dialog-confirm').click();await page.waitForFunction(()=>window.createdPersonas.length===2);assert(await page.evaluate(()=>window.createdPersonas[1].description.includes('번역')));
 await page.locator('#reader-tools > summary').click();const pngDownload=page.waitForEvent('download');await page.locator('#save-image').click();const png=fs.readFileSync(await (await pngDownload).path());assert.equal(png.toString('ascii',1,4),'PNG');
 await page.locator('.work-folder-tabs [data-page="create"]').click();await page.locator('[data-facet="au"]').waitFor({state:'detached'});await page.locator('[data-mode="facet"]').click();assert.equal(await page.locator('[data-facet="au"]').inputValue(),'Sentinel AU');
 await page.setViewportSize({width:390,height:780});const width=await page.locator('.window').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert(width.scroll<=width.client+1);await page.screenshot({path:'/tmp/facet-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS facet: identity extraction, edit/save/cancel/approve, source isolation, copy/text/JSON/PNG, relationship input, profile saving, translation and mobile layout');
}finally{await browser.close();}
