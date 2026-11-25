import {materialModelCodes,materialFields} from './product-input.mjs';
// This is a deny-fallback boundary, not a source of facts or a fuzzy model resolver.
// Only query selectors are retained; internal answers never enter model history.
const OWN=/王力|wonly|wangli|我司|我们公司|本公司/i;
const FACT=/型号|参数|认证|证书|供货|供了|供的|成立|注册|工厂|产能|员工|总部|公司名|中文名|英文名|产品|项目|案例|材质|尺寸|保修|质保|电池|供电|model|specification|certificat|warranty|material|dimension/i;
const RELATION=/就是|是不是|同一|同款|对应|等同|一样|关系|别名|alias|same|equivalent/i;
const CORRECT=/只说已核实|不要推测|别猜|不要猜|有依据吗|有证据吗|你确定吗|撤回|纠正刚才|only verified|don.t guess/i;
const productCodes=q=>materialModelCodes(q).filter(s=>/^[A-Z]{1,3}\d{2,4}[A-Z]?(?:[ _-]*(?:PRO|MAX|PLUS|ULTRA|LITE|BASIC|STANDARD))?$/.test(s));
export function factualScope(question,history=[]){
 const q=String(question||'').normalize('NFKC').trim();
 const prior=String(history.at(-1)||'').replace(/^事实核对：/,'');
 const codes=productCodes(q);
 if(codes.length)return {topic:'product',question:q,models:codes,fields:materialFields(q),relation:codes.length>1&&RELATION.test(q)};
 if(OWN.test(q)&&FACT.test(q))return {topic:'company',question:q,models:[],fields:materialFields(q)};
 // Never recover an old subject across an intervening unrelated turn.
 if(q.length<=100&&CORRECT.test(q)&&prior){const previous=factualScope(prior);if(previous)return {...previous,correction:true};}
 if(q.length<=100&&/^(?:那|它|这款|这个|还有|来源|出处|认证|证书|供货|供了|尺寸|材质|保修|质保|电池|供电|certification\b|warranty\b|material\b|dimensions?\b|size\b|source\b|reference\b|battery\b|power supply\b|what about\b|and\b)/i.test(q)&&prior){
  const previous=factualScope(prior);if(previous)return {...previous,question:previous.question+'；'+q,fields:materialFields(q),relation:false,clarifyModel:previous.models.length>1};
 }
 return null;
}
export function factualGap(scope){
 if(!scope)return null;
 const subject=scope.models.length?scope.models.join(' 与 '):'这项企业信息';
 const answer=scope.clarifyModel?`要查询 ${scope.models.join(' 还是 ')} 的${scope.fields.join('、')||'资料'}？两者的型号对应关系尚未确认。`:scope.relation?`目前不能确认 ${subject} 是否对应同一款产品；需要明确写出型号对应关系的资料，不能按名称相似推定。`:`${subject}：当前未取得能直接支持这项回答的证据，暂不作推断。`;
 return {answer:(scope.correction?'此前未附证据的型号关系或认证说法不应采信。\n':'')+answer,provider:'internal',model:'factual-evidence-boundary',context:{route:'materials',status:'evidence_required',material_question:('事实核对：'+scope.question).slice(0,500),fact_scope:{topic:scope.topic,models:scope.models,fields:scope.fields}}};
}
