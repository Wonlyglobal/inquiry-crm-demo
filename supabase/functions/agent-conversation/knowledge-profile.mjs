const texts=(rows,limit)=>Array.isArray(rows)?rows.slice(0,limit).filter(r=>Number.isInteger(r?.page)&&r.page>0&&typeof r.quote==='string').map(r=>({value:String(r.value||'').slice(0,80),field:String(r.field||'').slice(0,40),page:r.page,location:String(r.location||'').slice(0,140),quote:r.quote.slice(0,500),verified:false})):[];
export function normalizeProfile(p){
 if(!['evidence-profile-v1','evidence-profile-v2'].includes(p?.schema)||p.method!=='offline_extractive_rules')return null;
 return {schema:p.schema,human_verified:false,summary:texts(p.summary,3),models:texts(p.models,8),series:texts(p.series,8),parameters:texts(p.parameters,8),categories:texts(p.categories,6),document_types:texts(p.document_types,4),languages:(Array.isArray(p.languages)?p.languages:[]).filter(x=>['en','zh'].includes(x)),gaps:(Array.isArray(p.gaps)?p.gaps:[]).slice(0,8).map(x=>String(x).slice(0,180))};
}
export function profileEvidence(p){
 if(!p)return '';
 return '知识档案（自动提取，未人工核验）'+(p.languages.length?'｜正文语言线索：'+p.languages.map(x=>x==='en'?'英文':'中文').join('、'):'')+(p.series.length?'｜系列标注：'+p.series.map(x=>x.value+'（第'+x.page+'页）').join('、'):'')+'\n'+p.summary.map(x=>`[${x.location||'第'+x.page+'页'}] ${x.quote.slice(0,180)}`).join('\n')+(p.models.length?'\n型号标注：'+p.models.map(x=>x.value+'（第'+x.page+'页）').join('、'):'')+(p.gaps.length?'\n缺口：'+p.gaps.join('；'):'');
}

export function seriesCatalogueAnswer(data){
 const c=data.series_catalogue;if(!c)return '尚未取得产品系列目录，请稍后重试。';
 const names={fire_door:'防火门',medical_door:'医用门',security_door:'防盗门',smart_lock:'智能锁'};
 const series=(c.series||[]).slice(0,50),categories=(c.categories||[]).filter(x=>names[x.label]);
 return '已按当前有权查看的现行文档整理产品系列线索，以下尚未经过产品负责人核验。\n\n'+(series.length?'文档明确标注的系列：\n'+series.map(x=>`• ${String(x.label).slice(0,80)}：${Number(x.files)||0}份资料`).join('\n'):'目前没有提取到明确标注的系列名称，不能把产品门类当作公司正式系列。')+'\n\n正文识别到的产品门类（不是正式系列清单）：\n'+(categories.map(x=>`• ${names[x.label]}：${Number(x.files)||0}份资料`).join('\n')||'暂无可核对门类')+'\n\n可继续输入系列名称或型号查找原文、参数和出处。覆盖仅限已建立档案的现行文档，未解析资料和视频不计入，不代表公司完整产品线。';
}
