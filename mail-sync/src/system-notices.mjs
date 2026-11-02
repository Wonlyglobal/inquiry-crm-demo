// Transport/account notifications are archives, not customer conversations.
// Sender identity alone is insufficient: website RFQs also use no-reply.
export function classifySystemNotice(message = {}) {
  if (message.direction !== 'inbound') return null;
  const sender = String(message.sender_email || '').toLowerCase();
  if (!/^(?:no[._-]?reply|postmaster|mailer-daemon)@/.test(sender)) return null;
  const subject = String(message.subject || '').trim();
  const body = String(message.body_text || '');
  if (/退信|undeliver(?:ed|able)|delivery (?:status notification|failure)|returned mail|mail delivery (?:failed|failure)/i.test(subject)) return 'bounce';
  if (/(?:垃圾.*(?:提醒|摘要)|(?:junk|spam).*(?:digest|notification|reminder))/i.test(subject)) return 'junk_digest';
  if (/登录.*提醒|提醒.*登录|(?:login|sign.in).*(?:alert|notification)/i.test(subject)) return 'login_notice';
  if (/RFQ|quotation|inquiry|enquiry|采购|询价|需求/i.test(subject)) return null;
  if (/(?:阿里.*提醒|提醒.*阿里|系统)/.test(subject) && /阿里|邮箱|安全/.test(body)) return 'provider_notice';
  return null;
}
