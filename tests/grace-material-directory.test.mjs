import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {materialDirectoryRequest as plan,materialDirectoryReply as reply} from '../supabase/functions/agent-conversation/material-directory.mjs';

const asset=(name,n,type='文档',props={})=>({
 id:'46100402-0000-4000-8000-'+String(n).padStart(12,'0'),
 name,type,isCurrentVersion:true,...props
});
const available=(assets,has_more=false)=>({status:'available',assets,has_more});

test('generic file questions are searched without taking over specific or content questions',()=>{
 for (const q of ['有没有画册','我们还有没有画册？','请问，公司有产品图册吗？','帮我找一下画册']){
  assert.equal(plan(q)?.kind,'catalogue',q);
 }
 for (const q of ['我们有门窗画册吗','画册第3页','王力门业营业执照上的地址','法国营业执照','不要发我画册','S922和S936产品图']){
  assert.equal(plan(q),null,q);
 }
 assert.equal(plan('公司文件：王力门业的营业职照')?.company,'王力门业');
 assert.equal(plan('有没有什么产品图')?.kind,'product_image');
 assert.equal(plan('发我 S922 Pro 的外观图')?.model,'S922 PRO');
});

test('catalogue answers list bounded current catalogue cards and ignore documents that merely mention catalogues',()=>{
 const p=plan('有没有画册');
 const good=asset('归档/门窗工程画册.pdf',1,'文档',{proof:'should not leave server'});
 const other=asset('English Catalogue.pdf',2);
 const r=reply([available([good,asset('宣传视频.mp4',3,'视频'),asset('旧画册.pdf',4,'文档',{isCurrentVersion:false}),asset('经营会议.pdf',5)]),available([other,good],true)],p);
 assert.deepEqual(r.materials,[{id:good.id,name:'门窗工程画册.pdf',type:'文档'},other].map(({id,name,type})=>({id,name,type})));
 assert.match(r.answer,/先列出这2份画册/);
 assert.match(r.answer,/English Catalogue\.pdf/);
 assert.equal(reply([available(Array.from({length:9},(_,i)=>asset(i+'画册.pdf',i)))],p).materials.length,6);
});

test('license and product images keep document scope and do not mix model editions',()=>{
 const license=plan('王力门业营业执照');
 const right=asset('王力门业营业执照.jpg',1,'图片');
 const other=asset('王力安防营业执照.jpg',2,'图片');
 const finance=asset('万里汇收款信息.doc',3);
 assert.deepEqual(reply([available([right,other,finance])],license).materials.map(x=>x.id),[right.id]);
 const product=plan('S922的产品图');
 const base=asset('正面图.jpg',4,'图片',{relativePath:'产品资料包/外观图/S922外观图/正面图.jpg'});
 const pro=asset('S922Pro-正面.jpg',5,'图片',{relativePath:'产品资料包/外观图/S922外观图/S922Pro-正面.jpg'});
 const logos=asset('王力LOGO.png',6,'图片');
 assert.deepEqual(reply([available([base,pro,logos])],product).materials.map(x=>x.id),[base.id]);
 assert.deepEqual(reply([available([base,pro,logos])],plan('S922 Pro产品图')).materials.map(x=>x.id),[pro.id]);
});

test('outages are distinguishable from an empty search; partial results remain useful',()=>{
 const p=plan('有没有画册');
 const error={status:'unavailable'};
 assert.equal(reply([error],p),null);
 assert.equal(reply([error,available([])],p),null);
 assert.match(reply([available([])],p).answer,/暂未找到/);
 assert.match(reply([error,available([asset('门窗画册.pdf',1)])],p).answer,/部分检索暂未完成/);
 const source=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.ok(source.indexOf('const materialDirectory=')<source.indexOf('const sourceTask='));
 assert.match(source,/const materialDirectory=guest\|\|input\.persona!==.*null:materialDirectoryRequest/);
});
