import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function directAssignmentState('),html.indexOf('      async function openDirectAssignment('));
const state=vm.runInNewContext(`(${source.trim()})`);
const valid={validity:'valid',status:'received',owner_id:null};
test('manager and owner can assign valid open inquiries without sales follow-up permissions',()=>{
 for(const role of ['sales_manager','owner']) {
  assert.equal(state(role,valid).visible,true);
  assert.equal(state(role,valid).disabled,false);
  assert.equal(state(role,valid).label,'分配业务员');
  assert.equal(state(role,{...valid,owner_id:'someone'}).label,'重新分配');
 }
});
test('sales and marketing do not receive direct assignment capability',()=>{
 for(const role of ['sales','marketing',undefined]) {
  assert.equal(state(role,valid).visible,false);
  assert.equal(state(role,valid).disabled,true);
 }
});
test('invalid, pending review and closed inquiries explain their disabled assignment state',()=>{
 for(const patch of [{validity:'pending'},{validity:'invalid'},{invalid_review_status:'pending'},{status:'won'},{status:'lost'}]) {
  const result=state('sales_manager',{...valid,...patch});
  assert.equal(result.disabled,true);
  assert.ok(result.reason);
 }
});
