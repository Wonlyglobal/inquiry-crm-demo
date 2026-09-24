import test from 'node:test';import assert from 'node:assert/strict';
import {courtesyReply,spokenReply,materialSpokenReply,conversationStyle} from '../supabase/functions/agent-conversation/conversation-style.mjs';
test('courtesy only matches whole social turn; never swallows a task',()=>{
 assert.equal(courtesyReply('谢谢 Grace！'),'不客气，随时为你效劳。');
 for(const q of ['谢谢，帮我分析防火门','感谢客户的方法','你好，请查资料'])assert.equal(courtesyReply(q),null);
});
test('speech uses short opening without reading full report or links',()=>{
 assert.equal(spokenReply('建议先核对市场。再确认认证范围。\n\n详细报告：'+'明细'.repeat(500)),'建议先核对市场。再确认认证范围。');
 assert.ok(spokenReply('很长'.repeat(200)).length<220);assert.doesNotMatch(spokenReply('请看 https://example.com 。'),/https/);
});
test('material speech never leaks internal text or falsely claims a match',()=>{
 const d={status:'available',assets:[{name:'SECRET',text:'CONFIDENTIAL'}]};assert.doesNotMatch(materialSpokenReply(d),/SECRET|CONFIDENTIAL/);
 assert.match(materialSpokenReply({status:'available',assets:[]}),/没有找到/);assert.match(materialSpokenReply({status:'unavailable'}),/没能取得/);
 assert.match(conversationStyle,/不得声称从声线识别/);
});
