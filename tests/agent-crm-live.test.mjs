import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {crmDataIntent,crmLiveAnswer} from '../assets/agent-crm-live.mjs';
import {knowledgeRoute} from '../supabase/functions/agent-conversation/knowledge-routing.mjs';
import {resolveMaterialTurn} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
import {normalizeProductInput} from '../supabase/functions/agent-conversation/product-input.mjs';
test('explicit wooden-door catalogue request remains an internal standalone document lookup',()=>{
 for(const q of ['木门画册','查当前版木门画册的产品特点与适用场景，逐项给资料名称、版本、页码；只整理有原文依据的内容，不作性能或采购承诺。','物料：木门画册 当前版本 页码']){
  assert.equal(knowledgeRoute(q).materials,true,q);
  assert.deepEqual(resolveMaterialTurn(q,['王力产品系列目录，请列出资料来源、版本与页码']),{question:normalizeProductInput(q)},q);
 }
});
test('product source requests reach authorized materials instead of local channel statistics',()=>{
 for(const q of ['王力产品系列目录，请列出当前资料来源、版本与页码；不要做采购承诺。','列出当前产品手册来源和页码','我们产品有哪些来源资料','X60 Pro 参数当前来源有哪些']){
  assert.equal(crmDataIntent(q),null,q);
  assert.equal(crmLiveAnswer(q,{compute:()=>assert.fail('must not compute CRM statistics'),ready:true}),null,q);
  assert.equal(knowledgeRoute(q).materials,true,q);
 }
 for(const q of ['本月询盘来源分布','统计各来源询盘数量','本月客户来源有哪些','各渠道询盘分布'])assert.ok(crmDataIntent(q),q);
 assert.equal(crmDataIntent('列出当前资料来源'),null);
});
test('CRM number/list questions go to live CRM data; advice questions stay with the model',()=>{
 for(const q of ['销售额最高的是谁?','本月谁的成交额最高？','这个月新增了多少询盘','有哪些超时未跟进的询盘','当前商机漏斗情况','各渠道询盘分布','业绩排名','上周成交了几单'])assert.ok(crmDataIntent(q),q);
 for(const q of ['为什么这个月销售额下降了','怎么提升转化率','沙特渠道要不要加钱','介绍一下你自己','X60 Pro 的参数','打开零售画册'])assert.equal(crmDataIntent(q),null,q);
 assert.deepEqual(crmDataIntent('有哪些逾期的商机'),{view:'risk-review',label:'风险审查中心'});
 assert.equal(crmDataIntent('销售额最高的是谁').view,'dashboard');
});
test('live answer is computed locally, says so, and opens the matching CRM page in the timeline',()=>{
 const r=crmLiveAnswer('销售额最高的是谁',{compute:q=>'业务员销售额排名：\n1. 张三：¥100',ready:true});
 assert.match(r.answer,/张三/);assert.match(r.answer,/没有发送给外部模型/);assert.deepEqual(r.windows,[{type:'crm_view',view:'dashboard',label:'经营看板'}]);assert.deepEqual(r.labels,['CRM 实时数据']);
 assert.match(crmLiveAnswer('销售额最高的是谁',{compute:()=>'x',ready:false}).answer,/还在加载/);
 assert.equal(crmLiveAnswer('怎么提升销售额',{compute:()=>'x',ready:true}),null);
 const conv=readFileSync(new URL('../assets/agent-conversation.mjs',import.meta.url),'utf8');assert.match(conv,/crmAnswer\?\.\(question\)/);assert.match(conv,/action:'local-ticket'/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/crmAnswer:question=>crmLiveAnswer\(question,\{compute:aiAnswer,chart:aiChart,metric:aiChartMetric,ready:dashboardHasSuccessfulLoad,snapshot:aiDataContext,stale:agentDataRefreshFailed\}\),crmChart:aiChart/);
});
import {spokenNames,speechBody} from '../supabase/functions/agent-conversation/bailian.mjs';
test('TTS says Chloe the way she says it; on-screen text unchanged',()=>{
 assert.equal(spokenNames('好的，Chloe，我来帮你看看。'),'好的，克洛伊，我来帮你看看。');assert.equal(spokenNames("I'm here, Chloe."),"I'm here, Kloey.");
 assert.match(JSON.stringify(speechBody('你好 Chloe','Cherry')),/克洛伊/);assert.equal(spokenNames('Chloeee'),'Chloeee');
});

test('every CRM data answer names its source and carries a chart window first',async()=>{
 const spec={title:'业务员成交额排名',bars:[{label:'张三（1 单）',value:100,text:'¥100'}],sources:[{label:'CRM 实时数据（询盘与成交记录）'}]};
 const r=crmLiveAnswer('销售额最高的是谁',{compute:()=>'1. 张三：¥100',chart:()=>spec,metric:()=>'sales',ready:true});
 assert.match(r.answer,/来源：CRM 实时数据/);assert.equal(r.windows[0].type,'data_chart');assert.equal(r.windows[0].metric,'sales');assert.equal(r.windows[1].type,'crm_view');
 const broken=crmLiveAnswer('销售额最高的是谁',{compute:()=>'x',chart:()=>{throw Error('x')},ready:true});assert.equal(broken.windows[0].type,'crm_view');
 const {windowsFrom,storable}=await import('../assets/agent-timeline.mjs');const [w]=windowsFrom({actions:r.windows});assert.equal(w.kind,'chart');assert.equal(w.source,'crm');
 const {timelineWindow,expandTimeline}=await import('../supabase/functions/agent-conversation/request-timeline.mjs');
 const stored=timelineWindow(storable(w));assert.deepEqual(stored,{kind:'chart',source:'crm',metric:'sales',question:'销售额最高的是谁',label:'业务员成交额排名'});
 assert.equal(JSON.stringify(stored).includes('张三'),false,'names and amounts are never stored');
 assert.equal(timelineWindow({kind:'chart',source:'crm',metric:'x',question:'a'}),null);
 assert.equal(timelineWindow({kind:'chart',source:'crm',metric:'sales',question:'联系 a@b.com'}),null);
 assert.equal(expandTimeline([{windows:[stored]}])[0].windows.length,1);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/function aiChart\(question,c=aiDataContext\(question\)\)/);assert.match(html,/CRM 实时数据（询盘与成交记录）/);
});

test('product sources, certification risks and rankings never masquerade as CRM counts',()=>{
 for(const q of ['请介绍我们的产品系列目录，列出资料来源、版本和页码。','列出S922的认证风险','X60 Pro的来源有哪些','产品参数排名','来源呢','Instagram逐帖数据来源有哪些'])assert.equal(crmDataIntent(q),null,q);
 assert.ok(crmDataIntent('X60 Pro的询盘来源有哪些'));
});
