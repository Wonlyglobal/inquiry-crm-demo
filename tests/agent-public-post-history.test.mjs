import test from 'node:test';import assert from 'node:assert/strict';import {validateDialogue} from '../supabase/functions/agent-conversation/policy.mjs';
const input={action:'chat',persona:'Grace',question:'读取社媒第2页',history:[{role:'assistant',content:'https://www.tiktok.com/@wonlyglobal/video/7686483112536198414'}]};
test('public video identifiers do not block followup pages',()=>assert.doesNotThrow(()=>validateDialogue(input)));
test('unrelated numeric and credential identifiers remain blocked',()=>{for(const content of ['1234567890123456','https://evil.example/1234567890123456','密码: abc'])assert.throws(()=>validateDialogue({...input,history:[{role:'user',content}]}))});
