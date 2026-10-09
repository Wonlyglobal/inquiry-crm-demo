import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFeed,feedAge,buildBrief,safeSource} from '../assets/agent-intelligence.mjs';
const feed=JSON.parse(readFileSync(new URL('../data/agent-intelligence.json',import.meta.url)));
test('public intelligence has dated verifiable sources and no executable links',()=>{
 assert.equal(validateFeed(feed),feed);
 for(const value of ['javascript:alert(1)','data:text/html,evil','http://example.com','https://user:password@example.com'])assert.equal(safeSource(value),'');
 for(const patch of [{checked_at:'bad'},{findings:[{...feed.findings[0],url:'javascript:evil'}]},{findings:[feed.findings[0],feed.findings[0]]}])assert.throws(()=>validateFeed({...feed,...patch}));
});
test('stale and future timestamps cannot be presented as fresh',()=>{
 const t=Date.parse(feed.checked_at);
 assert.match(feedAge(feed,t+49*3600000),/超过48小时/);
 assert.match(feedAge(feed,t-600000),/时间异常/);
 assert.match(feedAge({},t),/时间异常/);
});
test('role briefs retain scope, omit customer secrets and do not infer company strategy',()=>{
 const context={created:[{target_country:'Brazil',product_category:'Steel door',secret:'BANK-SECRET',title:'PRIVATE-CUSTOMER'},{target_country:'Hidden',excluded_from_dashboard:true},{target_country:'__proto__',product_category:'Lock'}],start:new Date('2026-09-01'),end:new Date('2026-09-23'),scope:'limited-team',overdue:[{}],risky:[{},{}],active:[{}],won:[],sources:[{name:'Website',count:2}]};
 for(const persona of ['Grace','Brian','Jay']){
  const text=buildBrief(persona,context,feed,Date.parse(feed.checked_at));
  assert.match(text,/limited-team/);assert.doesNotMatch(text,/BANK-SECRET|PRIVATE-CUSTOMER|Hidden/);
 }
 const grace=buildBrief('Grace',context,feed);assert.match(grace,/Brazil 1条/);assert.match(grace,/正式战略优先级/);
 const jay=buildBrief('Jay',context,feed);assert.match(jay,/Grace汇报/);assert.match(jay,/Brian汇报/);assert.match(jay,/不是后台已留档/);
 assert.match(buildBrief('Grace',{},null),/样本不足/);assert.match(buildBrief('Grace',{},null),/不能据此判断市场没有变化/);
});
test('daily dataset contains public evidence only; no internal fields or arbitrary schema',()=>{
 assert.deepEqual(Object.keys(feed).sort(),['schema_version','checked_at','coverage','sources','findings'].sort());
 const raw=JSON.stringify(feed);assert.doesNotMatch(raw,/chloelee|service_role|grounded_answer|inquiry_no|owner_id|contact_email|access_token/i);
 for(const f of feed.findings)assert.ok(f.fact&&f.implication&&f.published_at&&f.observed_at);
});

test('customer type stored in product field is flagged instead of treated as product demand',()=>{
 const text=buildBrief('Grace',{created:[{product_category:'Distributor / Dealer'}]},feed);
 assert.match(text,/客户类型混入产品字段/);assert.doesNotMatch(text,/Distributor \/ Dealer 1条/);assert.match(text,/Al Kuhaimi/);
});
