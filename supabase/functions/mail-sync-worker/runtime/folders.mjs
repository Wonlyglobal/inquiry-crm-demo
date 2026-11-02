const isSentFolder = (name) => /sent|已发送|发件箱/i.test(String(name || ''));

const isJunkFolder = (folder) => {
  const specialUse = String(folder?.specialUse || '').toLowerCase();
  if (specialUse === '\\junk' || specialUse === '\\spam') return true;
  const path = String(folder?.path || folder || '').trim().toLowerCase();
  return /(?:^|[./ ])(?:junk(?:\s*e-?mail)?|spam|bulk(?:\s*mail)?|垃圾邮件|垃圾箱)(?:$|[./ ])/i.test(path);
};

function selectSyncFolders(boxes, { includeJunk = false } = {}) {
  const inbox = boxes.find((box) => box.specialUse === '\\Inbox')?.path || 'INBOX';
  const sent = boxes.find((box) => box.specialUse === '\\Sent')?.path
    || boxes.find((box) => isSentFolder(box.path))?.path;
  const junk = includeJunk ? boxes.filter(isJunkFolder).map((box) => box.path) : [];
  return [...new Set([inbox, sent, ...junk].filter(Boolean))];
}

function shouldInitializeAtLatest(folder, mailboxKind) {
  return isSentFolder(folder) || (mailboxKind === 'shared_inquiry' && !isJunkFolder(folder));
}

export { isJunkFolder, selectSyncFolders, shouldInitializeAtLatest };
