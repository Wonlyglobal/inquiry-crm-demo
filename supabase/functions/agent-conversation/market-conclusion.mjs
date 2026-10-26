// Deterministic internal synthesis; no product excerpt is sent to a model.
export const analyticalMarketFact=f=>f.analysis_eligible!==false&&/功能|配置|开锁|解锁|供电|电池|安装|尺寸|厚度|材质|结构|性能|认证|适用|场景|维护|质保|保修|feature|function|config|unlock|power|battery|install|dimension|thickness|material|performance|certif|application|warranty/i.test(f.field)&&!/^(?:型号|名称|产品名称|系列|model|name|series)$/i.test(f.field);
export const negativeMarketFact=f=>/无|未|没有|不(?:支持|具备|含|能|适用|符合|通过|提供|兼容|可)|缺少|尚缺|待(?:确认|核验|认证)|\bnot\b|\bwithout\b|\bno\b|\bcannot\b|\bun(?:certified|available|supported)\b/i.test(String(f.value||'').replace(/无线|无钥匙|无接触|无感|\bwireless\b|\bkeyless\b|\bcontactless\b|\bno-key\b/gi,''));
export function marketDecision(product,assessment){
 const parameters=(product.facts||[]).filter(analyticalMarketFact),usable=assessment.usable||[];
 const groups={access:parameters.filter(f=>/开锁|解锁|功能|配置|unlock|feature|function/i.test(f.field)),power:parameters.filter(f=>/供电|电池|power|battery/i.test(f.field)),installation:parameters.filter(f=>/安装|尺寸|厚度|结构|install|dimension|thickness/i.test(f.field)),connectivity:parameters.filter(f=>/联网|连接|通信|connect|wireless/i.test(f.field))};
 const market={supply:usable.filter(e=>['case','channel','price'].includes(e.kind)),price:usable.filter(e=>e.kind==='price'),channel:usable.filter(e=>e.kind==='channel'),admission:usable.filter(e=>e.kind==='admission'),demand:usable.filter(e=>e.kind==='demand')};
 const ids=rows=>rows.map(e=>'['+e.id+']').join('、');
 const blockers=[product.retrieval_incomplete?'物料检索候选尚未完整回读，缺失范围不得当作没有冲突或没有参数':product.source_configuration_ambiguous?'多份独立来源的配置尚未对齐，不能拼接字段作为同一配置':!parameters.length?'同型号现行功能参数尚未建立':null,product.conflicts?.length?'同字段证据存在冲突，冲突项不得用于适配':null,
  '本型号在拟用用途/无线配置下的准入适用性和证书范围未核实',!groups.installation.length?'缺本型号安装接口与目标门体的对应测量':'已有安装相关标称，尚缺目标门体逐项测量及样机结果',
  '缺同配置完整交付成本、可执行售后承诺和直接购买验证'].filter(Boolean);
 const checks=[
  {label:'准入核对',basis:market.admission.length?ids(market.admission):'本次未取得可引用的当地适用规则',action:'先确认国家、进口路径、无线配置和具体用途，再逐条核对型号证书/适用范围；规则存在不等于产品合规。',measure:'记录每条要求的适用/不适用依据、证书型号/有效期及未取得项；不把缺证书记为不合格或通过。'},
  {label:'安装与使用验证',basis:parameters.length?parameters.slice(0,4).map(f=>f.field+'｜'+f.ref).join('；'):'本次缺同型号现行参数',action:parameters.length?'先对齐锁体、门厚、背距、开孔、开向及环境，再设计台架验证；涉及当地样机或进口前先完成适用要求核对。':'先补完整型号、配置、安装接口、开锁及供电原页；仅做资料核对，不把名称当优势。',measure:'保留测量值与配置、通过数/总尝试、失败原因及低电/断网应急结果；标称不替代实测。'},
  {label:'渠道与完整成本',basis:ids([...market.channel,...market.price])||'当地报价/交付证据尚缺',action:market.channel.length?'以已核验当地渠道机制为访谈样本，逐项询问安装、改门、备件、保修和响应范围；服务页不代表所有SKU或邮编可用。':'先核对目标场景的本地安装及售后提供者，不能从品牌官网推断全国服务覆盖。',measure:'同锁型/配置/币种/日期分别记录本体、必需配件/网关、税费、运输、安装改门及持续服务，缺项标未知；不据不完整报价判便宜或毛利。'},
  {label:'购买假设与竞争验证',basis:ids([...market.demand,...market.supply])||'本次缺当地需求及供应证据',action:'用已核验的场景线索提出访谈假设，核对使用者、决策者、替代方案及愿付的完整交付价格；供应样本与联网/住房代理不证明智能锁销量。',measure:'记录访谈实际分母、需求原话的公司内证据引用、合格意向及拒绝原因；不编销量、ROI或全国份额。'}
 ];
 const direction=market.channel.length?'优先核对本地安装与售后渠道，再验证终端购买假设':market.price.length?'先对齐当地同配置完整交付报价，再决定验证定位':market.demand.length?'先验证需求代理对应的具体使用场景与购买决策':'先补当地供应、用途和交付证据';
 return {stage:parameters.length?'document_validation':'product_evidence_gap',conclusion:parameters.length?`${product.model}在${assessment.country.label}：建议推进资料与台架方案核对；${direction}。当地商业进入、试销和国家评级均暂缓。`:`${product.model}在${assessment.country.label}：先补同型号现行参数；当前只支持资料核对，不能作适合进入该国的结论。`,
  scope:'本次可核验来源及资料标称范围；尚无当地实测、合规通过或购买效果结论',blockers,checks,parameter_fields:parameters.map(f=>f.field),public_basis:usable.map(e=>e.id)};
}
export function renderMarketDecision(decision){
 return '具体决策结论（分析建议，未执行）：'+decision.conclusion+'\n适用范围：'+decision.scope+'。\n关键待补：'+decision.blockers.join('；')+'。\n'+decision.checks.map(c=>`- ${c.label}｜依据：${c.basis}\n  建议动作：${c.action}\n  后续验证记录：${c.measure}`).join('\n');
}
