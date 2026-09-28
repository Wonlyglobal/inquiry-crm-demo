import test from 'node:test';import assert from 'node:assert/strict';
import {companyLookupIntent,matchCompanies,companyCard,lookupCompanies,companyAnswer} from '../supabase/functions/agent-conversation/company-research.mjs';
const index={generatedAt:'2026-07-28',companies:[
 {company:'Example Door Trading LLC',normName:'example door trading',domain:'exampledoor.ae',country:'AE',countryName:'阿联酋',city:'Dubai',categoryName:'进口商/经销商',fitScore:4},
 {company:'Other Hardware',normName:'other hardware',domain:'otherhw.sa',country:'SA',countryName:'沙特',city:'Riyadh',categoryName:'五金/建材零售',fitScore:3}]};
const detail={company:'Example Door Trading LLC',countryName:'阿联酋',city:'Dubai',categoryName:'进口商/经销商',productFocus:'Fire doors',website:'https://exampledoor.ae/',email:'buyer@exampledoor.ae',phone:'+971500000000',decisionContact:'Jane Buyer, Procurement',keyContacts:'Jane Buyer',keyContactMethods:'WhatsApp +971500000000',nextAction:'Call Jane Buyer',fitScore:4,fitReason:'Imports fire-rated doors',risk:'Price sensitive',researchStatus:'已锁定采购链',researchConfidence:'高',addedDate:'2026-07-14',researchSources:['https://exampledoor.ae/about','http://insecure.example']};
const exported={schema:'background-business-v1',generatedAt:'2026-07-28',companies:[{...detail,domain:'exampledoor.ae',normName:'example door trading',sources:['https://exampledoor.ae/about','http://insecure.example']},{company:'Other Hardware',normName:'other hardware',domain:'otherhw.sa',countryName:'沙特',city:'Riyadh',categoryName:'五金/建材零售',fitScore:3}]};
const admin=(data=exported)=>({storage:{from:()=>({download:async()=>data?{data:new Blob([JSON.stringify(data)]),error:null}:{data:null,error:{message:'not found'}}})}});
const fetcher=async url=>new Response(JSON.stringify(index));
test('only background-style questions trigger a lookup',()=>{
 assert.equal(companyLookupIntent('帮我背调 Example Door Trading'),true);assert.equal(companyLookupIntent('exampledoor.ae 怎么样'),true);assert.equal(companyLookupIntent('本月渠道质量'),false);
});
test('matching prefers exact domain, then full name; short roots never match',()=>{
 assert.equal(matchCompanies('查一下 exampledoor.ae',index)[0].rank,3);
 assert.equal(matchCompanies('背调 Example Door Trading 这家',index)[0].domain,'exampledoor.ae');
 assert.deepEqual(matchCompanies('背调一下 door 公司',index),[]);
});
test('answers never contain personal contact fields and are marked unverified and internal',async()=>{
 const r=await lookupCompanies('背调 exampledoor.ae',{admin:admin(),fetcher});assert.equal(r.source,'private_export');const a=companyAnswer(r);
 for(const secret of ['buyer@exampledoor.ae','+971500000000','Jane Buyer','WhatsApp'])assert.ok(!a.includes(secret),secret);
 assert.match(a,/未独立核验/);assert.match(a,/未发送给外部模型/);assert.match(a,/Fire doors/);assert.match(a,/4\/5/);
 assert.match(a,/https:\/\/exampledoor.ae\/about/);assert.ok(!a.includes('http://insecure'));
});
test('no match or unavailable index returns null so the checklist path answers instead',async()=>{
 assert.equal(companyAnswer(await lookupCompanies('背调 Unknown Company',{admin:admin(),fetcher})),null);
 assert.equal(companyAnswer(await lookupCompanies('背调 exampledoor.ae',{admin:admin(null),fetcher:async()=>new Response('x',{status:500})})),null);
});
test('without the private export only public index fields show, and no detail URLs are fetched',async()=>{
 const urls=[];const f=async u=>{urls.push(u);return new Response(JSON.stringify(index))};
 const r=await lookupCompanies('查一下 exampledoor.ae',{admin:admin(null),fetcher:f});const a=companyAnswer(r);
 assert.equal(r.source,'public_index');assert.deepEqual(urls,['https://business.foreverdoodle.com/api/index.json']);assert.match(a,/仅显示公开索引信息/);assert.match(a,/本次只读到公开索引/);
 assert.equal(companyCard({},{company:'X',fitScore:null,domain:''}).includes('匹配度'),false);
});
test('a malformed private export is ignored',async()=>{
 const r=await lookupCompanies('查一下 exampledoor.ae',{admin:admin({schema:'other',companies:[]}),fetcher});assert.equal(r.source,'public_index');
});
test('companies without a domain show index fields and say so',async()=>{
 const idx={generatedAt:'2026-07-28',companies:[{company:'Nodomain Doors Co',normName:'nodomain doors co',domain:null,country:'KE',countryName:'肯尼亚',city:'Nairobi',categoryName:'建筑总包',fitScore:2}]};
 const a=companyAnswer(await lookupCompanies('背调 Nodomain Doors Co',{fetcher:async()=>new Response(JSON.stringify(idx))}));
 assert.match(a,/未收录该公司官网域名/);assert.match(a,/肯尼亚/);assert.match(a,/建筑总包/);
});
