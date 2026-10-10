import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answerDepthInstruction} from '../supabase/functions/agent-conversation/answer-depth.mjs';
test('depth guidance is Grace-only and does not change other personas',()=>{for(const p of ['brian','jay',undefined,'unknown'])assert.equal(answerDepthInstruction(p),'');assert.ok(answerDepthInstruction('grace').length>0)});
test('guidance is attached after route-specific system prompt for chat only',()=>{const s=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');assert.ok(s.indexOf('answerDepthInstruction(input.persona)')>s.indexOf('generalSystem(input.persona)'));assert.match(s,/if\(input.action==='chat'\)[^\n]*answerDepthInstruction\(input.persona\)/)});
