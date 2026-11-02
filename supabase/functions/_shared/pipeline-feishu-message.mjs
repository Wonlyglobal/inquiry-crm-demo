import {COUNTRY_CODES} from '../agent-conversation/country-codes.mjs';
export const STAGES=Object.freeze({pending_assignment:'待分配',received:'收到询盘',qualified:'有效询盘',contacted:'已联系',quoted:'已报价',sample_sent:'已寄样',negotiating:'谈判中',won:'已成交',lost:'已丢单'});
const normalize=value=>String(value??'').trim().toLowerCase();
const countries=new Map();
for(const code of COUNTRY_CODES){const zh=new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(code);for(const alias of [code,zh,new Intl.DisplayNames(['en'],{type:'region'}).of(code)])countries.set(normalize(alias),zh)}
for(const [alias,code] of Object.entries({'阿联酋':'AE','美国':'US','英国':'GB',uk:'GB',usa:'US',uae:'AE',prc:'CN','united states of america':'US','south korea':'KR','russia':'RU','vietnam':'VN','turkey':'TR','中国香港':'HK','中国台湾':'TW'}))countries.set(alias,countries.get(normalize(code)));
const products=new Map();
for(const [label,aliases] of [
 ['木门',['wooden_door','wooden door','wood doors','木门']],['智能锁',['smart_lock','smart lock','smart locks','智能锁']],
 ['防盗门',['security_door','security door','security doors','防盗门']],['医用门',['medical_door','medical door','hospital door','医用门']],
 ['防火门',['fire_door','fire door','fire doors','防火门']],['钢质门',['steel_door','steel door','steel doors','钢质门']],
 ['装甲门',['armored_door','armored door','装甲门']],['铸铝门',['cast_aluminum_door','cast aluminum door','铸铝门']],
 ['铜门',['copper_door','copper door','铜门']],['铝合金门窗',['aluminum_windows','aluminum windows','铝合金门窗']],
 ['铝木门窗',['aluminum_wood_windows','铝木门窗']],['机械锁及五金',['mechanical_hardware','hardware','机械锁及五金']],
 ['门',['door','doors','门']],['门窗',['doors and windows','门窗']],['锁具',['lock','locks','锁具']]
])for(const alias of aliases)products.set(normalize(alias),label);
export const safeProduct=value=>products.get(normalize(value))||'产品待核实';
export const safeCountry=value=>countries.get(normalize(value))||'国家/地区待核实';
export function safeQuantity(value){const text=normalize(value);return /^(?:[1-9]\d{0,6}|0)(?:\s*[-~–至]\s*[1-9]\d{0,6})?\s*(?:套|樘|扇|把|件|个|pcs?|pieces?|sets?|units?)?$/.test(text)?text:'数量待核实'}
// Employee display names only; never allow markup, mention syntax, URLs or multiline instructions.
const person=value=>typeof value==='string'&&/^[\p{L}\p{M} .·'-]{1,60}$/u.test(value.trim())?value.trim():null;
const stage=value=>STAGES[value]||'待核对';
const time=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'待核对':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short',hour12:false}).format(d)};
export function nextStep(p){
 const market=person(p.market_name)||'市场部（待指定）',manager=person(p.manager_name)||'销售主管（待指定）',owner=person(p.owner_name)||(p.owner_set?'已指定业务员（姓名待核对）':'业务员（待分配）');
 if(p.kind==='intake'&&!p.inquiry_id){if(p.trashed||p.triage_label==='warmup'||p.processing_status==='rejected')return `${market}：核对归档结果；有新信息时重新评估`;return `${market}：${p.triage_label==='real'?'核实基本需求并登记询盘':'分拣邮件，确认是否为真实询盘'}`}
 if(p.invalid_review_status==='pending')return `${manager}：审核无效申请`;
 if(p.validity==='invalid')return `${market}：保留关闭记录；有新信息时重新评估`;
 if(['won','lost'].includes(p.status))return `${owner}：${p.status==='won'?'核对成交记录并安排后续履约':'复盘丢单，确认后续培育安排'}`;
 if(p.validity!=='valid')return `${market}：核实需求和询盘有效性`;
 if(!p.owner_set)return `${manager}：指定负责业务员`;
 const action={pending_assignment:'核对分配并开展首次联系',received:'首次联系客户并核实需求',qualified:'联系客户并确认采购条件',contacted:'补齐采购条件并准备报价',quoted:'跟进报价反馈和样品安排',sample_sent:'跟进样品反馈',negotiating:'推进谈判并确认下一步'}[p.status]||'核对当前进展并安排跟进';
 return `${owner}：${action}`;
}
function eventTitle(p){
 if(p.kind==='intake'){if(p.trashed)return '邮件已移至回收站';if(p.inquiry_id)return '分拣邮件已登记为询盘';if(p.triage_label==='real')return '询盘邮件已分拣：真实询盘';if(p.triage_label==='warmup')return '邮件已分拣：预热/非询盘';return p.created?'收到待分拣邮件':'邮件处理进度已更新'}
 if(p.created)return '新询盘已登记';
 const fields=p.changed_fields||[];
 if(fields.includes('owner_id'))return p.owner_set?'询盘已分配/转派':'询盘归属已调整：待分配';
 if(fields.includes('status'))return `阶段更新：${stage(p.from_status)} → ${stage(p.status)}`;
 if(fields.includes('validity'))return '询盘有效性已更新';
 if(fields.includes('invalid_review_status'))return '无效申请审核进度已更新';
 if(fields.some(f=>['product_category','target_country','quantity','demand_summary'].includes(f)))return '基本需求已更新';
 if(fields.some(f=>f.startsWith('qualification_')))return '采购条件核实进度已更新';
 if(fields.some(f=>f.startsWith('nurture_')))return '培育安排已更新';
 return '询盘跟进进度已更新';
}
export function pipelineMessage(item){
 const p=item.payload||{};
 if(p.kind==='connection_test')return {msg_type:'text',content:{text:'【WONLY CRM 流水线提醒 · 连接验收】\n这是一条合成示例，无真实客户、人员或业绩。\n事件：询盘已分拣\n基本需求：防火门 / 国家待核实 / 数量待核实\n下一步：市场部（待指定）核实需求，销售主管再分配业务员。\n正式提醒仅来自启用后已保存的业务更新。'}};
 if(!['inquiry','intake'].includes(p.kind))throw new Error('invalid_event_kind');
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 const no=/^\d{1,12}$/.test(String(p.inquiry_no??''))?`#${String(p.inquiry_no).padStart(6,'0')}`:'待登记';
 const lines=[`【WONLY CRM】${eventTitle(p)}`,`询盘：${no}`];
 if(item.mode==='basic_demand')lines.push(`基本需求：${safeProduct(p.raw_product)} / ${safeCountry(p.raw_country)} / ${safeQuantity(p.raw_quantity)}`);
 lines.push(`当前进度：${p.kind==='intake'&&!p.inquiry_id?'邮件分拣/登记':p.validity==='invalid'?'已关闭（无效）':p.validity!=='valid'?'待确认有效性':stage(p.status)}`,`下一步：${nextStep(p)}`);
 if(p.next_follow_up_at)lines.push(`计划跟进：${time(p.next_follow_up_at)}`);
 lines.push(`更新人：${person(p.actor_name)||'系统或后台任务'}`,`事件时间：${time(item.occurred_at)}（北京时间）`, `CRM详情：https://crm.foreverdoodle.com/${uuid.test(p.inquiry_id||'')?'#inquiry/'+p.inquiry_id:'#view=email'}`,'以上为事件发生时的记录；当前进度与权限以 CRM 为准。');
 return {msg_type:'text',content:{text:lines.join('\n')}};
}
