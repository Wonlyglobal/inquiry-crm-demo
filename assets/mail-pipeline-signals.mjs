// Local, explainable rules. Mail content is data, never an instruction to act.
export const MAIL_SIGNAL_VERSION = 'mail-pipeline-20261127-v1';
const address = value => String(value || '').trim().toLowerCase();
const timestamp = value => Number.isFinite(Date.parse(value || '')) ? Date.parse(value) : null;
const closed = new Set(['won', 'lost']);
export function splitMailText(value = '') {
  const lines = String(value).split('\n');
  const index = lines.findIndex((line, n) => /^\s*(?:On .{5,200}wrote:|El .{5,200}escribi[oó]:|Le .{5,200}[ée]crit\s*:|Em .{5,200}escreveu:|在.{5,200}写道[：:]|[-_]{3,}\s*(?:Original Message|原始邮件|Forwarded message)|Begin forwarded message|转发邮件|>)/i.test(line)
    || /^\s*(?:From|发件人)\s*[:：]/i.test(line) && lines.slice(n + 1, n + 7).some(next => /^\s*(?:Sent|Date|To|发送时间|日期|收件人)\s*[:：]/i.test(next)));
  return {text:(index < 0 ? lines : lines.slice(0,index)).join('\n').trim(), quoted:index < 0 ? '' : lines.slice(index).join('\n')};
}
export function signalCustomerEmails(inquiry = {}) {
  const valid = value => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value || '');
  const external = value => valid(value) && !/@(?:[^@.]+\.)*(?:wonlyglobal\.com|wonly\.net)$/i.test(value);
  const sender=address(inquiry.email_intake?.sender_email);
  if(external(sender) && !/^(?:no-?reply|notify|notifications?)@/i.test(sender))return [sender];
  const parsed=inquiry.email_intake?.parsed_data||{};
  const labelled=[...splitMailText(inquiry.original_message||'').text.matchAll(/^\s*(?:email|e-mail|邮箱)\s*[:：]\s*([^\s<>]+)/gimu)].map(match=>match[1]);
  const explicit=[parsed.email,parsed.customer_email,parsed.contact_email,...labelled].filter(value=>typeof value==='string').map(address).filter(external);
  const candidates=[...new Set(explicit)];
  // Never choose arbitrarily among multiple contacts or a quoted old signature.
  return candidates.length===1?candidates:[];
}
const quoteRequest = /\b(?:please\s+(?:send\s+(?:us\s+)?(?:a\s+)?)?(?:quote|quotation)|please\s+(?:provide|share|submit).{0,35}(?:quotation|quote|pricing)|request\s+for\s+(?:a\s+)?quot(?:e|ation)|could\s+you\s+(?:quote|provide.{0,25}(?:quotation|price))|RFQ|solicit.{0,30}cotizaci[oó]n|solicit.{0,30}cota[çc][aã]o|demande.{0,25}devis)\b|请.{0,12}报价|需要.{0,12}报价|询价/iu;
const quoteClaim = /\b(?:our\s+(?:quotation|quote)\s+(?:is|for)|(?:please\s+)?find.{0,40}(?:quotation|quote)|(?:quotation|quote)\s+(?:is\s+)?attached|we\s+(?:have\s+)?(?:sent|provided|attached).{0,35}(?:quotation|quote))\b|\b(?:our|unit|total)\s+price\s*(?:is\b|:)|(?:单价|总价|报价)\s*[:：]|报价如下|我[们司].{0,10}报价|已.{0,8}发送.{0,12}报价|附[上件].{0,12}报价单/iu;
const futureQuote = /\b(?:will|would|plan\s+to|going\s+to).{0,45}(?:quote|quotation)|\b(?:quote|quotation).{0,20}(?:will\s+follow|to\s+follow)\b|(?:将|准备|稍后|待.{0,8}后|计划).{0,15}报价/iu;
const noQuote = /\b(?:not|never|haven['’]?t|have\s+not|cannot|can['’]?t).{0,25}(?:sent|provided|attached|quote|quotation)\b|(?:尚未|没有|未能|还没|暂不|无法).{0,12}(?:报价|发送报价)/iu;
const cancelledQuote = /\b(?:do\s+not|don['’]?t|no\s+longer).{0,15}need.{0,15}(?:quote|quotation)\b|无需报价|不用报价|取消询价|不需要报价/iu;
const money = /(?:\b(?:USD|EUR|CNY|RMB|GBP|AED|SAR)\s*|[$€£¥]\s*)\d[\d,.]*(?:\s*\b(?:USD|EUR|CNY|RMB|GBP|AED|SAR))?|\b\d[\d,.]*\s*(?:USD|EUR|CNY|RMB|GBP|AED|SAR)\b/iu;
const negotiation = /\b(?:discount|too\s+expensive|reduce\s+(?:your\s+|the\s+)?price|lower\s+(?:your\s+|the\s+)?price|better\s+price|descuento|r[eé]duction\s+de\s+prix)\b|(?:价格|报价).{0,10}(?:太高|太贵|降低|再降)|折扣|降价|优惠|便宜/iu;
const acceptance = /\b(?:we|I)\s+(?:accept\s+(?:your|the)\s+(?:quotation|quote|offer)|confirm\s+(?:the|our)\s+order|would\s+like\s+to\s+place\s+(?:an|the)\s+order)\b|(?:同意|接受).{0,6}报价|确认.{0,6}下单/iu;
const noAcceptance = /\b(?:not|cannot|can['’]?t|haven['’]?t).{0,25}(?:accept|confirm|place)\b|(?:不|尚未|还没|不能).{0,6}(?:同意|接受|确认|下单)/iu;
const sampleRequest = /\b(?:please|could\s+you).{0,25}(?:send|provide).{0,20}samples?\b|请.{0,12}寄.{0,5}样|需要.{0,8}样品/iu;
const sampleSent = /\b(?:we\s+(?:have\s+)?(?:sent|shipped|dispatched).{0,25}samples?|samples?\s+(?:have\s+been|were)\s+(?:sent|shipped|dispatched))\b|样品已.{0,6}(?:寄出|发出)|已.{0,5}寄出.{0,8}样品/iu;
const futureSample = /\b(?:will|would|plan\s+to|not|haven['’]?t).{0,35}(?:send|ship|dispatch).{0,20}samples?\b|(?:将|准备|尚未|还没|计划).{0,12}(?:寄|发送).{0,8}样品/iu;
const tracking = /(?:tracking\s*(?:number|no\.?|code)?|运单号|快递单号)\s*[:：#]?\s*([a-z0-9-]{7,35})/iu;
const internal = (email, own) => own.has(address(email)) || /@(?:[^@.]+\.)*(?:wonlyglobal\.com|wonly\.net)$/i.test(email || '');
export function detectMailSignals(messages, context = {}, asOf = Date.now()) {
  const inquiry = context.inquiry || {}, own = new Set((context.ownEmails || []).map(address));
  const customers = new Set((context.customerEmails || []).map(address).filter(Boolean));
  const mayReview = context.available === true && !context.readOnly && inquiry.validity === 'valid' && inquiry.invalid_review_status !== 'pending'
    && !!inquiry.owner_id && !closed.has(inquiry.status) && (context.role === 'owner' || context.role === 'sales' && context.actorId === inquiry.owner_id);
  const signals = [];
  for (const message of messages) {
    if (message.inquiry_id !== inquiry.id || message.association_status !== 'matched') continue;
    const at = timestamp(message.direction === 'outbound' ? message.sent_at : message.received_at || message.event_at);
    if (at === null || at > asOf || /^\s*(?:fw|fwd|转发|转寄)\s*[:：]/iu.test(message.subject || '') || /draft|outbox|草稿|发件箱/iu.test(message.folder || '')) continue;
    const text = splitMailText(message.body_text).text.slice(0, 24000);
    if (!text) continue;
    const inbound = message.direction === 'inbound' && !internal(message.sender_email, own);
    const verifiedInbound = inbound && customers.has(address(message.sender_email));
    const externalRecipients = (message.recipient_emails || []).filter(email => !internal(email, own));
    const verifiedOutbound = message.direction === 'outbound' && own.has(address(message.sender_email)) && externalRecipients.length > 0
      && customers.size > 0 && externalRecipients.some(email => customers.has(address(email)));
    const live = !message.historical && !message.body_truncated && !['truncated','unavailable'].includes(message.body_status);
    const afterAssignment = timestamp(inquiry.assigned_at) !== null && at >= timestamp(inquiry.assigned_at);
    const add = (kind, label, route = null) => {
      const canAct = mayReview && live && (verifiedInbound || verifiedOutbound && afterAssignment) && !!route;
      const pattern={quote_request:quoteRequest,quote_sent:quoteClaim,negotiation,order_intent:acceptance,sample_request:sampleRequest,sample_sent:sampleSent}[kind];
      const position=Math.max(0,text.search(pattern));
      signals.push({key:`${message.id}:${kind}`, version:MAIL_SIGNAL_VERSION, inquiryId:inquiry.id, messageId:message.id,
        kind, label, at, subject:message.subject||'无主题', historical:!!message.historical, evidence:text.slice(Math.max(0,position-70),position+250), route:canAct ? route : null,
        note:message.historical ? '历史邮件仅供核对，不推动当前阶段' : !live ? '正文不完整，仅供核对' : !context.available ? '账号或阶段信息未核对，暂不提供更新入口' : closed.has(inquiry.status) ? '商机已关闭，不建议改变阶段' : '规则识别，需人工核对原文及业务凭据'});
    };
    if (inbound) {
      if (acceptance.test(text) && !noAcceptance.test(text)) add('order_intent','客户表示接受 / 下单意向，待订单核验','order');
      else if (negotiation.test(text)) add('negotiation','客户提出价格 / 折扣协商', ['quoted','sample_sent'].includes(inquiry.status) ? 'negotiation' : null);
      else if (quoteRequest.test(text) && !cancelledQuote.test(text)) add('quote_request','客户要求报价，尚不代表我方已报价','quote');
      if (sampleRequest.test(text)) add('sample_request','客户要求样品，尚不代表已寄出','sample');
    }
    if (verifiedOutbound) {
      if (quoteClaim.test(text) && !futureQuote.test(text) && !noQuote.test(text)
        && (money.test(text) || Number(message.attachment_count) > 0 && /attach|附件|附上/iu.test(text))) {
        add('quote_sent','检出我方报价发送线索，审批与报价内容待核验', ['quoted','sample_sent','negotiating'].includes(inquiry.status) ? null : 'quote');
      }
      const match = text.match(tracking);
      if (sampleSent.test(text) && !futureSample.test(text) && match && /\d/.test(match[1])) add('sample_sent','检出样品寄出线索，运单与寄样登记待核验', ['sample_sent','negotiating'].includes(inquiry.status) ? null : 'sample');
    }
  }
  const seen=new Set();
  return signals.sort((a,b) => b.at-a.at || a.key.localeCompare(b.key)).filter(signal=>{if(seen.has(signal.kind))return false;seen.add(signal.kind);return true});
}

export function paintMailSignals(host, signals, {onReview = () => {}, onOpenMessage = () => {}, partial = false, loadedCount = 0} = {}) {
  host.replaceChildren();
  const title = document.createElement('h4');title.textContent = '邮件识别与流水线核对';
  const help = document.createElement('p');help.textContent = `仅识别当前已加载的 ${loadedCount} 封邮件，每类列出最近一封，全部原文保留在下方。不自动更改阶段；报价走原审批及发送流程，寄样走原凭据登记，成交仍需订单核验。`;
  host.append(title,help);
  if (partial) {const warning=document.createElement('p');warning.textContent='部分记录或账号信息未完整读取，本轮仅供核对。';host.append(warning)}
  if (!signals.length) {const empty=document.createElement('p');empty.textContent='当前已加载邮件中暂未识别到明确信号，不代表没有报价或沟通。可加载更早记录继续核对。';host.append(empty);return}
  const labels = {quote:'核对报价流程',sample:'核对寄样登记',negotiation:'核对并带入谈判阶段',order:'核对订单与成交凭据'};
  for (const signal of signals) {
    const card=document.createElement('article');card.className='mail-pipeline-signal';
    const heading=document.createElement('b');heading.textContent=signal.label;
    const info=document.createElement('small');info.textContent=new Date(signal.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间） · '+signal.subject+' · '+signal.note;
    const evidence=document.createElement('details'),summary=document.createElement('summary'),quote=document.createElement('blockquote');summary.textContent='查看识别依据';quote.textContent=signal.evidence;evidence.append(summary,quote);
    card.append(heading,info,evidence);
    const original=document.createElement('button');original.type='button';original.className='ghost';original.textContent='查看对应邮件原文';original.onclick=()=>onOpenMessage(signal.messageId);card.append(original);
    if (signal.route && !partial) {const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent=labels[signal.route];button.onclick=()=>onReview(signal);card.append(button)}
    host.append(card);
  }
}
