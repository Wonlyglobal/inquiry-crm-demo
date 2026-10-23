import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {crmLiveAnswer,crmDataIntent} from '../assets/agent-crm-live.mjs';
import {crmStatisticQuestion,crmStatisticReply,crmStatsChart} from '../supabase/functions/agent-conversation/data-charts.mjs';
import {summarizeCrm} from '../supabase/functions/agent-conversation/crm-stats.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),code=html.slice(html.indexOf('      function aiRangeFromQuestion'),html.indexOf('      function aiEvidence'));
const now=Date.parse('2026-10-23T04:00:00Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const names={received:'已接收',quoted:'已报价',won:'成交',lost:'丢单'};
function local(rows){const state={rows,profiles:[{id:'a',full_name:'A',role:'sales'},{id:'b',full_name:'B',role:'sales'}],history:[],followups:[]};return new Function('Date','dashboardState','$','displayCountry','fxToCny','amountCny','statusNames','sourceNames','inRange','dashboardRange','lastWeekRange','pct','money','fmtDate','dashboardHasSuccessfulLoad',code+';return {context:aiDataContext,answer:aiAnswer,chart:aiChart,metric:aiChartMetric,range:aiRangeFromQuestion};')(Clock,state,()=>({value:''}),x=>x||'—',()=>1,x=>x.won_currency==='CNY'?Number(x.won_amount):null,names,{website:'官网'},(v,a,b)=>Date.parse(v)>=+a&&Date.parse(v)<=+b,()=>{throw Error('unexpected fallback period')},()=>{throw Error('unexpected week')},(n,d)=>d?(n/d*100).toFixed(1)+'%':'—',n=>'¥'+n,x=>x,true)}
const row=(id,change={})=>({id,owner_id:'a',source:'website',created_at:'2026-10-10T00:00:00Z',validity:'valid',status:'received',...change});
const rows=[...Array.from({length:3},(_,i)=>row('old'+i,{created_at:'2026-08-01T00:00:00Z',status:'won',won_at:'2026-10-15T00:00:00Z',won_amount:100,won_currency:'CNY',risk_flag:true})),row('new-won',{status:'won',won_at:'2026-10-15T00:00:00Z',won_amount:200,won_currency:'CNY'}),row('new-lost',{status:'lost',risk_flag:true}),row('unknown',{owner_id:'b',status:'won',won_at:'2026-10-15T00:00:00Z',won_amount:null}),row('open',{status:'quoted',updated_at:'2026-10-10T00:00:00Z',next_follow_up_at:'2026-10-01T00:00:00Z'}),row('bad-time',{assigned_at:'2026-10-20T00:00:00Z',first_valid_contact_at:'2026-10-19T00:00:00Z'})];
test('actual CRM text and charts share metrics, cohort conversion and open-only risk',()=>{
 const api=local(rows),c=api.context('本月询盘');assert.equal(c.won.length,5);assert.equal(c.cohortWon.length,2);assert.equal(c.closed.length,3);assert.equal(c.risky.length,1);assert.equal(c.fast.length,0);assert.equal(c.amountMissing,1);assert.equal(c.totalCny,500);
 for(const [q,title] of [['本月有哪些逾期的商机','风险与超时'],['本月业绩排名','业务员成交额排名'],['本月商机漏斗情况','当前有效商机阶段分布']]){const a=api.answer(q,c),chart=api.chart(q,c);assert.equal(chart.title,title);assert.match(a,q.includes('逾期')?/高风险\/逾期商机/:q.includes('业绩')?/销售额排名/:/当前有效商机阶段/)}
 const a=api.answer('本月商机漏斗情况',c),chart=api.chart('本月商机漏斗情况',c);assert.match(a,/66.7%/);assert.match(chart.stat,/66.7%/);assert.doesNotMatch(a,/166.7%/);
 const active=api.chart('本月进行中商机有哪些',c);assert.equal(active.bars.reduce((n,b)=>n+b.value,0),c.active.length);assert.ok(active.bars.every(b=>!['成交','丢单'].includes(b.label)));
 const noDate=local([...rows,row('missing-date',{status:'won',won_amount:99,won_currency:'CNY'})]).context('本月询盘');assert.equal(noDate.won.length,5);assert.equal(noDate.wonDateMissing,1);
 const sales=api.chart('本月业绩排名',c);assert.equal(sales.bars.length,1);assert.match(sales.sources.at(-1).detail,/1 条缺金额/);assert.match(api.answer('本月业绩排名',c),/1 条缺金额/);
});
test('live response uses one snapshot and refuses stale data and compound local short-circuits',()=>{
 let calls=0;const result=crmLiveAnswer('本月业绩排名',{ready:true,snapshot:()=>({n:++calls}),compute:(_,x)=>'数量'+x.n,chart:(_,x)=>({bars:[{value:x.n,label:'n'}]})});assert.equal(calls,1);assert.match(result.answer,/数量1/);assert.equal(result.windows[0].chart.bars[0].value,1);
 const stale=crmLiveAnswer('本月业绩排名',{ready:true,stale:true,compute:()=>{throw Error('no old data')}});assert.match(stale.answer,/刷新失败/);assert.deepEqual(stale.windows,[]);
 assert.equal(crmDataIntent('查询本月渠道分布；分析近30天询盘阶段分布'),null);
});
test('explicit last month and fullwidth recent periods do not silently use dashboard defaults',()=>{
 const api=local([]),r=api.range('上月询盘');assert.equal(r.start.getMonth(),8);assert.equal(r.end.getMonth(),8);const recent=api.range('最近７天询盘');assert.equal((+recent.end-+recent.start+1)/86400000,7);
 const empty=api.context('本月询盘');assert.match(api.answer('本月经营数据',empty),/暂无可判定排名/);
});
test('server charts and prose agree on hidden groups, true zero and failed reads',()=>{
 const stats=summarizeCrm(Array.from({length:6},(_,i)=>row(i,{source:'email',status:i<3?'won':'lost'})),{start:'2026-09-23',end:'2026-10-23'},now);
 const result=crmStatisticReply('分析近30天询盘的渠道和阶段分布，说明口径和缺口',stats);assert.equal(result.actions.length,2);assert.match(result.answer,/企业邮箱|邮件/);assert.match(result.answer,/50.0%/);assert.deepEqual(result.actions[1].chart.bars,[]);assert.match(result.answer,/小样本分组已隐藏/);
 assert.match(crmStatisticReply('分析近30天询盘逾期情况',stats).answer,/未披露.*不代表零/);assert.match(crmStatisticReply('分析近30天询盘渠道分布',{status:'unavailable'}).answer,/未完整读取/);assert.match(crmStatisticReply('分析近30天询盘渠道分布',{status:'insufficient_sample'}).answer,/不等于零/);
 assert.equal(crmStatisticReply('分析近7天询盘渠道分布',stats).actions.length,0);assert.equal(crmStatsChart('分析本月询盘渠道分布',stats),null);assert.equal(crmStatsChart('分析SEO渠道表现',stats),null);
 assert.equal(crmStatisticQuestion('分析询盘渠道分布和X60产品参数'),null);
});

import {seoStatQuestion,seoStatReply} from '../supabase/functions/agent-conversation/seo-stat-report.mjs';
import {windowsFrom,storable} from '../assets/agent-timeline.mjs';
test('SEO prose/chart share windows and dates, preserving null/zero, CTR scale and stale state',()=>{
 assert.equal(seoStatQuestion('检查近7天和28天SEO点击率与数据来源'),true);for(const q of ['分析竞品SEO关键词','SEO为什么下降','分析SEO和询盘渠道'])assert.equal(seoStatQuestion(q),false);
 const seo={status:'stale',generated_at:'2026-10-23T01:00:00Z',freshness:{gsc:{through:'2026-10-20'},ga4:{through:'2026-10-21'}},windows:{'7d':{gsc:{ctr:0,clicks:0}},'28d':{gsc:{ctr:0.125}}}};
 const r=seoStatReply('检查近7天和28天SEO点击率与数据来源',seo);assert.match(r.answer,/已过期/);assert.match(r.answer,/2026-10-20/);assert.match(r.answer,/7天 0%.*28天 12.5%/);assert.deepEqual(r.actions[0].chart.bars.map(x=>x.value),[0,12.5]);assert.equal(storable(windowsFrom(r)[0]),null);
 assert.match(seoStatReply('查看GA4近7天自然会话',seo).answer,/未取得/);assert.ok(seoStatReply('查看GA4近7天自然会话',seo).actions.length);
 const absent=seoStatReply('检查近7天SEO展示',seo);assert.deepEqual(absent.actions[0].chart.bars,[]);assert.match(absent.answer,/未取得/);assert.match(seoStatReply('检查近7天SEO展示',{status:'unavailable'}).answer,/不代表流量为零/);assert.equal(seoStatReply('查看SEO近30天数据',seo).actions.length,0);
});
