// Run against isolated pinned PGlite only; never production test writes.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();const owner='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';let checks=0;
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant usage on schema auth to authenticated,anon;create table public.profiles(id uuid primary key,active boolean,role text);insert into public.profiles values('${owner}',true,'owner');
create table public.audit_logs(id bigint generated always as identity,actor_id uuid,entity_type text,entity_id uuid,action text,after_data jsonb,reason text,created_at timestamptz default clock_timestamp());`);
for(const file of ['20261019020000_agent_private_intelligence.sql','20261022100000_private_social_daily_types.sql','20261023110000_private_facebook_youtube_daily.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
const as=async(id=owner,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,email:'chloelee@wonlyglobal.com'})]);await db.exec('set role '+role)};
const doc={schema:'grace-private-intelligence-v1',kind:'tiktok',key:'tiktok-2026-10-22',title:'合成TikTok指标',generated_at:'2026-10-22T09:00:00Z',period:{from:'2026-10-22',to:'2026-10-22'},human_verified:false,source_sha256:'a'.repeat(64),sections:[{title:'日期与缺口',body:'合成数据，不是真实业务；missing未知，0是真实数值'}],evidence:[]};
const sync=d=>db.query('select public.sync_agent_private_intelligence($1) r',[JSON.stringify([d])]);const read=k=>db.query('select public.read_agent_private_intelligence($1,null,null,null,1) r',[k]);
const ok=x=>{assert.ok(x);checks++},reject=async f=>{await assert.rejects(f);checks++};
await as();const first=(await sync(doc)).rows[0].r.receipts[0];ok(first.key===doc.key);ok((await read('tiktok')).rows[0].r.documents[0].digest===first.digest);ok((await sync(doc)).rows[0].r.receipts[0].id===first.id);
const ig={...doc,kind:'instagram',key:'instagram-2026-10-22'};await sync(ig);ok((await read('instagram')).rows[0].r.documents[0].document.kind==='instagram');
for(const kind of ['facebook','youtube']){const d={...doc,kind,key:kind+'-2026-10-22'};const receipt=(await sync(d)).rows[0].r.receipts[0];ok((await read(kind)).rows[0].r.documents[0].digest===receipt.digest);ok((await sync(d)).rows[0].r.receipts[0].id===receipt.id)}
await reject(()=>sync({...doc,kind:'linkedin',key:'linkedin-2026-10-22'}));await reject(()=>sync({...doc,key:'instagram-2026-10-22'}));await reject(()=>db.query('select * from public.agent_private_intelligence_versions'));await reject(()=>db.query('delete from public.agent_private_intelligence_versions'));
await as('11111111-1111-4111-8111-111111111111');await reject(()=>read('tiktok'));await reject(()=>sync(doc));await as(null,'anon');await reject(()=>read('instagram'));
await db.exec('reset role');await db.query("update public.profiles set active=false where id=$1",[owner]);await as();await reject(()=>sync(doc));await db.close();console.log(JSON.stringify({checks,isolated:true,new_kinds_only:['facebook','youtube'],no_new_table_or_grants:true}));
