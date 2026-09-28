// Deterministic SEO opportunity list computed from the validated seoSummary.
// It only ranks what the summary already contains; it never invents keywords, rankings or traffic.
export function seoIntent(question){return /SEO|seo|网站|官网|排名|关键词|GSC|GA4|自然流量|收录|落地页|页面优化|标题|meta|搜索/i.test(String(question));}

export function seoOpportunities(seo,now=Date.now()){
 if(!seo||!['available','stale'].includes(seo.status))return {status:'unavailable',items:[],note:'未取得SEO摘要，不能列出页面机会。'};
 const pages=Array.isArray(seo.pages)?seo.pages:[];
 const siteCtr=seo.windows?.['28d']?.gsc?.ctr??null;
 const items=[];
 for(const p of pages){
  const g=p.gsc_28d||{};
  for(const i of p.issues||[])if(i.severity==='P1')items.push({type:'fix_p1_issue',priority:1,path:p.path,evidence:`问题代码 ${i.code}（P1）${i.detected_at?`，发现于 ${i.detected_at.slice(0,10)}`:''}`,metric:'问题消除后复查抓取/索引状态，再看28天展示',observe:'修复后7天复查'});
  if(g.impressions!=null&&g.impressions>=200&&g.ctr!=null&&siteCtr!=null&&g.ctr<siteCtr*0.6)items.push({type:'improve_snippet',priority:2,path:p.path,evidence:`28天展示 ${g.impressions}、CTR ${(g.ctr*100).toFixed(2)}%，低于全站28天CTR ${(siteCtr*100).toFixed(2)}% 的六成`,metric:'同页面28天CTR与点击',observe:'改标题/描述后观察14天再看28天'});
  if(g.avg_position!=null&&g.avg_position>=4&&g.avg_position<=15&&(g.impressions??0)>=100)items.push({type:'strengthen_content',priority:3,path:p.path,evidence:`28天平均排名 ${g.avg_position.toFixed(1)}、展示 ${g.impressions}，处于可提升区间`,metric:'同页面平均排名、点击与自然询盘事件',observe:'内容补强后观察28天'});
 }
 for(const e of seo.experiments||[]){
  const due=e.status==='observing_7d'?e.observe_7d_at:e.status==='observing_14d'?e.observe_14d_at:null;
  if(due&&Date.parse(due)<=now)items.push({type:'review_experiment',priority:2,path:(e.target_paths||[])[0]||null,evidence:`实验 ${e.id} 已到${e.status==='observing_7d'?'7天':'14天'}复盘时间（${due.slice(0,10)}）`,metric:'对比baseline与latest的同口径指标',observe:'复盘结论不足时继续观察，不提前判胜负'});
 }
 const markets=(seo.markets||[]).filter(m=>m.status==='missing').map(m=>m.country);
 const seen=new Set();
 const unique=items.filter(x=>{const k=x.type+'|'+x.path;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.priority-b.priority).slice(0,10);
 return {status:'available',site_ctr_28d:siteCtr,items:unique,markets_without_data:markets,
  rule:'机会清单只基于SEO摘要中的页面、问题和实验；排序为P1技术问题→高展示低CTR/到期实验→排名4–15内容补强。不承诺排名，不编造关键词搜索量；关键词想法必须标为待GSC查询验证。'};
}

export const seoFrameworkInstruction=`SEO问题按以下顺序回答，缺数据写“未取得”，不用generated_at代替through：
1. 数据截止：分别写GA4、GSC的through与状态；过期只作历史参考。
2. 需求面：用windows与pages的同一窗口（7天或28天，不混用）说明展示、点击、CTR、平均排名；自然与全渠道分开。
3. 机会清单：优先使用seoOpportunities中的条目及其证据，逐条写页面路径、证据、动作、主要指标、观察期、停止条件；P1技术问题排最前。
4. 转化面：自然渠道事件只说明站内行为，不等于唯一用户或CRM成交；form_open不是高意向。
5. 实验：只在到观察期后复盘；未满期不下结论。
6. 关键词与内容：可提出按国家/语言和采购意图（制造商、防火等级、认证、工程项目）的关键词假设，但必须写“待GSC查询验证”，不得编造搜索量、难度或排名。
不承诺排名或流量增长，目标数值无基线写“待基线确认”；不要建议未经证实的产品参数或认证写进页面。`;
