import test from 'node:test';
import assert from 'node:assert/strict';
import {privateSocialAnalysis,socialAnalysisIntent,socialAnalysisCoversParts} from '../supabase/functions/agent-conversation/private-social-analysis.mjs';
import {questionPlan} from '../supabase/functions/agent-conversation/question-plan.mjs';
import {privateIntelligenceIntent,readPrivateIntelligence} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {privateReportQuestion} from '../assets/agent-private-report-context.mjs';
const now=Date.parse('2026-10-23T03:00:00Z');
function fixture(platform='facebook',values=[0,20,100,300,300,10]){
 const hosts={facebook:i=>`https://www.facebook.com/reel/${i+1}/`,youtube:i=>`https://www.youtube.com/watch?v=fixture${i}`,instagram:i=>`https://www.instagram.com/reel/Fixture${i}/`,tiktok:i=>`https://www.tiktok.com/@fixture/video/${i+1}`};
 return {kind:platform,key:platform+'-2026-10-23',title:platform,period:{from:'2026-10-23',to:'2026-10-23'},generated_at:'2026-10-23T02:00:05Z',sections:[
  {title:'来源日期与覆盖',body:JSON.stringify({platform,status:'available',source_date:'2026-10-23T02:00:00Z',source_last_success_sync:'2026-10-23T02:00:00Z',post_coverage_complete:true,post_count:values.length,saved_posts:values.length,omitted_posts:0,window:{start:'2026-09-25T02:00:00Z',end:'2026-10-23T02:00:00Z',complete:true}})},
  {title:'已发布逐帖明细 1/1',body:values.map((v,i)=>`${hosts[platform](i)}\n发布：2026-10-22T15:00:00+0000；views=${v}；likes=${i===3?3:0}；comments=0${i===5?'；缺口 clicks:permission_required':`；clicks=${i===3?1:0}`}`).join('\n\n')}
 ]};
}
test('analysis ranks only known same-platform cumulative evidence, preserves ties, zeros and rate definitions without mutating input',()=>{
 const d=fixture(),before=JSON.stringify(d),text=privateSocialAnalysis(d,now);
 assert.equal(JSON.stringify(d),before);assert.match(text,/样本中位数60/);assert.equal((text.match(/^\d\. https:\/\//gm)||[]).length,3);
 assert.ok(text.indexOf('/reel/4/')<text.indexOf('/reel/3/'));assert.match(text,/并列值仅展示部分/);assert.match(text,/\(3\+0\)\/300=1.00%/);
 assert.match(text,/5\/6条可读，其中4条为0；其他1条未知/);assert.match(text,/不是平台官方互动率/);assert.match(text,/曝光\/归因/);assert.match(text,/内容证据缺口/);
 assert.match(text,/具体改进建议/);assert.match(text,/一个变量/);assert.match(text,/24小时\/72小时/);assert.match(text,/不承诺提升/);assert.match(text,/来源数据时间：2026-10-23 10:00:00/);
 assert.doesNotMatch(text,/点击率：\d|转化率：\d|已经证明.*封面|询盘增长：\d/);
});
test('thin, tied, zero and empty samples do not invent winners or complete metrics',()=>{
 assert.match(privateSocialAnalysis(fixture('facebook',[10,20]),now),/少于3条，暂不做样本排名/);
 for(const values of [[0,0,0],[9,9,9]])assert.match(privateSocialAnalysis(fixture('facebook',values),now),/不硬选/);
 const text=privateSocialAnalysis(fixture('facebook',[]),now);assert.match(text,/空结果不等于平台没有发布/);assert.doesNotMatch(text,/基础计数均可读|1\. https:\/\//);
});
test('failed, old, future and undated source snapshots cannot become a current performance leaderboard',()=>{
 for(const state of ['failed','stale','future','undated']){
  const d=fixture(),m=JSON.parse(d.sections[0].body);
  if(state==='failed'){m.status='unavailable';m.historical_saved_posts=6;m.saved_posts=0;d.sections[1].title='历史逐帖明细 1（非本次更新）'}
  m.source_date=state==='stale'?'2026-10-20T02:00:00Z':state==='future'?'2026-10-24T02:00:00Z':state==='undated'?null:m.source_date;
  d.sections[0].body=JSON.stringify(m);const text=privateSocialAnalysis(d,now);assert.match(text,/当前结论暂缓/);assert.doesNotMatch(text,/^1\. https:\/\//m);assert.match(text,/来源最近成功时间/);
 }
});
test('partial coverage and malformed layouts remain explicit instead of fabricating a full-window conclusion',()=>{
 const d=fixture(),m=JSON.parse(d.sections[0].body);m.post_coverage_complete=false;m.omitted_posts=2;d.sections[0].body=JSON.stringify(m);assert.match(privateSocialAnalysis(d,now),/仅部分保存明细，不能代表完整窗口/);
 d.sections[1].body='unknown future format';assert.match(privateSocialAnalysis(d,now),/未生成表现结论/);
});
test('social analysis wording routes to existing private reads while product, company and security questions stay out',()=>{
 for(const q of ['分析今天Facebook帖子表现，指出表现好的帖子、问题和改进建议','分析社媒表现','分析Ｆａｃｅｂｏｏｋ的帖子','哪些已同步的YouTube帖子表现好','查看私有知识 instagram-2026-10-23，怎么改进']){assert.equal(socialAnalysisIntent(q),true);assert.equal(privateIntelligenceIntent(q),true)}
 for(const q of ['分析S922安装方式','Facebook公司背调','分析Facebook广告账户安全问题','查看今天已同步的Facebook指标'])assert.equal(socialAnalysisIntent(q),false);
 const key='facebook-2026-10-23';for(const q of ['分析表现','哪些帖子表现好','有什么问题','怎么改进','改进建议呢'])assert.equal(privateReportQuestion(q,key),`查看私有知识 ${key}，${q}`);
 for(const q of ['S922有什么问题','昨天怎么改进','分析YouTube帖子'])assert.equal(privateReportQuestion(q,key),q);
});
test('multi-platform analysis reads each requested dated snapshot through the same RPC, with separate receipts and missing markers',async()=>{
 const calls=[],client={rpc:async(name,args)=>{calls.push({name,args});return {data:{documents:args.p_kind==='instagram'?[]:[{id:args.p_kind+'-id',digest:args.p_kind+'-hash',imported_at:'2026-10-23T02:00:05Z',document:fixture(args.p_kind)}]}}}};
 let r=await readPrivateIntelligence(client,'分析今天Facebook和YouTube帖子表现，给出改进建议',now);
 assert.deepEqual(calls.map(c=>c.args.p_kind),['facebook','youtube']);assert.ok(calls.every(c=>c.name==='read_agent_private_intelligence'&&c.args.p_from==='2026-10-23'&&c.args.p_to==='2026-10-23'&&c.args.p_limit===1));assert.equal(r.receipts.length,2);assert.match(r.answer,/不做跨平台排行榜/);
 calls.length=0;r=await readPrivateIntelligence(client,'分析今天社媒表现和改进建议',now);assert.deepEqual(calls.map(c=>c.args.p_kind),['tiktok','instagram','facebook','youtube']);assert.equal(r.receipts.length,3);assert.match(r.answer,/未找到对应日期快照：instagram/);assert.doesNotMatch(r.answer,/instagram-id/);
 await assert.rejects(()=>readPrivateIntelligence({rpc:async()=>({error:{message:'private secret'}})},'分析今天Facebook和YouTube帖子表现',now),e=>e.message==='私有知识读取未完成，请稍后重试');
});
test('single-report analysis retains its selector and digest, never reads a different source or fetches live data',async()=>{
 const d=fixture(),calls=[],q='查看私有知识 facebook-2026-10-23，分析帖子表现';
 const r=await readPrivateIntelligence({rpc:async(name,args)=>{calls.push({name,args});return {data:{documents:[{id:'saved-id',digest:'saved-sha',document:d}]}}}},q,now);
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_key,d.key);assert.equal(r.receipts[0].digest,'saved-sha');assert.match(r.answer,/知识编号：saved-id；版本校验：saved-sha/);assert.match(r.answer,/具体改进建议/);
});
test('single analysis aspects stay together but unrelated compound tasks and unsupported periods cannot silently change scope',async()=>{
 for(const q of ['分析今天Facebook帖子表现，并给出具体改进建议','分析Facebook帖子表现，并指出存在的问题，同时给出改进建议','分析Facebook帖子表现，并说明存在的问题和具体改进建议'])assert.equal(socialAnalysisCoversParts(q,questionPlan(q).parts),true);
 const one='分析Facebook帖子表现，并指出存在的问题和具体改进建议';assert.equal(questionPlan(one).parts.length,0);assert.equal(privateIntelligenceIntent(one),true);
 for(const q of ['分析Facebook帖子表现，并介绍CRM','分析Facebook帖子表现，并查询S922安装资料','分析Facebook帖子表现；介绍CRM；说明邮箱连接；分析YouTube帖子'])assert.equal(socialAnalysisCoversParts(q,questionPlan(q).parts),false);
 for(const q of ['分析近7天Facebook帖子表现','分析上周YouTube帖子','对比Facebook帖子观看量和昨天相比的增长','分析2026-10-01到2026-10-23社媒表现']){
  const r=await readPrivateIntelligence({rpc:async()=>{throw Error('must not substitute a different period')}},q,now);assert.match(r.answer,/不能用单份累计值冒充/);assert.equal(r.receipts.length,0);
 }
});
