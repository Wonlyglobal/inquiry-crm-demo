const FIELDS=new Set(['profile','company_type','products','brands','markets','projects','scale','recent_events','risk']);
const TOP=new Set(['domain','company','country','facts','identity_confirmed','publication_reviewed','expected_version','request_id']);
function text(v,max){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('invalid_text');return v.trim()}
export function publicUrl(value){
 const u=new URL(text(value,1000));
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname)||/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname))throw Error('invalid_public_url');
 return u.href;
}
export function normalizeSubmission(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!TOP.has(k)))throw Error('unsupported_fields');
 if(input.identity_confirmed!==true||input.publication_reviewed!==true)throw Error('public_review_required');
 const domain=text(input.domain,253).toLowerCase().replace(/^www\./,'');
 if(new URL(publicUrl('https://'+domain)).hostname!==domain||/(^|\.)(web3forms\.com|gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|live\.com|yahoo\.com|icloud\.com|qq\.com|163\.com|126\.com|proton\.me|protonmail\.com|mail\.ru|yandex\.ru|yandex\.com|rambler\.ru|wonlyglobal\.com)$/.test(domain))throw Error('invalid_company_domain');
 const company=text(input.company,180),country=text(input.country,100);
 if(/@|\+\d|[\r\n]/.test(company+country))throw Error('private_identity_not_allowed');
 if(/web3forms/i.test(company))throw Error('provider_is_not_company');
 if(!Number.isSafeInteger(input.expected_version)||input.expected_version<0)throw Error('expected_version_required');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id||''))throw Error('request_id_required');
 if(!Array.isArray(input.facts)||input.facts.length<1||input.facts.length>30)throw Error('facts_required');
 const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v).toISOString().slice(0,10)!==v||v>new Date().toISOString().slice(0,10))throw Error('invalid_date');return v};
 const facts=input.facts.map(f=>{
  if(!f||Object.keys(f).some(k=>!['field','value','source_url','accessed_at','event_date','verification'].includes(k))||!FIELDS.has(f.field))throw Error('invalid_fact');
  const value=text(f.value,1200);
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+\d[\d ()-]{7,}|\b(?:Bearer|ghp_|gho_|sk-)|报价|询盘原文|客户邮件|private contact/i.test(value))throw Error('private_content_not_allowed');
  if(!['official_self_report','independently_verified'].includes(f.verification))throw Error('verification_required');
  return {field:f.field,value,source_url:publicUrl(f.source_url),accessed_at:date(f.accessed_at),event_date:f.event_date?date(f.event_date):null,verification:f.verification};
 }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 if(!facts.some(f=>{const h=new URL(f.source_url).hostname.replace(/^www\./,'');return h===domain}))throw Error('official_domain_source_required');
 if(!facts.some(f=>f.value.length>=12&&f.value.toLowerCase()!==company.toLowerCase()))throw Error('substantive_public_fact_required');
 return {domain,payload:{company,country,domain,website:'https://'+domain,facts},expected_version:input.expected_version,request_id:input.request_id};
}
