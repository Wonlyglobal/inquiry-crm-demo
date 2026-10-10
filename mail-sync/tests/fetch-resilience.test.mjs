import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withSafeReadRetries } from '../src/fetch-resilience.mjs';

const networkError = (code) => new TypeError('fetch failed', { cause: Object.assign(new Error('network'), { code }) });

test('read-only requests retry a transient connection reset a bounded number of times', async () => {
  let calls = 0;
  const fetchWithRetry = withSafeReadRetries(async () => {
    calls += 1;
    if (calls < 3) throw networkError('ECONNRESET');
    return new Response(null, { status: 401 });
  }, { baseDelayMs: 0 });

  const response = await fetchWithRetry('https://example.invalid/rest/v1/', { method: 'HEAD' });
  assert.equal(calls, 3);
  assert.equal(response.status, 401);
});

test('write requests are never retried after an ambiguous network failure', async () => {
  let calls = 0;
  const fetchWithRetry = withSafeReadRetries(async () => {
    calls += 1;
    throw networkError('ECONNRESET');
  }, { baseDelayMs: 0 });

  await assert.rejects(fetchWithRetry('https://example.invalid/rest/v1/', { method: 'POST' }), /fetch failed/);
  assert.equal(calls, 1);
});

test('non-network TypeErrors are not retried', async () => {
  let calls = 0;
  const fetchWithRetry = withSafeReadRetries(async () => {
    calls += 1;
    throw new TypeError('invalid request');
  }, { baseDelayMs: 0 });

  await assert.rejects(fetchWithRetry('https://example.invalid/rest/v1/', { method: 'GET' }), /invalid request/);
  assert.equal(calls, 1);
});

test('outbox and daily report failures are isolated from the mailbox synchronization stage', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /await runOptionalCycleStage\('mail outbox',processOutbox\)/);
  assert.match(source, /await runOptionalCycleStage\('daily lead report',sendDailyLeadReport\)/);
  assert.match(source, /const \{data,error\}=await db\.from\('mailbox_connections'\)/);
});
