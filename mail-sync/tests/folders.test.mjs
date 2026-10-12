import test from 'node:test';
import assert from 'node:assert/strict';
import { isJunkFolder, selectSyncFolders, shouldInitializeAtLatest } from '../src/folders.mjs';

test('discovers localized and standard junk folders without treating Trash as Junk', () => {
  assert.equal(isJunkFolder({ path: 'INBOX/Junk E-mail' }), true);
  assert.equal(isJunkFolder({ path: 'INBOX.垃圾邮件' }), true);
  assert.equal(isJunkFolder({ specialUse: '\\Junk', path: 'Custom' }), true);
  assert.equal(isJunkFolder({ path: 'INBOX/Trash' }), false);
  assert.equal(isJunkFolder({ path: '已删除邮件' }), false);
});

test('syncs Junk only for the shared inquiry mailbox and preserves inbox/sent discovery', () => {
  const boxes = [
    { path: 'INBOX', specialUse: '\\Inbox' },
    { path: '已发送', specialUse: '\\Sent' },
    { path: '垃圾邮件', specialUse: '\\Junk' },
    { path: 'Spam', specialUse: '\\Junk' },
    { path: '已删除', specialUse: '\\Trash' },
  ];

  assert.deepEqual(selectSyncFolders(boxes, { includeJunk: true }), ['INBOX', '已发送', '垃圾邮件', 'Spam']);
  assert.deepEqual(selectSyncFolders(boxes), ['INBOX', '已发送']);
});

test('a new shared-mailbox junk cursor backfills only the bounded recent window', () => {
  assert.equal(shouldInitializeAtLatest('INBOX', 'shared_inquiry'), true);
  assert.equal(shouldInitializeAtLatest('垃圾邮件', 'shared_inquiry'), false);
  assert.equal(shouldInitializeAtLatest('垃圾邮件', 'personal'), false);
});

test('junk-folder mail bypasses inquiry matching and stays in manual triage', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /junkFolder\?null:parseWebsiteFormMessage/);
  assert.match(source, /triage_reason:'ali_mail_junk_folder'/);
  assert.match(source, /processing_status:'pending_review'/);
  assert.match(source, /junkFolder&&connection\.mailbox_kind==='shared_inquiry'\?\{id:null,method:'shared_mailbox_junk_pending_triage'\}/);
  assert.match(source, /const nurturing=!junkFolder&&isInstantlyNurturing/);
  assert.match(source, /if\(!\(junkFolder&&connection\.mailbox_kind==='shared_inquiry'\)\)for\(const \[index,attachment\]/);
  assert.match(source, /\.eq\('message_id',message\.message_id\)/);
  assert.match(source, /shouldInitializeAtLatest\(folder,connection\.mailbox_kind\)/);
});
