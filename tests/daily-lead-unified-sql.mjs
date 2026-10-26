// In-memory PostgreSQL only: synthetic profiles/content, actual repository RPCs.
// No network, credentials, production database, scheduler, notices or mail calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]||'@electric-sql/pglite');
const db=new PGlite();
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const migration=async name=>db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
try {
  // Minimal local schema shell, not a substitute for production RLS acceptance.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid',true),'')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('role',coalesce(nullif(current_setting('test.role',true),''),'authenticated'),
        'app_metadata',jsonb_build_object('crm_read_only',coalesce(nullif(current_setting('test.read_only',true),'')::boolean,false)))
    $$;
    create type public.crm_role as enum('owner','marketing','sales_manager','sales');
    create type public.inquiry_status as enum('received','pending_assignment','won','lost');
    create table public.profiles(id uuid primary key,full_name text,team text,active boolean default true,
      role crm_role,is_test_data boolean default false,data_environment text default 'production');
    create table public.companies(id uuid primary key,name text,domain text,country text,created_by uuid,
      is_test_data boolean,data_environment text,created_at timestamptz default clock_timestamp(),updated_at timestamptz);
    create table public.contacts(id uuid primary key,company_id uuid,full_name text,email text,phone text,whatsapp text,
      created_by uuid,is_test_data boolean,data_environment text,created_at timestamptz default clock_timestamp());
    create table public.inquiries(id uuid primary key,company_id uuid,contact_id uuid,title text,product_category text,
      quantity text,target_country text,source text,source_detail text,original_message text,demand_summary text,
      primary_source text,status inquiry_status,validity text,owner_id uuid,created_by uuid,updated_by uuid,
      estimated_amount numeric,currency text,expected_close_date date,first_contact_due_at timestamptz,
      last_change_reason text,is_test_data boolean,data_environment text,created_at timestamptz default clock_timestamp(),
      excluded_from_dashboard boolean not null default false);
    create table public.inquiry_marketing_touches(inquiry_id uuid,touch_at timestamptz,channel text,
      evidence_note text,is_primary boolean,created_by uuid);
    create table public.audit_logs(actor_id uuid,entity_type text,entity_id uuid,action text,reason text,
      before_data jsonb,after_data jsonb);
    create table public.notifications(id uuid default gen_random_uuid(),recipient_id uuid,inquiry_id uuid,
      type text,title text,body text);
    create table public.follow_ups(inquiry_id uuid,author_id uuid,created_at timestamptz);
    create table public.daily_sales_reports(id uuid primary key default gen_random_uuid(),sales_id uuid,
      report_date date,new_leads_count integer not null default 0,follow_up_count integer not null default 0,
      key_progress text,blockers text,tomorrow_plan text,submitted_at timestamptz,updated_at timestamptz,
      is_simulated boolean not null default false,simulation_batch text,unique(sales_id,report_date));
    alter table public.daily_sales_reports enable row level security;
    create policy fixture_own_report on public.daily_sales_reports for select to authenticated using(sales_id=auth.uid());
    grant select on public.daily_sales_reports to authenticated;
    create function private.reject_risk_event_mutation() returns trigger language plpgsql as $$
      begin raise exception 'immutable'; end
    $$;
    create function private.crm_manager_covers_user(manager uuid,subject uuid) returns boolean language sql as $$
      select exists(select 1 from public.profiles m join public.profiles s on m.team=s.team
        where m.id=manager and s.id=subject)
    $$;
    grant usage on schema auth to authenticated,anon;
  `);
  const ids={s:'11111111-1111-4111-8111-111111111111',s2:'22222222-2222-4222-8222-222222222222',
    m:'33333333-3333-4333-8333-333333333333',o:'44444444-4444-4444-8444-444444444444',
    boss:'55555555-5555-4555-8555-555555555555',inactive:'66666666-6666-4666-8666-666666666666',
    test:'77777777-7777-4777-8777-777777777777',sandbox:'88888888-8888-4888-8888-888888888888'};
  for(const [key,id] of Object.entries(ids)) await db.query(`
    insert into public.profiles(id,full_name,team,role,active,is_test_data,data_environment)
    values($1,$2,$3,$4,$5,$6,$7)`,[id,'合成-'+key,key==='s2'?'B':'A',
    key==='m'?'marketing':key==='o'?'owner':key==='boss'?'sales_manager':'sales',
    key!=='inactive',key==='test',key==='sandbox'?'test':'production']);
  await migration('20260922183000_daily_report_draft_submit_workflow.sql');
  for(const file of ['20260922190000_multichannel_customer_opportunity.sql','20261026090000_sales_lead_workspace.sql',
    '20261026091000_sales_lead_reminders.sql','20261026093000_sales_lead_future_exemptions.sql']) await migration(file);
  const dates=(await db.query(`select d::text today,(d-1)::text yesterday,(d-2)::text draft_day,
    (d-3)::text legacy_day,(d-4)::text simulation_day,(d-5)::text conflict_day,(d-100)::text old_day,
    (d+1)::text tomorrow,(d+2)::text too_future,(d-91)::text too_old
    from(select (clock_timestamp() at time zone 'Asia/Shanghai')::date d)s`)).rows[0];
  // Seed only isolated historical fixtures, before the new migration.
  await db.query(`insert into public.daily_sales_reports(sales_id,report_date,new_leads_count,follow_up_count,
    key_progress,blockers,tomorrow_plan,status,draft_saved_at,submitted_at,updated_at,is_simulated,simulation_batch)
    values($1,$2,17,9,'合成历史原文','合成原阻碍','合成原计划','submitted','2026-01-02T01:00Z',
      '2026-01-02T02:00Z','2026-01-02T02:00Z',false,null),
    ($1,$3,23,4,'合成90天外原文',null,null,'submitted','2025-01-02T01:00Z',
      '2025-01-02T02:00Z','2025-01-02T02:00Z',false,null),
    ($1,$4,99,8,'合成旧草稿',null,null,'draft','2026-01-02T01:00Z',null,'2026-01-02T01:00Z',false,null),
    ($1,$5,88,7,'合成模拟保留',null,null,'submitted','2026-01-02T01:00Z','2026-01-02T02:00Z',
      '2026-01-02T02:00Z',true,'isolated-fixture'),
    ($1,$6,5,2,'合成状态冲突',null,null,'draft','2026-01-02T01:00Z','2026-01-02T02:00Z',
      '2026-01-02T02:00Z',false,null)`,
    [ids.s,dates.legacy_day,dates.old_day,dates.draft_day,dates.simulation_day,dates.conflict_day]);
  const legacyBefore=(await db.query('select to_jsonb(r) r from public.daily_sales_reports r order by report_date')).rows.map(r=>r.r);
  const policiesBefore=(await db.query("select * from pg_policies where tablename='daily_sales_reports'")).rows;
  const catalogSql=`select md5(pg_get_functiondef(p.oid)) definition_md5,md5(prosrc) source_md5,
    pg_get_functiondef(p.oid) definition,prosrc,l.lanname,prokind,prosecdef,proleakproof,provolatile,
    proparallel,proisstrict,proretset,pronargs,pronargdefaults,proargtypes::regtype[]::text argtypes,
    proargnames,proargmodes,pg_get_function_result(p.oid) result,pg_get_expr(proargdefaults,0) defaults,proconfig
    from pg_proc p join pg_language l on l.oid=p.prolang
    where p.oid='public.save_or_submit_daily_report(date,text,text,text,boolean)'::regprocedure`;
  const localBefore=(await db.query(catalogSql)).rows[0];
  equal(localBefore.definition_md5,'fa92b2230dbbb701610d6c972f2d879c','Repository predecessor definition is pinned');
  equal(localBefore.source_md5,'ebcc1e863b385cc54ee21725edc9d461','Repository predecessor body is pinned');
  const deployedDefinition=await readFile(new URL('./fixtures/daily-report-deployed-before.sql',import.meta.url),'utf8');
  const unifiedMigration=await readFile(new URL('../supabase/migrations/20261026130000_unified_daily_lead_reports.sql',import.meta.url),'utf8');
  // Exact allowlisted definitions, not a runtime whitespace-normalizing bypass.
  // The production fixture contains source only. Both paths are tested locally.
  for(const [definition,expectedHash] of [[localBefore.definition,'fa92b2230dbbb701610d6c972f2d879c'],
    [deployedDefinition,'fe6243936f8c6e25690ab045b3dc9628']]) {
    const guardDb=new PGlite();
    try {
      await guardDb.exec(`create role anon;create role authenticated;create role service_role;
        create schema private;create schema auth;create type public.crm_role as enum('sales');
        create table public.profiles(id uuid,role public.crm_role);
        create table public.daily_sales_reports(id uuid,sales_id uuid,report_date date,new_leads_count integer,
          follow_up_count integer,key_progress text,blockers text,tomorrow_plan text,status text,
          draft_saved_at timestamptz,submitted_at timestamptz,updated_at timestamptz,is_simulated boolean,
          unique(sales_id,report_date));`);
      await guardDb.exec(definition);
      equal((await guardDb.query(catalogSql)).rows[0].definition_md5,expectedHash,'Exact predecessor fixture fingerprint');
      await guardDb.exec(unifiedMigration);
      equal((await guardDb.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='daily_sales_reports' and column_name in('converted_count','metric_basis','metrics_as_of')")).rows[0].n,3,'Reviewed predecessor passes migration guard');
    } finally {await guardDb.close();}
  }
  await db.exec(deployedDefinition);
  const deployedBefore=(await db.query(catalogSql)).rows[0];
  equal(deployedBefore.source_md5,'76dee07916e8aa9643d06d6b79f2a4a5','Reviewed SQL-editor predecessor body is pinned');
  const tokens=source=>source.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_\u0080-\uffff][A-Za-z_0-9$\u0080-\uffff]*|\d+(?:\.\d+)?|::|:=|<>|<=|>=|!=|\|\||[^\s]/g)||[];
  equal(tokens(deployedBefore.prosrc),tokens(localBefore.prosrc),'Reviewed body differs only in whitespace outside quoted text');
  equal(tokens(localBefore.prosrc).length,533,'Complete predecessor token count is fixed');
  const attributes=({definition_md5,source_md5,definition,prosrc,...rest})=>rest;
  equal(attributes(deployedBefore),attributes(localBefore),'Signature/defaults/language/security/null/volatility/search_path attributes match');
  for(const drift of [
    'alter function public.save_or_submit_daily_report(date,text,text,text,boolean) security invoker',
    "alter function public.save_or_submit_daily_report(date,text,text,text,boolean) set search_path='public'",
    'alter function public.save_or_submit_daily_report(date,text,text,text,boolean) strict',
    deployedDefinition.replace("actor_role is distinct from 'sales'","actor_role is distinct from 'owner'"),
    // Even unreviewed, semantically harmless formatting is not automatically allowed.
    deployedDefinition.replace('declare actor','declare  actor'),
  ]) {
    await db.exec(drift);
    await rejects(()=>db.exec(unifiedMigration),/日报接口已变化/);
    await db.exec('rollback');
    equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='daily_sales_reports' and column_name='metric_basis'")).rows[0].n,0,'Unknown drift aborts before schema mutation');
    await db.exec(deployedDefinition);
  }
  await migration('20261026130000_unified_daily_lead_reports.sql');
  const migrated=(await db.query('select to_jsonb(r) r from public.daily_sales_reports r order by report_date')).rows.map(r=>r.r);
  equal(migrated.map(({converted_count,metric_basis,metrics_as_of,...rest})=>rest),legacyBefore,'Migration preserves all prior payloads/counts/timestamps');
  ok(migrated.every(r=>r.metric_basis==='legacy_inquiries_v1'&&r.converted_count===0&&r.metrics_as_of===null),'Legacy basis is explicit; conversion 0 is not backfilled evidence');
  equal((await db.query("select * from pg_policies where tablename='daily_sales_reports'")).rows,policiesBefore,'No RLS policy change');
  const as=async(key,role='authenticated',readOnly=false)=>{
    await db.exec('reset role');
    await db.query("select set_config('test.uid',$1,false),set_config('test.role',$2,false),set_config('test.read_only',$3,false)",
      [ids[key]||'',role,String(readOnly)]);
    await db.exec('set role '+(key?'authenticated':'anon'));
  };
  const call=async(name,args)=>{
    const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');
    return (await db.query('select public.'+name+'('+placeholders+') r',args)).rows[0].r;
  };
  const save=(day,submit=false,progress='合成今日进展')=>call('save_or_submit_daily_report',[day,progress,'合成阻碍','合成明日计划',submit]);
  const rawReports=async()=>{await db.exec('reset role');return (await db.query('select to_jsonb(r) r from public.daily_sales_reports r order by sales_id,report_date')).rows.map(r=>r.r);};
  const row=(suffix,acquired=dates.yesterday)=>({request_id:crypto.randomUUID(),acquired_on:acquired,
    company:'合成客户-'+suffix,contact:'合成联系人-'+suffix,country:'合成地区',email:suffix+'@example.invalid',
    phone:'',source:'outbound',demand:'合成门类需求-'+suffix});

  await as('s');
  const manual=row('manual'),excel=row('excel');
  const recordedManual=await call('record_sales_leads',[JSON.stringify([manual]),'manual']);
  const recordedExcel=await call('record_sales_leads',[JSON.stringify([excel]),'excel']);
  const duplicate=await call('record_sales_leads',[JSON.stringify([{...excel,request_id:crypto.randomUUID()}]),'excel']);
  equal(duplicate[0],recordedExcel[0],'Duplicate Excel import retains original id and recording time');
  const converted=await call('convert_sales_lead',[recordedManual[0].id]);
  equal((await call('convert_sales_lead',[recordedManual[0].id])).inquiry_id,converted.inquiry_id,'Conversion retry keeps one opportunity');
  // A legacy +新增-style inquiry must not become an extra ledger lead.
  await call('create_customer_opportunity',['合成旧入口客户','合成联系人','old-direct@example.invalid',null,null,
    '合成地区','phone','合成旧入口','合成直接商机需求',null,null,null,null,null,null,false]);
  let view=await call('sales_lead_workspace',[dates.today,dates.today]);
  equal(view.leads.length,2,'Workspace records two, not the direct inquiry or repeated import');
  ok(view.leads.every(r=>r.recorded_on===dates.today&&r.acquired_on===dates.yesterday),'Late acquisition is counted on recording day');
  await db.exec('reset role');
  await db.query(`insert into public.follow_ups(inquiry_id,author_id,created_at) values($1,$2,clock_timestamp()),
    ($1,$2,clock_timestamp()+interval '1 day'),($1,$3,clock_timestamp())`,[converted.inquiry_id,ids.s,ids.s2]);
  await as('s');
  const first=await save(dates.today);
  equal([first.new_leads_count,first.converted_count,first.follow_up_count],[2,1,1],'RPC counts recorded leads, distinct daily conversion and own cutoff follow-up separately');
  equal([first.status,first.submitted_at,first.metric_basis],['draft',null,'ledger_recorded_v1'],'Draft is not submitted');
  ok(first.metrics_as_of&&first.draft_saved_at===first.metrics_as_of,'Draft records a precise metrics cutoff');
  const second=await save(dates.today,false,'合成修改后草稿');
  equal(second.id,first.id,'Saving a draft updates the same report');
  ok(Date.parse(second.metrics_as_of)>=Date.parse(first.metrics_as_of),'New draft save has nondecreasing cutoff');
  const yesterday=await save(dates.yesterday);
  equal([yesterday.new_leads_count,yesterday.converted_count],[0,0],'Acquisition date does not rewrite the prior day');
  const promotedLegacyDraft=await save(dates.draft_day,false,'合成旧草稿重新保存');
  equal([promotedLegacyDraft.new_leads_count,promotedLegacyDraft.converted_count,promotedLegacyDraft.metric_basis,
    promotedLegacyDraft.status,promotedLegacyDraft.submitted_at],[0,0,'ledger_recorded_v1','draft',null],'Only an explicitly re-saved draft receives the new metric basis');
  const submitted=await save(dates.today,true,'合成最终提交');
  equal([submitted.status,submitted.new_leads_count,submitted.converted_count],['submitted',2,1],'Explicit submit freezes the ledger snapshot');
  ok(submitted.submitted_at===submitted.metrics_as_of,'Submission time and metrics cutoff agree');
  let reportBefore=(await rawReports()).find(r=>r.id===submitted.id);
  const auditBefore=(await db.query("select count(*)::int n from public.audit_logs where entity_type='daily_sales_report'")).rows[0].n;
  await as('s');
  await call('record_sales_leads',[JSON.stringify([row('after-submit')]),'manual']);
  const retry=await save(dates.today,true,'禁止覆盖提交原文');
  equal(retry.id,submitted.id,'Retry returns the original report id');
  equal([retry.new_leads_count,retry.metrics_as_of,retry.submitted_at,retry.deduplicated],
    [2,submitted.metrics_as_of,submitted.submitted_at,true],'Retry does not refresh a submitted snapshot');
  await rejects(()=>save(dates.today,false),/已提交/);
  equal((await rawReports()).find(r=>r.id===submitted.id),reportBefore,'All submitted values remain byte-for-byte unchanged after retry/save attempt');
  equal((await db.query("select count(*)::int n from public.audit_logs where entity_type='daily_sales_report'")).rows[0].n,auditBefore,'Idempotent retry creates no misleading new submit audit');
  for(const day of [dates.legacy_day,dates.old_day]) {
    await as('s');
    const old=await save(day,true,'禁止覆盖历史原文');
    equal(old.metric_basis,'legacy_inquiries_v1','Legacy submitted report stays legacy, including an old date outside edit window');
    await rejects(()=>save(day,false),/已提交/);
  }
  await as('s');
  await rejects(()=>save(dates.simulation_day,true),/模拟/);
  await rejects(()=>save(dates.conflict_day,true),/状态与时间冲突/);
  await rejects(()=>save(dates.too_future,false),/允许范围/);
  await rejects(()=>save(dates.too_old,false),/允许范围/);
  await rejects(()=>save(null,false),/不能为空/);
  await rejects(()=>save(dates.tomorrow,null),/不能为空/);

  // Boundary/future fixtures are privileged writes ONLY to this disposable DB.
  await db.exec('reset role');
  const boundaryInquiry=crypto.randomUUID(),futureInquiry=crypto.randomUUID();
  await db.query(`insert into public.inquiries(id,owner_id,created_by,status) values($1,$3,$3,'received'),($2,$3,$3,'received')`,[boundaryInquiry,futureInquiry,ids.s2]);
  for(const [label,recordDay,recordExpr,inquiry,convertExpr] of [
    ['before-midnight',dates.yesterday,"$3::date::timestamp at time zone 'Asia/Shanghai' - interval '1 microsecond'",boundaryInquiry,"$3::date::timestamp at time zone 'Asia/Shanghai' - interval '1 microsecond'"],
    ['at-midnight',dates.today,"$3::date::timestamp at time zone 'Asia/Shanghai'",boundaryInquiry,"$3::date::timestamp at time zone 'Asia/Shanghai'"],
    ['future-record',dates.today,"clock_timestamp()+interval '1 day'",null,'null'],
    ['future-conversion',dates.today,'clock_timestamp()',futureInquiry,"clock_timestamp()+interval '1 day'"],
    ['same-conversion-again',dates.draft_day,"$3::date::timestamp at time zone 'Asia/Shanghai' - interval '2 days'",boundaryInquiry,"$3::date::timestamp at time zone 'Asia/Shanghai'"],
    ['tomorrow-boundary',dates.tomorrow,"($3::date+1)::timestamp at time zone 'Asia/Shanghai'",futureInquiry,"($3::date+1)::timestamp at time zone 'Asia/Shanghai'"]
  ]) await db.query(`insert into private.sales_leads(sales_id,acquired_on,recorded_on,recorded_at,company,country,
    source,demand,method,request_id,fingerprint,inquiry_id,converted_at)
    values($1,$3::date-20,$2::date,(${recordExpr}),'合成边界','合成地区','other',$4,'manual',gen_random_uuid(),$4,$5::uuid,(${convertExpr}))`,
    [ids.s2,recordDay,dates.today,label,inquiry]);
  await as('s2');
  const boundaryToday=await save(dates.today),boundaryYesterday=await save(dates.yesterday),boundaryTomorrow=await save(dates.tomorrow);
  equal([boundaryToday.new_leads_count,boundaryToday.converted_count],[2,1],'Shanghai midnight included; future times excluded; multiple links to same inquiry count once');
  equal([boundaryYesterday.new_leads_count,boundaryYesterday.converted_count],[1,1],'Before Shanghai midnight belongs only to the previous day');
  equal([boundaryTomorrow.new_leads_count,boundaryTomorrow.converted_count],[0,0],'Future-day records/conversions do not appear before cutoff');
  equal((await db.query('select count(*)::int n from public.daily_sales_reports where sales_id=$1',[ids.s])).rows[0].n,0,'Existing own-report RLS shell still hides another salesperson snapshots');
  await rejects(()=>db.exec('select * from private.sales_leads'),/permission denied/);
  await rejects(()=>db.exec('update public.daily_sales_reports set new_leads_count=999'),/permission denied/);

  const beforeDenied=await rawReports();
  for(const key of ['m','o','boss','inactive','test','sandbox',undefined]) {
    await as(key);
    await rejects(()=>save(dates.today,true));
  }
  await as('s','crm_marketing_readonly');
  await rejects(()=>save(dates.tomorrow,false),/只读/);
  await as('s','authenticated',true);
  await rejects(()=>save(dates.tomorrow,false),/只读/);
  equal(await rawReports(),beforeDenied,'Anonymous, role, inactive, test, environment and read-only denials leave every report unchanged');
  // Old submitted/simulated/conflicting snapshots still equal their original payloads.
  const final=await rawReports();
  for(const old of legacyBefore.filter(r=>r.report_date!==dates.draft_day)) {
    const {converted_count,metric_basis,metrics_as_of,...rest}=final.find(r=>r.id===old.id);
    equal(rest,old,'Historical non-editable record is preserved');
    equal([converted_count,metric_basis,metrics_as_of],[0,'legacy_inquiries_v1',null],'No historical metrics backfill');
  }
  equal((await db.query('select count(*)::int n from public.notifications')).rows[0].n,0,'No customer/team notification generated');
  equal((await db.query('select count(*)::int n from private.sales_lead_delivery')).rows[0].n,0,'No scheduler or Feishu delivery generated');
  const fn=(await db.query("select pg_get_functiondef('public.save_or_submit_daily_report(date,text,text,text,boolean)'::regprocedure) src")).rows[0].src;
  ok(fn.indexOf('pg_advisory_xact_lock')<fn.indexOf('select * into existing'),'Actor/date lock precedes the first report read');
  ok(fn.includes("SET search_path TO ''"),'Security-definer RPC has an empty search_path');
  equal((await db.query("select has_function_privilege('anon','public.save_or_submit_daily_report(date,text,text,text,boolean)','EXECUTE') allowed")).rows[0].allowed,false,'Anonymous execution remains revoked');
  console.log(JSON.stringify({checks,synthetic:true,in_memory:true,production_writes:false,external_calls:0,
    reviewed_predecessors:[{definition_md5:localBefore.definition_md5,source_md5:localBefore.source_md5},
      {definition_md5:deployedBefore.definition_md5,source_md5:deployedBefore.source_md5}],predecessor_tokens:533}));
} finally {await db.close();}
