import test from 'node:test';import assert from 'node:assert/strict';
import {productEvidence,productEvidenceText} from '../supabase/functions/agent-conversation/product-evidence.mjs';
const sha='a'.repeat(64);const raw={schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[{product:'TEST-X',field:'材质',value:'钢',page:1,quote:'TEST-X 使用钢材',human_verified:true}]};
test('semantic evidence rejects mismatched document versions',()=>{assert.equal(productEvidence(raw,'b'.repeat(64)),null);assert.equal(productEvidence(raw,''),null)});
test('semantic evidence never upgrades machine output to verified facts',()=>{const d=productEvidence(raw,sha);assert.equal(d.findings[0].human_verified,false);assert.match(productEvidenceText(d),/未人工核验/);assert.match(productEvidenceText(d),/第1页/)});
test('malformed product attribution is discarded',()=>{assert.equal(productEvidence({...raw,findings:[{...raw.findings[0],product:'OTHER'}]},sha).findings.length,0)});
