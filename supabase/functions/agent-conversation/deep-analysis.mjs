// Uses already-authorized, projected summaries only. No new tools or permissions.
export function analysisIntent(question){return /深度|综合|分析|诊断|优化|建议|方案|复盘|策略/.test(String(question));}
export function evidencePlan(context={},now=Date.now()){
 const sources=Object.entries(context).map(([name,value])=>{
  const status=value?.status||(name==='research'&&Number.isFinite(value?.sample_count)?'available':'missing');
  const raw=value?.generated_at||value?.as_of||null;
  const observed=raw&&Number.isFinite(Date.parse(raw))?raw:null;
  return {name,status,observed_at:observed,stale:observed?now-Date.parse(observed)>48*3600000:null,usable:['available','partial','stale'].includes(status),limits:typeof value?.limits==='string'?value.limits.slice(0,1200):null};
 });
 return {version:1,sources,missing:sources.filter(x=>!x.usable).map(x=>x.name),rule:'数据可读取不等于指标已核验；读取时间不等于数据截止日。只在同一地区、周期、平台定义下比较，不推断跨系统用户归因。'};
}
export const deepAnalysisInstruction=`本轮执行证据驱动的深度分析，不仅复述检索结果，也不输出隐藏思维链。先用两三句中文给有证据的核心判断与优先建议，随后输出可审阅的分析摘要：
1. 证据与缺口：每项关键判断注明来自哪个系统、数据日期/统计周期和具体指标或来源；明确未取得、过期、未核验记录及样本局限。
2. 问题诊断：区分观察事实、可能原因、待验证假设；至少考虑一个替代解释。不得把相关性或一次快照写成因果和趋势。
3. 优先行动：最多三项，逐项写依据、建议动作、预期作用、验证指标与观察条件、风险及需要补齐的数据。没有基线不编造增长目标和ROI；不假装已经执行。
4. 跨系统联动：只连接实际可用证据。社媒主题与SEO落地页可提出关联实验，但没有UTM/归因证据不得断言带来流量或成交；背调国家/类别分布只是研究样本，不能推断具体客户需求、采购意向或市场份额。没有视频转写/画面证据不声称看过视频。
若本轮没有可用业务数据，只给补数与验证计划，不给针对当前表现的诊断。内部物料未提供时不得从模型记忆补公司参数，不能声称全库已理解。末尾列明本轮未覆盖范围。用纯文本中文，不用星号。`;
