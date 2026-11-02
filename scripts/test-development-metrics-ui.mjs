// Loopback-only synthetic acceptance. No production endpoints or messaging.
import http from 'node:http';import {readFile} from 'node:fs/promises';
import {createMetricsFixture} from '../tests/lead-development-metrics-sql.mjs';
const {db,ids,as,call,today}=await createMetricsFixture();
await as('m');await call('save_lead_development_metrics',[ids.s,today,today,'goals',JSON.stringify({region:'模拟中东非',lead_target:200,send_target:140,note:'仅本机模拟目标依据'}),0]);await as('s');
const origin='http://127.0.0.1:8787';
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离模拟 · 客户线索开发统计</title><link rel="stylesheet" href="/assets/sales-leads.css"><header><h1>隔离模拟 · 客户线索开发统计</h1><p>仅本机空库和虚构人员，无生产连接。</p><button id="sales">模拟业务员</button> <button id="market">模拟市场部</button> <button id="refresh">刷新核对</button></header><main><section id="metrics"></section></main><script type="module">
import {mountDevelopmentMetrics} from '/assets/lead-development-metrics.mjs';
const request=async(path,body)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d};
const ui=mountDevelopmentMetrics(document.querySelector('#metrics'),{rpc:(name,args)=>request('/rpc',{name,args})});
const refresh=()=>ui.refresh({from:'${today}',to:'${today}',sales:''});
document.querySelector('#sales').onclick=async()=>{await request('/actor',{key:'s'});await refresh()};document.querySelector('#market').onclick=async()=>{await request('/actor',{key:'m'});await refresh()};document.querySelector('#refresh').onclick=refresh;await refresh();</script></html>`;
const assets=new Set(['sales-leads.css','lead-development-metrics.mjs']);
const server=http.createServer(async(req,res)=>{try{
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
 if(req.method==='GET'&&req.url?.startsWith('/assets/')){const file=req.url.slice(8).split('?')[0];if(!assets.has(file)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');return res.end(await readFile(new URL('../assets/'+file,import.meta.url)))}
 if(req.method!=='POST'||req.headers.origin!==origin){res.writeHead(404);return res.end()}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>8000)throw Error('fixture limit')}
 const data=JSON.parse(body);let result;
 if(req.url==='/actor'){if(!['s','m'].includes(data.key))throw Error('unknown synthetic actor');await as(data.key);result={ok:true}}
 else if(req.url==='/rpc'){
  const a=data.args;
  if(data.name==='lead_development_workspace')result=await call(data.name,[a.from_day,a.to_day]);
  else if(data.name==='save_lead_development_metrics')result=await call(data.name,[a.target_sales,a.from_day,a.to_day,a.section,JSON.stringify(a.values_json),a.expected_revision]);
  else throw Error('fixture RPC not allowed');
 }else throw Error('fixture path not allowed');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}
});server.listen(8787,'127.0.0.1',()=>console.log('Synthetic development metrics ready at '+origin));
process.on('SIGINT',()=>server.close(async()=>{await db.close();process.exit(0)}));
