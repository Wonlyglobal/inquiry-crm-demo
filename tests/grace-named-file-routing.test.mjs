import test from 'node:test';
import assert from 'node:assert/strict';
import {namedMaterialRequest,namedMaterialReply} from '../supabase/functions/agent-conversation/named-material.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {companyListingTurn,companyListingAnswer} from '../supabase/functions/agent-conversation/company-listing-turn.mjs';
import {archivedCatalogField} from '../supabase/functions/agent-conversation/catalog-field-turn.mjs';
import {catalogueReferenceRequest,conciseCatalogFacts} from '../supabase/functions/agent-conversation/catalog-fact-answer.mjs';

const name='示例岗位说明 2026.docx';
const asset={id:'aaaaaaaa-1111-4444-8888-bbbbbbbbbbbb',name,type:'文档',isCurrentVersion:true,
 document:{status:'ready',sha256:'a'.repeat(64),pages_total:1,pages:[{page:1,kind:'native_text',chunks:['岗位要求：\n英语可作工作语言。']}]}};

test('full filename and signed result produce only the exact current file card',()=>{
 for(const question of [`打开 ${name}，保留出处。`,`物料：${name}`,`帮我找一下文件 ${name}，给我文件卡片。`,`资料库有《${name}》吗？`,`${name} 可以下载吗？`]){
  const request=namedMaterialRequest(question);
  assert.deepEqual(request,{name,kind:'file'});
  const data={status:'available',assets:[{...asset,name:'其他'+name},{...asset,isCurrentVersion:false},asset]};
  assert.deepEqual(namedMaterialReply(data,request).materials,[{id:asset.id,name,type:'文档'}]);
 }
 assert.equal(namedMaterialReply({status:'unavailable'},{name,kind:'file'}),null);
});
test('named document answers use gated page text and do not promote index-only text',()=>{
 const request=namedMaterialRequest(`物料《${name}》里，“工作语言”写了什么？只根据这份资料。`);
 const clean=gateMaterialEvidence({status:'available',assets:[asset]});
 assert.match(namedMaterialReply(clean,request).answer,/英语可作工作语言.*\n出处：.*第 1 页/);
 const indexOnly=gateMaterialEvidence({status:'available',assets:[{...asset,document:null,excerpt:'英语可作工作语言。'}]});
 assert.match(namedMaterialReply(indexOnly,request).answer,/暂未定位/);
 assert.equal(namedMaterialRequest(`比较《${name}》和《另一个说明.docx》`),null);
 assert.equal(namedMaterialRequest(`根据《${name}》写一封邮件`),null);
});
test('presentation-only suffixes preserve a complete filename without overriding other tasks',()=>{
 for(const suffix of ['先用一句话回答核心问题。','请简短作答。','如有出处，请放在末尾。']){
  assert.deepEqual(namedMaterialRequest(`物料：${name} ${suffix}`),{name,kind:'file'});
 }
 assert.equal(namedMaterialRequest(`根据《${name}》写一封邮件。结论先说。`),null);
});
test('company stock followup uses latest company question and its indexed listing fact',()=>{
 const turn=companyListingTurn('那股票代码是多少？',['画册检索：王力是什么时候上市的？']);
 const catalog={facts:[{topic:'listing',catalog:'c2',page:3,zh:'2021年2月24日在上海证券交易所A股主板上市，股票代码605268。'}]};
 assert.match(companyListingAnswer(turn,catalog),/605268。\n出处：零售画册 PDF第3页/);
 assert.match(companyListingAnswer(companyListingTurn('王力在哪家交易所上市？'),catalog),/上海证券交易所/);
 assert.equal(companyListingTurn('那股票代码是多少？',['王力是什么时候上市的？','查竞品资料']),null);
 assert.equal(companyListingTurn('客户的股票代码是多少？',['公司资料：王力上市时间']),null);
 assert.equal(companyListingTurn('王力安防何时在证券交易所上市？').field,'date');
 assert.equal(companyListingTurn('后面帮我查一下它的股票代码。',['公司资料：王力上市时间']).field,'code');
});
test('scoped catalogue facts retain the requested page and cannot establish universal certification',()=>{
 const catalog={sources:[{id:'c2',edition:'test'}],facts:[
  {topic:'brand_value',catalog:'c2',page:3,text:'2025 brand value: 376.59',zh:'2025年品牌价值376.59亿元。'},
  {topic:'remote_sensing',catalog:'c2',page:61,text:'24 GHz radar',zh:'画册标注24 GHz雷达。'}
 ]};
 const brand=catalogueReferenceRequest('只按零售画册里的品牌价值数字，2025 年是什么口径？ 先用一句话回答核心问题。');
 assert.match(conciseCatalogFacts({kind:'facts',topics:[brand.topic]},catalog,brand.question),/376\.59.*\n来源：.*第3页/);
 const radar=catalogueReferenceRequest('原文明确出处后，再用中文概括零售画册第61页远感雷达的频率。');
 assert.match(conciseCatalogFacts({kind:'facts',topics:[radar.topic]},catalog,radar.question),/画册标注24 GHz雷达/);
 assert.equal(catalogueReferenceRequest('按王力画册，2023年品牌价值多少？'),null);
 assert.equal(catalogueReferenceRequest('零售画册提到 C 级锁芯的测试指标，可以写成所有锁都拥有海外认证吗？').certificationBoundary,true);
});
test('archive field uses exact model and source, and preserves current-parameter routing',()=>{
 const row={model:'S80 Max',page:15,catalog:'c4',specs:{Colour:'Xuanwu Gold',Type:'Remote-Sensing True Smart Lock'}};
 const catalog={products:[row,{...row,model:'S80 Pro',specs:{Colour:'Black'}}]};
 assert.match(archivedCatalogField('只看 S80 Max，画册写了哪种颜色？附来源。',catalog).answer,/玄武金.*\n出处：真智能锁画册 PDF第15页/);
 assert.match(archivedCatalogField('查一下 S80 Max 的产品类型，请简短回答并给出处。',catalog).answer,/远感真智能锁/);
 assert.equal(archivedCatalogField('S80 Max 当前在售版本的颜色是什么？',catalog),null);
 assert.equal(archivedCatalogField('S80 Max 第九版画册写了哪种颜色？',catalog),null);
 assert.match(archivedCatalogField('只看 S80 Max，画册写了哪种颜色？',{products:[row,{...row,page:13,specs:{Colour:'Black'}}]}).answer,/不同记录/);
});
