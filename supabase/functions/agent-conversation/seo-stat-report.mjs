// Reuses the existing approved SEO projection. No free-form model or new source access.
export function seoStatQuestion(question){
 const q=String(question||'').normalize('NFKC').toLowerCase();
 if(!/seo|gsc|ga4/.test(q)||/竞品|社媒|询盘|产品|策略|建议|原因|如何|怎么|发布|投放|关键词/.test(q))return false;
 return !q.replace(/seo|gsc|ga4|分析|查看|查询|检查|请|给我|近|最近|过去|天|和|与|及|的|表现|数据|统计|说明|口径|缺口|来源|日期|点击率|点击|曝光|展示|平均排名|排名|自然会话|会话|流量|ctr|\d+/g,'').replace(/[\s，。！？、：；,.!?;:]/g,'');
}
export function seoStatReply(question,seo){
 const q=String(question).normalize('NFKC').toLowerCase(),days=[...q.replace(/ga4|gsc/gi,'').matchAll(/\d+/g)].map(x=>Number(x[0]));
 if(days.some(n=>![7,28].includes(n)))return {answer:'现有SEO摘要只有7天和28天窗口，不能代替你要求的其他周期。本次不返回错周期数字或图表。',actions:[]};
 if(!['available','stale'].includes(seo?.status))return {answer:'本次SEO摘要未取得或通道不可用；不代表流量为零，也不使用历史答案代替本次结果。',actions:[]};
 const windows=days.length?[...new Set(days)].map(n=>n+'d'):['7d','28d'];
 const show=(v,suffix='')=>typeof v==='number'&&Number.isFinite(v)?String(v)+suffix:'未取得';
 const metrics=[['clicks','GSC点击','次','gsc'],['impressions','GSC展示','次','gsc'],['ctr','GSC点击率','%','gsc'],['avg_position','GSC平均排名','','gsc'],['organic_sessions','GA4自然会话','次','ga4']];
 const requested=metrics.filter(([key])=>({clicks:/点击(?!率)/,impressions:/展示|曝光/,ctr:/点击率|ctr/,avg_position:/排名/,organic_sessions:/自然会话|会话|流量/}[key]).test(q));
 const selected=requested.length?requested:metrics,lines=[seo.status==='stale'?'SEO快照已过期，仅作历史参考。':'本次读取SEO源端快照；不是实时全网。',`快照生成：${seo.generated_at||'未取得'}；GSC数据截止：${seo.freshness?.gsc?.through||'未取得'}；GA4数据截止：${seo.freshness?.ga4?.through||'未取得'}；来源状态 GSC ${seo.freshness?.gsc?.status||'未取得'} / GA4 ${seo.freshness?.ga4?.status||'未取得'}。`],actions=[];
 for(const [key,label,unit,source] of selected){const values=windows.map(window=>{const raw=seo.windows?.[window]?.[source]?.[key];return {window,value:typeof raw==='number'&&Number.isFinite(raw)?(key==='ctr'?Number((raw*100).toFixed(2)):raw):null}});lines.push(label+'：'+values.map(x=>`${x.window==='7d'?'7天':'28天'} ${show(x.value,unit)}`).join('；'));actions.push({type:'data_chart',source:'seo_stats',label,chart:{title:label,stat:seo.status==='stale'?'历史快照；已过期':'按来源窗口展示',unit,bars:values.filter(x=>x.value!==null).map(x=>({label:x.window==='7d'?'7天':'28天',value:x.value})),empty:'本次未取得此指标，不是0。',sources:[{label:source.toUpperCase()+' · SEO只读摘要',detail:`数据截止 ${seo.freshness?.[source]?.through||'未取得'}；生成 ${seo.generated_at||'未取得'}`}],note:'7天与28天长度不同，不能直接计算增长；CTR按0..1比例转成百分比，平均排名不由TopN重算。'}})}
 lines.push('缺口：未取得项目不画成0；生成时间不替代来源截止日期，不能据此断言成交或流量变化原因。');return {answer:lines.join('\n\n'),actions};
}
