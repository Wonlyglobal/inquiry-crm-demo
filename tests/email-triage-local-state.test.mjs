import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const categorySource=html.slice(html.indexOf('      function emailIntakeCategory('),html.indexOf('      function emailLocalFields('));
const classify=new Function(`${categorySource};return emailIntakeCategory;`)();
const localSource=html.slice(html.indexOf('      function emailLocalFields('),html.indexOf('      function aiTriageCard('));
const [fields,render]=new Function('isWebsiteFormServiceCompany','esc',`${localSource};return [emailLocalFields,emailLocalEvidenceCard];`)(x=>/web3forms/i.test(x),x=>String(x).replaceAll('<','&lt;').replaceAll('>','&gt;'));
test('converted or linked mail never appears as pending even when triage label is empty',()=>{
 assert.equal(classify({inquiry_id:'lead',processing_status:'converted',triage_label:null}),'linked');
 assert.equal(classify({inquiry_id:'lead',processing_status:'pending_review',triage_label:null}),'linked');
 assert.equal(classify({processing_status:'pending_review',triage_label:null}),'pending');
 assert.equal(classify({processing_status:'rejected'}),'excluded');
 assert.equal(classify({inquiry_id:'lead',trashed_at:'today'}),'trash');
});
test('local extraction uses explicit body fields, omits provider identity and escapes customer HTML',()=>{
 const body='name: Example Buyer\ncompany: Web3Forms\ncountry: Belarus\nemail: buyer@example.test\nmessage: <img src=x onerror=alert(1)>\njourney_events: [{"private":"not a demand field"}]';
 assert.ok(!fields(body).some(([label])=>label==='公司'));
 const rendered=render({body_text:body,inquiry_id:'lead'});
 assert.match(rendered,/未调用外部 AI/);assert.match(rendered,/&lt;img/);assert.doesNotMatch(rendered,/<img|journey_events|email-ai-analyze/);
 assert.match(rendered,/打开关联询盘/);
});
test('missing form fields are disclosed instead of invented; local panel has no transport or writes',()=>{
 assert.deepEqual(fields('ordinary unstructured message'),[]);
 assert.match(render({body_text:'ordinary message'}),/未找到明确/);
 assert.doesNotMatch(localSource,/fetch\(|functions.invoke|supabase|\.rpc\(/);
});
