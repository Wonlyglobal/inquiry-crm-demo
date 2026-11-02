// Isolated PostgreSQL fixtures only; no production connection or customer data.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_MODULE)throw Error('Provide a verified local PGlite module');
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();
const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const [owner,mailOwner,other,inactive,testProfile,batch,message,mailbox,inquiry]=Array.from({length:9},(_,i)=>uid(i+1));
await db.exec(`create role authenticated;create role anon;create role service_role;create role crm_marketing_readonly;
create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function private.crm_readonly_uid() returns uuid language sql stable as $$select nullif(current_setting('test.readonly_uid',true),'')::uuid$$;
create function private.reject_risk_event_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create type public.crm_role as enum('owner','sales','marketing','manager');
create table public.profiles(id uuid primary key,role public.crm_role,active boolean,is_test_data boolean,data_environment text);
create table public.mailbox_connections(id uuid primary key,user_id uuid);
create table public.sales_360_cycles(id uuid);
create table public.daily_sales_reports(id uuid);
create table public.email_messages(id uuid primary key,mailbox_connection_id uuid,inquiry_id uuid,association_method text,association_status text,body_text text);
insert into public.profiles values('${owner}','owner',true,false,'production'),('${mailOwner}','sales',true,false,'production'),('${other}','marketing',true,false,'production'),('${inactive}','owner',false,false,'production'),('${testProfile}','owner',true,true,'production');
insert into public.mailbox_connections values('${mailbox}','${mailOwner}');
insert into public.email_messages values('${message}','${mailbox}','${inquiry}','unique_contact_email','matched','Synthetic immutable original');
alter table public.email_messages enable row level security;
create policy fixture_email_scope on public.email_messages for select to authenticated,crm_marketing_readonly using(true);
grant usage on schema private,auth to authenticated,crm_marketing_readonly;
grant select on public.email_messages to authenticated,crm_marketing_readonly;`);
for(const table of ['follow_ups','communication_summaries','email_reply_reminders'])await db.exec(`create table public.${table}(id uuid primary key,inquiry_id uuid not null,content text);alter table public.${table} enable row level security;create policy fixture_scope on public.${table} for select to authenticated,crm_marketing_readonly using(true);grant select on public.${table} to authenticated,crm_marketing_readonly;insert into public.${table} values('${message}','${inquiry}','Synthetic retained history');`);
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
let scoring=(await read('supabase/migrations/20260918110000_sales_360_score_foundation.sql')).match(/create or replace function public\.calculate_sales_360_cycle\([\s\S]*?\$\$;/i)[0];
scoring=scoring.replace('select a.evaluator_group,r.overall_score from public.sales_360_evaluation_assignments a',"select a.evaluator_group,case when r.questionnaire_version='360-nrs-v3' then r.overall_score/2 else r.overall_score end as overall_score from public.sales_360_evaluation_assignments a");
scoring=scoring.replace('end as relative_rank','end::numeric as relative_rank');
await db.exec(scoring);
await db.exec((await read('supabase/migrations/20261026130000_unified_daily_lead_reports.sql')).match(/create or replace function public\.save_or_submit_daily_report\([\s\S]*?\$\$;/i)[0]);
const migration=await read('supabase/migrations/20261102210000_mail_attribution_history.sql');
await db.exec(migration);
let checks=0;
async function yes(sql,expected){assert.equal((await db.query(sql)).rows[0].v,expected);checks++}
async function rejects(sql){await assert.rejects(()=>db.exec(sql));checks++}
await yes("select position('e.attribution_correction_id is null' in prosrc)>0 v from pg_proc where oid='calculate_sales_360_cycle(uuid)'::regprocedure",true);
await yes("select position('attribution_correction_id is null and author_id' in prosrc)>0 v from pg_proc where oid='save_or_submit_daily_report(date,text,text,text,boolean)'::regprocedure",true);
for(const table of ['follow_ups','communication_summaries','email_reply_reminders']){
 await rejects(`insert into public.${table} values('${uid(20)}',null,'bad',null)`);
 await rejects(`update public.${table} set inquiry_id=null,attribution_correction_id='${batch}'`);
}
await db.exec(`insert into private.mail_attribution_correction_batches values('${batch}','synthetic-correction','${inquiry}',array['${message}'::uuid],repeat('a',32),'Synthetic authorized correction for isolated test','database-maintenance','Synthetic system notice wrongly attributed to customer',now());
insert into private.mail_attribution_correction_entries values('${batch}','${message}','junk_digest',repeat('a',32),'{}','{}');
update public.email_messages set inquiry_id=null;
`);
for(const table of ['follow_ups','communication_summaries','email_reply_reminders'])await db.exec(`update public.${table} set inquiry_id=null,attribution_correction_id='${batch}'`);
await yes(`select association_method='system_notice_correction_v1' and association_status='ignored' and inquiry_id is null v from email_messages`,true);
await db.exec(`update email_messages set inquiry_id='${inquiry}',association_method='unique_contact_email',association_status='matched'`);
await yes('select inquiry_id is null v from email_messages',true);
for(const table of ['batches','entries','routes']){
 if(table==='routes')await db.exec(`insert into private.mail_attribution_correction_routes values('${batch}','follow_ups','${message}','{}',repeat('a',32))`);
 await rejects(`delete from private.mail_attribution_correction_${table}`);
}
async function as(id,readonly=false){await db.exec(`reset role;select set_config('test.uid','${readonly?'':id}',false);select set_config('test.readonly_uid','${readonly?id:''}',false);set role ${readonly?'crm_marketing_readonly':'authenticated'};`)}
for(const readonly of [false,true])for(const [id,visible] of [[owner,1],[mailOwner,1],[other,0],[inactive,0],[testProfile,0]]){
 await as(id,readonly);
 await yes('select count(*)::int v from email_messages',visible);
 for(const table of ['follow_ups','communication_summaries','email_reply_reminders'])await yes(`select count(*)::int v from ${table}`,0);
 await rejects('select * from private.mail_attribution_correction_entries');
 await rejects(`update email_messages set inquiry_id='${inquiry}'`);
}
await db.exec('reset role');
for(const table of ['follow_ups','communication_summaries','email_reply_reminders']){
 await yes(`select content='Synthetic retained history' v from ${table}`,true);
 await rejects(`update ${table} set inquiry_id='${inquiry}'`);
 await db.exec(`update ${table} set inquiry_id='${inquiry}',attribution_correction_id=null`);
}
await as(other);
for(const table of ['follow_ups','communication_summaries','email_reply_reminders'])await yes(`select count(*)::int v from ${table}`,1);
await db.close();
console.log(`${checks} isolated attribution, resync, RLS, immutable-history and rollback checks passed`);
