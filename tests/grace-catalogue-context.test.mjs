import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogPrecheck,catalogIntent,fullCatalogueAnswer} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
import {resolveMaterialTurn} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
import {woodTrainingSearchTerm} from '../supabase/functions/agent-conversation/document-topic.mjs';

const model=(name,page,specs)=>({model:name,catalog:'c4',page,specs,category:'smart_lock'});
const catalogue={sources:[{id:'c4',edition:'2026-08'}],products:[
 model('A5',1,{Colour:'Black'}),
 model('A5N',2,{Colour:'Silver'}),
 model('Slipstream',3,{Sizes:'300 mm'}),
 model('T200',4,{Material:'Alloy',Colour:'Black'}),
 model('T200',5,{Power:'6 V',Display:'Touch screen'}),
],pages:[]};

test('short and named models are scoped by the requested field and exact catalogue identity',()=>{
 for(const [q,name] of [['A5 的颜色是什么？','A5'],['A5N 的颜色是什么？','A5N'],['我问的是 Slipstream，王力资料上它的尺寸怎么写？','Slipstream']]){
  assert.equal(catalogPrecheck(q),true);
  assert.deepEqual(catalogIntent(q,catalogue).models,[name]);
 }
 assert.equal(catalogPrecheck('客户合同 A5 的颜色核算'),false);
 assert.equal(catalogPrecheck('查一下 A5 的 V2 版尺寸'),false);
});

test('named product followups do not require model digits',()=>{
 const r=resolveMaterialTurn('那它的尺寸呢？',['先查 Slipstream 的资料']);
 assert.deepEqual(catalogIntent(r.question,catalogue).models,['Slipstream']);
 assert.ok(resolveMaterialTurn('那它的尺寸呢？',[]).clarification);
 assert.ok(resolveMaterialTurn('那它的尺寸呢？',['先查 Slipstream 的资料，对比另一款']).clarification);
});

test('video storage is a specification and actual video downloads remain a file intent',()=>{
 assert.equal(catalogPrecheck('X60 Pro 的视频存储是什么？'),true);
 assert.equal(catalogPrecheck('请下载 X60 Pro 的安装视频'),false);
});

test('supplementary fields retain their individual source pages',()=>{
 const q='T200 的供电是什么？';
 const answer=fullCatalogueAnswer(catalogIntent(q,catalogue),catalogue,q).answer;
 assert.match(answer,/Power：6 V（真智能锁画册 PDF第5页）/);
 assert.match(answer,/Display：Touch screen（真智能锁画册 PDF第5页）/);
 assert.match(answer,/出处：真智能锁画册 PDF第4页/);
 assert.equal(woodTrainingSearchTerm('木门日常使用如何通风干燥？'),'通风干燥');
});
