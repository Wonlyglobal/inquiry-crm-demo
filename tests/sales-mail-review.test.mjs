import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderReviewControls,renderReviewItems,renderReviewOriginal,reviewReason,createReviewRequests} from '../assets/sales-mail-review.mjs';
import {mailTypeTime} from '../assets/sales-mail-types.mjs';
test('review controls expose person month and disjoint review filters without broadening access',()=>{
 const h=renderReviewControls([{id:'x',full_name:'<svg onload=x>'}],'x','2026-09');
 for(const value of ['mail-review-sales','mail-review-month','mail-review-filter','全部待复核','安全跳过','AI待人工确认','已人工复核','上一页','下一页'])assert.ok(h.includes(value));
 assert.doesNotMatch(h,/<svg/);assert.match(h,/主管的未授权私人邮件不会开放/);
});
test('queue reasons distinguish safety signals from junk or factual certainty',()=>{
 assert.match(reviewReason({method:'skipped',reason:'含高敏内容'}),/高敏信号/);
 assert.match(reviewReason({method:'skipped',reason:'没有通用短语'}),/不代表垃圾邮件/);
 assert.match(reviewReason({method:'ai',category:'uncertain'}),/证据或置信度不足/);
 assert.match(reviewReason({method:'human'}),/已人工复核/);
});
test('original and review fields are escaped; original HTML never executes and no sending affordance',()=>{
 const h=renderReviewItems([{id:'a',subject:'<img src=x onerror=x>',method:'skipped',reason:'<script>',source_hash:'abc'}]);
 assert.match(h,/查看原邮件/);assert.match(h,/确认或纠正分类/);assert.doesNotMatch(h,/<img|<script/);
 const original=renderReviewOriginal({body_text:'<script>alert(1)</script>'});assert.match(original,/&lt;script&gt;/);assert.doesNotMatch(original,/<script|iframe/);
 assert.match(renderReviewOriginal({}),/原邮箱/);assert.match(renderReviewItems([]),/不代表源邮箱没有邮件/);
});
test('all displayed occurrence times use Beijing not UTC and invalid times are explicit',()=>{
 assert.match(mailTypeTime('2026-09-01T00:00:00Z'),/08:00:00.*北京时间/);assert.equal(mailTypeTime('invalid'),'时间未知');
});
test('late read tokens invalidate on filter changes and cancellation',()=>{
 const r=createReviewRequests(),a=r.begin();assert.ok(r.current(a));const b=r.begin();assert.ok(!r.current(a));assert.ok(r.current(b));r.cancel();assert.ok(!r.current(b));
});
test('queue SQL filters before stable bounded paging and uses same detail auth for originals',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261023160000_sales_mail_review_queue.sql',import.meta.url),'utf8');
 assert.match(sql,/private.sales_mail_type_scope\(auth.uid\(\),target_sales\)/);assert.match(sql,/private.sales_mail_type_detail\(auth.uid\(\),m.id\)/);
 assert.match(sql,/e.method='skipped' or \(e.method='ai' and e.category='uncertain'\)/);assert.match(sql,/order by occurred_at desc,id limit 50 offset target_offset/);
 assert.match(sql,/order by \(ev.method='human'\) desc/);assert.match(sql,/ev.source_hash=private.sales_mail_type_hash\(m\)/);
 assert.match(sql,/source_changed/);assert.match(sql,/sales_mail_type_original_viewed/);assert.doesNotMatch(sql,/update public|delete from|body_html|sender_email|recipient_emails/i);
 assert.match(sql,/from public,anon,service_role/);
});
test('frontend keeps original on-demand source freshness and error handling without writes to mail',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),start=html.indexOf('function openSalesMailReviewQueue'),end=html.indexOf('function openSalesMailTypes',start),block=html.slice(start,end);
 assert.match(block,/get_sales_mail_type_review_queue/);assert.match(block,/get_sales_mail_type_original/);assert.match(block,/review_sales_mail_type/);
 assert.match(block,/requests.current\(token\)/);assert.match(block,/original\?\.source_hash!==item.source_hash/);assert.match(block,/请先点击查看原邮件/);
 assert.match(block,/target_hash:item.source_hash/);assert.match(block,/drafts.delete/);assert.match(block,/loadDashboardEmailObservationSummary/);
 assert.doesNotMatch(block,/mark_email_message_read|functions.invoke|from\('email_messages'\)|localStorage|sessionStorage/);
});
