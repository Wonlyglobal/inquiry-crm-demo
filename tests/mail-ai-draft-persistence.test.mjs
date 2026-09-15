import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915230000_persist_mail_ai_drafts.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../supabase/functions/mailbox-ai-draft/index.ts',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('./production-mail-ai-draft-rollback.sql',import.meta.url),'utf8');

test('AI mail drafts are owner-private and recorded with an audit in one service workflow',()=>{
  assert.match(sql,/create table if not exists public\.email_ai_drafts/);
  assert.match(sql,/using\(author_id=\(select auth\.uid\(\)\)\)/);
  assert.match(sql,/record_email_ai_draft/);
  assert.match(sql,/mail_ai_draft_generated/);
  assert.match(sql,/grant execute on function public\.record_email_ai_draft[^;]+to service_role/s);
});

test('mail AI worker persists a draft before returning it to the browser',()=>{
  assert.match(worker,/db\.rpc\("record_email_ai_draft"/);
  assert.match(worker,/if\(draftError\|\|!draftId\)throw/);
  assert.match(worker,/draft:\{id:draftId,subject,body:draftBody/);
});

test('mail composer can recover recent persisted AI drafts',()=>{
  assert.match(html,/id="mail-ai-history"/);
  assert.match(html,/from\("email_ai_drafts"\).*\.eq\("author_id",profile\.id\)/s);
  assert.match(html,/data-restore-ai-draft/);
});

test('production AI draft persistence acceptance check is rollback-only',()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/AI_DRAFT_NOT_RECORDED/);
  assert.match(rollback,/^rollback;/m);
});
