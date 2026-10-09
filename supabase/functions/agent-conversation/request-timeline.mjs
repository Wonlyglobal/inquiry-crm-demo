// Grace request timeline (owner, 2026-09-28): validates what the browser asks to store. Only small
// descriptors are kept (no signed links, file bodies or contact fields), so history windows re-open
// through the same permission checks as the first time.
import {CRM_VIEWS,safeUrl,evidenceById} from './agent-actions.mjs';
import {priceGroups} from './competitor-brief.mjs';
import {CATEGORIES,PUBLIC_EVIDENCE} from './public-research.mjs';
const EVIDENCE_COMPANIES=new Set(PUBLIC_EVIDENCE.map(e=>e.company));

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|00)\d[\d \-]{7,}|\b\d{9,}\b|sk-[A-Za-z0-9_-]{8,}|(?:密码|密钥|口令)/i;
const VIEWS=new Set(CRM_VIEWS.map(([v])=>v));
const text=(v,max)=>{const s=String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();return s.slice(0,max)};

export function timelineWindow(w){
 if(!w||typeof w!=='object')return null;
 switch(w.kind){
  case 'catalog':return /^c[1-4]$/.test(w.catalog)&&Number.isInteger(w.page)&&w.page>=1&&w.page<=200?{kind:'catalog',catalog:w.catalog,page:w.page,label:text(w.label,80)}:null;
  case 'crm_view':return VIEWS.has(w.view)?{kind:'crm_view',view:w.view,label:text(w.label,40)}:null;
  case 'crm_record':return UUID.test(w.id||'')?{kind:'crm_record',id:w.id,label:text(w.label,80)}:null;
  case 'evidence':return evidenceById(w.id)?{kind:'evidence',id:w.id}:null;
  case 'search':{
   const query=text(w.query,120);if(query.length<2||SENSITIVE.test(query))return null;
   const sources=(Array.isArray(w.sources)?w.sources:[]).map(s=>({title:text(s?.title,200),url:safeUrl(s?.url)})).filter(s=>s.url).slice(0,8);
   return {kind:'search',query,sources};
  }
  case 'chart':if(w.source==='crm'){const question=text(w.question,200);return ['sales','risk','stages','sources','summary','quoted'].includes(w.metric)&&question&&!SENSITIVE.test(question)?{kind:'chart',source:'crm',metric:w.metric,question,label:text(w.label,60)}:null}
   return /^[A-Z]{2}$/.test(w.market||'')&&CATEGORIES[w.category]?{kind:'chart',market:w.market,category:w.category,companies:(Array.isArray(w.companies)?w.companies:[]).filter(c=>EVIDENCE_COMPANIES.has(c)).slice(0,6),label:text(w.label,60)}:null;
  case 'material':return UUID.test(w.id||'')?{kind:'material',id:w.id,name:text(w.name,120)}:null;
  default:return null;
 }
}

export function validateTimelineEntry(input){
 if(!['Grace','Brian','Jay'].includes(input?.persona))throw Error('智能体无效');
 const question=text(input.question,500);if(!question)throw Error('需求内容为空');
 if(!['done','failed'].includes(input.status))throw Error('状态无效');
 const steps=(Array.isArray(input.steps)?input.steps:[]).map(s=>text(s,40)).filter(Boolean).slice(0,12);
 const windows=(Array.isArray(input.windows)?input.windows:[]).map(timelineWindow).filter(Boolean).slice(0,8);
 return {p_persona:input.persona,p_question:question,p_route:text(input.route,40)||null,p_status:input.status,p_steps:steps,p_windows:windows};
}

// Stored rows come back with evidence expanded from the bundled evidence file (never from the row).
export function expandTimeline(rows){
 return (Array.isArray(rows)?rows:[]).map(r=>({...r,windows:(r.windows||[]).map(w=>w.kind==='evidence'?{...w,card:evidenceById(w.id)}:w.kind==='chart'&&w.source!=='crm'?{...w,chart:priceGroups({companies:w.companies||[],categories:[w.category],markets:[w.market]})[0]||null}:w).filter(w=>(w.kind!=='evidence'||w.card)&&(w.kind!=='chart'||w.chart||w.source==='crm'))}));
}

// In-page search: keyword only, never customer details.
export function searchQuery(input){
 const q=text(input?.query,120);
 if(q.length<2)throw Error('搜索关键词太短');
 if(SENSITIVE.test(q))throw Error('搜索内容里有联系方式或敏感信息，请换成公司名或产品关键词');
 return q;
}
