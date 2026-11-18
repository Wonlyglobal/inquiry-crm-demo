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

await db.exec(await readFile(new URL('../supabase/migrations/20261117173000_personal_lead_lifecycle.sql',import.meta.url),'utf8'));
await as('s');const today=(await db.query("select (clock_timestamp() at time zone 'Asia/Shanghai')::date::text d")).rows[0].d;
const make=(name)=>({request_id:crypto.randomUUID(),acquired_on:today,company:name,contact:'合成联系人',country:'合成国家',email:'test@example.invalid',source:'outbound',demand:'合成安全门需求'});
const saved=await call('record_sales_leads',[JSON.stringify([make('旧线索'),make('新线索')]),'manual']);
await db.exec('reset role');await db.query("update private.sales_leads set recorded_on=recorded_on-200,recorded_at=recorded_at-interval '200 days' where id=$1",[saved[0].id]);await as('s');
const before=await call('personal_sales_lead_detail',[saved[0].id,0]);ok((await call('sales_lead_workspace',[today,today])).leads.length===1);ok((await call('personal_sales_lead_list',['','pending',0])).total===2);
const due=new Date(Date.now()-60000).toISOString(),request=crypto.randomUUID();
await call('record_personal_lead_activity',[saved[0].id,request,'已联系客户，安排复核','核对门洞尺寸',due,false]);
await call('record_personal_lead_activity',[saved[0].id,request,'已联系客户，安排复核','核对门洞尺寸',due,false]);
let detail=await call('personal_sales_lead_detail',[saved[0].id,0]);ok(detail.history_total===1&&detail.lead.next_action==='核对门洞尺寸');ok(detail.lead.recorded_at===before.lead.recorded_at);ok((await call('personal_sales_lead_list',['','due',0])).total===1);
await reject(()=>call('record_personal_lead_activity',[saved[0].id,request,'不同的重试不能覆盖','核对门洞尺寸',due,false]));
await reject(()=>call('record_personal_lead_activity',[saved[0].id,crypto.randomUUID(),'不允许缺少截止时间','核对门洞尺寸',null,false]));
const profile={company:detail.lead.company,contact:detail.lead.contact,country:detail.lead.country,demand:detail.lead.demand};
await reject(()=>call('correct_personal_sales_lead',[saved[0].id,JSON.stringify(profile),JSON.stringify({...profile,company:{bad:true}})]));await call('correct_personal_sales_lead',[saved[0].id,JSON.stringify(profile),JSON.stringify({...profile,company:'已纠错客户'})]);await reject(()=>call('correct_personal_sales_lead',[saved[0].id,JSON.stringify(profile),JSON.stringify({...profile,company:'过期覆盖'})]));
detail=await call('personal_sales_lead_detail',[saved[0].id,0]);ok(detail.lead.company==='已纠错客户'&&detail.lead.recorded_at===before.lead.recorded_at);
for(const k of ['s2','m','o','boss','']){await as(k);await reject(()=>call('personal_sales_lead_detail',[saved[0].id,0]));await reject(()=>call('record_personal_lead_activity',[saved[0].id,crypto.randomUUID(),'越权不能跟进','',null,false]));await reject(()=>call('correct_personal_sales_lead',[saved[0].id,JSON.stringify(profile),JSON.stringify(profile)]));if(k!=='s2')await reject(()=>call('personal_sales_lead_list',['','all',0]));}
await as('s2');ok((await call('personal_sales_lead_for_inquiry',[crypto.randomUUID()]))===null);ok((await call('personal_sales_lead_list',['','all',0])).total===0);
await as('s');for(const args of [['','bad',0],['','all',-1],['','all',1],['x'.repeat(301),'all',0]])await reject(()=>call('personal_sales_lead_list',args));
const opportunity=await call('convert_sales_lead',[saved[0].id]);detail=await call('personal_sales_lead_detail',[saved[0].id,0]);ok(detail.lead.inquiry_id===opportunity.inquiry_id&&detail.history_total===1);ok((await call('personal_sales_lead_for_inquiry',[opportunity.inquiry_id]))===saved[0].id);await as('s2');ok((await call('personal_sales_lead_for_inquiry',[opportunity.inquiry_id]))===null);await as('s');ok((await call('personal_sales_lead_list',['','pending',0])).total===1);ok((await call('personal_sales_lead_list',['','converted',0])).total===1);
await reject(()=>call('correct_personal_sales_lead',[saved[0].id,JSON.stringify(profile),JSON.stringify(profile)]));
await call('record_personal_lead_activity',[saved[0].id,crypto.randomUUID(),'行动已经完成，等待客户反馈','核对门洞尺寸',due,true]);detail=await call('personal_sales_lead_detail',[saved[0].id,0]);ok(detail.history_total===2&&detail.lead.next_done_at);ok((await call('personal_sales_lead_list',['','due',0])).total===0);ok(detail.lead.recorded_at===before.lead.recorded_at&&detail.lead.source===before.lead.source);
await reject(()=>db.exec('select * from private.sales_lead_events'));await db.exec('reset role');
for(const signature of ['public.personal_sales_lead_for_inquiry(uuid)','public.personal_sales_lead_list(text,text,integer)','public.personal_sales_lead_detail(uuid,integer)','public.record_personal_lead_activity(uuid,uuid,text,text,timestamptz,boolean)','public.correct_personal_sales_lead(uuid,jsonb,jsonb)'])for(const role of ['anon','service_role'])ok(!(await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed);
ok((await db.query('select count(*)::int n from public.follow_ups')).rows[0].n===0);ok((await db.query('select count(*)::int n from public.inquiries')).rows[0].n===1);
await as('s');const batch=Array.from({length:55},(_,i)=>make('分页客户'+i));await call('record_sales_leads',[JSON.stringify(batch),'excel']);const first=await call('personal_sales_lead_list',['','all',0]),second=await call('personal_sales_lead_list',['','all',50]);ok(first.items.length===50&&second.items.length===7&&first.total===57);ok(new Set([...first.items,...second.items].map(x=>x.id)).size===57);ok((await call('personal_sales_lead_list',['%','all',0])).total===0);await reject(()=>call('personal_sales_lead_detail',[saved[0].id,1]));
await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[ids.s]);await as('s');await reject(()=>call('personal_sales_lead_list',['','all',0]));await reject(()=>call('personal_sales_lead_detail',[saved[0].id,0]));
await db.close();console.log(`${checks} isolated lifecycle assertions passed`);
