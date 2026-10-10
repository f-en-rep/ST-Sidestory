from pathlib import Path
import json
root=Path(__file__).parent
src=root/'src'
files=['replacement.js','reading-surface.js','token-budget.js','extras.js','transport.js','facet.js','core.js','renderer.js','extras-ui.js','enhancements.js','design.js','compact.js','series.js','composer.js','reading-ui.js','excerpt.js','generation.js','extension.js']
code='const SIDE_STYLE='+json.dumps((src/'style.css').read_text(),ensure_ascii=False)+';\n'
code+='\n'.join((src/f).read_text() for f in files)
wrapper='''import { createSTHost } from './src/st-host.js';
let hostAdapter,starting;
function start(){if(!starting)starting=startOnce().finally(()=>{starting=null;});return starting;}
async function startOnce() {
 if(document.getElementById('st-sidestory-root'))return;
 if(!globalThis.SillyTavern?.getContext)throw new Error('실리태번 컨텍스트를 찾지 못했어요.');
 let world={},state={},services={},personasApi={};
 try { world=await import('../../../world-info.js'); } catch(e) { console.warn('[Side Story] World Info module unavailable',e); }
 try { state=await import('../../../../script.js'); } catch(e) { console.warn('[Side Story] Optional state module unavailable',e); }
 try { services=await import('../../shared.js'); } catch(e) { console.warn('[Side Story] Connection service module unavailable',e); }
 try { personasApi=await import('../../../personas.js'); } catch(e) { console.warn('[Side Story] Persona module unavailable',e); }
 hostAdapter=createSTHost({world,state,services,personasApi});
 await (async function(stHost){
'''
wrapper+=code+'\n})(hostAdapter);\n}\n'
wrapper+='''export function onDisable(){hostAdapter?.cleanup();}
export function onEnable(){return start();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(report),{once:true});
else start().catch(report);
function report(e){console.error('[Side Story]',e);globalThis.toastr?.error(e.message,'Side Story');}
'''
(root/'index.js').write_text(wrapper)
print('Built index.js')

