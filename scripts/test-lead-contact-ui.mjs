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
await migration('20261028153000_weekly_customer_checks.sql');await migration('20261028170000_sales_lead_pending_contact.sql');
await db.query("insert into public.inquiries(id,title,status,owner_id,estimated_amount,currency,expected_close_date,is_test_data,data_environment,created_at) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','模拟待确认客户 · 门型需求','received',$1,null,'USD',null,false,'production',clock_timestamp()),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','模拟已知商机 · 木门需求','received',$1,25000,'USD','2026-12-20',false,'production',clock_timestamp())",[ids.s]);
await db.exec("insert into private.sales_lead_rules(effective_on,daily_min,remind_at,weekly_day,weekly_at,reason) values((clock_timestamp() at time zone 'Asia/Shanghai')::date+1,1,'17:00',5,'17:05','synthetic weekly schedule')");
await db.query("select set_config('test.uid',$1,false)",[ids.s]);await db.exec('set role authenticated');
const html=(await readFile(new URL('../sales-leads.html',import.meta.url),'utf8')).replace('<header>','<header><strong>隔离模拟验收 · 不连接生产、不发消息</strong>');
const assets=new Set(['sales-leads.css','sales-leads-page.mjs','sales-leads.mjs','sales-lead-import-ui.mjs','sales-lead-stages.mjs','weekly-customer-review.mjs']);
const server=http.createServer(async(req,res)=>{try{
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
 if(req.method==='GET'&&req.url?.startsWith('/assets/')){const name=req.url.slice(8).split('?')[0];if(!assets.has(name)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');let source=await readFile(new URL('../assets/'+name,import.meta.url),'utf8');if(name==='sales-leads-page.mjs'){const start=source.indexOf(" const {createClient}=");const end=source.indexOf(" const {data:{user},error}=",start);source=source.slice(0,start)+` db={rpc:async(name,args)=>{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});const result=await response.json();return response.ok?{data:result}:{error:result}},auth:{getUser:async()=>({data:{user:{id:'${ids.s}'}}})}};\n`+source.slice(end);source=source.replace("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs",'/xlsx.mjs')}return res.end(source)}
 if(req.method==='GET'&&req.url==='/xlsx.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile('/private/tmp/crm-sales-leads-xlsx-0.20.3.mjs'))}
 if(req.method!=='POST'||req.url!=='/rpc'||req.headers.origin!=='http://127.0.0.1:8785'){res.writeHead(404);return res.end()}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('fixture request too large')}
 const {name,args}=JSON.parse(body);let query,values;
 if(name==='weekly_customer_workspace'){query='select public.weekly_customer_workspace($1::date,$2::uuid,$3::integer) r';values=[args.week_day,args.target_sales,args.page_offset]}
 else if(name==='submit_weekly_customer_check'){query='select public.submit_weekly_customer_check($1::uuid,$2::jsonb) r';values=[args.target,args.details]}
 else if(name==='sales_lead_workspace'||name==='daily_report_timeliness'||name==='sales_lead_weekly_reports'){query='select public.'+name+'($1::date,$2::date) r';values=[args.from_day,args.to_day]}
 else if(name==='record_sales_leads'){query='select public.record_sales_leads($1::jsonb,$2::text) r';values=[JSON.stringify(args.rows),args.entry_method]}
 else if(name==='update_sales_lead_contact'){query='select public.update_sales_lead_contact($1::uuid,$2::text,$3::text) r';values=[args.target_id,args.email_value,args.phone_value]}
 else if(name==='convert_sales_lead'){query='select public.convert_sales_lead($1::uuid) r';values=[args.target_id]}
 else throw Error('fixture RPC not allowed');
 const result=(await db.query(query,values)).rows[0].r;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}
});
server.listen(8785,'127.0.0.1',()=>console.log('Synthetic pending-contact fixture ready: http://127.0.0.1:8785 (no production / messaging)'));
process.on('SIGINT',()=>server.close(async()=>{await db.close();process.exit(0)}));
