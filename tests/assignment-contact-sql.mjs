// Isolated in-memory PostgreSQL with synthetic fixtures. No production writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);
const db=new PGlite();let checks=0;
const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
const i='20000000-0000-0000-0000-000000000001',j='20000000-0000-0000-0000-000000000002';
const f='30000000-0000-0000-0000-000000000001';
const equal=(x,y)=>{assert.deepEqual(x,y);checks++};
const reject=async(fn,re)=>{await assert.rejects(fn,re);checks++};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('app_metadata',jsonb_build_object('crm_read_only',coalesce(current_setting('test.read_only',true),'false')))$$;
 create table profiles(id uuid primary key,active boolean,role text,is_test_data boolean default false,data_environment text default 'production');
 create table inquiries(id uuid primary key,owner_id uuid,validity text,excluded_from_dashboard boolean,status text,invalid_review_status text,assigned_at timestamptz,first_valid_contact_at timestamptz,updated_by uuid,updated_at timestamptz,last_change_reason text,archived_at timestamptz,is_test_data boolean default false,data_environment text default 'production');
 create table follow_ups(id uuid primary key,inquiry_id uuid,author_id uuid,method text,content text,is_first_valid_contact boolean default false,created_at timestamptz default now());
 create table audit_logs(actor_id uuid,entity_type text,entity_id uuid,action text,before_data jsonb,after_data jsonb,reason text);
 insert into profiles(id,active,role) values('${a}',true,'sales'),('${b}',true,'sales');
 insert into inquiries(id,owner_id,validity,excluded_from_dashboard,status,invalid_review_status,assigned_at,first_valid_contact_at,updated_by,updated_at,last_change_reason) values('${i}','${a}','valid',false,'received',null,'2026-10-10T00:00Z',null,null,null,null),('${j}','${b}','valid',false,'received',null,'2026-10-10T00:00Z',null,null,null,null);
 insert into follow_ups(id,inquiry_id,author_id,method,content) values('${f}','${j}','${b}','phone','synthetic contact');
 select set_config('test.uid','${a}',false);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261029180000_confirm_assignment_contact.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261029181000_confirm_contact_isolation.sql',import.meta.url),'utf8'));
 const call=(id=i,evidence=null,at='2026-10-10T02:00:00Z',note='业务员模拟确认实际联系')=>db.query('select confirm_assignment_first_contact($1,$2,$3,$4) result',[id,evidence,at,note]);
 await reject(()=>call(j),/本人/);
 await reject(()=>call(i,f),/本人/);
 await reject(()=>call(i,null,'2026-10-09T00:00Z'),/实际联系时间/);
 await reject(()=>call(i,null,'2999-01-01T00:00Z'),/实际联系时间/);
 await reject(()=>call(i,null,'2026-10-10T02:00Z',' '),/核对说明/);
 await db.exec("select set_config('test.read_only','true',false)");await reject(()=>call(),/负责业务员/);
 await db.exec("select set_config('test.read_only','false',false);update profiles set role='sales_manager'");await reject(()=>call(),/负责业务员/);
 await db.exec("update profiles set role='sales';update profiles set active=false");await reject(()=>call(),/负责业务员/);
 await db.exec("update profiles set active=true");
 for(const patch of ["status='won'","status='lost'","excluded_from_dashboard=true","validity='invalid'","invalid_review_status='pending'","archived_at=now()","is_test_data=true","data_environment='test'"]){
  await db.exec('begin;update inquiries set '+patch+` where id='${i}'`);await reject(()=>call(),/当前询盘/);await db.exec('rollback');
 }
 equal((await db.query('select count(*)::int n from audit_logs')).rows[0].n,0);
 const before=await db.query(`select count(*)::int n from inquiries where owner_id='${a}' and assigned_at is not null and first_valid_contact_at is null`);equal(before.rows[0].n,1);
 equal((await call()).rows[0].result.confirmed,true);
 equal((await db.query(`select count(*)::int n from inquiries where owner_id='${a}' and assigned_at is not null and first_valid_contact_at is null`)).rows[0].n,0);
 const saved=(await db.query(`select first_valid_contact_at,updated_at,status from inquiries where id='${i}'`)).rows[0];
 equal(new Date(saved.first_valid_contact_at).toISOString(),'2026-10-10T02:00:00.000Z');equal(saved.status,'received');assert.notEqual(String(saved.updated_at),String(saved.first_valid_contact_at));checks++;
 equal((await call()).rows[0].result.already_confirmed,true);
 equal((await db.query('select count(*)::int n from audit_logs')).rows[0].n,1);
 equal((await db.query('select after_data from audit_logs')).rows[0].after_data.confirmation_basis,'salesperson_declaration');
 await reject(()=>call(i,null,'2026-10-11T00:00Z'),/不能覆盖/);
 equal((await db.query(`select first_valid_contact_at from inquiries where id='${j}'`)).rows[0].first_valid_contact_at,null);
 for(const role of ['anon','service_role'])equal((await db.query(`select has_function_privilege('${role}','public.confirm_assignment_first_contact(uuid,uuid,timestamptz,text)','execute') allowed`)).rows[0].allowed,false);
 equal((await db.query("select has_function_privilege('authenticated','public.confirm_assignment_first_contact(uuid,uuid,timestamptz,text)','execute') allowed")).rows[0].allowed,true);
 console.log(`${checks} isolated assignment-contact checks passed`);
}finally{await db.close()}
