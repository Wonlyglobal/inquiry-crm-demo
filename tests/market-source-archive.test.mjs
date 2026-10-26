import test from 'node:test';import assert from 'node:assert/strict';
import {productMarketReport} from '../supabase/functions/agent-conversation/product-market.mjs';
const model='QX880 PRO',catalog={sources:[],products:[],pages:[],facts:[]};
const asset=(id,extra={})=>({id,name:'Synthetic source '+id,versionLabel:'V9',updatedAt:'2026-10-20',isCurrentVersion:true,document:{sha256:'a'.repeat(64),pages:[],product_understanding:null},...extra});
const report=assets=>productMarketReport({question:model+'智能锁V9越南市场分析',catalog,materials:{status:'available',assets},now:Date.parse('2026-10-26')});
test('a source with no accepted parameter still retains its version, source update and parse hash',()=>{
 const r=report([asset('only')]);assert.equal(r.current_parameter_count,0);assert.equal(r.status,'product_evidence_gap');
 for(const text of ['Synthetic source only','版次：V9','物料更新时间：2026-10-20','原文发布日期：未返回','解析SHA-256：'+'a'.repeat(64),'不代表参数已核实','更新时间不等于原文发布日期'])assert.ok(r.answer.includes(text));
 assert.doesNotMatch(r.answer,/可作为待测试卖点/);
});
test('missing source dates and hashes remain unknown and do not use the report date',()=>{
 const r=report([asset('unknown',{versionLabel:'',updatedAt:'',isCurrentVersion:false,document:null})]);
 assert.match(r.answer,/版次：未标注/);assert.match(r.answer,/源端标记：历史或未确认/);assert.match(r.answer,/物料更新时间：未返回/);assert.match(r.answer,/解析SHA-256：未返回/);
 assert.doesNotMatch(r.answer,/物料更新时间：2026-10-26/);
});
test('repeated projections do not duplicate source archives and display limits remain explicit',()=>{
 const a=asset('repeat'),r=report([a,a,...Array.from({length:9},(_,i)=>asset('other-'+i))]);
 assert.equal(r.answer.match(/Synthetic source repeat/g).length,1);assert.match(r.answer,/来源档案共10项，本次展示8项/);
});
