import test from 'node:test';import assert from 'node:assert/strict';
import {materialHistoryAfterFailure} from '../assets/agent-material-retry.mjs';
const prior=['物料：TEST-X的尺寸'];
test('failed short follow-up retains last successful source scope without learning failed output',()=>{
 for(const q of ['那它保修多久？','尺寸呢','那它的材质是什么？','隔声是多少'])assert.deepEqual(materialHistoryAfterFailure(q,TypeError('Failed to fetch'),prior),prior);
});
test('new products, topics, auth failure, abort and empty context never inherit old scope',()=>{
 for(const q of ['TEST-Y保修多久？','新需求','它的市场竞争力如何','换一个产品'])assert.deepEqual(materialHistoryAfterFailure(q,{},prior),[]);
 for(const e of [{status:401},{status:403},{name:'AbortError'}])assert.deepEqual(materialHistoryAfterFailure('尺寸呢',e,prior),[]);
 assert.deepEqual(materialHistoryAfterFailure('尺寸呢',{},[]),[]);
});
