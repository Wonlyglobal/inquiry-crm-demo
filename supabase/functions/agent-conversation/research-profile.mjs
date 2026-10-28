// Deterministic analysis of the existing approved, k>=5 research projection.
// No company identities, contacts, source free text, new authority or model calls.
import {findCountries} from './crm-stats.mjs';
import {COUNTRY_CODES} from './country-codes.mjs';
const codes=new Set(COUNTRY_CODES),names=new Intl.DisplayNames(['zh-CN'],{type:'region'});
const types={
 '进口商/经销商':['渠道采购候选','核实主营品类、进口资质、覆盖网点、安装售后和备件能力；不能由类别标签推断已有进口或采购意愿。','同型号样品、含税落地成本、备件与服务方案'],
 '五金/建材零售':['零售渠道候选','核实门店/线上渠道、实际客群、陈列与安装能力、售后及库存周转。','清晰选型、安装兼容清单和零售服务材料'],
 '安防/门禁集成商':['系统集成候选','核实实际集成平台、接口/协议、网络安全要求、交付项目和维护责任。','经验证的接口兼容、权限与应急开锁说明'],
 '建筑总包':['工程采购候选','核实项目阶段、技术规格、采购授权、进度、验收及付款条件。','项目规格逐项对照和交付验收清单'],
 '大型建筑承包商':['工程采购候选','核实项目与采购职责，不由类别名称推断实际规模、预算或履约能力。','技术报审、交付计划和适用检测证据'],
 '地产开发商':['开发项目候选','核实项目在建/规划状态、采购链条、样板与批量交付要求。','同配置样板、项目安装与维保方案'],
 '酒店集团':['酒店场景候选','核实新建/改造项目、管理系统兼容、消防疏散、运维与服务责任。','经验证的门锁/门组合、权限与运维说明']
};
const safeRows=rows=>Array.isArray(rows)?rows.filter(r=>r&&Number.isSafeInteger(r.count)&&r.count>=5):[];
const isoDate=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:null};
export function researchProfileIntent(q){return /画像/.test(String(q))&&/背调|目标客户|客户|国家|市场|采购商/.test(String(q))&&!/查看私有知识/.test(String(q))}
export function researchProfileReport(question,research,now=Date.now()){
 const q=String(question).slice(0,500),requested=findCountries(q),asof=isoDate(research?.as_of),today=new Date(now+8*3600000).toISOString().slice(0,10);
 const unavailable=research?.status==='unavailable'||!Number.isSafeInteger(research?.sample_count)||research.sample_count<0;
 const freshness=unavailable?'unavailable':!asof?'unknown':asof>today?'invalid_future':now-Date.parse(asof+'T00:00:00Z')>48*3600000?'stale':'recent_snapshot';
 const countryRows=safeRows(research?.countries).filter(r=>codes.has(r.label)).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 const page=Math.min(30,Math.max(1,Number(q.match(/国家第\s*(\d{1,2})\s*页/)?.[1]||1)));
 const selected=requested.length?countryRows.filter(r=>requested.includes(r.label)):countryRows.slice((page-1)*12,page*12);
 const categories=safeRows(research?.categories).filter(r=>Object.hasOwn(types,r.label)).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 const out=['目标客户与国家画像（内部样本分析）','阶段结论：'+(unavailable?'背调数据读取未完成，不能生成当前画像。':freshness!=='recent_snapshot'?'当前只能整理历史/日期未核定样本，暂不能据此确定今日目标客户或优先市场。':'以下是背调样本中的客户结构与核验顺序，不是购买意愿、市场规模或商业匹配排名。'),`来源：公司背调系统既有汇总；样本日期：${asof||'未知'}；本次读取日期：${today}（北京时间）。`,freshness==='stale'?'时效缺口：样本超过48小时；今日读取成功不等于今日更新。':freshness==='invalid_future'?'日期缺口：源日期晚于当前日期，停止当前目标判断。':freshness==='unknown'?'日期缺口：原始样本日期未确认。':'', '隐私与口径：仅国家、固定客户类别及国家×类别至少5条分组；不展示公司、联系人或联系方式，不推算被抑制小组。类别登记不是已核实客户属性。'];
 if(!unavailable){
  out.push(`背调索引记录共${research.sample_count}条；不是去重后的独立买家数量，未核验重复、存续、采购授权或最近需求。`,'客户类型画像：');
  for(const r of categories){const [label,check,offer]=types[r.label];out.push(`${r.label}：${r.count}条登记样本。候选角色：${label}。\n核验动作：${check}\n建议准备：${offer}。这些是待验证方案，不是已确认需求或WONLY供货承诺。`)}
  if(!categories.length)out.push('没有达到展示门槛的有效客户类别，不代表没有目标客户。');
  out.push(`国家画像：${requested.length?'按本次指定国家筛选':`第${page}页，每页最多12国；共${countryRows.length}个可展示国家组`}。数量仅表示背调样本覆盖，不表示需求、吸引力或竞争强弱。`);
  for(const r of selected){const mix=safeRows(research.country_categories?.[r.label]).filter(v=>Object.hasOwn(types,v.label));out.push(`${names.of(r.label)}（${r.label}）：${r.count}条国家登记样本。\n已披露类别：${mix.length?mix.map(m=>`${m.label} ${m.count}条`).join('；'):'没有达到5条的可展示类别，不能推断该国没有渠道或采购商'}。\n国家核验：逐项补当地准入、目标门安装条件、同配置落地成本、渠道服务和真实项目/购买证据；类别结构不能替代这些证据。`)}
  if(!selected.length)out.push('本次国家范围没有可展示组；可能未收录、日期未更新或不足门槛，不解释为零需求。');
  for(const code of requested.filter(code=>!selected.some(r=>r.label===code)))out.push(`${names.of(code)}（${code}）：当前汇总未披露该国分组，保持未知，不补零。`);
 }
 out.push('下一步：先核验样本日期和重复公司，再按客户类型验证采购角色与实际项目；将完整型号参数与同配置准入、成本和交付证据逐项匹配。没有证据的需求、预算、认证、销量、竞争评分及成交概率均不生成。','验证指标：有效公司去重覆盖、采购角色证据覆盖、可定位需求/项目证据、同型号安装/准入验证及服务责任完整性；未建立同口径基线，不编增长或销售目标。','缺口：当前接口没有已核实主营明细、实际采购品类/型号、预算、采购周期、渠道能力、项目与成交关联；因此这是一版类别画像和核验计划，不能称已完成逐公司目标匹配。','内部确定性汇总，不向外部模型发送背调正文；未修改公司、客户或发出消息。');
 return {answer:out.filter(Boolean).join('\n\n'),status:unavailable?'unavailable':freshness==='recent_snapshot'?'sample_profile':'historical_or_unverified',freshness,as_of:asof,countries:selected.map(r=>r.label),category_groups:categories.length,country_groups:countryRows.length,page,source:'research_index_aggregate'};
}
