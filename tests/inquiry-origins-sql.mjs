// In-memory synthetic PostgreSQL; no network or production writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();let checks=0;
const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
const ids=Array.from({length:5},(_,n)=>`20000000-0000-0000-0000-${String(n+1).padStart(12,'0')}`);
const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid,active boolean,role text,is_test_data boolean default false,data_environment text default 'production');
 create table inquiries(id uuid,owner_id uuid,source text,archived_at timestamptz,is_test_data boolean default false,data_environment text default 'production',excluded_from_dashboard boolean default false);
 create table audit_logs(entity_type text,entity_id uuid,action text);
 create table private.sales_leads(inquiry_id uuid);
 create function private.crm_manager_covers_inquiry(uuid,uuid) returns boolean language sql as $$select false$$;
 insert into profiles(id,active,role) values('${a}',true,'sales'),('${b}',true,'sales');
 insert into inquiries(id,owner_id,source) values('${ids[0]}','${a}','website'),('${ids[1]}','${a}','website'),('${ids[2]}','${a}','email'),('${ids[3]}','${a}','other'),('${ids[4]}','${b}','website');
 insert into audit_logs values('inquiry','${ids[1]}','multichannel_customer_opportunity_created');
 insert into private.sales_leads values('${ids[2]}');select set_config('test.uid','${a}',false);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261029190000_inquiry_channel_origins.sql',import.meta.url),'utf8'));
 const load=async()=>new Map((await db.query('select * from get_inquiry_channel_origins($1::uuid[])',[ids])).rows.map(x=>[x.id,x.origin]));
 let result=await load();eq(result.get(ids[0]),'official');eq(result.get(ids[1]),'personal');eq(result.get(ids[2]),'personal');eq(result.get(ids[3]),'unknown');eq(result.has(ids[4]),false);
 await db.exec("update profiles set role='sales_manager' where id='"+a+"'");eq((await load()).size,0);
 await db.exec("update profiles set role='owner' where id='"+a+"'");eq((await load()).size,5);
 for(const patch of ['archived_at=now()','is_test_data=true',"data_environment='test'",'excluded_from_dashboard=true']){
  await db.exec('begin;update inquiries set '+patch+" where id='"+ids[0]+"'");eq((await load()).has(ids[0]),false);await db.exec('rollback');
 }
 await assert.rejects(()=>db.query('select * from get_inquiry_channel_origins($1::uuid[])',[Array(201).fill(ids[0])]),/200/);checks++;
 await db.exec("update profiles set active=false where id='"+a+"'");await assert.rejects(load,/账号/);checks++;
 for(const role of ['anon','service_role'])eq((await db.query(`select has_function_privilege('${role}','get_inquiry_channel_origins(uuid[])','execute') allowed`)).rows[0].allowed,false);
 eq((await db.query('select count(*)::int n from inquiries')).rows[0].n,5);
 console.log(`${checks} isolated origin-scope checks passed`);
}finally{await db.close()}
