import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261027133000_sales_lead_division_digest.sql',import.meta.url),'utf8');
test('division digest keeps private notifications but supersedes individual Feishu deliveries without claiming success',()=>{
 assert.match(sql,/result:=private\.process_sales_lead_personal_schedule_v1\(run_at\)/);
 assert.match(sql,/superseded_at=clock_timestamp\(\),superseded_reason='replaced_by_division_summary'/);
 assert.doesNotMatch(sql,/set sent_at\s*=/i);
 assert.match(sql,/delivery_key like 'division-daily:%' or delivery_key like 'division-weekly:%'/);
 assert.match(sql,/superseded_at is null/);
 assert.match(sql,/on conflict do nothing/);
});
test('whole-division ranks use real recorded-time cutoff, exclude non-production users and keep zero rows',()=>{
 assert.match(sql,/recorded_on=d and l\.recorded_at<=run_at/);
 assert.match(sql,/dense_rank\(\) over\(order by n desc\)/);
 assert.match(sql,/p\.role='sales' and p\.active and not p\.is_test_data and p\.data_environment='production'/);
 assert.doesNotMatch(sql,/where\s+n\s*[><=]/i);
 assert.match(sql,/無新增|无新增申报不算新增，也不代表日报正式提交/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/grant\s/i);
});
