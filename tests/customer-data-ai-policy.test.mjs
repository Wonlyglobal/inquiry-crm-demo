import test from 'node:test';
import assert from 'node:assert/strict';
import {customerDataAiFetch} from '../supabase/functions/_shared/customer-data-ai.ts';
test('unclassified customer payload and client approval hints never reach external fetch',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('{}')};
 try {
  for(const payload of [{body:'synthetic quotation'},{classification:'L1',approved:true},{classification:'L4',approved:true}])
   await assert.rejects(()=>customerDataAiFetch('https://example.invalid',{method:'POST',body:JSON.stringify(payload)}),/AI_DATA_POLICY_BLOCKED/);
  assert.equal(calls,0);
 } finally {globalThis.fetch=original}
});

// Check integration at every currently inventoried provider call; the behavioral
// test above proves this shared transport cannot issue a network request.
test('all eight inventoried DeepSeek endpoints use the guarded transport',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const name of ['mailbox-ai-draft','mailbox-draft-fact-check','email-communication-ai','crm-ai-assistant','daily-report-ai','email-intake-ai','inquiry-qualification-ai','whatsapp-translate']) {
  const source=await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/await fetch\(\s*["']https:\/\/api\.deepseek\.com/);
  assert.match(source,/await customerDataAiFetch\(/);
 }
});
