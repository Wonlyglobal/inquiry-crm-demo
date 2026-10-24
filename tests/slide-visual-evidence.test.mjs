import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSlideVisual,slideVisualText} from '../supabase/functions/agent-conversation/slide-visual.mjs';
import {normalizeDocument,documentEvidence} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {resolveMaterialTurn,conciseMaterialAnswer} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
import {materialFields} from '../supabase/functions/agent-conversation/product-input.mjs';
const sha='a'.repeat(64),render='b'.repeat(64);
// Entire fixture is synthetic. No company product or material content.
const visual={schema:'internal-slide-visual-v1',source_sha256:sha,status:'partial',read_at:'2026-01-01T00:00:00Z',pages_total:2,pages_rendered:2,pages_observed:1,pages_ocr:2,native_charts:0,native_tables:1,pages:[{page:2,render_sha256:render,status:'read',description:'Test page shows a diagram; dimensions are unreadable.',ocr_chunks:['Test Door\nSynthetic label'],table_chunks:['A1=Test'],uncertainties:['Small labels remain unverified.']}]};
test('visual evidence requires exact source and render provenance',()=>{
 assert.equal(normalizeSlideVisual({...visual,source_sha256:'c'.repeat(64)},sha),null);
 assert.equal(normalizeSlideVisual({...visual,schema:'anything'},sha),null);
 assert.equal(normalizeSlideVisual({...visual,pages:[{...visual.pages[0],render_sha256:'wrong'}]},sha).pages.length,0);
 assert.equal(normalizeSlideVisual(visual,sha).human_verified,false);
});
test('normalization bounds and ignores machine verification claims',()=>{
 const v=normalizeSlideVisual({...visual,human_verified:true,pages:[{...visual.pages[0],description:'x'.repeat(900),human_verified:true,ocr_chunks:Array(8).fill('y'.repeat(1000))}]},sha);
 assert.equal(v.pages[0].description.length,500);assert.equal(v.pages[0].ocr_chunks.length,3);assert.equal(v.pages[0].ocr_chunks[0].length,850);assert.equal(v.pages[0].human_verified,false);
});
test('visual answers separate observations, OCR, native table and missing evidence',()=>{
 const d=normalizeDocument({sha256:sha,status:'partial',visual_understanding:visual,pages:[]});
 const text=documentEvidence(d);
 for(const s of ['2/2','视觉模型读取 1 页','机器观察','非产品参数事实','同页OCR','同页原生表格','Small labels','不自动归属'])assert.ok(text.includes(s));
 assert.ok(slideVisualText(d.visual_understanding).includes('这不排除图片中含图示'));
});
test('specific visual question does not substitute native parameter findings',()=>{
 const doc=normalizeDocument({sha256:sha,status:'partial',visual_understanding:visual,pages:[]});
 const a=conciseMaterialAnswer({read_at:'now',assets:[{name:'Synthetic file',isCurrentVersion:true,updatedAt:'then',document:doc}]},'物料：Test Door 图片和图表');
 assert.ok(a.includes('Test page shows'));assert.ok(a.includes('更新时间：then'));assert.ok(a.includes('本次读取：now'));assert.ok(a.includes('未人工核验'));
 const no=conciseMaterialAnswer({assets:[{name:'Synthetic file',document:{}}]},'物料：Test Door 图示');assert.ok(no.includes('尚未取得'));assert.ok(no.includes('不能据此猜测'));
});
test('literal color and lock-option fields support followups',()=>{
 assert.deepEqual(materialFields('颜色 colour'),['颜色']);assert.deepEqual(materialFields('Lock Options 锁选项'),['锁选项']);
 const history=['物料：Synthetic_Long_Document_Product_Information_20260101_0001 TEST-X404 颜色'];
 const turn=resolveMaterialTurn('那它的来源和页码呢？',history);
 assert.ok(turn.question.includes('Synthetic_Long_Document_Product_Information_20260101_0001'));assert.ok(turn.question.includes('TEST-X404'));assert.equal(turn.clarification,undefined);
});
