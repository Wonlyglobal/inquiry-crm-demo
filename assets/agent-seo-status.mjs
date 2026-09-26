export function seoContextLabel(context){
 if(!context?.seo_status||context.seo_status==='not_requested')return '';
 if(!['available','stale'].includes(context.seo_status))return '\nSEO：'+(context.seo_status==='not_configured'?'只读通道尚未配置':'来源暂不可用')+'，不能据此判断流量为零。';
 const stamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}/.test(x)?x:'未取得';
 const f=context.seo_freshness||{};
 return `\nSEO：${context.seo_status==='stale'?'快照已过期，仅供历史参考':'已读取源端快照'}；生成时间 ${stamp(context.seo_generated_at)}；GA4截至 ${stamp(f.ga4?.through)}，GSC截至 ${stamp(f.gsc?.through)}。各来源缺失项以正文说明为准。`;
}

export function socialContextLabel(context){if(!context?.social_status||context.social_status==='not_requested')return '';const coverage=Number.isInteger(context.social_library_total)?`\nGrace 内容覆盖：本次读取 ${context.social_library_records} / ${context.social_library_total} 条已入库发布记录${context.social_library_status==='partial'?'（读取不完整）':''}；不代表平台全部内容，未核验视频画面或后台留存。`:'';const platforms=context.social_library_platforms?Object.entries(context.social_library_platforms).filter(([k,v])=>['tiktok','youtube','instagram','facebook','linkedin','other'].includes(k)&&Number.isInteger(v)&&v>=0).map(([k,v])=>`${k} ${v}条`).join('、'):'';return coverage+(platforms?'\n本次读取分布：'+platforms:'')+ '\n社媒：'+(context.social_status==='available'?'已读取源端记录；各账号同步时间及过期状态见正文，读取时间不代表平台实时数据。':'来源暂不可用，未确认当前账号与竞品表现。')}
