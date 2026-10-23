import test from 'node:test';
import assert from 'node:assert/strict';
import {privateSocialDisplay,privateSocialTime} from '../supabase/functions/agent-conversation/private-social-display.mjs';
import {privateIntelligenceAnswer} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {privateReportQuestion} from '../assets/agent-private-report-context.mjs';
import {privateReportButtons} from '../assets/agent-private-intelligence.mjs';
const doc=()=>({kind:'facebook',title:'facebook snapshot',period:{from:'2026-10-23',to:'2026-10-23'},generated_at:'2026-10-23T02:00:05Z',sections:[
 {title:'来源日期与覆盖',body:JSON.stringify({platform:'facebook',status:'available',source_date:'2026-10-23T02:00:00Z',source_last_success_sync:'2026-10-23T02:00:00Z',window:{start:'2026-09-25T02:00:00Z',end:'2026-10-23T02:00:00Z',complete:true,stop_reason:null},post_count:8,saved_posts:8,omitted_posts:0,post_coverage_complete:true,reason:null})},
 {title:'已发布逐帖明细 1/1',body:'逐帖指标为本次获取的累计值\n'+Array.from({length:8},(_,i)=>`https://www.facebook.com/reel/${i+1}/\n发布：2026-10-22T15:00:00+0000；views=${i}；viewers=1${i===0?'；clicks=0':'；缺口 clicks:permission_required'}`).join('\n\n')},
 {title:'同口径历史与验证指标',body:'上次来源成功时间：2026-10-22T01:00:00Z；不将累计值相减当增长。'}]});
test('saved snapshot overview keeps zero, known coverage, timezone and hidden-preview count without changing the document',()=>{
 const d=doc(),before=JSON.stringify(d),text=privateSocialDisplay(d,'查看今天已同步的Facebook指标');
 assert.equal(JSON.stringify(d),before);assert.match(text,/观看量：8\/8/);assert.match(text,/独立观看者：8\/8/);assert.match(text,/点击数：1\/8；7条未知/);
 assert.match(text,/观看量：0；独立观看者：1；点击数：0/);assert.match(text,/缺少读取权限/);assert.match(text,/2026-10-23 10:00:00（北京时间）/);
 assert.match(text,/窗口分页：已读完/);assert.doesNotMatch(text,/停止或缺口原因：未知|views=|viewers=|permission_required|posts_in_window/);
 assert.equal((text.match(/https:\/\//g)||[]).length,5);assert.match(text,/显示5\/8条/);assert.match(text,/其余3条/);assert.match(text,/不能跨帖相加/);
 const row={id:'fixture-id',digest:'fixture-digest',document:d};const answer=privateIntelligenceAnswer({documents:[row]},'查看今天已同步的Facebook指标');
 assert.match(answer,/知识编号：fixture-id；版本校验：fixture-digest/);assert.doesNotMatch(answer,/附有 0 项来源/);
});
test('expand and source options use the same saved document with full detail or metadata-only content',()=>{
 const d=doc(),key='facebook-2026-10-23';const expanded=privateSocialDisplay(d,`查看私有知识 ${key}，展开逐帖明细`);
 assert.equal((expanded.match(/https:\/\//g)||[]).length,8);assert.match(expanded,/显示8\/8条/);assert.match(expanded,/2026-10-22 09:00:00（北京时间）/);
 const sources=privateSocialDisplay(d,`查看私有知识 ${key}，来源与缺口`);assert.doesNotMatch(sources,/https:\/\//);assert.match(sources,/点击数：1\/8；7条未知/);
});
test('failed-source history stays historical and partial windows, omissions and empty reads cannot become complete data',()=>{
 const d=doc(),m=JSON.parse(d.sections[0].body);Object.assign(m,{status:'unavailable',source_date:null,post_count:0,saved_posts:0,historical_saved_posts:8,post_coverage_complete:false,reason:'timeout',window:null});
 d.sections[0].body=JSON.stringify(m);d.sections[1].title='历史逐帖明细 1（非本次更新）';let text=privateSocialDisplay(d);
 assert.match(text,/本次读取未成功：读取超时/);assert.match(text,/历史保存明细的指标覆盖/);assert.match(text,/历史逐帖明细（非本次更新）/);assert.match(text,/来源数据时间：未知/);assert.match(text,/未将未返回的数据记为0/);
 const partial=doc(),p=JSON.parse(partial.sections[0].body);Object.assign(p,{status:'partial',post_coverage_complete:false,omitted_posts:2,reason:'private_document_limit'});p.window.complete=false;p.window.stop_reason='page_cap';partial.sections[0].body=JSON.stringify(p);text=privateSocialDisplay(partial);assert.match(text,/未读完；达到分页上限/);assert.match(text,/因知识包容量未保存：2条/);assert.match(text,/窗口明细未完整/);
 const empty=doc(),e=JSON.parse(empty.sections[0].body);e.post_count=e.saved_posts=0;empty.sections[0].body=JSON.stringify(e);empty.sections.splice(1,1);text=privateSocialDisplay(empty);assert.match(text,/空结果不证明平台没有发布/);assert.doesNotMatch(text,/观看量：0/);
});
test('unfamiliar layouts and non-social reports preserve the original renderer; dates never assume an unstated timezone',()=>{
 assert.equal(privateSocialDisplay({kind:'weekly'}),null);const d=doc();d.sections[0].body='not JSON';assert.equal(privateSocialDisplay(d),null);
 const bad=doc();bad.sections[1].body='future format which must remain visible';assert.equal(privateSocialDisplay(bad),null);
 assert.equal(privateSocialTime('2026-10-23'),'2026-10-23（仅日期）');assert.equal(privateSocialTime('2026-10-23T02:00:00'),'未知');
 assert.equal(privateSocialTime('2026-10-23T10:00:00+08:00'),'2026-10-23 10:00:00（北京时间）');
});
test('short social followups retain only a valid social key and options send explicit read selectors',()=>{
 const key='facebook-2026-10-23';for(const q of ['点击呢','那独立观看者呢','展开逐帖明细','来源与缺口'])assert.equal(privateReportQuestion(q,key),`查看私有知识 ${key}，${q}`);
 for(const q of ['S922的点击呢','YouTube点击呢','昨天点击呢','点击以及介绍CRM'])assert.equal(privateReportQuestion(q,key),q);
 assert.equal(privateReportQuestion('点击呢','weekly-2026-10-12-2026-10-18'),'点击呢');
 const prior=globalThis.document;const asked=[];
 try{globalThis.document={createElement:tag=>({tag,children:[],setAttribute(){},append(...c){this.children.push(...c)}})};
  const bar=privateReportButtons([{id:'11111111-1111-4111-8111-111111111111',key,digest:'a'.repeat(64)}],q=>asked.push(q));assert.deepEqual(bar.children.map(c=>c.textContent),['内容与改进','分析表现','指标概览','展开逐帖','来源与缺口']);bar.children[3].onclick();assert.deepEqual(asked,[`查看私有知识 ${key}，展开逐帖明细`]);
 }finally{globalThis.document=prior}
});
