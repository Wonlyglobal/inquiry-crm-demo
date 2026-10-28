// Synthetic isolated UI fixture. Binds loopback only; never loads Supabase,
// production credentials, mail or Feishu. Stop after acceptance with Ctrl-C.
import http from 'node:http';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();
const migration=async name=>db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
const source=await readFile(new URL('../tests/daily-lead-unified-sql.mjs',import.meta.url),'utf8');
const setup=source.slice(source.indexOf('await db.exec(`'),source.indexOf('  const dates='));
const ids=await new (Object.getPrototypeOf(async function(){}).constructor)('db','migration',setup+';return ids;')(db,migration);
await migration('20261027133000_sales_lead_division_digest.sql');await migration('20261028110000_daily_report_timeliness.sql');
await db.exec('alter table public.inquiries add column if not exists next_follow_up_at timestamptz;alter table public.inquiries add column if not exists excluded_from_dashboard boolean default false;');
await migration('20261028153000_weekly_customer_checks.sql');
await db.query("insert into public.inquiries(id,title,status,owner_id,estimated_amount,currency,expected_close_date,is_test_data,data_environment,created_at) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','模拟待确认客户 · 门型需求','received',$1,null,'USD',null,false,'production',clock_timestamp()),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','模拟已知商机 · 木门需求','received',$1,25000,'USD','2026-12-20',false,'production',clock_timestamp())",[ids.s]);
await db.exec("insert into private.sales_lead_rules(effective_on,daily_min,remind_at,weekly_day,weekly_at,reason) values((clock_timestamp() at time zone 'Asia/Shanghai')::date+1,1,'17:00',5,'17:05','synthetic weekly schedule')");
await db.query("select set_config('test.uid',$1,false)",[ids.s]);await db.exec('set role authenticated');
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离模拟验收 · 每周客户核对</title><link rel="stylesheet" href="/assets/sales-leads.css"><header><h1>隔离模拟验收 · 每周客户核对</h1><p>仅本机合成业务员与两条模拟商机；不连接生产，不发送邮件或飞书。</p></header><main><section id="weekly-customer"><div id="review"></div></section></main><script type="module">import {mountWeeklyCustomerReview} from "/assets/weekly-customer-review.mjs";const review=mountWeeklyCustomerReview(document.querySelector("#review"),{rpc:async(name,args)=>{const response=await fetch("/rpc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,args})});const data=await response.json();if(!response.ok)throw Error(data.error);return data}});await review.refresh();</script></html>';
const assets=new Set(['sales-leads.css','weekly-customer-review.mjs','sales-lead-stages.mjs']);
const server=http.createServer(async(req,res)=>{try{
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
 if(req.method==='GET'&&req.url?.startsWith('/assets/')){const name=req.url.slice(8).split('?')[0];if(!assets.has(name)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');return res.end(await readFile(new URL('../assets/'+name,import.meta.url)))}
 if(req.method!=='POST'||req.url!=='/rpc'||req.headers.origin!=='http://127.0.0.1:8784'){res.writeHead(404);return res.end()}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('fixture request too large')}
 const {name,args}=JSON.parse(body);let query,values;
 if(name==='weekly_customer_workspace'){query='select public.weekly_customer_workspace($1::date,$2::uuid,$3::integer) r';values=[args.week_day,args.target_sales,args.page_offset]}
 else if(name==='submit_weekly_customer_check'){query='select public.submit_weekly_customer_check($1::uuid,$2::jsonb) r';values=[args.target,args.details]}
 else throw Error('fixture RPC not allowed');
 const result=(await db.query(query,values)).rows[0].r;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}
});
server.listen(8784,'127.0.0.1',()=>console.log('Synthetic weekly review fixture ready: http://127.0.0.1:8784 (no production / messaging)'));
process.on('SIGINT',()=>server.close(async()=>{await db.close();process.exit(0)}));
