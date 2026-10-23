import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {mailboxRankingRows,rankedMailbox,renderMailboxRankings} from '../assets/sales-mailbox-rankings.mjs';
const people=[{id:'a',full_name:'A'},{id:'b',full_name:'B'},{id:'c',full_name:'C'}];
const record={sales_id:'a',mailbox_status:'connected',last_synced_at:'2026-10-23T03:38:11Z',sync_has_error:false,development_sent:0,customer_inbound:0,mature_7d_sent:0,replied_7d:0,replied_in_period:0,replied_within_24h:0,pending_replies:0,overdue_replies:0,ai_pending_review:0};
const snapshot=()=>({month:'2026-10',people:[record,{...record,sales_id:'b',mailbox_status:'not_connected'}],daily:[{sales_id:'a',day:'2026-10-23',total_received:2,total_sent:1,reply_sent:0}]});
test('Alibaba traffic and CRM-only counts remain separate and only scoped people are returned',()=>{
 const s=snapshot();s.daily.push({sales_id:'foreign',day:'2026-10-23',total_received:999,total_sent:999,reply_sent:0});
 const rows=mailboxRankingRows(people,s,'2026-10','2026-10-23');assert.equal(rows.length,3);assert.equal(rows[0].total_received,2);assert.equal(rows[0].total_sent,1);assert.equal(rows[0].development_sent,0);assert.equal(rows[0].customer_inbound,0);assert.equal(rows[1].total_sent,null);assert.equal(rows[2].development_sent,null);
 assert.deepEqual(rankedMailbox(rows,'total_sent').map(r=>[r.name,r.rank,r.value]),[['A',1,1]]);
});
test('missing, failed, stale-period, malformed and future rows never become valid zero totals',()=>{
 for(const change of [{error:'failure'},{loading:true},{month:'2026-09'}])assert.deepEqual(mailboxRankingRows(people,{...snapshot(),...change},'2026-10','2026-10-23'),[]);
 for(const change of [{sync_has_error:true},{last_synced_at:null},{last_synced_at:'bad'},{last_synced_at:'2026-09-01T00:00:00Z'},{last_synced_at:'2027-01-01T00:00:00Z'}]){const s=snapshot();s.people[0]={...record,...change};assert.equal(mailboxRankingRows(people,s,'2026-10','2026-10-23')[0].total_sent,null)}
 const s=snapshot();s.daily.push({sales_id:'a',day:'2026-10-24',total_sent:100,total_received:100,reply_sent:100},{sales_id:'a',day:'2026-09-01',total_sent:100,total_received:100,reply_sent:100});assert.equal(mailboxRankingRows(people,s,'2026-10','2026-10-23')[0].total_sent,1);
 for(const value of [null,undefined,'',-1,'bad']){const s=snapshot();s.daily[0].total_sent=value;assert.equal(mailboxRankingRows(people,s,'2026-10','2026-10-23')[0].total_sent,null)}
 const duplicate=snapshot();duplicate.daily.push({...duplicate.daily[0]});assert.equal(mailboxRankingRows(people,duplicate,'2026-10','2026-10-23')[0].total_sent,null);
 const absent=snapshot();delete absent.daily;assert.equal(mailboxRankingRows(people,absent,'2026-10','2026-10-23')[0].total_sent,null);
});
test('ties share rank, known zero does not win, and unknown rows do not enter the denominator',()=>{
 const rows=[{name:'A',total_sent:2},{name:'B',total_sent:2},{name:'C',total_sent:1},{name:'D',total_sent:0},{name:'E',total_sent:null}];assert.deepEqual(rankedMailbox(rows,'total_sent').map(r=>r.rank),[1,1,3]);
 const s=snapshot();s.daily=[];const known=mailboxRankingRows(people,s,'2026-10','2026-10-23');assert.equal(known[0].total_sent,0);assert.equal(known[1].total_sent,null);assert.equal(rankedMailbox(known,'total_sent').length,0);
});
test('table includes all metrics, preserves no-sample states, and escapes names',()=>{
 const rows=mailboxRankingRows([{id:'a',full_name:'<img onerror=alert(1)>'}],snapshot(),'2026-10','2026-10-23');const html=renderMailboxRankings(rows,'2026-10');
 for(const label of ['阿里邮箱总发件榜','阿里邮箱总收件榜','CRM开发信','已关联客户来信','CRM回复','24小时内回复','待回复 / 超时','AI待复核','最近同步','成熟样本不足5封','不计销售评分'])assert.ok(html.includes(label),label);
 assert.doesNotMatch(html,/<img|NaN|Infinity/);assert.match(html,/&lt;img/);
});
test('ranking integration reuses role-filtered people and existing aggregate RPC without adding data access',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/mailboxRankingRows\(people,summary,month,chinaDate\(\)\)/);assert.match(html,/root.innerHTML=renderMailboxRankings\(mailboxRows,month\)\+sendBoard/);
 const module=readFileSync(new URL('../assets/sales-mailbox-rankings.mjs',import.meta.url),'utf8');assert.doesNotMatch(module,/fetch\(|\.rpc\(|localStorage|email_messages|sender_email|body_text/);
});
