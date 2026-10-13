import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20261013093000_reassign_open_followup_tasks.sql',import.meta.url),'utf8');

test('mailbox calendar replacement does not remove reassignment synchronization',()=>{
  const start=html.indexOf('} else if(view==="follow-calendar")');
  const branch=html.slice(start,html.indexOf('} else if (["inquiries"',start));
  assert.match(branch,/get_sales_email_activity_metrics/);
  assert.doesNotMatch(branch,/from\("follow_ups"\)/);
  assert.match(sql,/sync_open_followup_task_owner/);
});

test('inquiry reassignment moves only open task ownership and audits every move',()=>{
  assert.match(sql,/after update of owner_id on public\.inquiries/);
  assert.match(sql,/f\.is_task=true/);
  assert.match(sql,/f\.completed_at is null/);
  assert.match(sql,/set author_id=new\.owner_id/);
  assert.match(sql,/'task_reassigned'/);
  assert.match(sql,/before_data,after_data/);
});

test('migration repairs existing mismatched open tasks without rewriting history',()=>{
  assert.match(sql,/join public\.inquiries i on i\.id=f\.inquiry_id/);
  assert.match(sql,/i\.owner_id is not null/);
  assert.match(sql,/f\.author_id is distinct from i\.owner_id/);
  assert.match(sql,/修复转派后未同步的未完成跟进任务负责人/);
});
