import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {publicMarketQuery,PUBLIC_PRODUCT_TERMS} from '../assets/outreach-research-plan.mjs';
const source=stripTypeScriptTypes((await readFile(new URL('../supabase/functions/company-website-images/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,''));
async function harness({loggedIn=true,visible=true}={}){
 let handler;const requests=[];
 const client={auth:{getUser:async()=>({data:{user:loggedIn?{id:'actor'}:null}})},from:table=>({select(){return this},eq(){return this},single:async()=>table==='profiles'?{data:{id:'actor',active:true}}:visible?{data:{id:'inquiry'}}:{data:null,error:{message:'denied'}}})};
 vm.runInNewContext(source,{Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},withReadOnlyGuard:fn=>fn,createClient:()=>client,publicMarketQuery,PUBLIC_PRODUCT_TERMS,URL,Response,AbortSignal,fetch:async(url)=>{
 const u=String(url);requests.push(u);
 if(u.includes('news.google.com'))return new Response('<rss><item><title>Construction market update</title><link>https://example.org/news</link><pubDate>Wed, 28 Oct 2026 00:00:00 GMT</pubDate></item></rss>');
 const links=['about','products/wood','products/fire','products/copper','products/steel'];
 return new Response('<title>Steel doors</title><meta name="description" content="Steel entrance doors">'+(u==='https://example.com/'?links.map(x=>'<a href="/'+x+'">Page</a>').join(''):''),{headers:{'Content-Type':'text/html'}});
 }});
 const response=await handler(new Request('https://service.invalid/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inquiry_id:'inquiry',website:'https://example.com/',company_name:'Example',focus_category:'steel_door',market_code:'BY'})}));
 return {response,requests,data:await response.json()};
}
test('handler prioritizes requested product pages and returns bounded title leads separately',async()=>{
 const {response,requests,data}=await harness();assert.equal(response.status,200);
 assert.equal(requests[1],'https://example.com/products/steel');assert.equal(data.website_evidence.length,5);
 assert.equal(data.market_headlines.length,1);assert.match(data.market_limits,/未读取/);
 assert.ok(requests.some(x=>x.includes('q=Belarus%20steel%20doors')));
 assert.equal(Object.hasOwn(data,'product_facts'),false);
});
test('unauthenticated or invisible inquiry never triggers public retrieval',async()=>{
 for(const options of [{loggedIn:false},{visible:false}]){const {response,requests}=await harness(options);assert.ok(response.status>=400);assert.equal(requests.length,0)}
});
