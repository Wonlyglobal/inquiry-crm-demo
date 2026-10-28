// A mailbox belongs to one CRM person; message copies remain in their source mailbox.
export function mailboxState(rows=[]) {
  const boxes=(Array.isArray(rows)?rows:[rows]).filter(x=>x?.mailbox_kind!== 'shared_inquiry' && x);
  const connected=boxes.filter(x=>x.status==='connected');
  const latest=key=>boxes.map(x=>x[key]).filter(Boolean).sort().at(-1)||null;
  return {count:boxes.length,connected:connected.length,status:connected.length?'connected':boxes.some(x=>x.status==='error')?'error':boxes[0]?.status||'not_connected',last_synced_at:latest('last_synced_at'),last_tested_at:latest('last_tested_at')};
}
export function dedupePersonMail(rows=[]) {
  const seen=new Set();
  return rows.filter(m=>{const key=m.message_id?.trim()?`${m.direction}:${m.message_id.trim()}`:`row:${m.id}`;if(seen.has(key))return false;seen.add(key);return true;});
}
