import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]||'@electric-sql/pglite');const db=new PGlite();let checks=0;
const ok=v=>{assert.ok(v);checks++},reject=async f=>{await assert.rejects(f);checks++};
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;grant usage on schema auth,private to authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
create table profiles(id uuid primary key,role text,full_name text,active boolean default true,is_test_data boolean default false,data_environment text default 'production');
create table companies(id uuid primary key default gen_random_uuid(),name text,domain text,created_by uuid);
create table contacts(id uuid primary key default gen_random_uuid(),company_id uuid,full_name text,email text,created_by uuid);
create table inquiries(id uuid primary key default gen_random_uuid(),inquiry_no bigint default 1,company_id uuid,contact_id uuid,title text,source text default 'email',original_message text,product_category text,target_country text,quantity text,demand_summary text,status text default 'pending_assignment',validity text default 'pending',owner_id uuid,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),first_contact_due_at timestamptz,last_change_reason text,archived_at timestamptz,is_test_data boolean default false,data_environment text default 'production',excluded_from_dashboard boolean default false);
create table email_intake(id uuid primary key default gen_random_uuid(),inquiry_id uuid,triage_label text,processing_status text,triaged_by uuid,triaged_at timestamptz,updated_at timestamptz,subject text,body_text text,sender_name text,sender_email text,received_at timestamptz default now(),created_at timestamptz default now());
create table audit_logs(id uuid default gen_random_uuid(),actor_id uuid,entity_type text,entity_id uuid,action text,before_data jsonb,after_data jsonb,reason text,created_at timestamptz default clock_timestamp());
create function private.current_crm_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid() and active$$;
create function private.link_email_intake_messages(uuid,uuid) returns void language sql as $$select$$;
create function private.reject_risk_event_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create function private.sales_lead_actor() returns public.profiles language plpgsql security definer set search_path='' as $$declare p public.profiles;begin select * into p from public.profiles where id=auth.uid() and active;return p;end$$;
create function private.crm_manager_covers_user(uuid,uuid) returns boolean language sql as $$select false$$;
alter table inquiries enable row level security;alter table profiles enable row level security;alter table audit_logs enable row level security;
create policy p on profiles for select to authenticated using(id=auth.uid());
create policy i on inquiries for all to authenticated using(owner_id=auth.uid() or private.current_crm_role() in('owner','marketing')) with check(owner_id=auth.uid() or private.current_crm_role() in('owner','marketing'));
create policy a_read on audit_logs for select to authenticated using(actor_id=auth.uid());create policy a_insert on audit_logs for insert to authenticated with check(actor_id=auth.uid());
grant select on profiles to authenticated;grant select,update on inquiries to authenticated;grant select,insert on audit_logs to authenticated;`);
await db.exec(await readFile(new URL('../supabase/migrations/20261102180000_pipeline_feishu_events.sql',import.meta.url),'utf8'));
const originalConversion=(await readFile(new URL('../supabase/migrations/20260917090000_link_manual_email_conversion_messages.sql',import.meta.url),'utf8')).match(/create or replace function public\.convert_email_intakes_to_inquiries\([\s\S]*?\$\$;/)[0];await db.exec(originalConversion);
await db.exec('revoke all on function public.convert_email_intakes_to_inquiries(uuid[]) from public,anon,service_role;grant execute on function public.convert_email_intakes_to_inquiries(uuid[]) to authenticated');
await db.exec(await readFile(new URL('../supabase/migrations/20261102200000_email_needs_extraction.sql',import.meta.url),'utf8'));
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];const parse=async(s,b='')=>(await one('select private.parse_email_needs($1,$2) r',[s,b])).r;
let r=await parse('RFQ: Steel fire doors, residential project RC1 & RC2 (32 items, approx. 2,400 doors)');
ok(r.fields.product_category==='Steel fire doors');ok(r.fields.quantity==='approx. 2400 doors');ok(!r.fields.target_country);ok(r.fields.demand_summary.includes('Project type: Residential'));ok(!r.fields.demand_summary.includes('RC1'));
for(const [line,country] of [['Country: Armenia','Armenia'],['Destination: United States','United States'],['Project location: Germany','Germany'],['Country: AM','Armenia'],['国家：中国','China']]){r=await parse('Fire doors',line);assert.equal(r.fields.target_country,country,line);checks++}
for(const line of ['Best regards\nBob\nCountry: Germany','My company is in Germany.','Email us@example.us or visit https://example.com.','Shipping origin: China','Country: US and Canada']){r=await parse('Fire doors',line);assert.equal(r.fields.target_country,undefined,line);checks++}
for(const [s,q] of [['We need 2400 doors.','2400 doors'],['Need 100-200 sets','100-200 sets'],['32 items, approx. 2,400 doors','approx. 2400 doors'],['Quantity: 2400','2400'],['Fire doors 200 doors\nQuantity: 200','200 doors']]){r=await parse(s);ok(r.fields.quantity===q)}
for(const s of ['Quote USD 2400, phone +8613800138000, project RC1/RC2, 32 items','Need 200 doors and 300 doors','Need 200-100 doors','Price $100 doors','0 doors','Model FD-2400 doors','Fire doors 200 doors\nQuantity: 300']){r=await parse(s);ok(!r.fields.quantity)}
r=await parse('We do not need fire doors');ok(!r.fields.product_category);r=await parse('Interested in smart locks and wooden doors');ok(r.fields.product_category.includes('Smart locks')&&r.fields.product_category.includes('Wooden doors'));
r=await parse('x'.repeat(64001));ok(r.unresolved.includes('source_too_long'));
// Caller-RLS, fill blanks, immutable provenance and transactional pipeline capture.
const ids={owner:'11111111-1111-4111-8111-111111111111',sales:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
for(const [role,id] of Object.entries(ids))await db.query('insert into profiles(id,role,full_name) values($1,$2,$3)',[id,role==='owner'?'owner':'sales','模拟'+role]);
const as=async(key,readonly=false)=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.jwt',$2,false)",[ids[key]||'',JSON.stringify({role:key?'authenticated':'anon',app_metadata:{crm_read_only:readonly}})]);await db.exec('set role '+(key?'authenticated':'anon'))};
const i=(await one("insert into inquiries(title,original_message,owner_id) values('Steel fire doors, approx. 2400 doors','Country: Armenia',$1) returning *",[ids.sales]));
const call=(id=i.id,recheck=false)=>one('select extract_inquiry_email_needs($1,$2) r',[id,recheck]);
await as('other');await reject(call);await as('sales',true);await reject(call);await as();await reject(call);await as('sales');r=(await call()).r;ok(r.fields.product_category==='Steel fire doors');ok(r.fields.target_country==='Armenia');ok(r.report.applied_fields.length===4);ok((await call()).r.deduplicated);
await db.exec('reset role');ok((await one("select count(*)::int n from audit_logs where action='email_needs_extracted'")).n===1);
await db.query("update inquiries set quantity='Human quantity' where id=$1",[i.id]);await as('sales');r=(await call(i.id,true)).r;ok(r.fields.quantity==='Human quantity');
await db.exec('reset role');const j=(await one("insert into inquiries(title,original_message,owner_id,target_country) values('Fire doors 200 doors','Country: Armenia',$1,'Germany') returning *",[ids.sales]));await as('sales');r=(await call(j.id)).r;ok(r.fields.target_country==='Germany'&&!r.fields.demand_summary);ok(r.report.unresolved.includes('summary_conflicts_with_existing_fields'));
await db.exec('reset role');await db.exec("update private.pipeline_feishu_config set enabled=true,enabled_at=clock_timestamp(),destination_hash=repeat('a',64),approved_by='模拟负责人',approval_reason='合成测试授权基础摘要'");await as('owner');
await db.exec('reset role');const mail=(await one("insert into public.email_intake(subject,body_text,sender_email) values('Steel fire doors approx. 2400 doors','Country: Armenia','synthetic@example.com') returning id")).id;
// Conversion definer is owner-only, original intake linking and fields preserved.
await as('owner');const converted=(await db.query('select * from convert_email_intakes_to_inquiries($1)',[[mail]])).rows[0];ok(converted.was_created);await db.exec('reset role');r=(await one('select * from inquiries where id=$1',[converted.result_inquiry_id]));ok(r.product_category==='Steel fire doors'&&r.quantity==='approx. 2400 doors'&&r.target_country==='Armenia');
const q=(await one("select * from private.pipeline_feishu_queue where kind='intake' and inquiry_id=$1 and state='pending'",[r.id]));ok(q.payload.raw_product==='Steel fire doors');ok(q.payload.email_needs.quantity==='approx. 2400 doors');ok(!JSON.stringify(q.payload.email_needs).includes('synthetic@'));ok((await one("select count(*)::int n from private.pipeline_feishu_queue where inquiry_id=$1 and state='pending'",[r.id])).n===1);
// Audit failure must roll back field updates and queue capture together.
await db.exec("create function private.fail_email_needs_audit() returns trigger language plpgsql as $$begin if new.action='email_needs_extracted' then raise exception 'synthetic audit failure';end if;return new;end$$;create trigger fail_email_needs_audit before insert on audit_logs for each row execute function private.fail_email_needs_audit()");
const atomic=(await one("insert into inquiries(title,original_message,owner_id) values('Fire doors 80 doors','Country: Germany',$1) returning id",[ids.sales])).id;
const beforeAtomic=(await one('select count(*)::int n from private.pipeline_feishu_queue')).n;
await as('sales');await reject(()=>call(atomic));await db.exec('reset role');
ok((await one('select product_category is null and quantity is null and demand_summary is null untouched from inquiries where id=$1',[atomic])).untouched);
ok((await one('select count(*)::int n from private.pipeline_feishu_queue')).n===beforeAtomic);
await db.exec('drop trigger fail_email_needs_audit on audit_logs');
// Reopening the same source does not change stage/validity/owner or queue again.
await as('sales');await call(atomic);await db.exec('reset role');const stable=await one('select status,validity,owner_id,updated_at from inquiries where id=$1',[atomic]);const queueCount=(await one('select count(*)::int n from private.pipeline_feishu_queue')).n;
await as('sales');ok((await call(atomic)).r.deduplicated);await db.exec('reset role');assert.deepEqual(await one('select status,validity,owner_id,updated_at from inquiries where id=$1',[atomic]),stable);checks++;ok((await one('select count(*)::int n from private.pipeline_feishu_queue')).n===queueCount);
await as('owner',true);await reject(()=>db.query('select * from convert_email_intakes_to_inquiries($1)',[[mail]]));
await db.exec('reset role');ok(!(await one("select has_function_privilege('anon','public.extract_inquiry_email_needs(uuid,boolean)','execute') a,has_function_privilege('service_role','public.extract_inquiry_email_needs(uuid,boolean)','execute') s")).a);
await db.close();console.log(JSON.stringify({checks,synthetic:true,production_writes:false}));
