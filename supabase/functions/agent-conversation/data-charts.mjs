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

// Deliberately narrow: other dimensions, periods and compound requests keep their own routes.
export function crmCountryQuestion(question){
 const q=String(question||'').normalize('NFKC').toLowerCase();
 if(!/(询盘|线索)/.test(q)||!/(国家|地区)/.test(q))return false;
 return !q.replace(/分析|查看|查询|请|给我|近|最近|过去|30|三十|天|询盘|线索|的|按|国家|地区|分布|统计|数量|说明|解释|展示|口径|和|与|及|缺口|数据|情况|为什么|未知|其他|全部|都是|未识别/g,'').replace(/[\s，。！？、：；,.!?;:]/g,'');
}
export function crmCountryReply(crm){
 const action=crmStatsChart('询盘国家分布',crm);if(!action)return null;
 const c=action.chart,rows=c.bars.map(x=>`${x.label}：${x.value} 条。`);
 const answer=[`本次权限内近 30 天新增询盘共 ${crm.lead_count} 条，统计周期 ${day(crm.period?.start)} 至 ${day(crm.period?.end)}。`,
 rows.length?`达到展示阈值的国家分组：\n${rows.join('\n')}`:c.empty,
 c.note,'当前汇总不能说明小样本国家的具体数量、是否缺填或表单配置原因，也不能据此判断重点市场表现。建议在原有权限内核对国家字段填写与命名，再按相同周期和口径复查；不从联系信息猜测国家。',
 '来源：CRM 询盘表（你的权限内可见记录）；只展示至少 5 条的分组。'].join('\n\n');
 return {answer,actions:[action]};
}

export function crmStatsChart(question,crm){
 const q=String(question||'');
 if(!crm||crm.status!=='available'||!DATAQ.test(q))return null;
 const [key,names,title]=/国家|市场|country/i.test(q)?['countries',COUNTRY_NAME,'近 30 天询盘·按国家']:/阶段|漏斗|转化|报价|成交/.test(q)?['stages',STAGE_NAME,'近 30 天询盘·按阶段']:['channels',SOURCE_NAME,'近 30 天询盘·按渠道'];
 const rows=(Array.isArray(crm[key])?crm[key]:[]).filter(x=>Number.isFinite(x?.count)).sort((a,b)=>b.count-a.count);
 if(!rows.length&&key!=='countries')return null;
 return {type:'data_chart',source:'crm_stats',label:title,chart:{title,stat:`共 ${crm.lead_count} 条（只列出 ≥5 条的分组）`,unit:'条',
  empty:key==='countries'?'当前没有达到 5 条展示阈值的国家分组。小样本分组已隐藏，不代表没有询盘，也不代表国家全部未知。':undefined,
  note:key==='countries'?'国家按询盘的目标国家/地区字段归类；未填、未识别或冲突不会自动推断。总数包含未展示的小样本，图中分组不一定覆盖全部询盘。':undefined,
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
