import test from 'node:test';import assert from 'node:assert/strict';import {trendPointText} from '../assets/trend-tooltip.mjs';
test('tooltip identifies period and value including response denominator and no-data',()=>{
 const b={key:'2026-11',fast:2,assigned:4};assert.equal(trendPointText({title:'新增询盘',unit:'条',format:v=>v+' 条'},b,9),'2026-11\n新增询盘：9 条');
 const c={title:'首次响应率',unit:'%',format:v=>v.toFixed(1)+'%'};assert.match(trendPointText(c,b,50),/50.0%.*\n30分钟内首次联系：2 条 \/ 已分配有效询盘：4 条/);assert.match(trendPointText(c,{...b,assigned:0},0),/无已分配询盘/);
 assert.match(trendPointText({title:'成交额',unit:'CNY',format:v=>'¥'+v},b,123),/人民币/);
});
