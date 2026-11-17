// Isolated, synthetic records only. No connection to production.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]||'@electric-sql/pglite');const db=new PGlite();let checks=0;
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role',coalesce(nullif(current_setting('test.role',true),''),'authenticated'))$$;
create type public.crm_role as enum('owner','marketing','sales_manager','sales');create type public.inquiry_status as enum('received','pending_assignment','won','lost');
create table public.profiles(id uuid primary key,full_name text,team text,active boolean default true,role crm_role,is_test_data boolean default false,data_environment text default 'production');
create table public.companies(id uuid primary key,name text,domain text,country text,created_by uuid,is_test_data boolean,data_environment text,created_at timestamptz default clock_timestamp(),updated_at timestamptz);
create table public.contacts(id uuid primary key,company_id uuid,full_name text,email text,phone text,whatsapp text,created_by uuid,is_test_data boolean,data_environment text,created_at timestamptz default clock_timestamp());
create table public.inquiries(id uuid primary key,company_id uuid,contact_id uuid,title text,product_category text,quantity text,target_country text,source text,source_detail text,original_message text,demand_summary text,primary_source text,status inquiry_status,validity text,owner_id uuid,created_by uuid,updated_by uuid,estimated_amount numeric,currency text,expected_close_date date,first_contact_due_at timestamptz,last_change_reason text,is_test_data boolean,data_environment text,created_at timestamptz default clock_timestamp());
create table public.inquiry_marketing_touches(inquiry_id uuid,touch_at timestamptz,channel text,evidence_note text,is_primary boolean,created_by uuid);
create table public.audit_logs(actor_id uuid,entity_type text,entity_id uuid,action text,reason text,after_data jsonb);
create table public.notifications(id uuid default gen_random_uuid(),recipient_id uuid,inquiry_id uuid,type text,title text,body text);
create table public.follow_ups(inquiry_id uuid,author_id uuid,created_at timestamptz);
create function private.reject_risk_event_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create function private.crm_manager_covers_user(manager uuid,subject uuid) returns boolean language sql as $$select exists(select 1 from public.profiles m join public.profiles s on m.team=s.team where m.id=manager and s.id=subject)$$;
grant usage on schema auth to authenticated,anon;
`);
const ids={s:'11111111-1111-4111-8111-111111111111',s2:'22222222-2222-4222-8222-222222222222',m:'33333333-3333-4333-8333-333333333333',o:'44444444-4444-4444-8444-444444444444',boss:'55555555-5555-4555-8555-555555555555'};
for(const [k,id] of Object.entries(ids))await db.query('insert into public.profiles(id,full_name,team,role) values($1,$2,$3,$4)',[id,'合成'+k,k==='s2'?'B':'A',k==='s'||k==='s2'?'sales':k==='m'?'marketing':k==='boss'?'sales_manager':'owner']);
for(const f of ['20260922190000_multichannel_customer_opportunity.sql','20261026090000_sales_lead_workspace.sql','20261026091000_sales_lead_reminders.sql','20261026093000_sales_lead_future_exemptions.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const as=async(k)=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[ids[k]||'']);await db.exec('set role '+(k?'authenticated':'anon'))};
const call=async(name,args)=>{const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');return (await db.query('select public.'+name+'('+placeholders+') r',args)).rows[0].r};
const reject=async fn=>{await assert.rejects(fn);checks++};const ok=x=>{assert.ok(x);checks++};
await db.exec(await readFile(new URL('../supabase/migrations/20261028170000_sales_lead_pending_contact.sql',import.meta.url),'utf8'));


await db.exec(await readFile(new URL('../supabase/migrations/20261112140000_sales_lead_estimate.sql',import.meta.url),'utf8'));

await db.exec(await readFile(new URL('../supabase/migrations/20261117163000_unconverted_lead_progress.sql',import.meta.url),'utf8'));
await as('s');const today=(await db.query("select (clock_timestamp() at time zone 'Asia/Shanghai')::date::text d")).rows[0].d;
const row={request_id:crypto.randomUUID(),acquired_on:today,company:'合成待转化客户',contact:'合成联系人',country:'合成地区',email:'test@example.invalid',phone:'',source:'outbound',demand:'合成测试需求'};
const saved=await call('record_sales_leads',[JSON.stringify([row]),'manual']);let view=await call('sales_lead_workspace',[today,today]);const before=view.leads[0];
await call('update_sales_lead_progress',[saved[0].id,'已电话联系，待确认需求']);view=await call('sales_lead_workspace',[today,today]);let lead=view.leads[0];ok(lead.progress_note==='已电话联系，待确认需求'&&lead.progress_at&&lead.inquiry_id===null);ok(lead.recorded_at===before.recorded_at&&lead.source===before.source&&view.leads.length===1);
for(const k of ['s2','m','o','boss','']){await as(k);await reject(()=>call('update_sales_lead_progress',[saved[0].id,'不允许代替本人跟进']));}
await as('s');await reject(()=>call('update_sales_lead_progress',[saved[0].id,'短']));await reject(()=>call('update_sales_lead_progress',[saved[0].id,'字'.repeat(2001)]));await reject(()=>call('update_sales_lead_progress',[crypto.randomUUID(),'不存在的线索不能修改']));await reject(()=>call('update_sales_lead_progress',[null,'空对象不能修改']));
const converted=await call('convert_sales_lead',[saved[0].id]);await call('update_sales_lead_progress',[saved[0].id,'会议已完成，继续核实交期']);view=await call('sales_lead_workspace',[today,today]);lead=view.leads[0];ok(lead.inquiry_id===converted.inquiry_id&&lead.recorded_at===before.recorded_at&&lead.source===before.source);ok(lead.progress_note==='会议已完成，继续核实交期'&&view.leads.length===1);ok((await call('convert_sales_lead',[saved[0].id])).inquiry_id===converted.inquiry_id);
await reject(()=>db.exec('select * from private.sales_lead_events'));
await db.exec('reset role');ok((await db.query("select count(*)::int n from private.sales_lead_events where action='progress_updated'")).rows[0].n===2);ok((await db.query('select count(*)::int n from public.inquiries')).rows[0].n===1);ok((await db.query('select owner_id from public.inquiries where id=$1',[converted.inquiry_id])).rows[0].owner_id===ids.s);
for(const role of ['anon','service_role'])ok(!(await db.query("select has_function_privilege($1,'public.update_sales_lead_progress(uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed);
await db.query('update public.profiles set active=false where id=$1',[ids.s]);await as('s');await reject(()=>call('update_sales_lead_progress',[saved[0].id,'已停用账号不允许修改']));
await db.exec('reset role');const migration=await readFile(new URL('../supabase/migrations/20261117163000_unconverted_lead_progress.sql',import.meta.url),'utf8');await reject(()=>db.exec(migration));
await db.close();console.log(`${checks} lead progress authorization and immutable timing assertions passed`);
