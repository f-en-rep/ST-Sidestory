import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSTHost} from '../src/st-host.js';
function fixture(){
 const handlers=new Map(),saved={uid:1,content:'NOT SELECTED',constant:true};
 const c={extensionSettings:{},eventTypes:{WORLDINFO_ENTRIES_LOADED:'loaded'},eventSource:{on:(name,fn)=>handlers.set(name,fn),removeListener:(name,fn)=>{if(handlers.get(name)===fn)handlers.delete(name);}}};
 const scan=()=>{const rows={globalLore:[saved],characterLore:[saved],chatLore:[saved],personaLore:[saved]};handlers.get('loaded')?.(rows);return rows;};
 return {c,handlers,saved,scan,host:createSTHost({context:()=>c})};
}
test('manual lore replaces automatic scan only for the request and leaves stored entries and Authors Note options intact',async()=>{
 const {c,handlers,saved,scan,host}=fixture();const before=structuredClone(saved);
 c.generateQuietPrompt=async args=>{assert(Object.values(scan()).every(rows=>rows.length===0));assert.equal(args.skipWIAN,undefined);assert.equal(args.quietPrompt,'SELECTED');return 'done';};
 await host.generate({useSillyTavernContext:true,selectedLoreOnly:true,quietPrompt:'SELECTED'});
 assert.equal(handlers.size,0);assert.deepEqual(saved,before);assert.equal(scan().globalLore.length,1);
 c.generateQuietPrompt=async()=>{assert.equal(scan().globalLore.length,1);return 'default';};
 assert.equal(await host.generate({useSillyTavernContext:true,quietPrompt:'TASK'}),'default');
});
test('manual lore hook survives UI cancellation until the underlying job stops, then is always removed',async()=>{
 const {c,handlers,host,scan}=fixture();let finish;
 c.generateQuietPrompt=()=>new Promise(resolve=>finish=resolve);
 const ctrl=new AbortController(),task=host.generate({useSillyTavernContext:true,selectedLoreOnly:true},ctrl.signal);
 await Promise.resolve();ctrl.abort();await assert.rejects(task,{name:'AbortError'});
 assert.equal(scan().globalLore.length,0);finish('late');
 for(let i=0;i<8;i++)await Promise.resolve();assert.equal(handlers.size,0);
 c.generateQuietPrompt=async()=>{throw Error('provider failure');};
 await assert.rejects(host.generate({useSillyTavernContext:true,selectedLoreOnly:true}),/provider failure/);assert.equal(handlers.size,0);
});
test('unsupported ST versions cannot silently ignore manual entry selection',async()=>{
 let sent=false;const host=createSTHost({context:()=>({generateQuietPrompt:async()=>{sent=true;return 'bad';}})});
 await assert.rejects(host.generate({useSillyTavernContext:true,selectedLoreOnly:true}),/WORLDINFO_ENTRIES_LOADED/);assert(!sent);
});
test('selected entries include only chosen IDs, support disabled entries and empty selection',async()=>{
 const source=fs.readFileSync(new URL('../src/generation.js',import.meta.url),'utf8');
 const collect=new Function('get','H','lorebooks',source.slice(0,source.indexOf('/* Generation orchestration'))+'return collectLore;')(
  async()=>[{id:'0',enabled:true,content:'EXCLUDED'},{id:'1',enabled:false,content:'CHOSEN'}],{parseObject:v=>v||{},truth:x=>x===true},[{id:'Book',name:'Book'}]);
 const options={loreIds:['Book'],loreEntries:{Book:['1']}};
 assert.deepEqual((await collect(options,{}))[0].entries,[{name:'',content:'CHOSEN'}]);
 options.loreEntries.Book=[];assert.deepEqual((await collect(options,{}))[0].entries,[]);
 options.loreIds=[];assert.deepEqual(await collect(options,{}),[]);
});
