export const REDACTION_VERSION = "mail-minimum-excerpts-v1";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cleanLine = (value) => String(value || "").replace(/\u0000/g, " ").replace(/[\t ]+/g, " ").trim();

function bodyExcerpt(value) {
  let text = String(value || "").replace(/\u0000/g, " ");
  const cutMarkers = [
    /(?:^|\n)\s*-{2,}\s*(?:original message|forwarded message)\s*-*/i,
    /(?:^|\n)\s*on .{1,100}wrote\s*:/i,
    /(?:^|\n)\s*(?:发件人|差し出し人)\s*[:：]/i,
    /(?:^|\n)\s*>/,
    /(?:^|\n)\s*(?:best(?: regards)?|kind regards|regards|sincerely|cheers|sent from my|此致|敬礼|祝好)[,，!！。 ]*(?:\n|$)/i,
  ];
  for (const marker of cutMarkers) {
    const match = marker.exec(text);
    if (match && match.index >= 0) text = text.slice(0, match.index);
  }
  return text.trim().slice(0, 900);
}

function chooseMessages(messages) {
  const ordered = [...messages].sort((a, b) => Date.parse(a.occurred_at || "") - Date.parse(b.occurred_at || ""));
  if (ordered.length <= 6) return ordered;
  const firstInbound = ordered.findIndex((message) => message.direction === "inbound");
  const firstOutbound = firstInbound < 0 ? -1 : ordered.findIndex((message, index) => index > firstInbound && message.direction === "outbound");
  const selected = new Map();
  if (firstInbound >= 0) selected.set(firstInbound, ordered[firstInbound]);
  if (firstOutbound >= 0) selected.set(firstOutbound, ordered[firstOutbound]);
  for (let index = ordered.length - 1; index >= 0 && selected.size < 6; index -= 1) selected.set(index, ordered[index]);
  return [...selected.entries()].sort(([a], [b]) => a - b).map(([, message]) => message);
}

function redactText(input, identities) {
  let text = input;
  const replacements = [];
  const replaceKnown = (value, label) => {
    const candidate = cleanLine(value);
    if (candidate.length < 2 || candidate.length > 120 || !text.toLocaleLowerCase().includes(candidate.toLocaleLowerCase())) return;
    text = text.replace(new RegExp(escapeRegExp(candidate), "gi"), (original) => {
      const token = `[${label}_${replacements.length + 1}]`;
      replacements.push({ token, original });
      return token;
    });
  };
  const patterns = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "EMAIL"],
    [/\bhttps?:\/\/[^\s<>]+|\bwww\.[^\s<>]+/gi, "URL"],
    [/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, "DOMAIN"],
    [/(?<![\w@])(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g, "PHONE"],
    [/\b(?:USD|EUR|GBP|CNY|RMB|AED|JPY|MXN|BRL)\s?\d[\d,]*(?:\.\d{1,2})?\b|[$€£¥]\s?\d[\d,]*(?:\.\d{1,2})?/gi, "AMOUNT"],
    [/\b(?:IBAN|SWIFT|BIC|bank account|account no\.?|passport|national id|tax id)\s*[:#-]?\s*[A-Z0-9 -]{4,}/gi, "SENSITIVE"],
    [/\b\d{6,}\b/g, "NUMBER"],
  ];
  for (const [pattern, label] of patterns) {
    text = text.replace(pattern, (original) => {
      const token = `[${label}_${replacements.length + 1}]`;
      replacements.push({ token, original });
      return token;
    });
  }
  [...new Set(identities)].sort((a, b) => b.length - a.length).forEach((identity) => replaceKnown(identity, "CONTACT"));
  text = text.replace(/\b(?:hi|hello|dear)\s+[A-Z][\p{L}'’-]{1,}(?:\s+[A-Z][\p{L}'’-]{1,}){0,2}\b/giu, (greeting) => greeting.replace(/\s+.+$/u, ""));
  return { text, replacements };
}

function normalizeWithMap(value) {
  let text = "";
  const starts = [];
  const ends = [];
  for (let index = 0; index < value.length;) {
    if (/\s/.test(value[index])) {
      const start = index;
      while (index < value.length && /\s/.test(value[index])) index += 1;
      if (text && index < value.length) {
        text += " ";
        starts.push(start);
        ends.push(index - 1);
      }
      continue;
    }
    text += value[index];
    starts.push(index);
    ends.push(index);
    index += 1;
  }
  return { text, starts, ends };
}

export function buildRedactedMailPayload(messages, knownIdentities = []) {
  const selected = chooseMessages(messages).filter((message) => message && ["inbound", "outbound"].includes(message.direction));
  const mappings = new Map();
  let totalChars = 0;
  const excerpts = [];
  for (const [index, message] of selected.entries()) {
    const originalExcerpt = bodyExcerpt(message.body_text);
    if (!originalExcerpt) continue;
    const { text, replacements } = redactText(originalExcerpt, knownIdentities);
    const remaining = Math.max(0, 4800 - totalChars);
    const excerpt = text.slice(0, Math.min(800, remaining));
    if (!excerpt) break;
    const externalId = `M${index + 1}`;
    mappings.set(externalId, { message_id: message.id, originalExcerpt, sanitizedExcerpt: excerpt, replacements });
    excerpts.push({ message_id: externalId, direction: message.direction, excerpt });
    totalChars += excerpt.length;
    if (totalChars >= 4800) break;
  }
  return { excerpts, mappings, redaction_version: REDACTION_VERSION, sent_char_count: totalChars };
}

export function restoreEvidenceQuote(externalMessageId, quote, mappings) {
  const source = mappings.get(externalMessageId);
  const sanitizedQuote = String(quote || "").trim();
  if (!source || !sanitizedQuote) return null;
  const normalizedSource = normalizeWithMap(source.sanitizedExcerpt);
  const normalizedQuote = normalizeWithMap(sanitizedQuote).text;
  const matchAt = normalizedSource.text.indexOf(normalizedQuote);
  if (!normalizedQuote || matchAt < 0) return null;
  const exactSanitizedQuote = source.sanitizedExcerpt.slice(normalizedSource.starts[matchAt], normalizedSource.ends[matchAt + normalizedQuote.length - 1] + 1);
  let restored = exactSanitizedQuote;
  for (const { token, original } of [...source.replacements].sort((a, b) => b.token.length - a.token.length)) {
    restored = restored.split(token).join(original);
  }
  if (!source.originalExcerpt.includes(restored)) return null;
  return { message_id: source.message_id, quote: restored };
}

export function redactGeneratedText(value, knownIdentities = []) {
  return redactText(String(value || ""), knownIdentities).text.replace(/\[(?:CONTACT|EMAIL|URL|DOMAIN|PHONE|AMOUNT|SENSITIVE|NUMBER)_?\d*\]/gi, "客户信息");
}
