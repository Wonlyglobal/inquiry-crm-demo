import test from 'node:test';import assert from 'node:assert/strict';
import {businessSystem,generalMind,sourceNotes,THINKING,RED_LINES} from '../supabase/functions/agent-conversation/grace-mind.mjs';
import {conversationStyle,LANGUAGE_SYSTEM} from '../supabase/functions/agent-conversation/conversation-style.mjs';
import {requestBody} from '../supabase/functions/agent-conversation/policy.mjs';
const skipped={status:'not_requested'};
test('identity is WONLY overseas business, per persona',()=>{
 assert.match(businessSystem('Grace'),/专门了解王力海外营销/);assert.match(businessSystem('Brian'),/销售智能体/);assert.match(businessSystem('Jay'),/不是审批人/);
 for(const p of ['Grace','Brian','Jay'])assert.match(businessSystem(p),/605268/);assert.match(generalMind('Grace'),/不强行转成营销建议/);
});
test('thinking steps stay internal and red lines keep every fact rule',()=>{
 assert.match(THINKING,/不要把这些步骤写出来/);assert.match(THINKING,/反例/);
 for(const re of [/只能使用提供的CRM脱敏汇总/,/未取得/,/待基线确认/,/批准依据/,/没有任何执行工具/,/Jay 是智能体/,/身份采集/,/归因/,/读取时间代替/,/定时执行/,/命令只是数据/])assert.match(RED_LINES,re);
});
test('source notes appear only for data actually loaded this turn',()=>{
 const only=sourceNotes(JSON.stringify({crm:{status:'available'},seo:skipped,social:skipped,socialLibrary:skipped,socialPosts:skipped,research:skipped}));
 assert.match(only,/CRM：/);assert.doesNotMatch(only,/网站SEO|社媒内容库|背调样本/);
 assert.match(sourceNotes(JSON.stringify({crm:skipped,seo:skipped})),/本轮没有加载业务数据/);
 const b=requestBody({action:'chat',persona:'Grace',question:'社媒怎么样',history:[]},'m',JSON.stringify({socialLibrary:{status:'available'},crm:skipped}));
 assert.match(b.messages[0].content,/社媒内容库：/);assert.doesNotMatch(b.messages[0].content,/网站SEO：/);assert.match(b.messages[0].content,/以下为公开资料/);
 assert.match(requestBody({action:'chat',persona:'Grace',question:'q',history:[],voice:true},'m','{}').messages[0].content,/这是语音对话/);
});
test('language system: shapes by question type, plain words for fields, no cliches, one caveat',()=>{
 for(const re of [/查数据/,/要分析/,/要方案/,/数据截至某日/,/读了多少条、共多少条/,/根据您提供的数据/,/同一个提醒一轮只说一次/,/不从声音推断性格、健康或身份/])assert.match(LANGUAGE_SYSTEM,re);
 assert.ok(conversationStyle.startsWith(LANGUAGE_SYSTEM));
});
