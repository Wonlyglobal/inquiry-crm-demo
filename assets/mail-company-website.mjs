import {researchCompanyDomain} from './business-public-research.mjs';

// Customer-supplied candidate only: never derive a website from an email address.
export function mailCompanyWebsite(text='',companyName=''){
 const source=String(text).replace(/&amp;/gi,'&');
 const normalize=value=>{
  const raw=String(value).trim().replace(/[),.;，。；]+$/g,'');
  if(raw.includes('@'))return '';
  try{
   const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return '';
   const host=url.hostname.toLowerCase();
   if(!host.includes('.')||/^[\d.]+$/.test(host)||/(^|\.)(localhost|local|internal|example\.com|facebook\.com|linkedin\.com|instagram\.com|youtube\.com|youtu\.be|tiktok\.com|wa\.me|google\.com|bing\.com|bit\.ly|tinyurl\.com|aliyun\.com|alimail\.com)$/.test(host))return '';
   return researchCompanyDomain('https://'+host);
  }catch{return ''}
 };
 const labelled=[...source.matchAll(/(?:^|\n)\s*(?:company[ _](?:website|domain)|website(?:[ _]url)?|web|官网|网站|公司官网)\s*[:：]\s*(\S+)/gi)].map(m=>normalize(m[1])).filter(Boolean);
 const unique=values=>[...new Set(values)];
 const explicit=unique(labelled);
 const choose=(candidates,origin)=>{
  const tokens=String(companyName).toLowerCase().match(/[a-z0-9]{3,}/g)||[];
  const words=tokens.filter(w=>!['company','limited','ltd','llc','inc','group','international','trading','corp','corporation','the'].includes(w));
  const ranked=candidates.map(domain=>({domain,score:(explicit.includes(domain)?10:0)+words.reduce((n,w)=>n+(domain.split('.').slice(0,-1).join('').replace(/-/g,'').includes(w)?4:0),0)})).sort((a,b)=>b.score-a.score||a.domain.localeCompare(b.domain));
  const uniqueBest=ranked.length===1||(ranked[0]?.score>ranked[1]?.score&&ranked[0].score>0);
  return {domain:uniqueBest?ranked[0]?.domain||'':'',candidates:ranked.map(x=>x.domain),ranking:ranked,source:origin,status:uniqueBest&&ranked.length?'candidate':ranked.length?'conflict':'missing'};
 };
 // Only URL-shaped tokens; bare domains inside email addresses cannot match.
 const links=unique([...source.matchAll(/(?:https?:\/\/|\bwww\.)[^\s<>"']+/gi)].filter(m=>!/[\w@]/.test(source[m.index-1]||'')).map(m=>normalize(m[0])).filter(Boolean));
 return choose(unique([...explicit,...links]),explicit.length?'body_website_field':'body_or_signature_url');
}
