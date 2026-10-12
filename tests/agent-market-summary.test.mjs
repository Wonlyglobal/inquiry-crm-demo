import test from 'node:test';import assert from 'node:assert/strict';
import {marketSummary} from '../assets/agent-market-summary.mjs';
test('market ranking excludes exact placeholder labels without changing records',()=>{
 const rows=[{target_country:'Test Region'},{target_country:'TEST COUNTRY 2'},{target_country:'测试地区'},{target_country:'德国'},{target_country:'德国'},{target_country:''}];
 const before=JSON.stringify(rows),s=marketSummary(rows);assert.equal(s.value,'德国 2');assert.match(s.note,/3条测试地区值/);assert.match(s.note,/1条未填写/);assert.equal(JSON.stringify(rows),before);
});
test('all placeholders show missing usable data, not a zero or invented country',()=>{assert.equal(marketSummary([{target_country:'Test Region'}]).value,'暂无可用市场数据')});
test('real names containing test text are retained',()=>{assert.equal(marketSummary([{target_country:'Test Region Islands'}]).value,'Test Region Islands 1')});
