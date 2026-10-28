// Loopback-only, synthetic PostgreSQL and actor switching. No production network or messaging.
import http from 'node:http';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();
const source=await readFile(new URL('../tests/sales-leads-sql.mjs',import.meta.url),'utf8');
const setup=source.slice(source.indexOf('await db.exec(`'),source.indexOf("await as('s');const today="));
const ids=await new (Object.getPrototypeOf(async function(){}).constructor)('db','readFile','baseUrl',setup.replaceAll('import.meta.url','baseUrl')+';return ids;')(db,readFile,new URL('../tests/sales-leads-sql.mjs',import.meta.url).href);
for(const name of ['20261028170000_sales_lead_pending_contact.sql','20261028183000_company_candidate_pool.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
async function actor(key){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[ids[key]]);await db.exec('set role authenticated')}
await actor('o');
const controls='<div style="padding:16px;background:#fff0d9"><strong>隔离模拟验收 · 非生产、不发邮件或群消息</strong><button onclick="fetch(\'/actor\',{method:\'POST\',body:\'o\'}).then(()=>location.reload())">模拟老板</button><button onclick="fetch(\'/actor\',{method:\'POST\',body:\'s\'}).then(()=>location.reload())">模拟业务员A</button><button onclick="fetch(\'/actor\',{method:\'POST\',body:\'s2\'}).then(()=>location.reload())">模拟业务员B</button></div>';
const assets=new Set(['company-candidates-page.mjs','company-candidates.mjs','sales-leads.mjs','sales-leads.css']);
const server=http.createServer(async(req,res)=>{try{
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end((await readFile(new URL('../company-candidates.html',import.meta.url),'utf8')).replace('<body>','<body>'+controls))}
 if(req.method==='GET'&&req.url==='/xlsx.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile('/private/tmp/crm-sales-leads-xlsx-0.20.3.mjs'))}
 if(req.method==='GET'&&req.url?.startsWith('/assets/')){const name=req.url.slice(8).split('?')[0];if(!assets.has(name))throw Error('fixture asset denied');let text=await readFile(new URL('../assets/'+name,import.meta.url),'utf8');
  if(name==='company-candidates-page.mjs'){
   text=text.replace('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs','/xlsx.mjs');
   const start=text.indexOf('try{const {createClient}='),end=text.indexOf('await action(load)',start);
   text=text.slice(0,start)+"try{db={rpc:async(name,args)=>{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});const data=await response.json();return response.ok?{data}:{error:data}}};"+text.slice(end);
  }
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');return res.end(text);
 }
 if(req.method!=='POST'||req.headers.origin!=='http://127.0.0.1:8786')throw Error('fixture origin denied');
 let body='';for await(const chunk of req){body+=chunk;if(body.length>600000)throw Error('fixture request too large')}
 if(req.url==='/actor'){if(!['o','s','s2'].includes(body))throw Error('fixture actor denied');await actor(body);return res.end('{}')}
 if(req.url!=='/rpc')throw Error('fixture RPC path denied');
 const {name,args}=JSON.parse(body);let sql,values;
 if(name==='company_candidate_workspace'){sql='select public.company_candidate_workspace($1::text,$2::text,$3::integer) r';values=[args.search_text,args.state_filter,args.page_offset]}
 else if(name==='import_company_candidates'){sql='select public.import_company_candidates($1::jsonb,$2::uuid,$3::text) r';values=[JSON.stringify(args.rows),args.batch_id,args.batch_label]}
 else if(name==='review_company_candidate'){sql='select public.review_company_candidate($1::uuid,$2::text,$3::text,$4::text) r';values=[args.target_id,args.decision,args.official_url,args.evidence_note]}
 else if(name==='claim_company_candidate'){sql='select public.claim_company_candidate($1::uuid) r';values=[args.target_id]}
 else if(name==='promote_company_candidate'){sql='select public.promote_company_candidate($1::uuid,$2::text,$3::date) r';values=[args.target_id,args.demand,args.acquired_on]}
 else throw Error('fixture RPC denied');
 const result=(await db.query(sql,values)).rows[0].r;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message}))}});
server.listen(8786,'127.0.0.1',()=>console.log('Synthetic company candidate fixture: http://127.0.0.1:8786/'));
process.on('SIGINT',()=>server.close(async()=>{await db.close();process.exit(0)}));
