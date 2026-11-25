import {mailCompanyIdentity} from './mail-company-identity.mjs?v=20261125-2';
// Display-only fallback. Never persist claims or use them for automatic assignment.
export function claimedInquiryCountry(inquiry={},aliases={}){
 if(String(inquiry.target_country||'').trim())return null;
 const location=inquiry.original_message?mailCompanyIdentity(inquiry.original_message).location:'';
 const text=[inquiry.title,location].filter(Boolean).join(' ').normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
 const found=new Map();
 for(const [alias,pair] of Object.entries(aliases)){
  if(!Array.isArray(pair)||pair.length<2)continue;
  const term=alias.toLowerCase(),escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const matches=/^[a-z .'-]+$/i.test(term)?new RegExp('(^|[^a-z])'+escaped+'(?=$|[^a-z])','i').test(text):text.includes(term);
  if(matches)found.set(pair[1],pair);
 }
 if(found.size!==1)return null;
 const pair=[...found.values()][0];return {country:pair[1],label:pair[0]+' / '+pair[1],verification:'customer_claim',source:'inquiry_title'};
}
export function inquiryCountryText(inquiry,aliases,format=value=>value){
 if(String(inquiry?.target_country||'').trim())return format(inquiry.target_country);
 const claim=claimedInquiryCountry(inquiry,aliases);
 return claim?claim.label+'（客户自述）':'—';
}
