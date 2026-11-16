import test from 'node:test';import assert from 'node:assert/strict';
import {selectChatModel} from '../supabase/functions/agent-conversation/model-routing.mjs';
const options={standard:'qwen3.7-plus',complex:'qwen4-max'};
test('daily and complex models route without changing the input or accepting caller model',()=>{
 for(const question of ['你好','智能锁画册','它的尺寸','下载它'])assert.equal(selectChatModel({question,model:'injected'},options),'qwen3.7-plus');
 for(const question of ['做一个SWOT','市场分析','产品比较','competitive analysis'])assert.equal(selectChatModel({question},options),'qwen4-max');
 assert.equal(selectChatModel({question:'继续',history:[{role:'user',content:'市场分析'}]},options),'qwen4-max');
 assert.equal(selectChatModel({question:'你好',history:[{role:'user',content:'市场分析'}]},options),'qwen3.7-plus');
 assert.equal(selectChatModel({question:'继续',history:[{role:'user',content:'市场分析'},{role:'user',content:'你好'}]},options),'qwen3.7-plus');
 assert.equal(selectChatModel({question:'市场分析'}),'qwen-plus');
});
