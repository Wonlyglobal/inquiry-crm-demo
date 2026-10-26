// Explicit in-memory synthetic SQL acceptance. Only argv[2] is used: a preinstalled pinned PGlite URL.
// This script has no production connection, network fetch, private bundle path or persistence directory.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productDocument,productKey,region,span,rekey} from './private-product-evidence-fixture.mjs';
if(!process.argv[2]||process.argv.length>3)throw Error('Pass only the verified local PGlite module URL');
const {PGlite}=await import(process.argv[2]),db=new PGlite();let checks=0;
const owner='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
const oldFiles=['20261019020000_agent_private_intelligence.sql','20261022100000_private_social_daily_types.sql','20261023110000_private_facebook_youtube_daily.sql'];
const sql=await readFile(new URL('../supabase/migrations/20261026150000_private_product_page_evidence.sql',import.meta.url),'utf8');
const query=(s,args=[])=>db.query(s,args),ok=(x,note)=>{assert.ok(x,note);checks++};
const reject=async(f,note)=>{await assert.rejects(f,undefined,note);checks++};
try{
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant usage on schema auth to authenticated,anon;
create table public.profiles(id uuid primary key,active boolean,role text);insert into public.profiles values('${owner}',true,'owner');
create table public.audit_logs(id bigint generated always as identity,actor_id uuid,entity_type text,entity_id uuid,action text,after_data jsonb,reason text,created_at timestamptz default clock_timestamp());`);
const definitions=new Map();
for(const f of oldFiles){const text=await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8');await db.exec(text);for(const m of text.matchAll(/create(?: or replace)? function public\.([a-z_]+)\([\s\S]*?end; \$\$;/g))definitions.set(m[1],m[0].replace(/^create function/,'create or replace function'))}
for(const name of ['private_intelligence_actor','validate_private_intelligence','sync_agent_private_intelligence','read_agent_private_intelligence','receipt_agent_private_intelligence']){
 const definition=definitions.get(name);assert.ok(definition);await db.exec(definition.replace('begin\n','begin\n -- synthetic definition drift\n'));
 await reject(()=>db.exec(sql),'definition drift '+name);await db.exec('rollback');await db.exec(definition);
}
ok((await query("select to_regprocedure('public.validate_private_product_page_evidence(jsonb)') is null missing")).rows[0].missing);

const preserved=['private_intelligence_actor','sync_agent_private_intelligence','receipt_agent_private_intelligence'];
const fingerprints=async()=>Object.fromEntries((await query("select proname,md5(prosrc) hash from pg_proc where pronamespace='public'::regnamespace and proname=any($1)",[preserved])).rows.map(r=>[r.proname,r.hash]));
const before=await fingerprints();await db.exec(sql);assert.deepEqual(await fingerprints(),before);checks++;
const as=async(sub=owner,email='chloelee@wonlyglobal.com',role='authenticated')=>{await db.exec('reset role');await query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,email})]);await db.exec('set role '+role)};
const validate=async d=>{await db.exec('reset role');return query('select public.validate_private_intelligence($1::jsonb)',[JSON.stringify(d)])};
const sync=async docs=>(await query('select public.sync_agent_private_intelligence($1::jsonb) r',[JSON.stringify(docs)])).rows[0].r;
const read=async(key=null,kind='product',limit=5)=>(await query('select public.read_agent_private_intelligence($1,null,null,$2,$3) r',[kind,key,limit])).rows[0].r;
const changed=fn=>{const d=productDocument();fn(d,d.product_evidence,d.product_evidence.regions[0]);return d};
await validate(productDocument());checks++;
// Every prior kind remains independently valid and has its original date key.
for(const kind of ['weekly','daily','evidence','tiktok','instagram','facebook','youtube']){
 const d=productDocument();delete d.product_evidence;d.kind=kind;d.key=kind+'-2026-10-26'+(kind==='weekly'?'-2026-10-26':'');d.sections=[{title:'Synthetic scope',body:'Synthetic old-kind data only'}];
 await validate(d);checks++;
}
const invalid=[
 d=>{d.kind='product-evidence'},d=>{d.key='evidence-2026-10-26'},d=>{d.key='product-'+ 'a'.repeat(64)},
 d=>{d.source_sha256=Number('1'.repeat(64));d.product_evidence.source_sha256=d.source_sha256},d=>{d.human_verified=true},d=>{d.extra='unexpected'},d=>{d.source_sha256='b'.repeat(64)},
 (d,e)=>{e.isCurrentVersion=true},(d,e)=>{e.human_verified=true},(d,e)=>{e.extra=true},(d,e)=>{e.schema='wrong'},(d,e)=>{e.model='TEST80';rekey(d)},
 (d,e)=>{e.model='V9';rekey(d)},(d,e)=>{e.model='ISO9001';rekey(d)},(d,e)=>{e.model='T'+'9'.repeat(60);rekey(d)},
 (d,e)=>{e.source_sha256='b'.repeat(64)},(d,e)=>{e.source_name=''},(d,e)=>{e.source_name='x'.repeat(181)},(d,e)=>{e.source_edition=''},
 (d,e)=>{delete e.source_published_at},(d,e)=>{e.source_published_at='2026-02-30'},(d,e)=>{e.source_updated_at='2026-10-26'},
 (d,e)=>{e.extracted_at='2026-10-26T00:00:01Z'},(d,e)=>{e.extracted_at='invalid'},d=>{d.generated_at='2026-10-26'},
 d=>{d.period.to='2026-10-27'},d=>{d.sections=[]},d=>{d.sections[0].body='arbitrary conclusion'},d=>{d.evidence=[{}]},
 (d,e)=>{e.regions=[]},(d,e)=>{e.regions=Array(13).fill(e.regions[0])},(d,e)=>{e.gaps=Array(13).fill('gap')},(d,e)=>{e.gaps=['x'.repeat(501)]},(d,e)=>{e.gaps=[7]},
 (d,e,r)=>{r.schema='ocr_region_v1'},(d,e,r)=>{r.source_kind='ocr'},(d,e,r)=>{delete r.source_kind},(d,e,r)=>{r.source_sha256='b'.repeat(64)},
 (d,e,r)=>{r.page=0},(d,e,r)=>{r.page=501},(d,e,r)=>{r.page=1.5},(d,e,r)=>{r.page='1'},
 (d,e,r)=>{r.offset_unit='utf16'},(d,e,r)=>{delete r.offset_unit},(d,e,r)=>{r.coordinate_system='pdf_bottom_left'},(d,e,r)=>{r.rotation=90},(d,e,r)=>{r.region_id='x'.repeat(101)},
 (d,e,r)=>{r.page_width=0},(d,e,r)=>{r.page_height=-1},(d,e,r)=>{r.page_width='600'},(d,e,r)=>{r.page_width=600.00001},
 (d,e,r)=>{r.panel_bbox=[0,0,601,100]},(d,e,r)=>{r.panel_bbox=[0,0,0,100]},(d,e,r)=>{r.panel_bbox=[0,-1,500,300]},
 (d,e,r)=>{r.panel_bbox=[0,0,500,300,1]},(d,e,r)=>{r.panel_bbox=['0',0,500,300]},(d,e,r)=>{r.panel_bbox=[0,0,500.00001,300]},
 (d,e,r)=>{r.native_text='x'.repeat(2551)},(d,e,r)=>{r.native_text=''},(d,e,r)=>{r.extra=true},
 (d,e,r)=>{r.headings=[]},(d,e,r)=>{r.headings=Array(4).fill(r.headings[0])},(d,e,r)=>{r.headings[0].model='TEST80'},
 (d,e,r)=>{r.headings[0].quote='TEST80'},(d,e,r)=>{r.headings[0].end=6},(d,e,r)=>{r.headings[0].bbox=[0,0,550,30]},
 (d,e,r)=>{r.headings[0].extra=true},(d,e,r)=>{r.field.extra=true},(d,e,r)=>{r.field.name=''},
 (d,e,r)=>{r.field.name='x'.repeat(61)},(d,e,r)=>{r.native_text=e.model+'\n'+'x'.repeat(501);r.field=span(r.native_text,'x'.repeat(501),{name:'供电'})},(d,e,r)=>{r.field.quote='not in source'},(d,e,r)=>{r.field.start=0},
 (d,e,r)=>{r.field.end=999999999999},(d,e,r)=>{r.field.start=1.5},(d,e,r)=>{r.field.bbox=[1,1,1,2]},
 (d,e,r)=>{r.field.bbox=[0,0,501,20]},(d,e,r)=>{r.field.bbox=[1,1,3.00001,4]},
 (d,e)=>{e.gaps=['access_token: synthetic-only-value']},(d,e)=>{e.gaps=['password: synthetic-only-value']},(d,e)=>{e.gaps=['密码：合成非秘密']},
];
for(let i=0;i<invalid.length;i++)await reject(()=>validate(changed(invalid[i])),'synthetic invalid case '+i);
// Canonical spelling retains complete suffixes; key and source SHA are independent of package digest.
for(const spelling of ['TEST80 / PRO','TEST80 . PRO','ＴＥＳＴ８０ ＰＲＯ','TEST80\nPRO']){
 const d=changed((d,e)=>{e.model=spelling});await validate(d);checks++;
}
for(const suffix of ['Basic','Max','Plus','Ultra','Lite','Standard']){
 const model='TEST80 '+suffix,d=changed((d,e)=>{e.model=model;e.regions=[region({model})];rekey(d)});await validate(d);checks++;
}
const unicode=changed((d,e,r)=>{r.native_text='🧪 '+r.native_text;r.headings=[span(r.native_text,e.model,{model:e.model})];r.field=span(r.native_text,'Synthetic supply 8V',{name:'供电'})});await validate(unicode);checks++;
const decimal=changed((d,e,r)=>{r.panel_bbox=[0.0001,0.0001,500.1234,300.1234]});await validate(decimal);checks++;
const dated=changed((d,e)=>{e.source_published_at='2026-01-01';e.source_updated_at='2026-10-25T00:00:00+08:00'});await validate(dated);checks++;
const repeated=changed((d,e,r)=>{r.native_text=e.model+' MAX first variant\n'+e.model+'\nSynthetic supply 8V';const at=r.native_text.lastIndexOf(e.model);r.headings=[{...span(r.native_text,e.model,{model:e.model}),start:at,end:at+e.model.length}];r.field=span(r.native_text,'Synthetic supply 8V',{name:'供电'})});await validate(repeated);checks++;
const huge=changed((d,e)=>{const text=e.model+'\n'+'合'.repeat(2500);const r=region({model:e.model,text,quote:'合'.repeat(500)});e.regions=Array.from({length:12},(_,i)=>({...structuredClone(r),page:1+Math.floor(i/2),headings:Array.from({length:3},()=>span(text,text.slice(0,500),{model:e.model}))}));e.gaps=Array(12).fill('合'.repeat(500))});await reject(()=>validate(huge));
const clipped=changed((d,e,r)=>{e.model='TEST80';rekey(d);r.headings=[{...r.headings[0],model:'TEST80',quote:'TEST80',end:6}]});await reject(()=>validate(clipped));
// NFKC identity checks never turn a clipped Unicode/separator variant into a base model.
for(const literal of ['TEST80 PRO_BASIC','TEST80 ＰＲＯ','TEST80\u00a0PRO']){
 const d=changed((d,e,r)=>{e.model='TEST80';rekey(d);r.native_text=literal+'\nSynthetic supply 8V';r.headings=[span(r.native_text,'TEST80',{model:e.model})];r.field=span(r.native_text,'Synthetic supply 8V',{name:'供电'})});await reject(()=>validate(d));
}
for(const literal of ['ＴＥＳＴ８０ ＰＲＯ','TEST80\u00a0PRO']){
 const d=changed((d,e,r)=>{r.native_text='ﬃ '+literal+'\nSynthetic supply 8V';r.headings=[span(r.native_text,literal,{model:e.model})];r.field=span(r.native_text,'Synthetic supply 8V',{name:'供电'})});await validate(d);checks++;
}
// Same panel/native text can repeat for distinct fields without inflating the page text budget.
const shared=changed((d,e,r)=>{r.native_text=e.model+'\nSynthetic supply 8V\n'+'x'.repeat(2000);e.regions=Array.from({length:4},(_,i)=>({...structuredClone(r),field:{...r.field,name:'synthetic-'+i}}))});await validate(shared);checks++;
await reject(()=>validate(changed((d,e)=>{e.regions=Array(5).fill(e.regions[0])})));
await reject(()=>validate(changed((d,e)=>{e.regions=Array.from({length:7},(_,i)=>region({page:i+1}))})));
await validate(changed((d,e)=>{e.regions=Array.from({length:6},(_,i)=>region({page:i+1}))}));checks++;
await reject(()=>validate(changed((d,e)=>{e.regions=[region(),{...region(),page_width:601}]})));
await reject(()=>validate(changed((d,e)=>{e.regions=[region({text:e.model+'\nSynthetic supply 8V\n'+'a'.repeat(1300)}),region({text:e.model+'\nSynthetic supply 8V\n'+'b'.repeat(1300),id:'other'})]})));
// Original persistence, exact actor, old evidence namespace and transaction-audited entry points.
await as();const first=(await sync([productDocument()])).receipts[0];ok(first.key===productDocument().key);ok(first.digest!==productDocument().source_sha256);
ok((await sync([productDocument()])).receipts[0].id===first.id);ok((await read(first.key)).documents[0].id===first.id);
ok((await query('select public.receipt_agent_private_intelligence($1) r',[first.id])).rows[0].r.receipt.digest===first.digest);
const older=productDocument(),newer=productDocument();newer.generated_at='2026-10-26T00:01:00Z';newer.product_evidence.gaps.push('Synthetic revised gap');
const second=(await sync([newer])).receipts[0];ok(second.id!==first.id);ok((await read(first.key)).documents[0].id===second.id);await reject(()=>sync([older]));
const oldEvidence=productDocument();delete oldEvidence.product_evidence;oldEvidence.kind='evidence';oldEvidence.key='evidence-2026-10-26';oldEvidence.sections=[{title:'Synthetic old evidence',body:'Must remain separate'}];const oldReceipt=(await sync([oldEvidence])).receipts[0];ok((await read(oldEvidence.key,'evidence')).documents[0].id===oldReceipt.id);
await reject(()=>query('select * from public.agent_private_intelligence_versions'));await reject(()=>query('delete from public.agent_private_intelligence_versions'));
await reject(()=>query('select public.validate_private_product_page_evidence($1::jsonb)',[JSON.stringify(productDocument())]));
await reject(()=>query('select public.private_product_bbox_valid($1::jsonb,600,800)',[JSON.stringify([0,0,10,10])]));
await reject(()=>read('x'.repeat(101)));await reject(()=>sync([{padding:'x'.repeat(262145)}]));await reject(()=>sync(Array(6).fill(productDocument())));await reject(()=>sync([productDocument(),productDocument()]));
const fresh=changed((d,e)=>{e.model='TEST81 PRO';e.regions=[region({model:e.model})];rekey(d)});
await reject(()=>sync([fresh,changed(d=>{d.human_verified=true})]));await db.exec('reset role');ok((await query('select count(*)::int n from public.agent_private_intelligence_versions where document_key=$1',[fresh.key])).rows[0].n===0);
await db.exec(`create function reject_product_audit() returns trigger language plpgsql as $$begin if new.action like 'agent_private_intelligence_%' then raise exception 'Synthetic audit failure';end if;return new;end;$$;create trigger reject_product_audit before insert on public.audit_logs for each row execute function reject_product_audit();`);
await as();await reject(()=>sync([fresh]));await reject(()=>read(first.key));await reject(()=>query('select public.receipt_agent_private_intelligence($1)',[first.id]));await db.exec('reset role');await db.exec('drop trigger reject_product_audit on public.audit_logs');
for(const [sub,email,role] of [['11111111-1111-4111-8111-111111111111','chloelee@wonlyglobal.com','authenticated'],[owner,'wrong@example.com','authenticated'],[null,'','anon']]){await as(sub,email,role);await reject(()=>sync([fresh]));await reject(()=>read(first.key));await reject(()=>query('select public.receipt_agent_private_intelligence($1)',[first.id]))}
for(const patch of ["active=false","active=true,role='marketing'"]){await db.exec('reset role');await db.exec('update public.profiles set '+patch);await as();await reject(()=>sync([fresh]));await reject(()=>read(first.key))}
await db.exec('reset role');await db.exec("update public.profiles set active=true,role='owner'");
// Existing 5-document read and shared import/read/receipt ceilings are unchanged.
await as();for(let i=0;i<6;i++){const d=changed((d,e)=>{e.model='TEST'+(90+i)+' PRO';e.regions=[region({model:e.model})];rekey(d)});await sync([d])}
ok((await read(null,'product',100)).documents.length===5);
await db.exec('reset role');let count=(await query("select count(*)::int n from public.audit_logs where actor_id=$1 and action='agent_private_intelligence_read'",[owner])).rows[0].n;await as();for(;count<30;count++)await read(first.key);await reject(()=>read(first.key));
await db.exec('reset role');count=(await query("select count(*)::int n from public.audit_logs where actor_id=$1 and action='agent_private_intelligence_receipt_read'",[owner])).rows[0].n;await as();for(;count<60;count++)await query('select public.receipt_agent_private_intelligence($1)',[first.id]);await reject(()=>query('select public.receipt_agent_private_intelligence($1)',[first.id]));
await db.exec('reset role');count=(await query("select count(*)::int n from public.audit_logs where actor_id=$1 and action='agent_private_intelligence_synced'",[owner])).rows[0].n;await as();for(;count<30;count++)await sync([newer]);await reject(()=>sync([newer]));
await db.exec('reset role');ok((await query('select count(*)::int n from public.agent_private_intelligence_versions where document_key=$1',[oldEvidence.key])).rows[0].n===1);
console.log(JSON.stringify({checks,isolated:true,synthetic_only:true,production_writes:false,new_kind:'product',original_actor_acl_audit_limits_preserved:true}));
}catch(error){console.error(JSON.stringify({synthetic_only:true,checks,error:error.message,where:error.where||null}));process.exitCode=1}finally{await db.close()}
