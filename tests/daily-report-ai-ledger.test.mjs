import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../supabase/functions/daily-report-ai/index.ts',import.meta.url),'utf8');
const metricsBody=source.slice(source.indexOf('const dailyLeadMetrics='),source.indexOf('\nDeno.serve('))
  .replace('(workspace:any,salesId:string,date:string)','(workspace,salesId,date)')
  .replaceAll('(value:unknown)','(value)').replace('value as string','value');
const metrics=vm.runInNewContext(`${metricsBody}\ndailyLeadMetrics;`,{Intl,Date,Set,Number,Error});
const plain=value=>JSON.parse(JSON.stringify(value));
const row=(id,overrides={})=>({id,sales_id:'sales-a',recorded_on:'2026-10-26',recorded_at:'2026-10-26T01:00:00Z',...overrides});
const workspace=leads=>({as_of:'2026-10-26T12:00:00Z',leads});

test('daily-report AI counts the authorized lead ledger by actual entry day, not inquiry creation',()=>{
  assert.match(source,/userDb\.rpc\("sales_lead_workspace",\{from_day:date,to_day:date\}\)/);
  assert.doesNotMatch(source,/db\.from\("inquiries"\)/);
  assert.doesNotMatch(source,/eq\("created_by",user\.id\)/);
  const first=row('lead-1',{acquired_on:'2026-09-10',inquiry_id:'inquiry-1',converted_at:'2026-10-26T02:00:00Z'});
  const second=row('lead-2',{acquired_on:'2026-10-01'});
  const result=plain(metrics(workspace([first,second,first,row('other',{sales_id:'sales-b'})]),'sales-a','2026-10-26'));
  assert.deepEqual(result,{new_leads_count:2,converted_count:1,metric_basis:'ledger_recorded_v1',metrics_as_of:'2026-10-26T12:00:00Z'});
});

test('conversion is a separate distinct-inquiry measure using Shanghai calendar dates',()=>{
  const result=plain(metrics(workspace([
    row('old-1',{recorded_on:'2026-10-01',inquiry_id:'shared',converted_at:'2026-10-25T16:00:00Z'}),
    row('old-2',{recorded_on:'2026-10-02',inquiry_id:'shared',converted_at:'2026-10-25T16:00:00Z'}),
    row('old-3',{recorded_on:'2026-10-03',inquiry_id:'yesterday',converted_at:'2026-10-25T15:59:59Z'}),
    row('old-4',{recorded_on:'2026-10-04',inquiry_id:'tomorrow',converted_at:'2026-10-26T16:00:00Z'}),
  ]),'sales-a','2026-10-26'));
  assert.equal(result.new_leads_count,0);
  assert.equal(result.converted_count,1);
});

test('lead metrics honor server as-of and do not turn unavailable data into an empty count',()=>{
  const result=plain(metrics(workspace([
    row('current'),
    row('after-cutoff',{recorded_at:'2026-10-26T13:00:00Z',inquiry_id:'later',converted_at:'2026-10-26T13:00:00Z'}),
  ]),'sales-a','2026-10-26'));
  assert.equal(result.new_leads_count,1);
  assert.equal(result.converted_count,0);
  assert.throws(()=>metrics(null,'sales-a','2026-10-26'),/线索统计暂不可用/);
  assert.throws(()=>metrics({leads:[],as_of:'invalid'},'sales-a','2026-10-26'),/线索统计暂不可用/);
  assert.throws(()=>metrics({as_of:'2026-10-26T12:00:00Z'},'sales-a','2026-10-26'),/线索统计暂不可用/);
});

test('ledger cutoff preserves microsecond ordering for recording and conversion',()=>{
  const data={as_of:'2026-10-26T12:00:00.123456Z',leads:[
    row('before',{recorded_at:'2026-10-26T12:00:00.123455Z',inquiry_id:'before',converted_at:'2026-10-26T12:00:00.123455Z'}),
    row('at',{recorded_at:'2026-10-26T20:00:00.123456+08:00',inquiry_id:'at',converted_at:'2026-10-26T12:00:00.123456Z'}),
    row('after-record',{recorded_at:'2026-10-26T12:00:00.123457Z',inquiry_id:'after-record',converted_at:'2026-10-26T12:00:00.123455Z'}),
    row('after-conversion',{inquiry_id:'after-conversion',converted_at:'2026-10-26T12:00:00.123457Z'}),
  ]};
  const result=plain(metrics(data,'sales-a','2026-10-26'));
  assert.equal(result.new_leads_count,3);
  assert.equal(result.converted_count,2);
});

test('malformed or zone-less timestamps fail closed rather than being counted as zero',()=>{
  for(const as_of of ['2026-10-26T12:00:00','2026-02-30T12:00:00Z','invalid']){
    assert.throws(()=>metrics({as_of,leads:[]},'sales-a','2026-10-26'),/线索统计暂不可用/);
  }
  for(const overrides of [
    {recorded_at:'2026-10-26T12:00:00'},
    {recorded_at:'invalid'},
    {converted_at:'2026-10-26T12:00:00'},
    {converted_at:'invalid'},
    {recorded_on:'2026-02-30'},
  ])assert.throws(()=>metrics(workspace([row('invalid',overrides)]),'sales-a','2026-10-26'),/线索统计暂不可用/);
});

test('the ledger projection contains only numeric counts and metric provenance, never customer fields',()=>{
  const result=plain(metrics(workspace([row('one',{company:'PRIVATE COMPANY',email:'private@example.invalid',demand:'PRIVATE DEMAND',contact:'PRIVATE CONTACT'})]),'sales-a','2026-10-26'));
  assert.deepEqual(Object.keys(result),['new_leads_count','converted_count','metric_basis','metrics_as_of']);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|example\.invalid/);
  assert.match(source,/const source=\{date,salesperson:profile\.full_name,daily_plans:plans\|\|\[\],follow_up_records:follows\|\|\[\],\.\.\.leadMetrics\}/);
  assert.doesNotMatch(source,/new_leads\s*:\s*(?:workspace|leads)/);
});

test('existing authentication, sales guard and fail-closed customer AI boundary remain intact',()=>{
  assert.match(source,/userDb\.auth\.getUser\(token\)/);
  assert.match(source,/if\(!profile\?\.active\|\|profile\.role!=="sales"\)/);
  assert.match(source,/Deno\.serve\(withReadOnlyGuard/);
  assert.match(source,/await customerDataAiFetch\("https:\/\/api\.deepseek\.com\/chat\/completions"/);
  assert.doesNotMatch(source,/await fetch\(/);
  const policy=fs.readFileSync(new URL('../supabase/functions/_shared/customer-data-ai.ts',import.meta.url),'utf8');
  assert.match(policy,/AI_DATA_POLICY_BLOCKED/);
});
