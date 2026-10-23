import {COUNTRY_CODES} from './country-codes.mjs';
// Data charts for server-built answers (owner, 2026-10-01: "调出任何数据都要说明来源并生成图表").
// Only aggregate counts that were already allowed into the answer are charted; nothing new is disclosed.
const SOURCE_NAME={website:'官网',email:'邮件',manual:'手工录入',whatsapp:'WhatsApp',wechat:'微信',phone:'电话',social_media:'社媒',offline_visit:'线下拜访',dealer_referral:'经销商推荐',customer_referral:'客户推荐',internal_referral:'内部推荐',outbound:'主动开发',feishu:'飞书',google_ads:'Google Ads',meta_ads:'Meta Ads',linkedin:'LinkedIn',exhibition:'展会',self_developed:'自主开发',referral:'推荐',other:'其他',other_or_unknown:'其他/未知'};
const STAGE_NAME={pending_assignment:'待分配',received:'已接收',qualified:'已确认需求',contacted:'已联系',quoted:'已报价',sample_sent:'已寄样',negotiating:'谈判中',won:'成交',lost:'丢单',other_or_unknown:'其他/未知'};
const COUNTRY_NAME={SA:'沙特',AE:'阿联酋',MX:'墨西哥',OM:'阿曼',QA:'卡塔尔',KW:'科威特',BH:'巴林',KZ:'哈萨克斯坦',UZ:'乌兹别克斯坦',BR:'巴西',US:'美国',NG:'尼日利亚',IN:'印度',GH:'加纳',ID:'印尼',VN:'越南',MY:'马来西亚',PH:'菲律宾',EG:'埃及',KE:'肯尼亚',ZA:'南非',other_or_unknown:'国家未填或未识别'};
const displayCountry=new Intl.DisplayNames(['zh'],{type:'region'});
const countryNames=new Map(COUNTRY_CODES.map(code=>[code,displayCountry.of(code)]));
const DATAQ=/多少|几|分布|占比|渠道|来源|国家|市场|阶段|漏斗|数据|统计|排名|趋势|对比|情况|表现|转化/;
const day=s=>String(s||'').slice(0,10);

// One request-local aggregate supplies both text and charts. No model history is used.
export function crmStatisticQuestion(question){
 const q=String(question||'').normalize('NFKC').toLowerCase();
 if(!/(询盘|线索|crm|商机)/.test(q))return null;
 const dimensions=[];
 if(/国家|地区/.test(q))dimensions.push('countries');
 if(/渠道|来源/.test(q))dimensions.push('channels');
 if(/阶段|漏斗|转化率|成交率/.test(q))dimensions.push('stages');
 if(/逾期|跟进/.test(q))dimensions.push('overdue');
 if(!dimensions.length)return null;
 const residue=q.replace(/分析|查看|查询|请|给我|我们|crm|近|最近|过去|[0-9]+|三十|天|本月|上月|这个月|本周|上周|今年|本年|本季度|询盘|线索|商机|的|按|国家|地区|渠道|来源|阶段|漏斗|转化率|成交率|逾期|跟进|分布|统计|数量|说明|解释|展示|口径|和|与|及|缺口|数据|情况|为什么|未知|其他|全部|都是|未识别/g,'').replace(/[\s，。！？、：；,.!?;:]/g,'');
 if(residue)return null;
 const periods=[...q.matchAll(/(?:近|最近|过去)\s*(\d+)\s*天/g)].map(x=>Number(x[1]));
 return {dimensions,unsupportedPeriod:/本月|上月|这个月|本周|上周|今年|本年|季度/.test(q)||periods.some(n=>n!==30)};
}
export function crmCountryQuestion(question){const i=crmStatisticQuestion(question);return !!i&&!i.unsupportedPeriod&&i.dimensions.length===1&&i.dimensions[0]==='countries'}
export function crmStatisticReply(question,crm){
 const intent=crmStatisticQuestion(question);if(!intent)return null;
 if(intent.unsupportedPeriod)return {answer:'本次服务端汇总仅支持近30天新增批次，不能用它代替你要求的其他周期。请在CRM本地看板选择对应周期后查询；本次没有返回错周期数字或图表。',actions:[]};
 if(crm?.status!=='available')return {answer:crm?.status==='insufficient_sample'?'本次权限内近30天样本不足5条，按原规则不披露统计；这不等于零询盘。':'本次权限内近30天统计未完整读取，不能当作零线索或沿用历史数字；请稍后重试。',actions:[]};
 const actions=intent.dimensions.filter(k=>k!=='overdue').map(k=>crmStatsChart({countries:'询盘国家分布',channels:'询盘渠道分布',stages:'询盘阶段分布'}[k],crm)).filter(Boolean),lines=[`本次权限内近 30 天新增询盘共 ${crm.lead_count} 条，统计周期 ${day(crm.period?.start)} 至 ${day(crm.period?.end)}。`];
 for(const action of actions){const c=action.chart;lines.push(c.title,c.bars.length?c.bars.map(x=>`${x.label}：${x.value} 条。`).join('\n'):c.empty,c.note)}
 if(intent.dimensions.includes('stages'))lines.push(crm.closed_cohort_win_rate===null||crm.closed_cohort_win_rate===undefined?'同批次已关闭成交率：未披露（已关闭样本不足5条），不代表0%。':`同批次已关闭成交率：${(crm.closed_cohort_win_rate*100).toFixed(1)}%。分子为该新增批次当前已成交数，分母为同批次当前已关闭数；不是同期全部成交率。`);
 if(intent.dimensions.includes('overdue')){const value=crm.overdue_count;lines.push(value===null||value===undefined?'同批次有效未关闭询盘的计划跟进逾期数：未披露（不足5条），不代表零。':`同批次有效未关闭询盘的计划跟进逾期数：${value} 条。`);actions.push({type:'data_chart',source:'crm_stats',label:'近30天新增批次·计划跟进逾期',chart:{title:'近30天新增批次·计划跟进逾期',stat:'只展示达到5条的计数',unit:'条',bars:Number.isFinite(value)?[{label:'计划跟进逾期',value}]:[],empty:'不足5条，不披露；不是零，也不是首次响应超时。',sources:[{label:'CRM 询盘表（原身份权限内）',detail:`${day(crm.period?.start)} 至 ${day(crm.period?.end)} 新增`}],note:'有效且未关闭、计划下次跟进时间已过；不包含已成交或丢单。'}})}
 lines.push('当前汇总不能说明隐藏分组的具体数量、是否缺填或表单配置原因，也不能据此判断市场或渠道好坏。请按相同周期和口径复查，不从联系信息猜测国家。','来源：CRM 询盘表（你的权限内可见记录）；至少5条的分组才展示。');
 return {answer:lines.filter(Boolean).join('\n\n'),actions};
}
export function crmCountryReply(crm){return crm?.status==='available'?crmStatisticReply('询盘国家分布',crm):null}

export function crmStatsChart(question,crm){
 const q=String(question||'');
 if(/SEO|社媒|TikTok|Instagram|YouTube|Facebook|关键词|搜索/i.test(q)||crmStatisticQuestion(q)?.unsupportedPeriod)return null;
 if(!/国家|市场|country|阶段|漏斗|转化|报价|成交|渠道|来源/.test(q))return null;
 if(!crm||crm.status!=='available'||!DATAQ.test(q))return null;
 const [key,names,title]=/国家|市场|country/i.test(q)?['countries',COUNTRY_NAME,'近 30 天询盘·按国家']:/阶段|漏斗|转化|报价|成交/.test(q)?['stages',STAGE_NAME,'近 30 天询盘·按阶段']:['channels',SOURCE_NAME,'近 30 天询盘·按渠道'];
 const rows=(Array.isArray(crm[key])?crm[key]:[]).filter(x=>Number.isFinite(x?.count)).sort((a,b)=>b.count-a.count);

 return {type:'data_chart',source:'crm_stats',label:title,chart:{title,stat:`共 ${crm.lead_count} 条（只列出 ≥5 条的分组）`,unit:'条',
  empty:`当前没有达到 5 条展示阈值的${key==='countries'?'国家':key==='channels'?'渠道':'阶段'}分组。小样本分组已隐藏，不代表没有询盘${key==='countries'?'，也不代表国家全部未知':''}。`,
  note:(key==='countries'?'国家按询盘的目标国家/地区字段归类；未填、未识别或冲突不会自动推断。':key==='channels'?'渠道按主来源优先、原来源次之归类；未识别不是自动隐藏的小样本。':'阶段为近30天新增批次的当前状态，不是累计到达各阶段的转化漏斗。')+'总数包含未展示的小样本，图中分组不一定覆盖全部询盘。',
  bars:rows.map(x=>({label:names[x.label]||(key==='countries'?countryNames.get(x.label)||'国家未填或未识别':x.label),value:x.count})),
  sources:[{label:'CRM 询盘表（你的权限内可见记录）',detail:`${day(crm.period?.start)} 至 ${day(crm.period?.end)} 新增`},{label:'口径',detail:'不足 5 条的分组不单独列出，避免小样本误读'}]}};
}

export function intelChart(report,{focus=null}={}){
 const items=(Array.isArray(report?.items)?report.items:[]).filter(i=>i.kind!=='evidence_changed');
 if(!items.length)return null;
 const by=new Map();for(const i of items){const c=String(i.company).replace(/（.*?）|\(.*?\)/g,'').trim();const v=by.get(c)||{n:0,url:i.url};v.n++;by.set(c,v)}
 const rows=[...by].sort((a,b)=>b[1].n-a[1].n).slice(0,12);
 const when=report?.last_run?.started_at?new Date(report.last_run.started_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'';
 return {type:'data_chart',source:'intel',label:focus==='marketing'?'竞品新内容数量（营销视图）':'竞品新内容数量',chart:{title:'近 14 天各竞品新内容条数',stat:`共 ${items.length} 条（官网新闻 + YouTube 视频）`,unit:'条',
  bars:rows.map(([c,v])=>({label:c,value:v.n,url:v.url,source:'该公司最新一条'})),
  sources:[{label:'竞品官网新闻页与官方 YouTube 频道（自动巡检）',detail:when?'最近一次巡检 '+when:'每 4 小时巡检'},{label:'说明',detail:'条数多不等于动作大；同品牌非门锁内容可能混入，点柱子看原文'}]}};
}
