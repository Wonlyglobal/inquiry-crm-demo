import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {activityRows,renderMailActivity} from '../assets/mail-activity-dashboard.mjs';
const people=[{id:'a',full_name:'<script>'}];
const summary={month:'2026-09',activity_schema:'synced-mail-activity-v1',people:[{sales_id:'a',total:5,inbound:3,outbound:2,unknown_direction:0,linked:1,confirmed_total:2,awaiting_confirmation:3,pending:1,skipped:1,failed:0,confirmed:{business_followup:2},suggested:{outreach:1},daily:[{day:'2026-09-01',total:5,inbound:3,outbound:2,linked:1,confirmed_total:2,awaiting_confirmation:3}]}]};
test('actual activity reconciles directions, classifications, pending and links without conflating AI',()=>{
 const r=activityRows(people,summary,'2026-09')[0];assert.equal(r.available,true);assert.equal(r.confirmed_total,2);assert.equal(r.awaiting_confirmation,3);
 const v=renderMailActivity(people,summary,'2026-09','2026-10-23');assert.match(v.table,/3 \/ 2/);assert.match(v.table,/1 \/ 4/);assert.match(v.table,/一般商务跟进 2/);assert.doesNotMatch(v.table,/<script>/);assert.match(v.trend,/不计绩效/);assert.equal((v.trend.match(/<tr>/g)||[]).length,31);
});
test('unavailable, stale or inconsistent counts never render false zero',()=>{
 for(const edit of [s=>delete s.activity_schema,s=>s.month='2026-08',s=>s.people[0].linked=9,s=>s.people[0].confirmed_total=3,s=>s.people[0].daily=[],s=>s.people[0].daily.push(s.people[0].daily[0]),s=>s.people[0].inbound=-1]){let s=structuredClone(summary);edit(s);assert.equal(activityRows(people,s,'2026-09')[0].available,false);assert.match(renderMailActivity(people,s,'2026-09','2026-10-23').kpis,/未就绪，不显示为0/);}
});
test('true empty mailbox is zero and current month does not show future days',()=>{
 const s=structuredClone(summary),r=s.people[0];for(const k of ['total','inbound','outbound','linked','confirmed_total','awaiting_confirmation','pending','skipped'])r[k]=0;r.confirmed={};r.suggested={};r.daily=[];s.month='2026-10';assert.equal(activityRows(people,s,'2026-10')[0].available,true);assert.equal((renderMailActivity(people,s,'2026-10','2026-10-23').trend.match(/<tr>/g)||[]).length,24);
});
test('migration preserves original authorization and latest source event selection, adds counts only',()=>{
const s=fs.readFileSync(new URL('../supabase/migrations/20261023190000_mail_activity_dashboard.sql',import.meta.url),'utf8');assert.match(s,/source_drift_mail_summary/);assert.match(s,/private.sales_mail_type_scope\(auth.uid\(\),p.id\)/);assert.match(s,/ev.source_hash=private.sales_mail_type_hash\(m\)/);assert.match(s,/order by \(ev.method='human'\) desc/);assert.match(s,/i.is_test_data or i.data_environment<>'production'/);assert.match(s,/clock_timestamp\(\)/);assert.doesNotMatch(s,/grant |create policy|update public|delete from|insert into public/i);
});
