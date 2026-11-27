import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {originalMailTime} from '../mail-sync/src/message-time.mjs';
test('message Date preserves timezone and ignores import/current time; missing or invalid stays unknown',()=>{
 assert.equal(originalMailTime('Tue, 24 Nov 2026 13:30:00 +0300'),'2026-11-24T10:30:00.000Z');
 assert.equal(originalMailTime(null,undefined,''),null);assert.equal(originalMailTime('bad',new Date('invalid')),null);
 assert.equal(originalMailTime('bad','2026-11-24T10:30:00Z'),'2026-11-24T10:30:00.000Z');
});
test('live and history ingestion never use migration internalDate or current time as mail event time',()=>{
 const src=fs.readFileSync(new URL('../mail-sync/src/index.mjs',import.meta.url),'utf8');
 assert.match(src,/originalMailTime\(parsed.date,msg.envelope\?\.date\)/);
 assert.doesNotMatch(src,/sent_at:sent\?\(parsed.date\|\|new Date/);
 const history=fs.readFileSync(new URL('../supabase/functions/inquiry-mail-history/history.mjs',import.meta.url),'utf8');
 assert.match(history,/const time=stamp\(metadata.envelope\?\.date\)/);assert.doesNotMatch(history,/stamp\(metadata.internalDate/);
 assert.equal(src,fs.readFileSync(new URL('../supabase/functions/mail-sync-worker/runtime/index.mjs',import.meta.url),'utf8'));
});
