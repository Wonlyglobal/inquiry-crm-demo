const {PGlite}=await import(process.env.CRM_PGLITE_MODULE || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,full_name text,email text,role text,team text,job_title text,active boolean,is_test_data boolean,data_environment text);
create table sales_target_people(profile_id uuid,sales_region text);
insert into profiles select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'User'||i,'internal'||i||'@example.test',case i when 1 then 'owner' when 2 then 'sales_manager' when 3 then 'marketing' else 'sales' end,'team'||i,'staff',i<>5,i=6,case when i=7 then 'staging' else 'production' end from generate_series(1,7) i;
alter table profiles enable row level security;grant select on profiles to authenticated;create policy own on profiles for select to authenticated using(id=auth.uid());
insert into sales_target_people select id,'中东' from profiles where role='sales';`);
await db.exec(await readFile(new URL('../supabase/migrations/20260922133000_member_directory.sql',import.meta.url),'utf8'));
const actor=async i=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[i?'00000000-0000-4000-8000-'+String(i).padStart(12,'0'):'']);
await db.exec('set role authenticated');
for(const i of [1,2,3]){await actor(i);const rows=(await db.query('select * from get_crm_member_directory()')).rows;assert.equal(rows.length,5);assert.equal(rows.filter(x=>!x.active).length,1);assert.deepEqual(Object.keys(rows[0]),['id','full_name','email','role','team','job_title','active','sales_region']);assert.equal((await db.query('select * from profiles')).rows.length,1);}
for(const i of [null,4,5,6,7]){await actor(i);await assert.rejects(()=>db.query('select * from get_crm_member_directory()'),/无权/);}
await db.exec('reset role');await db.exec('update profiles set active=false where role=\'marketing\'');await actor(3);await assert.rejects(()=>db.query('select * from get_crm_member_directory()'),/无权/);
assert.equal((await db.query("select has_function_privilege('anon','get_crm_member_directory()','execute') ok")).rows[0].ok,false);
await db.close();console.log('Directory SQL passed: authorized roles see formal active/inactive directory; test/staging excluded; inactive/anonymous/sales denied; base RLS unchanged.');
