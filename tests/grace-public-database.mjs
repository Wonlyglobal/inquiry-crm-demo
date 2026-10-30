// Run only in a new in-memory database; no production connection is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz);`);
await db.exec(await readFile(new URL('../apps/grace/public-backend/migrations/202610300001_public_accounts.sql',import.meta.url),'utf8'));
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.users values('${a}',now(),null),('${b}',null,null);`);
const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
for(const role of ['anon','authenticated']){
 assert.equal(await scalar(`select has_schema_privilege('${role}','grace_private','USAGE')`),false);
 for(const name of ['account','consume','disable'])assert.equal(await scalar(`select has_function_privilege('${role}','public.grace_public_${name}(uuid)','EXECUTE')`),false);
}
assert.equal(await scalar(`select public.grace_public_account('${b}')`),false);
assert.equal(await scalar(`select public.grace_public_consume('${b}')`),false);
for(let i=0;i<20;i++)assert.equal(await scalar(`select public.grace_public_consume('${a}')`),true);
assert.equal(await scalar(`select public.grace_public_consume('${a}')`),false);
assert.equal(await scalar(`select used from grace_private.quota where scope='global'`),20);
await db.exec(`update auth.users set email_confirmed_at=now() where id='${b}'; update grace_private.quota set used=500 where scope='global';`);
assert.equal(await scalar(`select public.grace_public_consume('${b}')`),false);
await db.exec(`select public.grace_public_disable('${a}');`);
assert.equal(await scalar(`select public.grace_public_account('${a}')`),false);
await db.exec(`delete from auth.users where id='${a}';`);
assert.equal(await scalar(`select count(*)::int from grace_private.accounts where user_id='${a}'`),0);
assert.equal(await scalar(`select count(*)::int from grace_private.quota where scope='${a}'`),0);
assert.equal(await scalar(`select used from grace_private.quota where scope='global'`),500);
await db.close();
console.log('PASS: separate-project SQL permissions, verification, quota, disable and deletion cascade');
