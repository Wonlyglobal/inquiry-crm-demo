// Country market background brief and company background-check framework.
// Uses only already-approved aggregates (research index >=5 groups, CRM >=5 groups) and bundled
// public evidence. No company names, contacts or CRM records are read or sent.
import {findCountries} from './crm-stats.mjs';
import {PUBLIC_EVIDENCE,DIMENSIONS,CATEGORIES} from './public-research.mjs';

export function backgroundIntent(question){
 const q=String(question).slice(0,500);
 const countries=findCountries(q);
 const company=/(这家|该|这个|那家)(公司|客户|买家|采购商)|客户背调|公司背调|背景调查.*(公司|客户)|(公司|客户).*(靠谱|真实|可信|规模|资质|骗子|诈骗)/.test(q);
 const market=countries.length>0&&/背调|市场|行业|竞品|渠道|采购|经销|进口|打法|机会|准入|认证|标准/.test(q);
 return {countries,company,market};
}

export function countryBrief(code,{research,crm,evidence=PUBLIC_EVIDENCE}={}){
 const sample=research?.countries?.find(x=>x.label===code)?.count??null;
 const mix=research?.country_categories?.[code]||[];
 const leads=crm?.status==='available'?crm.countries?.find(x=>x.label===code)?.count??null:null;
 const pub=evidence.filter(e=>e.market===code).map(e=>({company:e.company,product:e.product,category:CATEGORIES[e.category],dimension:DIMENSIONS[e.dimension].label,value:e.value,source_url:e.source_url,accessed:e.accessed,quote_verified:e.quote_verified}));
 const gaps=[];
 if(research?.status==='unavailable')gaps.push('背调索引本次不可用');else if(sample==null)gaps.push('背调索引中该国样本不足5条或未收录，不披露也不代表没有采购商');
 if(crm?.status!=='available')gaps.push('CRM权限内统计未取得或样本不足');else if(leads==null)gaps.push('近30天CRM该国新增线索不足5条，不披露数量，不代表零');
 if(!pub.length)gaps.push('该国尚未收录公开竞品证据');
 gaps.push('当地准入标准、消防/民防认证要求、关税与清关条件未在系统内核验，需官方来源');
 gaps.push('王力在该国的目标、预算、已有客户与交付能力需业务负责人确认');
 return {country:code,research_as_of:research?.as_of||null,research_sample:sample,research_category_mix:mix,crm_period:crm?.period||null,crm_recent_leads:leads,public_competitor_evidence:pub,gaps,limits:'背调索引是样本分布，不是市场规模、份额或成交意愿；CRM数为近30天权限内新增批次，小于5不披露。'};
}

export const countryBriefInstruction=`国家市场背调按以下顺序输出，每节标明数据来源与日期，缺失写“未取得”：
1. 结论先行：两三句说明该国对王力的现有证据强弱与最值得验证的一件事，不给未经证据支持的“机会大/小”判断。
2. 采购方结构：只用countryBriefs中背调样本及类别分布（注明样本量与as_of），说明它能与不能说明什么。
3. 需求信号：只用CRM近30天权限内汇总；不足5条写不披露，不当作零。
4. 竞争与对标：只列public_competitor_evidence中的公开事实与来源，标注候选对标、未确认直接竞争；不排名。
5. 准入与认证：系统未核验的标准只能列为“需核实”的清单项，不得断言具体法规条款、认证机构要求或关税数字。
6. 缺口与下一步：最多三项验证动作，写清要取得的证据、负责人角色（待确认）和判断标准；没有基线写“待基线确认”。`;

export const companyCheckInstruction=`本问题涉及单个客户或公司背调。系统没有客户明细或企业登记数据，不得编造注册号、成立年份、规模、营收、法人或信用结论，也不得据邮箱或名称推断真伪。按核验清单回答：官网与邮箱域名是否一致及域名注册时长、企业登记与实体地址（地图/街景）、主营是否与门窗五金/工程相关、可核验的项目或进口记录、社媒与行业目录存续情况、付款方式与首单条款风险、样品与验厂要求。每项写“需在哪里核实”和“什么结果算风险信号”。只根据用户在本轮主动提供的公开信息给初步判断，并标明“基于用户提供信息，未独立核验”。若包含客户联系人等敏感信息，提示回到CRM本地处理。`;

export function backgroundContext(question,{research,crm}){
 const intent=backgroundIntent(question);
 const countryBriefs=intent.market?intent.countries.map(c=>countryBrief(c,{research,crm})):[];
 const instructions=[countryBriefs.length?countryBriefInstruction:'',intent.company?companyCheckInstruction:''].filter(Boolean);
 return {intent,countryBriefs,instruction:instructions.join('\n')};
}
