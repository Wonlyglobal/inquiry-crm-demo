import test from 'node:test';
import assert from 'node:assert/strict';
import {developmentMetrics,sumDevelopmentMetrics,metricRate} from '../assets/lead-development-metrics.mjs';
test('reference formulas use total sent for reply denominator and read minus replied for unreplied',()=>{
 const m=developmentMetrics({ledger_count:40,goals:{lead_target:200,send_target:140},actuals:{sent:50,invalid:20,opened:6,replied:3}});
 assert.deepEqual(m,{lead_target:200,actual:40,collection_rate:20,send_target:140,sent:50,invalid:20,success:30,success_rate:60,unread:24,opened:6,unreplied:3,replied:3,reply_rate:6});
});
test('unknown stays unknown, verified zero is zero and zero denominator is unavailable',()=>{
 const m=developmentMetrics({ledger_count:0,goals:{lead_target:0},actuals:{sent:0,invalid:0,replied:0}});
 assert.equal(m.actual,0);assert.equal(m.success,0);assert.equal(m.opened,null);assert.equal(m.unread,null);assert.equal(m.reply_rate,null);assert.equal(m.collection_rate,null);
 assert.equal(metricRate(0,100),0);assert.equal(metricRate(null,100),null);
});
test('historical aggregates replace only the report actual; they never add to ledger',()=>{
 const m=developmentMetrics({ledger_count:3,actuals:{lead_mode:'manual',manual_leads:60}});assert.equal(m.actual,60);
 assert.equal(developmentMetrics({ledger_count:3,actuals:{lead_mode:'ledger',manual_leads:60}}).actual,3);
});
test('subtotal is weighted from raw counts and incomplete fields do not become zero',()=>{
 const rows=[{ledger_count:1,goals:{lead_target:10},actuals:{sent:10,invalid:0,opened:4,replied:2}},{ledger_count:9,goals:{lead_target:10},actuals:{sent:90,invalid:10,opened:40,replied:9}}];
 const m=sumDevelopmentMetrics(rows);assert.equal(m.collection_rate,50);assert.equal(m.reply_rate,11);assert.equal(m.success_rate,90);
 rows[1].actuals.opened=null;assert.equal(sumDevelopmentMetrics(rows).opened,null);assert.equal(sumDevelopmentMetrics(rows).unreplied,null);assert.equal(sumDevelopmentMetrics(rows).reply_rate,11);
 assert.equal(sumDevelopmentMetrics([]).sent,null);
});
test('corrupt or conflicting values never render negative derived counts',()=>{
 assert.equal(developmentMetrics({actuals:{sent:1,invalid:2,opened:3,replied:4}}).success,null);
 assert.equal(developmentMetrics({actuals:{sent:'10'}}).sent,null);
});
