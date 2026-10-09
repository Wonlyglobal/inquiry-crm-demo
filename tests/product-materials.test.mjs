import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {mentions,relatedMaterials,relatedText,kindOf} from '../supabase/functions/agent-conversation/product-materials.mjs';
const a=(id,name,extra={})=>({id,name,type:'',isCurrentVersion:true,excerpt:'',relativePath:'',document:null,video:null,...extra});
test('only files that actually mention the model are linked',()=>{
 assert.ok(mentions(a('1','X60 Pro 安装视频.mp4'),'X60 Pro'));
 assert.ok(mentions(a('2','manual.pdf',{excerpt:'Model: X-60PRO fingerprint'}),'X60 Pro'));
 assert.ok(mentions(a('3','v.mp4',{video:{segments:[{text:'这是 S80 Max'}]}}),'S80 Max'));
 assert.equal(mentions(a('4','公司简介.pdf'),'X60 Pro'),false);assert.equal(mentions(a('5','x'),'X6'),false,'too short to trust');
 const rel=relatedMaterials(['X60 Pro'],[{assets:[a('1','X60 Pro 安装视频.mp4',{type:'视频'}),a('4','公司简介.pdf'),a('1','X60 Pro 安装视频.mp4')]},{assets:[a('6','X60 Pro 彩页.pdf',{isCurrentVersion:false,type:'PDF'})]}]);
 assert.deepEqual(rel.map(r=>r.asset.id),['1','6']);
 const t=relatedText(['X60 Pro'],rel,'available');assert.match(t,/共 2 份/);assert.match(t,/视频：X60 Pro 安装视频\.mp4/);assert.match(t,/〔历史版本〕/);
 assert.match(relatedText(['X60 Pro'],[],'available'),/暂时没有找到写明 X60 Pro/);assert.match(relatedText(['X60 Pro'],[],'unavailable'),/没连上/);
 assert.equal(kindOf('a.MOV'),'视频');
});
test('catalogue model cards carry related materials into the answer windows',()=>{
 const ts=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.match(ts,/related=relatedMaterials\(intent\.models,found\)/);assert.match(ts,/materials:related\.map\(\(r:any\)=>r\.asset\),provider:'internal',model:'wonly-catalog'/);
});
test('product evidence shows the catalogue model and marks rule excerpts',async()=>{
 const {productEvidence,productEvidenceText}=await import('../supabase/functions/agent-conversation/product-evidence.mjs');
 const sha='c'.repeat(64);const d=productEvidence({schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[{product:'tx-60',model:'TX60',method:'rule',field:'厚度',value:'90 mm',page:2,quote:'tx-60\nThickness: 90 mm'}]},sha);
 const t=productEvidenceText(d);assert.match(t,/tx-60（画册型号 TX60）｜第2页｜厚度（规则摘录）/);
});

test('model boundaries reject other models and variants without joining fields',()=>{
 for(const name of ['X600安装手册.pdf','AX60安装手册.pdf','X60 Pro安装手册.pdf','X60-Max.pdf'])assert.equal(mentions({name},'X60'),false,name);
 assert.equal(mentions({name:'X',excerpt:'60'},'X60'),false);
 assert.ok(mentions({name:'X-60安装手册.pdf'},'X60'));
 assert.ok(mentions({name:'X60.pdf'},'X60'));
});
