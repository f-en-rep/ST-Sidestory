import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from '../test-runtime/linkedom.mjs';

const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');

test('morph patches in place: nodes, scroll containers and code-managed content survive',()=>{
 const {document}=parseHTML('<html><body><div id="ui"></div></body></html>');
 const morph=new Function('document',read('morph.js')+';return SideMorph;')(document);
 const ui=document.getElementById('ui');
 morph.patch(ui,'<div class="scrim"></div><section class="sheet" data-key="sheet-a"><div class="body" data-ui-scroll="a"><p>one</p></div></section><div id="result" data-own></div>');
 const scrim=ui.querySelector('.scrim'),sheet=ui.querySelector('.sheet'),result=ui.querySelector('#result');
 result.className='prose';result.innerHTML='<iframe></iframe>';
 const kept=document.createElement('div');kept.dataset.keep='';ui.append(kept);
 morph.patch(ui,'<div class="scrim"></div><section class="sheet" data-key="sheet-a"><div class="body" data-ui-scroll="a"><p>two</p></div></section><div id="result" data-own></div>');
 assert.equal(ui.querySelector('.scrim'),scrim);assert.equal(ui.querySelector('.sheet'),sheet);
 assert.equal(sheet.textContent,'two');
 assert.equal(ui.querySelector('#result'),result);assert.equal(result.className,'prose');assert(result.querySelector('iframe'));
 assert(kept.parentNode===ui,'data-keep nodes stay');
 morph.patch(ui,'<div class="scrim"></div><section class="sheet" data-key="sheet-b"><p>other</p></section>');
 assert.equal(ui.querySelector('.scrim'),scrim,'the scrim is reused when only the sheet changes');
 assert.notEqual(ui.querySelector('.sheet'),sheet,'a different sheet is a new element');
 assert.equal(ui.querySelector('#result'),null);
});

test('morph keeps form state in step with the template',()=>{
 const {document}=parseHTML('<html><body><div id="ui"></div></body></html>');
 const morph=new Function('document',read('morph.js')+';return SideMorph;')(document);
 const ui=document.getElementById('ui');
 morph.patch(ui,'<input type="checkbox" class="c"><details><summary>s</summary></details>');
 ui.querySelector('details').setAttribute('open','');
 morph.patch(ui,'<input type="checkbox" class="c" checked><details><summary>s</summary></details>');
 assert.equal(ui.querySelector('.c').checked,true);
 assert(ui.querySelector('details').hasAttribute('open'),'a user-opened details stays open');
});
