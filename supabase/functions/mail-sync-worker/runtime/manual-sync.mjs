export async function processManualSharedMailSync({db,syncMailbox,log=()=>{}}){
  const {data:requests,error:claimError}=await db.rpc('claim_shared_mail_sync_request');
  if(claimError)throw claimError;
  const request=Array.isArray(requests)?requests[0]:null;
  if(!request?.request_id)return null;

  let connectionId=null,resultCode='ok',targetStatus='completed';
  try{
    const {data:connection,error}=await db.from('mailbox_connections').select('id,email,imap_host,imap_port,mailbox_kind,status,sync_enabled')
      .eq('mailbox_kind','shared_inquiry').eq('status','connected').eq('sync_enabled',true).maybeSingle();
    if(error)throw error;
    if(!connection){resultCode='mailbox_unavailable';targetStatus='failed'}
    else{
      connectionId=connection.id;
      const result=await syncMailbox(connection);
      if(result?.complete===false){resultCode='sync_failed';targetStatus='failed'}
    }
  }catch(error){
    resultCode='sync_failed';targetStatus='failed';
    log(`manual shared mailbox sync failed: ${error?.name||'Error'}`);
    if(connectionId)await db.from('mailbox_connections').update({error_message:'公共邮箱手动同步失败，请检查邮箱连接与同步服务状态'}).eq('id',connectionId);
  }

  const {error:finishError}=await db.rpc('finish_shared_mail_sync_request',{
    target_request_id:request.request_id,target_status:targetStatus,target_result_code:resultCode,
  });
  if(finishError)log(`manual shared mailbox request completion failed: ${finishError?.name||'Error'}`);
  return connectionId;
}
