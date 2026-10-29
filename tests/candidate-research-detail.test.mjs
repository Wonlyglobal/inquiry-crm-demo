import test from 'node:test';import assert from 'node:assert/strict';
import {candidateResearchDetail} from '../assets/candidate-research-detail.mjs';
const item={id:'synthetic',company:'<img src=x>',country:'Ghana',website:'https://example.com',source_url:'https://example.com/about',state:'pending',snapshot_date:'2026-08-01',source_kind:'company_site_candidate'};
test('candidate detail separates evidence, review and missing research without creating facts',()=>{
 const html=candidateResearchDetail(item);assert.match(html,/来源与公司身份/);assert.match(html,/当前核验记录/);assert.match(html,/尚未由候选接口返回/);assert.match(html,/2026-08-01/);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/detail-review-candidate/);
 assert.match(candidateResearchDetail({...item,can_review:true}),/detail-review-candidate/);
});
test('masked candidates never disclose details, and unsafe source links stay inert',()=>{
 assert.equal(candidateResearchDetail({...item,masked:true}),'');assert.equal(candidateResearchDetail(null),'');
 assert.doesNotMatch(candidateResearchDetail({...item,website:'javascript:alert(1)',source_url:'https://mail.ru'}),/href="(?:javascript|https:\/\/mail.ru)/);
});
test('full original workspace is explicit, fixed-origin, lazy and never given CRM identity',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../company-candidates.html',import.meta.url),'utf8');
 const page=await readFile(new URL('../assets/company-candidates-page.mjs',import.meta.url),'utf8');
 assert.match(html,/id="business-research-frame"[^>]+referrerpolicy="no-referrer"/);
 assert.doesNotMatch(html,/id="business-research-frame"[^>]+src=/);
 const handler=page.slice(page.indexOf("$('#open-business-workspace').onclick="),page.indexOf('let db,view'));
 assert.match(handler,/frame.src='https:\/\/business.foreverdoodle.com\/'/);
 assert.doesNotMatch(handler,/postMessage|token|session|profile|company|encodeURIComponent|fetch\(/);
 assert.match(page,/item.masked\)return/);
});
