/* Host transport, prompt-context shaping, and safe rendering helpers. */
const HostCore=(()=>{
  const parse = (value, fallback={}) => { if (typeof value !== 'string') return value ?? fallback; try { return JSON.parse(value); } catch { return fallback; } };
  const parseObject = (value, fallback={}) => { const parsed=parse(value,fallback); return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:fallback; };
  const parseArray = (value, fallback=[]) => { const parsed=parse(value,fallback); return Array.isArray(parsed)?parsed:fallback; };
  const truth = x => x === true || x === 'true';
  const esc = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid = () => globalThis.crypto?.randomUUID?.() || `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function character(row) {
    const d=parseObject(row?.data,parseObject(row)); const ext=parseObject(d.extensions);
    return {name:d.name||row?.name||'이름 없음',description:d.description||'',personality:d.personality||'',scenario:d.scenario||'',backstory:d.backstory||ext.backstory||'',appearance:d.appearance||ext.appearance||'',exampleDialogue:d.mes_example||d.exampleDialogue||''};
  }
  async function context({chat,cards=[],personas=[],messages=[],lore=[]}, s, counter) {
    const meta=parseObject(chat.metadata), warnings=[];
    let eligible=messages.filter(m=>!truth(parseObject(m.extra).hiddenFromAI)&&!truth(parseObject(m.extra).hiddenFromUser)&&m.role!=='system');
    let boundary=-1; eligible.forEach((m,i)=>{if(truth(parseObject(m.extra).isConversationStart))boundary=i;});
    if(boundary>=0) eligible=eligible.slice(boundary);
    const total=eligible.length;if(s.referenceMode==='summary')eligible=[];
    if(s.scope!=='all')eligible=eligible.slice(-Math.max(1,Number(s.scope)||60));
    const names=Object.fromEntries(cards.map(c=>[c.id,character(c).name]));
    const base={characters:cards.map(character),players:personas.map(character),summary:s.includeSummary?(meta.summary||''):'',providedSummary:s.manualSummary||'',world:lore,notes:s.notes||''};
    const baseText=JSON.stringify(base),baseTokens=await counter.text(baseText);
    const mapped=eligible.map(m=>({id:m.id,speaker:m.role==='user'?'PC':(names[m.characterId]||m.role),text:String(m.content||'')}));
    const encode=n=>JSON.stringify({...base,dialogue:mapped.slice(n).map(({id,...rest})=>rest)});
    let lo=0,hi=mapped.length,best=mapped.length;
    while(lo<=hi){const mid=Math.floor((lo+hi)/2),count=await counter.text(encode(mid));if(count<=s.contextBudget){best=mid;hi=mid-1;}else lo=mid+1;}
    const selected=mapped.slice(best),used=await counter.text(encode(best))-baseTokens;
    if(best)warnings.push('참고 토큰 한도에 맞춰 오래된 대화를 제외했어요.');
    if(baseTokens>s.contextBudget)warnings.push('고정 참고 자료가 참고 한도를 넘어요. 대화는 제외했어요.');
    if(!selected.length&&!base.summary&&!base.providedSummary)warnings.push('참고할 대화·요약이 없어요. 제공된 설정만 사용해요.');if(s.referenceMode==='summary'&&!base.summary&&!base.providedSummary)throw new Error('요약 중심으로 생성하려면 직접 요약을 넣거나 저장된 채팅 요약을 포함해 주세요.');
    return {text:JSON.stringify({...base,dialogue:selected.map(({id,...rest})=>rest)}),stats:{messages:selected.length,available:total,tokens:baseTokens+used,first:selected[0]?.id,last:selected.at(-1)?.id,summary:!!base.summary,manualSummary:SideExtras.tokens(base.providedSummary),lore:lore.length},warnings};
  }

  function markdown(text) {
    const inline=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>').replace(/(^|[^_])_([^_\n]+)_(?!_)/g,'$1<em>$2</em>');
    const lines=text.split('\n'),out=[];let code=false,chunk=[];
    for(let i=0;i<lines.length;i++) {const l=lines[i];if(/^```/.test(l)){if(code){out.push('<pre><code>'+esc(chunk.join('\n'))+'</code></pre>');chunk=[];}code=!code;continue;}if(code){chunk.push(l);continue;}
      if(i+1<lines.length&&l.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])) {const cells=x=>x.trim().replace(/^\||\|$/g,'').split('|');out.push('<div class="table-wrap"><table><thead><tr>'+cells(l).map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>');i+=2;while(i<lines.length&&lines[i].includes('|')){out.push('<tr>'+cells(lines[i]).map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>');i++;}i--;out.push('</tbody></table></div>');continue;}
      const h=l.match(/^(#{1,6})\s+(.+)/);if(h)out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);else if(/^\s*(?:-{3,}|\*{3,})\s*$/.test(l))out.push('<hr>');else if(/^\s*[-*]\s/.test(l))out.push('<p class="bullet">• '+inline(l.replace(/^\s*[-*]\s/,''))+'</p>');else if(l.trim())out.push('<p>'+inline(l)+'</p>');
    }if(chunk.length)out.push('<pre>'+esc(chunk.join('\n'))+'</pre>');return out.join('\n');
  }

return {parse,parseObject,parseArray,truth,esc,uuid,character,context,markdown};
})();
if(typeof module!=="undefined")module.exports=HostCore;
