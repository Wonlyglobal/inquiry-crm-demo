import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {renderReviewControls,reviewReason} from '../assets/sales-mail-review.mjs';
test('all awaiting is default and definite AI remains explicitly unconfirmed',()=>{
 const h=renderReviewControls([{id:'x',full_name:'X'}],'x','2026-09');assert.match(h,/value="awaiting" selected/);assert.match(h,/AI明确建议（未确认）/);assert.match(reviewReason({method:'ai',category:'outreach'}),/必须阅读原件独立判断/);assert.match(reviewReason({}),/尚未分类或原文已变更/);
});
test('all awaiting includes unclassified, failed, all AI and human uncertain but never definite human',()=>{
 const s=fs.readFileSync(new URL('../supabase/migrations/20261023200000_all_pending_mail_review.sql',import.meta.url),'utf8');assert.match(s,/left join lateral/);assert.match(s,/when 'awaiting' then e.method is distinct from 'human' or e.category='uncertain'/);assert.match(s,/when 'suggested' then e.method='ai' and e.category<>'uncertain'/);assert.match(s,/source_drift_mail_review_queue/);assert.match(s,/private.sales_mail_type_scope\(auth.uid\(\),target_sales\)/);assert.match(s,/private.sales_mail_type_detail\(auth.uid\(\),m.id\)/);assert.match(s,/ev.source_hash=private.sales_mail_type_hash\(m\)/);assert.match(s,/order by occurred_at desc,id limit 50 offset target_offset/);assert.doesNotMatch(s,/grant |create policy|update public|delete from|body_text|body_html/i);
});
