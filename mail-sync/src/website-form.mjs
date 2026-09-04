const clean = (value) => String(value || '').trim();

const genericEmailDomains = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'qq.com', '163.com', '126.com',
]);

const journeyEventNames = new Set([
  'cta_click', 'form_open', 'form_start', 'form_submit', 'generate_lead',
  'form_error', 'form_abandon', 'contact_click',
]);

const safeText = (value, max = 160) => clean(value).replace(/[\r\n\t]+/g, ' ').slice(0, max);

export function parseWebsiteJourney(fields = {}) {
  const raw = clean(fields.journey_events || fields.user_journey || fields.journey_path);
  if (!raw) return [];
  let items;
  try { items = JSON.parse(raw); }
  catch { items = raw.split(/\s*(?:→|->|>)\s*/).filter(Boolean).map((event_name) => ({ event_name })); }
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).map((item, index) => {
    const eventName = safeText(item?.event_name || item?.event || item, 40).toLowerCase();
    if (!journeyEventNames.has(eventName)) return null;
    const eventAt = item?.event_at || item?.timestamp || null;
    return {
      session_ref: safeText(item?.session_ref || fields.journey_session, 80) || null,
      event_name: eventName,
      event_at: eventAt && !Number.isNaN(Date.parse(eventAt)) ? new Date(eventAt).toISOString() : null,
      sequence_no: index + 1,
      page_path: safeText(item?.page_path || item?.page, 300) || null,
      page_title: safeText(item?.page_title, 160) || null,
      cta_name: safeText(item?.cta_name || item?.cta, 120) || null,
      section_name: safeText(item?.section_name || item?.section, 120) || null,
      language: safeText(item?.language || fields.language, 20) || null,
      product_context: safeText(item?.product_context || fields.product_context, 160) || null,
      error_type: eventName === 'form_error' ? safeText(item?.error_type, 80) || null : null,
    };
  }).filter(Boolean);
}

export function parseWebsiteFormMessage(message) {
  const subject = clean(message?.subject);
  const sender = clean(message?.sender_email).toLowerCase();
  const body = String(message?.body_text || '').replace(/\r\n?/g, '\n');
  const looksLikeWebsiteForm = /website\s+(enquiry|inquiry)/i.test(subject)
    || sender === 'notify@web3forms.com'
    || /(^|\n)source\s*:\s*(quote_modal|website|web_form)\s*($|\n)/i.test(body);
  if (!looksLikeWebsiteForm) return null;

  const fields = {};
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*([a-z][a-z0-9_ -]{0,50})\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    fields[match[1].trim().toLowerCase().replace(/[ -]+/g, '_')] = clean(match[2]);
  }

  const email = clean(fields.email).toLowerCase();
  if (!email || !email.includes('@')) return null;
  const emailDomain = email.split('@')[1] || '';
  const companyName = clean(fields.company) || emailDomain || email;
  const companyDomain = emailDomain && !genericEmailDomains.has(emailDomain) ? emailDomain : null;
  const product = clean(fields.interests || fields.interest || fields.product || fields.product_category);
  const sourceDetail = clean(fields.source) || 'website_form';
  const journeyEvents = parseWebsiteJourney(fields);

  return {
    name: clean(fields.name),
    companyName,
    companyDomain,
    jobTitle: clean(fields.job_title || fields.title),
    country: clean(fields.country),
    email,
    phone: clean(fields.phone),
    product,
    quantity: clean(fields.volume || fields.quantity),
    timeline: clean(fields.timeline),
    businessType: clean(fields.business_type),
    customerMessage: clean(fields.message),
    sourceDetail,
    journeyEvents,
    rawFields: fields,
  };
}

export function websiteInquiryTitle(form) {
  const identity = [form.companyName, form.product].filter(Boolean).join(' · ');
  return identity ? `官网询盘：${identity}` : '官网询盘';
}
