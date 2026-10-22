export const BUSINESS_INTAKE='https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/business-company-intake';
export function researchCompanyDomain(value){
 try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value),h=u.hostname.toLowerCase().replace(/^www\./,'');
  if(u.protocol!=='https:'||/(^|\.)(web3forms\.com|gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|live\.com|yahoo\.com|icloud\.com|qq\.com|163\.com|126\.com|proton\.me|protonmail\.com|mail\.ru|yandex\.ru|yandex\.com|rambler\.ru|wonlyglobal\.com)$/.test(h))return '';
  return h;
 }catch{return ''}
}
export function websiteFacts(data,day){
 const pages=Array.isArray(data?.website_evidence)?data.website_evidence:[];
 return pages.map(p=>({field:'profile',value:[p.title,p.description,...(p.headings||[])].filter(Boolean).join(' · ').slice(0,1200),source_url:p.url,accessed_at:day,event_date:null,verification:'official_self_report'})).filter(p=>p.value&&p.source_url);
}
export function mergePublicFacts(previous,incoming){
 const key=f=>JSON.stringify([f.field,f.value,f.source_url,f.event_date,f.verification]);
 const out=[...previous];
 for(const fact of incoming)if(!out.some(x=>key(x)===key(fact)))out.push(fact);
 return out;
}
