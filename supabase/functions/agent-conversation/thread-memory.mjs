// Extractive memory stays in the enterprise database. Preserve answers separately.
export function memoryNote(question,answer){
 const parts=answer.split(/(?<=[。！？])|\n/).map(x=>x.trim()).filter(Boolean);
 const decisions=parts.filter(x=>/已确认|决定|要求|下一步|待办|待核实|截止|已选|画册|型号/.test(x));
 return [...new Set([question.slice(0,180),parts[0],...decisions.slice(-2)])].filter(Boolean).join(' · ').slice(0,800);
}
export function summarizeThread(turns){
 if(!turns.length)return '';
 const distinct=[...new Set(turns.map(t=>t.memory_note).filter(Boolean))];
 const selected=distinct.length>4?[distinct[0],...distinct.slice(-3)]:distinct;
 return selected.map(s=>s.slice(0,260)).join('\n');
}
