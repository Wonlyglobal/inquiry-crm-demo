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
const PREFIX='背调画像：';
const REGIONS={东南亚:'BN KH ID LA MY MM PH SG TH TL VN'.split(' '),非洲:'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'.split(' ')};
const plays={
 '进口商/经销商':['渠道进入假设：先验证现有分销与售后覆盖，再评估区域试点；不直接授予独家代理。','询证：目前经营哪些门锁品牌？由谁负责安装和保修？能否给出可核验的公开渠道/项目？','停止条件：采购主体或服务责任无法核实，先补证，不判定对方有过错。'],
 '五金/建材零售':['零售进入假设：先验证现有客群和安装服务，再测试清晰选型与陈列。','询证：哪些安装条件最常见？谁承担退换和维护？是否有同类产品陈列或销售证据？','停止条件：安装/退换责任不清，不承诺销量或备货规模。'],
 '安防/门禁集成商':['集成进入假设：先做兼容性与权限/应急流程验证，再讨论项目方案。','询证：现有平台、协议与部署方式是什么？采购规格由谁确认？如何验收、更新和维护？','停止条件：接口或数据安全要求未验证，不承诺已兼容。'],
 '建筑总包':['工程进入假设：按真实项目的技术报审、样板、交期和验收节点逐步推进。','询证：项目与采购阶段是什么？谁批准技术参数？需提交哪些第三方检测与安装证据？','停止条件：项目/技术批准/验收与付款职责不明，暂缓报价承诺。'],
 '大型建筑承包商':['工程进入假设：先验证项目和决策链，不因类别含“大型”就推断预算与规模。','询证：采购范围是否含门锁？总包、分包、顾问各自批准什么？如何分批验收？','停止条件：采购主体或技术条件未明确，不用类别名称提高客户评级。'],
 '地产开发商':['开发项目进入假设：先核实项目阶段与样板要求，再确认批量交付和维保范围。','询证：是规划、新建还是改造？样板和最终采购由谁审批？门组合与交付节点如何定义？','停止条件：项目或供货边界未证实，不视为现有订单机会。'],
 '酒店集团':['酒店场景进入假设：先验证项目/运营管理需求和紧急疏散，再验证接口与服务。','询证：是新建还是改造？现有管理系统和门组合是什么？钥匙权限、断电与运维如何验收？','停止条件：门/锁适用性或紧急流程未验证，不承诺消防、系统兼容或投用。']
};
export function researchProfileTurn(question,history=[]){
 const q=String(question||'').slice(0,500);
 if(researchProfileIntent(q))return q;
 const prior=Array.isArray(history)?history.find(h=>typeof h==='string'&&h.startsWith(PREFIX)):null;
 if(!prior||!/(?:深入|展开|画像|客户类型|采购角色|进入路径|怎么开发|如何开发|证据缺口|核验|国家第\s*\d+\s*页|东南亚|非洲|(?:那|换成).{0,20}(?:呢|画像))/.test(q))return null;
 if(/(?:发送|发信|删除|修改|报价给|同步|导出)/.test(q))return null;
 const old=prior.slice(PREFIX.length,475),specified=findCountries(q).length||Object.keys(REGIONS).some(r=>q.includes(r));
 return (specified?'目标客户与国家画像；'+q:old.replace(/；追问：[^\n]*$/,'').replace(/国家第\s*\d+\s*页/g,'')+'；追问：'+q).slice(0,500);
}
const safeRows=rows=>Array.isArray(rows)?rows.filter(r=>r&&Number.isSafeInteger(r.count)&&r.count>=5):[];
const isoDate=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:null};
export function researchProfileIntent(q){return /画像/.test(String(q))&&/背调|目标客户|客户|国家|市场|采购商/.test(String(q))&&!/查看私有知识/.test(String(q))}
export function researchProfileReport(question,research,now=Date.now()){
 const q=String(question).slice(0,500),requested=findCountries(q),asof=isoDate(research?.as_of),today=new Date(now+8*3600000).toISOString().slice(0,10);
 const unavailable=research?.status==='unavailable'||!Number.isSafeInteger(research?.sample_count)||research.sample_count<0;
 const freshness=unavailable?'unavailable':!asof?'unknown':asof>today?'invalid_future':now-Date.parse(asof+'T00:00:00Z')>48*3600000?'stale':'recent_snapshot';
 const countryRows=safeRows(research?.countries).filter(r=>codes.has(r.label)).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 const page=Math.min(30,Math.max(1,Number(q.match(/国家第\s*(\d{1,2})\s*页/)?.[1]||1)));
 const regions=Object.keys(REGIONS).filter(name=>q.includes(name)),regionCodes=new Set(regions.flatMap(name=>REGIONS[name]));
 const scoped=requested.length?countryRows.filter(r=>requested.includes(r.label)):regions.length?countryRows.filter(r=>regionCodes.has(r.label)):countryRows;
 const selected=requested.length?scoped:scoped.slice((page-1)*12,page*12);
 const categories=safeRows(research?.categories).filter(r=>Object.hasOwn(types,r.label)).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 const out=['目标客户与国家画像（内部样本分析）','阶段结论：'+(unavailable?'背调数据读取未完成，不能生成当前画像。':freshness!=='recent_snapshot'?'当前只能整理历史/日期未核定样本，暂不能据此确定今日目标客户或优先市场。':'以下是背调样本中的客户结构与核验顺序，不是购买意愿、市场规模或商业匹配排名。'),`来源：公司背调系统既有汇总；样本日期：${asof||'未知'}；本次读取日期：${today}（北京时间）。`,freshness==='stale'?'时效缺口：样本超过48小时；今日读取成功不等于今日更新。':freshness==='invalid_future'?'日期缺口：源日期晚于当前日期，停止当前目标判断。':freshness==='unknown'?'日期缺口：原始样本日期未确认。':'', '隐私与口径：仅国家、固定客户类别及国家×类别至少5条分组；不展示公司、联系人或联系方式，不推算被抑制小组。类别登记不是已核实客户属性。'];
 if(!unavailable){
  out.push(`背调索引记录共${research.sample_count}条；不是去重后的独立买家数量，未核验重复、存续、采购授权或最近需求。`,'客户类型画像：');
  for(const r of categories){const [label,check,offer]=types[r.label];out.push(`${r.label}：${r.count}条登记样本。候选角色：${label}。\n核验动作：${check}\n建议准备：${offer}。这些是待验证方案，不是已确认需求或WONLY供货承诺。`)}
  if(!categories.length)out.push('没有达到展示门槛的有效客户类别，不代表没有目标客户。');
  out.push(`国家画像：${requested.length?'按本次指定国家筛选':`${regions.length?regions.join('、')+'范围；':''}第${page}页，每页最多12国；本范围共${scoped.length}个可展示国家组`}。数量仅表示背调样本覆盖，不表示需求、吸引力或竞争强弱。`);
  for(const r of selected){const mix=safeRows(research.country_categories?.[r.label]).filter(v=>Object.hasOwn(types,v.label));out.push(`${names.of(r.label)}（${r.label}）：${r.count}条国家登记样本。\n已披露类别：${mix.length?mix.map(m=>`${m.label} ${m.count}条`).join('；'):'没有达到5条的可展示类别，不能推断该国没有渠道或采购商'}。\n国家核验：逐项补当地准入、目标门安装条件、同配置落地成本、渠道服务和真实项目/购买证据；类别结构不能替代这些证据。`)}
  out.push('深入判断：国家×客户类型的进入假设（不是已确认商机）');
  for(const r of selected){
   const mix=safeRows(research.country_categories?.[r.label]).filter(v=>Object.hasOwn(plays,v.label)).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
   out.push(`${names.of(r.label)}（${r.label}）｜证据状态：${freshness==='recent_snapshot'?'本次源日期在窗口内，但类别登记未独立核验':'历史或日期未核定，不批准今日进入结论'}。`);
   if(!mix.length)out.push('缺少可披露的国家×客户类别交叉证据，不用全局类别代替该国结构，不推断采购方。');
   if(mix.length>2)out.push(`本国共${mix.length}个已披露类别，深入部分仅展开按登记量排序的前2类；其余保留上方结构，未完成逐类深入，不代表重要性更低。`);
   for(const m of mix.slice(0,2)){out.push(`${m.label}｜历史/登记依据：该国该类${m.count}条。\n${plays[m.label].join('\n')}\n产品对接：先取得对方实际品类和完整型号，再核对同源参数/适用条件；当前类别不能证明其需要WONLY任一具体型号。`)}
  }
  if(!selected.length)out.push('本次国家范围没有可展示组；可能未收录、日期未更新或不足门槛，不解释为零需求。');
  for(const code of requested.filter(code=>!selected.some(r=>r.label===code)))out.push(`${names.of(code)}（${code}）：当前汇总未披露该国分组，保持未知，不补零。`);
 }
 out.push('证据分层：已知＝本次固定类别/国家样本及来源日期；假设＝进入路径与采购问题；未知＝真实需求、决策权、产品适用性、商业可行性。原始fitScore未核验且不用于排序，城市/身份/联系方式与文件正文不参与本报告。','下一步：先核验样本日期和重复公司，再按客户类型验证采购角色与实际项目；将完整型号参数与同配置准入、成本和交付证据逐项匹配。没有证据的需求、预算、认证、销量、竞争评分及成交概率均不生成。','验证指标：有效公司去重覆盖、采购角色证据覆盖、可定位需求/项目证据、同型号安装/准入验证及服务责任完整性；未建立同口径基线，不编增长或销售目标。','缺口：当前接口没有已核实主营明细、实际采购品类/型号、预算、采购周期、渠道能力、项目与成交关联；因此这是一版类别画像和核验计划，不能称已完成逐公司目标匹配。','内部确定性汇总，不向外部模型发送背调正文；未修改公司、客户或发出消息。');
 return {answer:out.filter(Boolean).join('\n\n'),status:unavailable?'unavailable':freshness==='recent_snapshot'?'sample_profile':'historical_or_unverified',freshness,as_of:asof,countries:selected.map(r=>r.label),category_groups:categories.length,country_groups:countryRows.length,page,regions,scope_country_groups:scoped.length,material_question:PREFIX+q,source:'research_index_aggregate'};
}
