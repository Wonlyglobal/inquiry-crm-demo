// Loopback-only synthetic fixture. No production auth, mail, Feishu or worker.
import http from 'node:http';import {readFile,writeFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();
const file=await readFile(new URL('../tests/sales-lead-estimate-sql.mjs',import.meta.url),'utf8');
const prefix=file.slice(file.indexOf('await db.exec(`'),file.indexOf("await as('s');const today=")).replaceAll('import.meta.url',JSON.stringify(new URL('../tests/sales-lead-estimate-sql.mjs',import.meta.url).href));
const scope=await new(Object.getPrototypeOf(async function(){}).constructor)('db','readFile',prefix+';return {ids,as};')(db,readFile);
await scope.as('s');
const origin='http://127.0.0.1:8786';
const html=(await readFile(new URL('../sales-leads.html',import.meta.url),'utf8')).replace('<header>','<header><strong>隔离模拟验收：不连接生产、不发送消息</strong>');
const allowed=new Set(['sales-leads.css','sales-leads-page.mjs','sales-leads.mjs','sales-lead-import-ui.mjs','sales-lead-stages.mjs','weekly-customer-review.mjs','lead-development-metrics.mjs','lead-workspace-embed.mjs','customer-csv-reader.mjs','lead-worksheet-rows.mjs','customer-import-normalize.mjs']);
const server=http.createServer(async(req,res)=>{try{
 const path=(req.url||'').split('?')[0];
 if(req.method==='GET'&&path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
 if(req.method==='GET'&&path.startsWith('/assets/')){const name=path.slice(8);if(!allowed.has(name)){res.writeHead(404);return res.end()}let source=await readFile(new URL('../assets/'+name,import.meta.url),'utf8');if(name==='sales-leads-page.mjs'){const start=source.indexOf(' const {createClient}='),end=source.indexOf(' const {data:{user},error}=',start);if(start<0||end<0)throw Error('fixture auth seam changed');source=source.slice(0,start)+` db={rpc:async(name,args)=>{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});const data=await response.json();return response.ok?{data}:{error:data}},auth:{getUser:async()=>({data:{user:{id:'${scope.ids.s}'}}})}};\n`+source.slice(end)}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');return res.end(source)}
 if(req.method!=='POST'||path!=='/rpc'||req.headers.origin!==origin){res.writeHead(404);return res.end()}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)throw Error('fixture request too large')}const {name,args}=JSON.parse(body);let query,values,result;
 if(name==='sales_lead_workspace'){query='select public.sales_lead_workspace($1::date,$2::date) r';values=[args.from_day,args.to_day]}
 else if(name==='record_sales_leads'){query='select public.record_sales_leads($1::jsonb,$2::text) r';values=[JSON.stringify(args.rows),args.entry_method]}
 else if(name==='update_sales_lead_estimate'){query='select public.update_sales_lead_estimate($1::uuid,$2::text,$3::text) r';values=[args.target_id,args.amount_value,args.currency_value]}
 else if(name==='convert_sales_lead'){query='select public.convert_sales_lead($1::uuid) r';values=[args.target_id]}
 else if(name==='daily_report_timeliness')result={rules:[],people:[],as_of:new Date().toISOString()};
 else if(name==='sales_lead_weekly_reports')result=[];
 else if(name==='weekly_customer_workspace')result={actor:{role:'sales'},rules:[],people:[],items:[],total:0,week_start:args.week_day,deadline_at:new Date().toISOString(),as_of:new Date().toISOString()};
 else if(name==='lead_development_workspace')result={rows:[],from_day:args.from_day,to_day:args.to_day,as_of:new Date().toISOString()};
 else throw Error('fixture RPC not allowed');
 if(query)result=(await db.query(query,values)).rows[0].r;
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:e.message}))}});
server.listen(8786,'127.0.0.1',()=>console.log('Synthetic estimate fixture ready: '+origin));
process.on('SIGINT',()=>server.close(async()=>{await db.exec('reset role');await writeFile('/private/tmp/crm-export-template-20261112/ui-readback.private.json',JSON.stringify({leads:(await db.query('select * from private.sales_leads')).rows,inquiries:(await db.query('select id,estimated_amount,currency,owner_id from public.inquiries')).rows,events:(await db.query('select action,details from private.sales_lead_events')).rows,notifications:(await db.query('select count(*)::int n from public.notifications')).rows}));await db.close();process.exit(0)}));
