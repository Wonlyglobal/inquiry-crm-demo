const DOMAINS=new Set(['hormann.com','dierre.com','oikos.it','kaadas.com','cdfdistributors.com']);
const n=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:null;
const query=v=>typeof v==='string'&&v.length<=80&&!/https?:|@|Bearer|sk-|\d{9,}|[<>\x00-\x1f]/i.test(v)?v:null;
export function competitorSeo(raw,approved,now=Date.now()){
 return (Array.isArray(raw)?raw:[]).slice(0,20).flatMap(r=>{
  if(!r||!DOMAINS.has(r.domain)||!approved.includes(r.domain)||!['official_api','authorized_export'].includes(r.source_type)||r.estimated!==true||!/^([a-z]{2}|global)$/.test(r.database||'')||!['desktop','mobile'].includes(r.device)||!day(r.period?.start)||!day(r.period?.end)||r.period.start>r.period.end||!day(r.captured_at)||Date.parse(r.captured_at)>now||r.period.end>r.captured_at)return [];
  const safePage=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname.replace(/^www\./,'')===r.domain&&!u.username&&!u.password&&!u.search&&!u.hash?u.href:null}catch{return null}};
  return [{domain:r.domain,source_type:r.source_type,database:r.database,device:r.device,period:{start:r.period.start,end:r.period.end},captured_at:r.captured_at,estimated:true,organic_traffic:n(r.organic_traffic),organic_keywords:n(r.organic_keywords),backlinks:n(r.backlinks),referring_domains:n(r.referring_domains),keywords:(Array.isArray(r.keywords)?r.keywords:[]).slice(0,20).filter(k=>k&&query(k.query)).map(k=>({query:query(k.query),position:n(k.position),previous_position:n(k.previous_position)})),top_pages:(Array.isArray(r.top_pages)?r.top_pages:[]).slice(0,20).filter(p=>p&&safePage(p.url)).map(p=>({url:safePage(p.url),traffic:n(p.traffic)}))}];
 });
}
