import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  doorWindowCatalogueReply,
  doorWindowCatalogueRequest,
} from '../supabase/functions/agent-conversation/door-window-catalogues.mjs';

const asset = (name, index, overrides={}) => ({
  id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,
  name:'门窗画册/'+name,
  type:'文档',
  relativePath:'门窗画册/'+name,
  isCurrentVersion:true,
  document:{status:'not_indexed'},
  ...overrides,
});
const engineering = asset('王力智能门窗工程画册.pdf', 1);
const retail = asset('王力智能门窗零售图册.pdf', 2);

test('the reported questions are directory lookups, with scoped edition follow-ups', () => {
  for (const text of ['有门窗画册吗','有门窗相关画册吗？','门窗有哪些画册','帮我找一下门窗画册']) {
    assert.deepEqual(doorWindowCatalogueRequest(text),{edition:''},text);
  }
  assert.deepEqual(doorWindowCatalogueRequest('打开王力智能门窗工程画册PDF'),{edition:'工程'});
  assert.deepEqual(doorWindowCatalogueRequest('那零售那本呢','物料：门窗画册'),{edition:'零售'});
  assert.equal(doorWindowCatalogueRequest('零售','物料：锁具画册'),null);
});

test('questions about page content, dimensions or other catalogues keep their existing route', () => {
  for (const text of ['门窗画册第 3 页','门窗画册里面有工程参数吗','对比门窗画册和零售画册',
    '画册里有门窗产能吗','智能锁画册在哪里','打开工程画册','门窗工程画册V2','有其他品牌的门窗画册吗']) {
    assert.equal(doorWindowCatalogueRequest(text,'物料：门窗画册'),null,text);
  }
});

test('current authorized PDFs work without parsed pages and retain only file-card metadata', () => {
  const available = {status:'available',assets:[
    retail, engineering, engineering,
    asset('旧版.pdf',3,{isCurrentVersion:false}),
    asset('旧版位置.pdf',4,{relativePath:'官网资料搜集/门窗/旧版位置.pdf'}),
    asset('视频.pdf',5,{type:'视频'}),
    asset('测试稿.docx',6),
  ]};
  const reply = doorWindowCatalogueReply(available,{edition:''});
  assert.deepEqual(reply.materials,[
    {id:engineering.id,name:'王力智能门窗工程画册.pdf',type:'文档'},
    {id:retail.id,name:'王力智能门窗零售图册.pdf',type:'文档'},
  ]);
  assert.match(reply.answer,/2份画册/);
  assert.deepEqual(doorWindowCatalogueReply(available,{edition:'零售'}).materials,[reply.materials[1]]);
  assert.equal(doorWindowCatalogueReply({status:'unavailable',assets:[]},{edition:''}),null);
  assert.match(doorWindowCatalogueReply({status:'available',assets:[]},{edition:''}).answer,/有权访问.*暂未找到/);
});

test('the signed owner lookup precedes the page index and uses the existing answer envelope', () => {
  const handler = readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
  const branch = handler.slice(handler.indexOf('   if(directoryRequest){'),handler.indexOf('   // Internal writing'));
  assert.ok(handler.indexOf('if(!eligible(user,profile))')<handler.indexOf('   if(directoryRequest){'));
  assert.ok(handler.indexOf('   if(directoryRequest){')<handler.indexOf('catalogPrecheck(catalogQuestion)'));
  assert.match(branch,/loadFullMaterials\(\{\.\.\.materialConfig/);
  assert.match(branch,/insert\(\{actor_id:user\.id/);
  assert.match(branch,/material_connection_unavailable/);
  assert.match(branch,/json\(\{\.\.\.reply,provider:'internal'/);
});
