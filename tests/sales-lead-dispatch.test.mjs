import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../supabase/functions/sales-lead-dispatch/index.ts',import.meta.url),'utf8')
 .replace(/^import .*\n/,'').replace('status:number,result:unknown','status,result');
const oldHook='https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-4000-8000-000000000001';
const newHook='https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-4000-8000-000000000002';
function fixture(env={},provider=0){
 let handler;const requests=[],rpc=[];
 const context={Response,AbortSignal,JSON,Deno:{env:{get:key=>({MAIL_SYNC_WORKER_TOKEN:'synthetic-worker',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key',...env})[key]},serve:fn=>handler=fn},
 createClient:()=>({rpc:async(name,args)=>{rpc.push({name,args});return name==='claim_sales_lead_delivery'?{data:[{id:'fixture-1',body:'Synthetic route test only'}],error:null}:{error:null}}}),
 fetch:async(url,options)=>{requests.push({url,options});return Response.json({code:provider})}};
 vm.runInNewContext(source,context);
 return {requests,rpc,run:(headers={'x-mail-sync-token':'synthetic-worker'},method='POST')=>handler(new Request('https://example.invalid/dispatch',{method,headers}))};
}
test('division-only webhook overrides global without changing message or worker authorization',async()=>{
 const f=fixture({FEISHU_WEBHOOK_URL:oldHook,SALES_LEAD_FEISHU_WEBHOOK_URL:newHook});
 assert.equal((await f.run()).status,200);assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,newHook);
 assert.equal(JSON.parse(f.requests[0].options.body).content.text,'Synthetic route test only');
 assert.equal(f.rpc[1].name,'finish_sales_lead_delivery');assert.equal(f.rpc[1].args.succeeded,true);
});
test('legacy route stays compatible only when dedicated config is absent',async()=>{
 const f=fixture({FEISHU_WEBHOOK_URL:oldHook});assert.equal((await f.run()).status,200);assert.equal(f.requests[0].url,oldHook);
});
test('invalid dedicated destinations fail closed and never fall back or expose the URL',async()=>{
 for(const url of ['http://127.0.0.1/secret','https://open.feishu.cn.evil.invalid/hook',newHook+'?token=private',newHook+'#private','https://user:secret@open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-4000-8000-000000000002']){
  const f=fixture({FEISHU_WEBHOOK_URL:oldHook,SALES_LEAD_FEISHU_WEBHOOK_URL:url});const response=await f.run();
  assert.equal(response.status,503);assert.equal(f.requests.length,0);assert.equal(f.rpc.length,0);assert.equal((await response.json()).error,'feishu_not_configured');
 }
});
test('failed provider never reroutes to the old group or records delivery success',async()=>{
 const f=fixture({FEISHU_WEBHOOK_URL:oldHook,SALES_LEAD_FEISHU_WEBHOOK_URL:newHook},999);
 assert.equal((await f.run()).status,502);assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,newHook);assert.equal(f.rpc[1].args.succeeded,false);
});
test('method and worker token protections run before configuration and queue access',async()=>{
 const f=fixture({SALES_LEAD_FEISHU_WEBHOOK_URL:newHook});assert.equal((await f.run({},'GET')).status,405);assert.equal((await f.run({})).status,401);assert.equal(f.rpc.length,0);assert.equal(f.requests.length,0);
});
