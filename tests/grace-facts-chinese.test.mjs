import test from 'node:test';
import assert from 'node:assert/strict';
import {factChinese,wantsFactOriginal,conciseCatalogFacts} from '../supabase/functions/agent-conversation/catalog-fact-answer.mjs';
test('Chinese paraphrases retain source numbers and units without converting marketing claims into certification',()=>{
 assert.equal(factChinese('Annual capacity: 2 million steel doors, 1 million smart locks, 4 million wooden doors and 0.5 million m² of doors and windows.'),'年产能：钢质门200万樘、智能锁100万把、木门400万樘、门窗50万平方米。');
 assert.match(factChinese("120 minutes of manipulation resistance — 12x what China's top Class C requires"),/120分钟.*画册称.*12倍/);
 assert.equal(factChinese('Unknown claim'),null);
});
test('original is opt-in and negated requests stay Chinese',()=>{
 assert.equal(wantsFactOriginal('请看原文'),true);
 assert.equal(wantsFactOriginal('不要英文原文，只用中文'),false);
 const text='Patented Cylindrical Lock Core — Above Class C';
 const c={facts:[{topic:'lock_core',catalog:'c2',page:62,text}],pages:[{catalog:'c2',page:62,text}],sources:[{id:'c2',edition:'2026-08'}]};
 const intent={kind:'facts',topics:['lock_core']};
 const zh=conciseCatalogFacts(intent,c,'零售画册第62页锁芯等级');
 assert.match(zh,/专利圆柱锁芯.*高于C级/);assert.doesNotMatch(zh,/Patented|Above Class/);assert.match(zh,/PDF第62页/);
 assert.match(conciseCatalogFacts(intent,c,'零售画册第62页锁芯原文'),/Patented/);
});
