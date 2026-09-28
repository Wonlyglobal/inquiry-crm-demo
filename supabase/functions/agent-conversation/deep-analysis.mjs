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
export function marketingIntent(question){return /渠道|投放|广告|Ads|展会|参展|SEO|网站|社媒|TikTok|Instagram|营销|漏斗|询盘质量|获客|增长方案|复盘/i.test(String(question));}
export const marketingFrameworkInstruction=`营销分析按“渠道质量五问”核对，每问只用已提供数据并注明来源和统计期：
1. 量：该渠道线索数及占比（只用crm.channels，小于5不披露）。
2. 质：优先用crm.channel_funnel中该渠道自己的quote_rate与closed_win_rate；为null或渠道未列出时写“样本不足，无法按该渠道计算”，不得用整体成交率代替单渠道，也不把null当零。
3. 速：跟进逾期等过程信号只能说明整体，不归因到单一渠道。
4. 本：没有花费数据时不计算成本或ROI，写“未取得花费”。
5. 因：网站、社媒与询盘之间没有UTM或归因证据时，只能提出关联实验，不写因果。
建议必须是可停止的实验：写观察期、主要指标、停止条件；目标数值没有基线写“待基线确认”。`;
