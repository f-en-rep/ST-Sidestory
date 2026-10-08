import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.SIDE_STORY_BROWSER||undefined,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 const requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.fulfill({contentType:'text/html',body:'<html><head></head><body><p id="host-secret">HOST</p></body></html>'});});
 await page.goto('https://sideb.test');requests.length=0;
 await page.addScriptTag({content:fs.readFileSync(new URL('../src/extras.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8')+'\nwindow.H=SideHTML;'});
 const source=`<!doctype html><html><head><style>[hidden]{display:none!important}.screen{padding:20px}button{padding:12px}</style></head><body><section id="home" class="screen"><button id="app" data-open="messages">Messages</button></section><section id="messages" hidden><p id="message-text">Hello</p><button id="back">Home</button></section><button id="cafe">Cafe</button><p id="thought" hidden>Sweet coffee after work</p><button id="bad-inline" onclick="document.body.dataset.bad='yes'">Inline enabled</button><script>document.addEventListener('DOMContentLoaded',()=>{const home=document.getElementById('home'),messages=document.getElementById('messages');document.getElementById('app').addEventListener('click',()=>{home.hidden=true;messages.hidden=false;});document.getElementById('back').addEventListener('click',()=>{messages.hidden=true;home.hidden=false;});document.getElementById('cafe').addEventListener('click',()=>document.getElementById('thought').hidden=false);try{parent.document.getElementById('host-secret');document.body.dataset.host='exposed';}catch{document.body.dataset.host='blocked';}try{localStorage.setItem('secret','x');document.body.dataset.storage='exposed';}catch{document.body.dataset.storage='blocked';}fetch('https://blocked.test/api').then(()=>document.body.dataset.fetch='exposed').catch(()=>document.body.dataset.fetch='blocked');document.body.dataset.popup=window.open('https://blocked.test/popup')?'exposed':'blocked';try{top.location='https://blocked.test/top';}catch{};});</script></body></html>`;
 await page.evaluate(source=>document.body.append(H.frame(source,{original:true,interactive:true})),source);
 let child=page.frames().find(f=>f.parentFrame());
 await child.waitForSelector('body[data-fetch="blocked"]');
 assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');
 for(const name of ['host','storage','fetch','popup'])assert.equal(await child.locator('body').getAttribute('data-'+name),'blocked');
 assert.equal(page.url(),'https://sideb.test/');
 assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentDocument),null);
 await child.locator('#app').click();assert(await child.locator('#messages').isVisible());assert(!(await child.locator('#home').isVisible()));
 await child.locator('#back').click();assert(await child.locator('#home').isVisible());
 await child.locator('#cafe').click();assert(await child.locator('#thought').isVisible());
 await child.locator('#app').click();assert(await child.locator('#messages').isVisible());
 await child.locator('#bad-inline').click();assert.equal(await child.locator('body').getAttribute('data-bad'),'yes');
 await child.evaluate(()=>{const img=new Image();img.src='https://blocked.test/image';document.body.append(img);});
 await page.waitForTimeout(100);assert.deepEqual(requests,[]);
 const png=await page.evaluate(async()=>{const blob=await H.png(document.querySelector('iframe'));return {type:blob.type,size:blob.size};});assert.equal(png.type,'image/png');assert(png.size>100);
 const exported=await page.evaluate(source=>H.exportDocument(source),source);
 await page.setContent(exported);child=page.frames().find(f=>f.parentFrame());await child.waitForSelector('#app');await child.locator('#app').click();assert(await child.locator('#messages').isVisible());
 // Inline-only fragments must work, including dynamically-created handlers.
 await page.evaluate(()=>{document.body.replaceChildren(H.frame('<button id="only" onclick="this.textContent=event.type">Only</button>',{interactive:true,original:true}));});
 child=page.frames().find(f=>f.parentFrame());await child.locator('#only').click();assert.equal(await child.locator('#only').textContent(),'click');
 await child.evaluate(()=>{const b=document.createElement('button');b.id='dynamic';b.setAttribute('onclick',"alert('file preview')");document.body.append(b);});
 await child.locator('#dynamic').click();await child.getByRole('dialog').waitFor();assert((await child.getByRole('dialog').textContent()).includes('file preview'));await child.getByRole('button',{name:'확인'}).click();assert.equal(await child.getByRole('dialog').count(),0);
 // Disabling scripts removes both script blocks and inline handlers.
 await page.evaluate(source=>document.body.replaceChildren(H.frame(source,{interactive:false,original:true})),source);
 child=page.frames().find(f=>f.parentFrame());assert.equal(await child.locator('#bad-inline').count(),0);assert.equal(await child.locator('script').count(),0);
 console.log('PASS Chromium: app/back interactions, host/storage isolation, blocked fetch/images/popups/top navigation, native inline handlers, current-DOM PNG capture and sandboxed HTML export.');
} finally {await browser.close();}
