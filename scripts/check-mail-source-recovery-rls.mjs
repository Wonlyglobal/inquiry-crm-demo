// Synthetic isolated PostgreSQL only. No production access or real mail.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_MODULE)throw Error('Provide a verified PGlite module');
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const [owner,mailOwner,other,box,batch,reminder,original,inquiry]=Array.from({length:8},(_,i)=>id(i+1));
await db.exec(`create role authenticated;create role anon;create role service_role;create role crm_marketing_readonly;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('test.role',true)$$;
create function private.crm_readonly_uid() returns uuid language sql stable as $$select nullif(current_setting('test.readonly_uid',true),'')::uuid$$;
create function private.reject_risk_event_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table public.profiles(id uuid primary key,role text,active boolean,is_test_data boolean,data_environment text);
create table public.mailbox_connections(id uuid primary key,user_id uuid);
create table public.email_messages(id uuid primary key,mailbox_connection_id uuid references mailbox_connections,message_id text,sender_email text,subject text,body_text text,body_html text,association_method text,association_status text,inquiry_id uuid);
create table public.email_intake(id uuid primary key,inquiry_id uuid,processing_status text,message_id text,sender_email text,subject text,body_text text);
create table public.audit_logs(actor_id uuid,entity_type text,entity_id uuid,action text,after_data jsonb,reason text);
insert into profiles values('${owner}','owner',true,false,'production'),('${mailOwner}','sales',true,false,'production'),('${other}','marketing',true,false,'production');
insert into mailbox_connections values('${box}','${mailOwner}');
insert into email_messages values('${reminder}','${box}','digest@example.test','no-reply@example.test','Digest','Synthetic digest','','system_notice_correction_v1','ignored',null),('${original}','${box}','original@example.test','buyer@example.test','Doors','Synthetic original','','source_recovery_review','ignored',null);
alter table public.email_messages enable row level security;create policy fixture_read on public.email_messages for select to authenticated,crm_marketing_readonly using(true);grant select on public.email_messages to authenticated,crm_marketing_readonly;grant usage on schema private,auth to authenticated,crm_marketing_readonly;
`);
const old=await readFile(new URL('../supabase/migrations/20261102210000_mail_attribution_history.sql',import.meta.url),'utf8');
await db.exec(old.match(/create function private\.can_read_system_notice\([\s\S]*?\$\$;/)[0]);
await db.exec('revoke all on function private.can_read_system_notice(uuid,text) from public,anon,service_role;grant execute on function private.can_read_system_notice(uuid,text) to authenticated,crm_marketing_readonly;');
await db.exec(await readFile(new URL('../supabase/migrations/20261102223000_mail_source_recovery.sql',import.meta.url),'utf8'));
let checks=0;const yes=async(sql,v)=>{assert.equal((await db.query(sql)).rows[0].v,v);checks++};const rejects=async sql=>{await assert.rejects(()=>db.exec(sql));checks++};
await db.exec(`insert into private.mail_source_recovery_batches values('${batch}','synthetic-recovery',array['${reminder}'::uuid],'Synthetic project owner authorization for exact original source recovery','database-maintenance',now());
insert into private.mail_source_recovery_jobs(batch_id,mailbox_id,tasks) values('${batch}','${box}',jsonb_build_array(jsonb_build_object('reminder_id','${reminder}','mailbox_id','${box}','reminder_hash',md5('Synthetic digest'||E'\n'),'row','1','sender','buyer@example.test','subject','Doors','at','2026-09-10T00:00:00Z')));`);
for(const role of ['anon','authenticated','crm_marketing_readonly']){
 await db.exec('set role '+role);await rejects('select public.claim_mail_source_recovery()');await rejects('select * from private.mail_source_recovery_jobs');await db.exec('reset role');
}
await db.exec("select set_config('test.role','service_role',false);set role service_role");await rejects('select * from private.mail_source_recovery_jobs');
const claim=(await db.query('select public.claim_mail_source_recovery() v')).rows[0].v;assert.equal(claim.tasks.length,1);checks++;
await yes('select public.claim_mail_source_recovery() is null v',true);
await rejects(`select public.finish_mail_source_recovery('${claim.id}','${id(99)}','completed','{}')`);
await rejects(`select public.finish_mail_source_recovery('${claim.id}','${claim.lease_id}','completed','{"body_text":"no raw mail allowed"}')`);
await db.exec(`select public.finish_mail_source_recovery('${claim.id}','${claim.lease_id}','completed','{"items":[],"source_records":0}')`);
await yes('select public.claim_mail_source_recovery() is null v',true);
await db.exec('reset role');
await yes("select count(*)::int v from audit_logs where actor_id is null and action='mail_source_recovery_completed'",1);
await rejects('delete from private.mail_source_recovery_batches');await rejects('delete from private.mail_source_recovery_events');
for(const readonly of [false,true])for(const [actor,n] of [[owner,2],[mailOwner,2],[other,1]]){
 await db.exec(`select set_config('test.uid','${readonly?'':actor}',false);select set_config('test.readonly_uid','${readonly?actor:''}',false);set role ${readonly?'crm_marketing_readonly':'authenticated'};`);
 await yes('select count(*)::int v from email_messages',n);await db.exec('reset role');
}
await db.exec(`update email_messages set inquiry_id='${inquiry}',association_method='unique_contact_email',association_status='matched' where id='${original}'`);
await yes(`select inquiry_id is null and association_method='source_recovery_review' v from email_messages where id='${original}'`,true);
await db.exec(`insert into email_intake values('${id(20)}','${inquiry}','converted','other@example.test','buyer@example.test','Other','Other');update email_messages set inquiry_id='${inquiry}',association_method='thread_header' where id='${original}'`);
await yes(`select inquiry_id is null v from email_messages where id='${original}'`,true);
await db.exec(`update email_intake set message_id='original@example.test';update email_messages set inquiry_id='${inquiry}',association_method='manual_intake_conversion',association_status='matched' where id='${original}'`);
await yes(`select inquiry_id='${inquiry}' and body_text='Synthetic original' v from email_messages where id='${original}'`,true);
// An altered frozen reminder blocks re-claim instead of searching a changed source.
await db.exec("update private.mail_source_recovery_jobs set state='queued';update email_messages set body_text='Changed synthetic digest' where message_id='digest@example.test';set role service_role;");
await rejects('select public.claim_mail_source_recovery()');
await db.close();console.log(`${checks} isolated recovery scope, ACL, lease, source-drift, readonly visibility and conversion checks passed`);
