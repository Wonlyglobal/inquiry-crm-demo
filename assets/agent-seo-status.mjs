export function seoContextLabel(context){
 if(!context?.seo_status)return '';
 if(!['available','stale'].includes(context.seo_status))return '\nSEO：'+(context.seo_status==='not_configured'?'只读通道尚未配置':'来源暂不可用')+'，不能据此判断流量为零。';
 const stamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}/.test(x)?x:'未取得';
 const f=context.seo_freshness||{};
 return `\nSEO：${context.seo_status==='stale'?'快照已过期，仅供历史参考':'已读取源端快照'}；生成时间 ${stamp(context.seo_generated_at)}；GA4截至 ${stamp(f.ga4?.through)}，GSC截至 ${stamp(f.gsc?.through)}。各来源缺失项以正文说明为准。`;
}
