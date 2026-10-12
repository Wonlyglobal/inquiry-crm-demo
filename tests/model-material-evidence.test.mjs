import test from 'node:test';import assert from 'node:assert/strict';
import {modelMaterialEvidence} from '../supabase/functions/agent-conversation/model-material-evidence.mjs';
const quote='TEST-1 厚度 50mm；TEST-1 MAX 厚度 70mm';
const result={status:'available',assets:[{id:'a',name:'合成',document:{status:'ready',sha256:'a'.repeat(64),pages_total:1,pages:[{page:1,chunks:[quote]}],product_understanding:{status:'processed',findings:[{product:'TEST-1',field:'厚度',value:'50mm',quote:'TEST-1 厚度 50mm',page:1},{product:'TEST-1 MAX',field:'厚度',value:'70mm',quote:'TEST-1 MAX 厚度 70mm',page:1}]}}}]};
test('only requested exact model facts survive mixed-model document',()=>{const text=modelMaterialEvidence(['TEST-1'],[result]);assert.match(text,/50mm/);assert.doesNotMatch(text,/70mm|TEST-1 MAX/);assert.match(text,/产品专家档案/)});
test('unsupported quotes and unknown aliases do not become facts',()=>{const bad=structuredClone(result);bad.assets[0].document.product_understanding.findings[0].value='90mm';assert.doesNotMatch(modelMaterialEvidence(['TEST-1'],[bad]),/90mm/);assert.match(modelMaterialEvidence(['TEST1'],[result]),/没有通过原文校验/)});
test('failed lookup is not zero coverage',()=>assert.match(modelMaterialEvidence(['TEST-1'],[{status:'unavailable'}]),/读取失败/));
