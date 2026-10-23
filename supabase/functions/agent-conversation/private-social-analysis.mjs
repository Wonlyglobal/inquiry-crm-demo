// Evidence-bound analysis of existing private metrics. No model, fetch, content reading or writes.
import {readPrivateSocialSnapshot,privateSocialTime,SOCIAL_METRIC_LABELS} from './private-social-display.mjs';
export const SOCIAL_ANALYSIS_PLATFORMS=['tiktok','instagram','facebook','youtube'];
export function socialAnalysisIntent(question=''){
 const q=String(question||'').normalize('NFKC');
 return /TikTok|Instagram|Facebook|YouTube|社媒/i.test(q)&&/分析|表现好|优秀|最好|排名|问题|改进|建议|优化|复盘|对比|比较|增长/.test(q)&&(/帖子|逐帖|指标|观看|播放|互动|点击|表现|社媒/.test(q)||/查看私有知识 (?:tiktok|instagram|facebook|youtube)-/.test(q));
}
export function socialAnalysisCoversParts(question,parts=[]){
 return socialAnalysisIntent(question)&&parts.length>1&&parts.length<=3&&parts.every(p=>socialAnalysisIntent(p)||/^(?:请)?(?:给出|说明|指出|列出|分析)(?:具体)?(?:改进建议|(?:存在的)?问题(?:和(?:具体)?改进建议)?|表现好的帖子|优秀帖子|后续验证指标)[。？?]?$/.test(p));
}
export function unsupportedSocialAnalysisPeriod(question=''){
 const q=String(question||'').normalize('NFKC'),dates=q.match(/20\d{2}-\d{2}-\d{2}/g)||[];
 return /(?:近|最近|过去)\s*\d+\s*天|上月|本月|上周|本周|这周|环比|同比|(?:观看|播放|点击|互动|粉丝|流量|指标|数据).{0,4}增长|增长率|(?:和|与|比)昨天|相比|上期/.test(q)||new Set(dates).size>1;
}
export function socialAnalysisPlatforms(question=''){
 const q=String(question||'').normalize('NFKC');const selected=SOCIAL_ANALYSIS_PLATFORMS.filter(p=>new RegExp(p,'i').test(q));
 return selected.length?selected:SOCIAL_ANALYSIS_PLATFORMS;
}
const known=(p,k)=>typeof p.metrics[k]==='number'&&Number.isFinite(p.metrics[k])&&p.metrics[k]>=0;
const median=values=>{const a=[...values].sort((a,b)=>a-b),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
const pct=x=>(x*100).toFixed(2)+'%';
export function privateSocialAnalysis(d,now=Date.now()){
 if(!SOCIAL_ANALYSIS_PLATFORMS.includes(d?.kind))return null;
 const snapshot=readPrivateSocialSnapshot(d);
 if(!snapshot)return '这份已保存的社媒快照格式或明细数量尚未通过分析校验，未生成表现结论。可先查看原报告及来源缺口，不用猜测替代证据。';
 const {metadata:m,posts,platform,historical}=snapshot,source=Date.parse(m.source_date),stale=Number.isFinite(source)&&now-source>48*3600000;
 const out=[`${platform} · ${d.period.from} 帖子表现分析`,`来源数据时间：${privateSocialTime(m.source_date)}；本次只分析已保存快照，没有重新采集。`];
 if(m.window)out.push(`帖子发布窗口：${privateSocialTime(m.window.start)} 至 ${privateSocialTime(m.window.end)}`);
 out.push(`分析范围：已保存${posts.length}条；${m.post_coverage_complete===true?'快照登记窗口明细完整':'仅部分保存明细，不能代表完整窗口'}。自动分析未经人工事实核验。`);
 if(historical||!Number.isFinite(source)||source>now||stale){
  out.push('\n当前结论暂缓',historical?'本次源读取失败，保存的明细为历史数据；不能给出当前优秀帖子或当前问题结论。':stale?'来源已超过48小时，以下不形成当前表现榜单；旧指标不冒充今日变化。':'来源日期未知或异常，无法确认指标时点，不生成当前榜单。',`来源最近成功时间：${privateSocialTime(m.source_last_success_sync)}`,'建议动作：先恢复原授权来源读取并完成私有同步/回读，再按同平台、同发布时间长度复核。此回答未自动同步或修改权限。');
  return out.join('\n');
 }
 if(!posts.length){out.push('\n分析暂缓','没有可核对的已保存逐帖明细，不能排名或判断互动表现。空结果不等于平台没有发布。','建议动作：先在原平台核对已发布列表、窗口/分页及授权，再完成内部同步与回读；不自动补零或重试写入。');return out.join('\n')}
 const views=posts.filter(p=>known(p,'views')),positive=views.filter(p=>p.metrics.views>0);
 out.push('\n值得优先复盘的帖子（事实与范围）');
 if(views.length<3)out.push(`仅${views.length}/${posts.length}条观看量可读，少于3条，暂不做样本排名；样本不足不等于表现差。`);
 else if(!positive.length||Math.max(...views.map(p=>p.metrics.views))===Math.min(...views.map(p=>p.metrics.views)))out.push('已知观看量均为0或彼此相同，不硬选“最好”的帖子。');
 else{
  const middle=median(views.map(p=>p.metrics.views)),lowest=Math.min(...views.map(p=>p.metrics.views));
  const top=positive.filter(p=>p.metrics.views>=middle&&p.metrics.views>lowest).sort((a,b)=>b.metrics.views-a.metrics.views||a.url.localeCompare(b.url)).slice(0,3);
  out.push(`按已知${views.length}/${posts.length}条的累计观看量筛选；样本中位数${middle}。以下最多3条不低于中位数，发布时间不同，不能当作同龄效率或内容质量排名；并列值仅展示部分。`);
  for(const [i,p] of top.entries()){
   const pair=known(p,'likes')&&known(p,'comments');
   out.push(`${i+1}. ${p.url}`,`发布：${privateSocialTime(p.published)}；累计观看量：${p.metrics.views}${known(p,'clicks')?'；点击数：'+p.metrics.clicks:''}`,
    pair?`点赞评论/观看比：(${p.metrics.likes}+${p.metrics.comments})/${p.metrics.views}=${pct((p.metrics.likes+p.metrics.comments)/p.metrics.views)}`:'点赞或评论缺失，不能计算点赞评论/观看比。');
  }
 }
 out.push('\n已知问题与判断限制');
 const clickRows=posts.filter(p=>known(p,'clicks')),clickZero=clickRows.filter(p=>p.metrics.clicks===0).length;
 if(clickRows.length)out.push(`点击计数：${clickRows.length}/${posts.length}条可读，其中${clickZero}条为0；其他${posts.length-clickRows.length}条未知。快照未区分独立用户、外链点击及客户归因，不能把总点击当作这些值；缺少曝光/归因时不判断点击率或获客效果。`);
 else out.push('点击指标全部未知，不能把缺失判成0点击，也不能评价询盘转化。');
 const paired=positive.filter(p=>known(p,'likes')&&known(p,'comments')),noReaction=paired.filter(p=>p.metrics.likes===0&&p.metrics.comments===0);
 if(paired.length)out.push(`有观看且点赞/评论都可读的${paired.length}条中，${noReaction.length}条点赞评论均为0。这是计数观察，不能据此断言选题、封面或开头不好。`);
 else out.push('没有观看量大于0且点赞/评论都可读的配对样本，暂不计算比例。');
 const gaps=Object.entries(SOCIAL_METRIC_LABELS).filter(([k])=>k!=='viewers'||d.kind==='facebook').map(([k,label])=>({label,missing:posts.filter(p=>!known(p,k)).length})).filter(x=>x.missing);
 out.push(gaps.length?'指标缺口：'+gaps.map(g=>`${g.label}${g.missing}/${posts.length}条未知`).join('；')+'。':'本份保存明细的基础计数均可读；这不代表留存、内容或转化已接通。');
 out.push('点赞评论/观看比只使用这三个已知计数，不含分享/收藏，不是平台官方互动率或独立用户转化率；分母小、重复观看及帖子发布时间差异都会影响解读。',
  '内容证据缺口：本次没有读取标题正文、视频画面、留存曲线或客户归因，无法确认表现原因；不做跨平台总排名，不将逐帖独立观看者相加。');
 out.push('\n具体改进建议（待验证的实验，不是原因结论）',
  '1. 先在原平台人工复盘本份快照中的帖子链接（可点“展开逐帖”），检查开头、封面、字幕及行动提示，记录可核对的差异；优先看上述候选，指标不能替代内容检查。');
 if(noReaction.length)out.push('2. 下一批同类内容只测试一个变量，例如结尾是否增加一个明确提问；保留原做法作对照。在发布后相同24小时/72小时时点记录观看、点赞、评论，比较点赞评论/观看比及样本数，不承诺提升。');
 else out.push('2. 对下一批同类内容保留原做法作对照，一次只改变一个经人工复盘选定的变量；按相同发布后时长比较已知指标，避免用发布时间不同的累计值判断改善。');
 if(clickRows.length&&clickZero)out.push('3. 先人工检查资料/咨询入口能否正常打开，再测试一个更明确的行动提示；在相同发布后时点记录点击数，并另核验曝光、外链点击及归因。未补齐前不把点击变化称为询盘增长。');
 else out.push('3. 先补齐原授权内可取得的点击/曝光与归因缺口；未取得前只跟踪观看和已知互动，不设未经批准的销售目标。');
 out.push('后续验证：同平台、相同发布后24小时/72小时、相同指标定义；记录每帖链接、来源日期、已知帖数和未知项。有变化再同步并回读，不直接相减不同窗口的累计数。',
  '所有建议仅供人工决定；没有自动发帖、投放、修改客户或公开物料。');
 return out.join('\n');
}
