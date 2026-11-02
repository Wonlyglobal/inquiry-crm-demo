export const WEBSITE_SIGNALS_SCHEMA='website-signals-en-v1';
export const WEBSITE_SIGNALS_POLICY='public-website-evidence-en-v1';
export const SIGNAL_EMPTY={seo:'No supported product-category focus was identified in the retrieved website evidence.',projects:'No supported project-specific or application signal was identified in the retrieved website evidence.'};
export const SIGNAL_UNAVAILABLE='English summary is not available yet. Generate it from the public website evidence.';
export function isEnglishSummary(value){return typeof value==='string'&&value.trim().length>2&&value.length<=280&&!/[<>\r\n]/.test(value)&&!Array.from(value).some(c=>/\p{L}/u.test(c)&&!/[a-z]/i.test(c))}
