import test from 'node:test';
import assert from 'node:assert/strict';
import {socialWeekPeriod,socialWeekReply} from '../supabase/functions/agent-conversation/social-week.mjs';

const now = Date.parse('2026-11-23T02:43:00Z');
const question = '本周社媒情况发我';

test('uses Beijing Monday at midnight and stops at the current time', () => {
 const period = socialWeekPeriod(question, now);
 assert.equal(period.dates, '2026-11-23 至 2026-11-23');
 assert.equal(new Date(period.start).toISOString(), '2026-11-22T16:00:00.000Z');
 assert.equal(period.end, now);
 const posts = [
  {platform:'tiktok',published_at:'2026-10-26T02:00:00Z'},
  {platform:'tiktok',published_at:'2026-11-22T15:59:59.999Z'},
  {platform:'tiktok',published_at:'2026-11-22T16:00:00Z'},
  {platform:'youtube',published_at:'2026-11-23T02:43:00Z'},
  {platform:'instagram',published_at:'2026-11-23T02:43:00.001Z'},
 ];
 const result = socialWeekReply(period,{posts,all_stored_records_read:true});
 assert.match(result.answer, /有 2 条已发布记录（TikTok 1 条、YouTube 1 条）/);
 assert.doesNotMatch(result.answer, /28天|Instagram/);
 assert.match(result.answer, /出处：王力社媒系统/);
});

test('last week uses a closed local week and honors a named platform', () => {
 const period = socialWeekPeriod('上周 Instagram 发了几条',now);
 assert.equal(period.dates, '2026-11-16 至 2026-11-22');
 const posts = [
  {platform:'instagram',published_at:'2026-11-16T00:00:00+08:00'},
  {platform:'youtube',published_at:'2026-11-22T23:59:59+08:00'},
  {platform:'instagram',published_at:'2026-11-23T00:00:00+08:00'},
 ];
 assert.match(socialWeekReply(period,{posts,all_stored_records_read:true}).answer,/1 条已发布记录（Instagram 1 条）/);
});

test('distinguishes zero records, incomplete coverage and source outage', () => {
 const period = socialWeekPeriod(question, now);
 assert.match(socialWeekReply(period,{posts:[],all_stored_records_read:true}).answer,/暂无已发布记录/);
 assert.match(socialWeekReply(period,{posts:[],all_stored_records_read:false}).answer,/实际数量待核对/);
 assert.equal(socialWeekReply(period,{posts:[{platform:'youtube',published_at:null}],all_stored_records_read:true}).status,'partial');
 assert.match(socialWeekReply(period,{status:'unavailable'}).answer,/暂时读不到/);
});

test('does not replace explicit comparison, competitor and other business routes', () => {
 for (const q of ['本周和上周社媒对比','本周客户有哪些','竞品本周社媒情况','最近28天社媒情况','本周社媒数据同步']) {
  assert.equal(socialWeekPeriod(q, now),null,q);
 }
});
