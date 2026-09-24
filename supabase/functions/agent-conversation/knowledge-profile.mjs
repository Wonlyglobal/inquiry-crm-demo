const texts=(rows,limit)=>Array.isArray(rows)?rows.slice(0,limit).filter(r=>Number.isInteger(r?.page)&&r.page>0&&typeof r.quote==='string').map(r=>({value:String(r.value||'').slice(0,80),field:String(r.field||'').slice(0,40),page:r.page,location:String(r.location||'').slice(0,140),quote:r.quote.slice(0,500),verified:false})):[];
export function normalizeProfile(p){
 if(p?.schema!=='evidence-profile-v1'||p.method!=='offline_extractive_rules')return null;
 return {schema:p.schema,human_verified:false,summary:texts(p.summary,3),models:texts(p.models,8),parameters:texts(p.parameters,8),categories:texts(p.categories,6),document_types:texts(p.document_types,4),languages:(Array.isArray(p.languages)?p.languages:[]).filter(x=>['en','zh'].includes(x)),gaps:(Array.isArray(p.gaps)?p.gaps:[]).slice(0,8).map(x=>String(x).slice(0,180))};
}
export function profileEvidence(p){
 if(!p)return '';
 return '知识档案（自动提取，未人工核验）'+(p.languages.length?'｜正文语言线索：'+p.languages.map(x=>x==='en'?'英文':'中文').join('、'):'')+'\n'+p.summary.map(x=>`[${x.location||'第'+x.page+'页'}] ${x.quote.slice(0,180)}`).join('\n')+(p.models.length?'\n型号标注：'+p.models.map(x=>x.value+'（第'+x.page+'页）').join('、'):'')+(p.gaps.length?'\n缺口：'+p.gaps.join('；'):'');
}
