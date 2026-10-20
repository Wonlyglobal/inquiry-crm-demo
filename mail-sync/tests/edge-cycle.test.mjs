import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseEdgeMailboxes,runEdgeMailCycle,runWithEdgeWorkerLease} from '../src/edge-cycle.mjs';

const mailboxes=[
  {id:'shared',mailbox_kind:'shared_inquiry',status:'connected',sync_enabled:true},
  {id:'a',mailbox_kind:'personal',status:'connected',sync_enabled:true},
  {id:'b',mailbox_kind:'personal',status:'connected',sync_enabled:true},
  {id:'c',mailbox_kind:'personal',status:'connected',sync_enabled:true},
  {id:'disabled',mailbox_kind:'personal',status:'disabled',sync_enabled:true},
  {id:'off',mailbox_kind:'personal',status:'connected',sync_enabled:false},
];

test('edge scheduler prioritizes shared mailbox and rotates a bounded personal batch',()=>{
  assert.deepEqual(chooseEdgeMailboxes(mailboxes,{now:0}).map(row=>row.id),['shared','a','b']);
  assert.deepEqual(chooseEdgeMailboxes(mailboxes,{now:60_000}).map(row=>row.id),['shared','b','c']);
  assert.deepEqual(chooseEdgeMailboxes(mailboxes,{now:0,skipConnectionId:'shared'}).map(row=>row.id),['a','b']);
});

test('worker lease skips a concurrent cycle and never calls its mailbox task',async()=>{
  const calls=[];
  const result=await runWithEdgeWorkerLease({db:{rpc:async(name)=>{calls.push(name);return{data:false,error:null}}},run:async()=>{throw new Error('must not execute')}});
  assert.deepEqual(result,{attempted:0,completed:0,partial:0,failed:0,skipped:true});
  assert.deepEqual(calls,['acquire_mail_sync_worker_lease']);
});

test('worker lease is released after the cycle, including failures',async()=>{
  const calls=[];
  await assert.rejects(()=>runWithEdgeWorkerLease({
    nonce:'synthetic-nonce',db:{rpc:async(name,args)=>{calls.push([name,args]);return{data:true,error:null}}},
    run:async()=>{throw new Error('synthetic cycle failure')},
  }),/synthetic cycle failure/);
  assert.deepEqual(calls,[
    ['acquire_mail_sync_worker_lease',{target_nonce:'synthetic-nonce'}],
    ['release_mail_sync_worker_lease',{target_nonce:'synthetic-nonce'}],
  ]);
});

test('edge cycle runs manual shared pull first and never returns message details',async()=>{
  const updates=[];let syncCalls=[];
  const db={from(table){assert.equal(table,'mailbox_connections');return{select(){return this},eq(){return this},then(resolve){return resolve({data:mailboxes,error:null})},update(value){updates.push(value);return this}}}};
  const result=await runEdgeMailCycle({db,now:0,processManual:async()=> 'shared',syncMailbox:async row=>{syncCalls.push(row.id);return{complete:true}}});
  assert.deepEqual(syncCalls,['a','b']);
  assert.deepEqual(result,{attempted:2,completed:2,partial:0,failed:0});
  assert.deepEqual(Object.keys(result).sort(),['attempted','completed','failed','partial']);
  assert.equal(updates.length,0);
});

test('edge cycle isolates one mailbox failure and continues other mailboxes',async()=>{
  const updates=[];const calls=[];
  const db={from(){return{select(){return this},eq(){return this},then(resolve){return resolve({data:mailboxes,error:null})},update(value){updates.push(value);return this},eqAfterUpdate(){return this}}}};
  const result=await runEdgeMailCycle({db,now:0,processManual:async()=>null,syncMailbox:async row=>{calls.push(row.id);if(row.id==='shared')throw new Error('credentials must not be exposed');return{complete:false}}});
  assert.deepEqual(calls,['shared','a','b']);
  assert.deepEqual(result,{attempted:3,completed:0,partial:2,failed:1});
  assert.deepEqual(updates,[{error_message:'邮件同步失败，请检查邮箱连接和同步服务状态'}]);
});
