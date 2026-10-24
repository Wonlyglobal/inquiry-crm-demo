import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {outreachProductRequest,outreachProductEvidence,buildProductReviewDraft,REVIEW_MARKER} from '../supabase/functions/agent-conversation/outreach-product-draft.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
const input={action:'outreach-product-draft',inquiry_id:'00000000-0000-4000-8000-000000000001',category:'wooden_door',recipient:'fixture@example.com',angle:'a synthetic door selection enquiry',signer:'Fixture'};
const asset={id:'fixture',name:'木门画册.pdf',versionLabel:'V1',isCurrentVersion:true,document:{status:'ready',sha256:'a'.repeat(64),pages_total:1,pages:[{page:1,chunks:['PRIVATE SYNTHETIC DOCUMENT TEXT'],facts:[]}]}};
test('draft requests are bounded and cannot add arbitrary API destinations or product types',()=>{
 assert.equal(outreachProductRequest(input).category,'wooden_door');
 for(const change of [{category:'constructor'},{category:'__proto__'},{inquiry_id:'-'.repeat(36)},{recipient:'invalid'},{angle:'x'.repeat(4001)},{angle:'invalid\x00control'},{url:'https://example.com'}])assert.throws(()=>outreachProductRequest({...input,...change}));
});
test('only current matching located evidence survives; stale, unparsed and unrelated files are gaps',()=>{
 const data={status:'available',assets:[asset]};const e=outreachProductEvidence(gateMaterialEvidence(data),'wooden_door');assert.equal(e.length,1);assert.equal(e[0].human_verified,false);
 for(const change of [{isCurrentVersion:false},{name:'木门logo.png'},{name:'智能锁.pdf'},{versionLabel:''},{document:{status:'queued'}}])assert.equal(outreachProductEvidence(gateMaterialEvidence({status:'available',assets:[{...asset,...change}]}),'wooden_door').length,0);
 assert.equal(outreachProductEvidence({status:'unavailable'},'wooden_door').length,0);
 assert.throws(()=>buildProductReviewDraft(input,[]));
});
test('customer angle is optional and accepts short, Chinese, multiline and longer notes without fake translation',()=>{
 const evidence=outreachProductEvidence(gateMaterialEvidence({status:'available',assets:[asset]}),'wooden_door');
 for(const angle of ['', '门类确认', 'Hi', '中文需求\n补充说明', '中'.repeat(600)]){
  const req=outreachProductRequest({...input,angle});assert.equal(req.angle,angle);
  const draft=buildProductReviewDraft(req,evidence);assert.equal(draft.send_allowed,false);
  assert.equal(draft.letter,'');assert.match(draft.body,/不是开发信，尚未生成客户正文/);assert.doesNotMatch(draft.body,/I would like to discuss|待审核英文正文/);
  if(angle)assert.ok(draft.body.includes(angle));
 }
});
test('shared draft contains references only, never internal filenames/excerpts or inferred specifications',()=>{
 const e=outreachProductEvidence(gateMaterialEvidence({status:'available',assets:[asset]}),'wooden_door');const r=buildProductReviewDraft(input,e,'2026-10-22T00:00:00Z');
 assert.ok(r.body.startsWith(REVIEW_MARKER));assert.equal(r.status,'pending_human_review');assert.equal(r.send_allowed,false);assert.equal(r.external_model_called,false);
 assert.match(r.body,/资料ID：fixture/);assert.doesNotMatch(r.body,/PRIVATE SYNTHETIC DOCUMENT TEXT|木门画册.pdf/);assert.doesNotMatch(r.letter,/certified|warranty|fire.rating|lead.time|MOQ/i);
 assert.equal(r.letter,'');assert.match(r.body,/三类依据齐备/);assert.doesNotMatch(r.body,/Hello,|Best regards|I would like to explore whether/);
});
test('integration uses original inquiry RLS, signed material reads and original user draft insert/readback',()=>{
 const fn=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');const start=fn.indexOf("if(input.action==='outreach-product-draft'");const block=fn.slice(start,fn.indexOf("if(input.action==='material-progress')",start));
 assert.match(block,/client\.from\('inquiries'\)/);assert.match(block,/gateMaterialEvidence\(await loadFullMaterials/);assert.match(block,/client\.from\('outreach_drafts'\)\.insert/);assert.match(block,/readback.body!==result.body/);assert.doesNotMatch(block,/providerJson|mailbox-send|letter\.foreverdoodle|admin\.from\('outreach_drafts'\)/);
 const send=readFileSync(new URL('../supabase/functions/mailbox-send/index.ts',import.meta.url),'utf8');assert.ok(send.indexOf('内部产品证据草稿不可直接发送')<send.indexOf('nodemailer.createTransport'));
 assert.match(send,/String\(draft.body\|\|''\)\.includes/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/grace-outreach-confirm/);assert.match(html,/data\.evidence\|\|\[\]\)\.map/);assert.match(html,/grace-outreach-private-evidence.*textContent=''/);
});
