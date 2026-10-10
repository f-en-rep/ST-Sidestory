import test from 'node:test';
import assert from 'node:assert/strict';
import {createSTHost} from '../src/st-host.js';

function fixture({sourcePresent=true,initAvailable=true}={}){
 const calls=[],registered=[],refreshed=[];
 const original={avatar:'origin.png',name:'Original',data:{name:'Original',description:'Original character text'}};
 const powerUserSettings={personas:{'me.png':'Original persona'},persona_descriptions:{'me.png':{description:'Original persona text'}}};
 const context={characters:[original],characterId:0,chatId:'test',powerUserSettings,getCurrentChatId(){return this.chatId;},getRequestHeaders:({omitContentType}={})=>omitContentType?{'x-test':'1'}:{'Content-Type':'application/json'},getCharacters:async()=>{}};
 const fetcher=async(url,opts={})=>{
  calls.push({url,opts});
  if(opts.method==='GET'){
   if(!sourcePresent && url!=='img/user-default.png')return {ok:false,status:404};
   return {ok:true,blob:async()=>new Blob([new Uint8Array(url.includes('user-default')?8:20)],{type:'image/png'})};
  }
  if(url==='/api/characters/create')return {ok:true,text:async()=> 'New Character.png'};
  if(url==='/api/avatars/upload')return {ok:true,json:async()=>({path:opts.body.get('overwrite_name')})};
  throw new Error('Unexpected mock URL '+url);
 };
 const personasApi=initAvailable?{initPersona:async(...args)=>registered.push(args),getUserAvatars:async(...args)=>refreshed.push(args)}:{};
 const adapter=createSTHost({context:()=>context,state:{user_avatar:'me.png',default_user_avatar:'img/user-default.png'},personasApi,fetcher});
 return {adapter,calls,registered,refreshed,original,powerUserSettings};
}

test('new character inherits a separately uploaded original avatar without editing its source',async()=>{
 const f=fixture();
 assert.equal(await f.adapter.createCharacterFromProfile({name:'A AU',description:'New character sheet',sourceAvatar:'origin.png'}),'New Character.png');
 const upload=f.calls.find(x=>x.url==='/api/characters/create');
 assert(upload.opts.body instanceof FormData);
 assert(upload.opts.body.get('avatar') instanceof File);
 assert.equal(upload.opts.body.get('description'),'New character sheet');
 assert.equal(upload.opts.body.get('ch_name'),'A AU');
 assert.equal(f.original.data.description,'Original character text');
 assert(f.calls.some(x=>x.url==='characters/origin.png'));
});

test('new character keeps existing default avatar fallback when source image is unavailable',async()=>{
 const f=fixture({sourcePresent:false});
 await f.adapter.createCharacterFromProfile({name:'Fallback',description:'Text',sourceAvatar:'missing.png'});
 const request=f.calls.find(x=>x.url==='/api/characters/create');
 assert.equal(typeof request.opts.body,'string');
 assert.equal(JSON.parse(request.opts.body).description,'Text');
});

test('new persona registers an independent image and description without selecting or overwriting the original',async()=>{
 const f=fixture();
 const id=await f.adapter.createPersonaFromProfile({name:'Persona AU',description:'New persona description',sourceAvatar:'me.png'});
 const upload=f.calls.find(x=>x.url==='/api/avatars/upload');
 assert(upload.opts.body instanceof FormData);
 assert(upload.opts.body.get('avatar') instanceof File);
 assert(id.startsWith('side-story-')&&id.endsWith('.png'));
 assert.equal(upload.opts.body.get('overwrite_name'),id);
 assert.deepEqual(f.registered[0],[id,'Persona AU','New persona description','']);
 assert.equal(f.refreshed[0][1],id);
 assert.equal(f.powerUserSettings.persona_descriptions['me.png'].description,'Original persona text');
 assert(f.calls.some(x=>x.url==='User Avatars/me.png'));
});

test('persona source image falls back to SillyTavern default, without touching original',async()=>{
 const f=fixture({sourcePresent:false});
 const id=await f.adapter.createPersonaFromProfile({name:'Fallback Persona',description:'Text',sourceAvatar:'missing.png'});
 assert(id);
 assert(f.calls.some(x=>x.url==='img/user-default.png'));
 assert.equal(f.registered.length,1);
});

test('persona save rejects missing SillyTavern persona module before uploading',async()=>{
 const f=fixture({initAvailable:false});
 await assert.rejects(()=>f.adapter.createPersonaFromProfile({name:'X',description:'Text'}),/페르소나 모듈/);
 assert.equal(f.calls.length,0);
});
