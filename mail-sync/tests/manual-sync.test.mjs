import test from 'node:test';
import assert from 'node:assert/strict';
import {processManualSharedMailSync} from '../src/manual-sync.mjs';

const connection={id:'shared-connection',mailbox_kind:'shared_inquiry',status:'connected',sync_enabled:true};

function mockDb({requestId='request-1',mailbox=connection,mailboxError=null,finishError=null}={}){
  const calls=[];
  return {calls,async rpc(name,args){calls.push({type:'rpc',name,args});if(name==='claim_shared_mail_sync_request')return{data:requestId?[{request_id:requestId}]:[],error:null};if(name==='finish_shared_mail_sync_request')return{data:true,error:finishError};throw new Error(`unexpected RPC ${name}`)},from(name){assert.equal(name,'mailbox_connections');const query={select(){return query},eq(){return query},maybeSingle:async()=>({data:mailbox,error:mailboxError}),update(values){calls.push({type:'update',values});return query},then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject)}};return query}};
}

test('manual request syncs only the shared mailbox and marks it completed',async()=>{
  const db=mockDb();let synced=null;
  const id=await processManualSharedMailSync({db,syncMailbox:async value=>{synced=value}});
  assert.equal(id,connection.id);assert.equal(synced,connection);
  assert.deepEqual(db.calls.find(call=>call.name==='finish_shared_mail_sync_request').args,{target_request_id:'request-1',target_status:'completed',target_result_code:'ok'});
});

test('no queued manual request does not touch a mailbox',async()=>{
  const db=mockDb({requestId:null});let called=false;
  assert.equal(await processManualSharedMailSync({db,syncMailbox:async()=>{called=true}}),null);
  assert.equal(called,false);assert.equal(db.calls.filter(call=>call.name==='finish_shared_mail_sync_request').length,0);
});

test('disconnected mailbox fails with a safe status code',async()=>{
  const db=mockDb({mailbox:null});let called=false;
  assert.equal(await processManualSharedMailSync({db,syncMailbox:async()=>{called=true}}),null);
  assert.equal(called,false);
  assert.deepEqual(db.calls.find(call=>call.name==='finish_shared_mail_sync_request').args,{target_request_id:'request-1',target_status:'failed',target_result_code:'mailbox_unavailable'});
});

test('IMAP failure is reported without leaking its detail to user-visible status',async()=>{
  const db=mockDb();const logs=[];
  const id=await processManualSharedMailSync({db,syncMailbox:async()=>{const error=new Error('secret host detail');error.name='ImapError';throw error},log:value=>logs.push(value)});
  assert.equal(id,connection.id);
  assert.deepEqual(db.calls.find(call=>call.name==='finish_shared_mail_sync_request').args,{target_request_id:'request-1',target_status:'failed',target_result_code:'sync_failed'});
  assert.deepEqual(logs,['manual shared mailbox sync failed: ImapError']);
  assert.equal(db.calls.find(call=>call.type==='update').values.error_message,'公共邮箱手动同步失败，请检查邮箱连接与同步服务状态');
});
