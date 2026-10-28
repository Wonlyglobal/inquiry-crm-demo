import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectPersonalMailbox as select} from '../mail-sync/src/mailbox-selection.mjs';
import {mailboxState,dedupePersonMail} from '../assets/mailbox-multi.mjs';
test('one person aggregates all personal mailboxes and latest sync, excludes shared',()=>{
 const state=mailboxState([{status:'error',last_synced_at:'2026-10-01'},{status:'connected',last_synced_at:'2026-10-02'},{mailbox_kind:'shared_inquiry',status:'connected',last_synced_at:'2026-10-03'}]);
 assert.equal(state.count,2);assert.equal(state.connected,1);assert.equal(state.status,'connected');assert.equal(state.last_synced_at,'2026-10-02');
 assert.equal(mailboxState([]).status,'not_connected');
});
test('duplicate RFC IDs count once per direction, missing IDs remain independent',()=>{
 assert.equal(dedupePersonMail([{id:'1',message_id:'<x>',direction:'inbound'},{id:'2',message_id:'<x>',direction:'inbound'},{id:'3',message_id:'<x>',direction:'outbound'},{id:'4'},{id:'5'}]).length,4);
});
function db(rows){return {from(){let visible=rows;const q={select(){return q},eq(k,v){visible=visible.filter(r=>r[k]===v);return q},order(){return q},limit(n){return Promise.resolve({data:visible.slice(0,n),error:null})}};return q}}}
const boxes=[{id:'a',user_id:'me',mailbox_kind:'personal',status:'connected'},{id:'b',user_id:'me',mailbox_kind:'personal',status:'connected'},{id:'c',user_id:'other',mailbox_kind:'personal',status:'connected'},{id:'d',user_id:'me',mailbox_kind:'personal',status:'disabled'}];
test('sender selection rejects ambiguity, another owner and disabled mailbox',async()=>{
 assert.equal((await select(db(boxes),'me','b')).id,'b');
 await assert.rejects(()=>select(db(boxes),'me'),/选择发件邮箱/);
 for(const id of ['c','d','unknown'])await assert.rejects(()=>select(db(boxes),'me',id),/不可用/);
 assert.equal((await select(db(boxes.slice(0,1)),'me')).id,'a');
});
