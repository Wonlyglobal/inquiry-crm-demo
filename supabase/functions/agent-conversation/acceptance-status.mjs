// Only structural counts leave the internal evidence path. No quotes, filenames or parameters.
export function evidenceCheck(data){
 const assets=data?.status==='available'&&Array.isArray(data.assets)?data.assets:[];
 let pages=0,findings=0;
 for(const a of assets){pages+=(a.document?.pages||[]).length;findings+=(a.document?.product_understanding?.findings||[]).length;}
 return {source_status:data?.status||'unavailable',source_code:/^[a-z0-9_]{1,40}$/.test(data?.code||'')?data.code:null,assets:assets.length,pages,findings,rejected:Number(data?.evidence_gate?.rejected)||0,source_freshness_verified:false,human_verified:false};
}
export function sourceStatusIntent(q=''){
 return /SEO|GA4|GSC|SEMrush|社媒/i.test(q)&&/接入状态|连接状态|是否可读|数据日期|同步状态/.test(q)&&!/优化|分析表现|制定|投放/.test(q);
}
const label=s=>({available:'可读取',ok:'可读取',partial:'部分可用',stale:'数据已过期',missing:'未取得',unavailable:'读取失败',not_configured:'未配置',not_requested:'未请求'}[s]||'状态待核验');
const safeDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?$/.test(d)&&Number.isFinite(Date.parse(d))?d:'未知';
export function sourceStatusAnswer(seo,social){
 const lines=['本次来源检查（只报告连接和日期，不判断经营表现）：',`SEO：${label(seo?.status)}；摘要生成时间：${safeDate(seo?.generated_at)}。`];
 for(const [k,v] of Object.entries(seo?.freshness||{}))if(['ga4','gsc','semrush'].includes(k))lines.push(`${k.toUpperCase()}：${label(v?.status)}；数据截止：${safeDate(v?.through)}。`);
 if(!seo?.freshness)lines.push('GA4、GSC、SEMrush：未取得逐源日期与覆盖，不能确认已同步。');
 lines.push(`社媒：${label(social?.status)}；摘要生成时间：${safeDate(social?.generated_at)}。`,'缺口：连接可读不等于全量导入、实时同步或已理解；未取得的指标不能记为零。');
 return lines.join('\n');
}
