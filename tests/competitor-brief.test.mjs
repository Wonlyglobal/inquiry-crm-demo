import test from 'node:test';import assert from 'node:assert/strict';
import {briefIntent,briefAnswer,priceIntent,priceAnswer,priceOf} from '../supabase/functions/agent-conversation/competitor-brief.mjs';
import {PUBLIC_EVIDENCE,competitorIntent} from '../supabase/functions/agent-conversation/public-research.mjs';
import {compareAnswer} from '../supabase/functions/agent-conversation/wonly-compare.mjs';

test('evidence now carries profile, channel and price dimensions',()=>{
 for(const d of ['price','channel','company_profile','product_range'])assert.ok(PUBLIC_EVIDENCE.filter(e=>e.dimension===d).length>=4,d);
 assert.ok(PUBLIC_EVIDENCE.length>=260);
 assert.equal(new Set(PUBLIC_EVIDENCE.map(e=>e.id)).size,PUBLIC_EVIDENCE.length);
 assert.ok(!PUBLIC_EVIDENCE.some(e=>e.company==='Vulcan（阿联酋迪拜）'),'duplicate company name normalised');
});
test('battle card: intent needs a known company and a brief word',()=>{
 assert.ok(briefIntent('介绍一下NAFFCO'));
 assert.ok(briefIntent('怎么打Phillips'));
 assert.equal(briefIntent('介绍一下我们的产品'),null);
 assert.equal(briefIntent('NAFFCO最新动态介绍'),null,'news goes to intel');
});
test('battle card: profile, channels, prices, angles, sources; no CRM data',()=>{
 const a=briefAnswer(briefIntent('Phillips是什么来头'),{products:[]});
 assert.match(a,/作战卡/);assert.match(a,/【公司概况】/);assert.match(a,/【销售渠道】/);assert.match(a,/【官网价格】/);
 assert.match(a,/可用切入点/);assert.match(a,/不直接报价/);assert.match(a,/没有发送给外部模型/);
});
test('price parse takes the posted (sale) price from the quote',()=>{
 assert.equal(priceOf({quote:'Yale Precio de oferta $ 5,207.00 Precio habitual $ 5,481.00'}),5207);
 assert.equal(priceOf({quote:'Philips EasyKey DDL801 Smart Door Lock Discount 24% SAR 2,599.00 SAR 3,379.00'}),2599);
 assert.equal(priceOf({quote:'no price here'}),null);
});
test('price band: sorted per market, min/median/max, honest when missing',()=>{
 const i=priceIntent('墨西哥智能锁竞品价格');assert.deepEqual(i.markets,['MX']);
 const a=priceAnswer(i);assert.match(a,/墨西哥·智能锁/);assert.match(a,/最低 934/);
 const nums=[...a.matchAll(/^\s+([\d,]+)｜/gm)].map(m=>Number(m[1].replace(/,/g,'')));
 assert.deepEqual(nums,[...nums].sort((x,y)=>x-y));
 assert.match(priceAnswer(priceIntent('阿联酋防火门竞品价格')),/还没有/);
 assert.equal(priceIntent('王力智能锁价格'),null,'our own prices are internal');
 assert.equal(priceIntent('今天天气价格'),null);
});
test('new dimensions are found by the generic competitor route; WONLY table ignores them',()=>{
 assert.equal(competitorIntent('Hörmann销售渠道').dimension,'channel');
 const t=compareAnswer({categories:['smart_lock'],markets:['MX'],companies:[]},{products:[]});
 assert.doesNotMatch(t,/官网价格|销售渠道|公司概况/);
});
