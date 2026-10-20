export function chooseEdgeMailboxes(connections,{now=Date.now(),skipConnectionId=null,maxPersonal=2}={}){
  const enabled=(connections||[]).filter(row=>row?.sync_enabled===true&&row?.status==='connected');
  const shared=enabled.find(row=>row.mailbox_kind==='shared_inquiry'&&row.id!==skipConnectionId);
  const personal=enabled.filter(row=>row.mailbox_kind==='personal'&&row.id!==skipConnectionId)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const offset=personal.length?Math.floor(now/60_000)%personal.length:0;
  const rotated=personal.length?[...personal.slice(offset),...personal.slice(0,offset)]:[];
  return [...(shared?[shared]:[]),...rotated.slice(0,Math.max(0,maxPersonal))];
}

export async function runWithEdgeWorkerLease({db,run,nonce=crypto.randomUUID(),log=()=>{}}){
  const {data:acquired,error:leaseError}=await db.rpc('acquire_mail_sync_worker_lease',{target_nonce:nonce});
  if(leaseError)throw leaseError;
  if(acquired!==true)return {attempted:0,completed:0,partial:0,failed:0,skipped:true};
  try{return await run()}
  finally{
    const {error}=await db.rpc('release_mail_sync_worker_lease',{target_nonce:nonce});
    if(error)log(`mail sync worker lease release failed: ${error.name||'Error'}`);
  }
}

export async function runEdgeMailCycle({db,processManual,syncMailbox,now=Date.now(),maxPersonal=2,log=()=>{}}){
  let manuallySyncedConnectionId=null;
  try{manuallySyncedConnectionId=await processManual()}catch(error){log(`manual mail request stage failed: ${error?.name||'Error'}`)}

  const {data,error}=await db.from('mailbox_connections')
    .select('id,user_id,mailbox_kind,status,sync_enabled,imap_host,imap_port,email,created_by')
    .eq('status','connected').eq('sync_enabled',true);
  if(error)throw error;

  let attempted=0,completed=0,partial=0,failed=0;
  const selected=chooseEdgeMailboxes(data,{now,skipConnectionId:manuallySyncedConnectionId,maxPersonal});
  for(const connection of selected){
    attempted++;
    try{
      const result=await syncMailbox(connection);
      if(result?.complete===false)partial++;else completed++;
    }catch(error){
      failed++;
      await db.from('mailbox_connections').update({error_message:'邮件同步失败，请检查邮箱连接和同步服务状态'}).eq('id',connection.id);
      log(`mailbox sync failed: ${error?.name||'Error'}`);
    }
  }
  return {attempted,completed,partial,failed};
}
