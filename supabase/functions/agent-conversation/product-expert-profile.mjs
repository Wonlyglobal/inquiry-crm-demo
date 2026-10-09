// An evidence map of this authorized retrieval, never a whole-library completeness score.
const DIMENSIONS=[
 ['identity','系列与型号',/型号|系列|model|series/i],
 ['structure','材料与结构',/材质|厚度|尺寸|门框|结构|material|thickness|dimension|frame/i],
 ['configuration','配置与功能',/锁体|锁芯|开锁|供电|屏幕|颜色|配置|功能|lock|power|feature|colour|color/i],
 ['performance','性能与测试条件',/耐火|隔声|隔音|防盗|性能|等级|fire|sound|grade|performance/i],
 ['certification','标准与认证范围',/标准|认证|证书|检测|standard|certif|test/i],
 ['application','场景与使用限制',/场景|用途|适用|限制|环境|application|usage|limitation/i],
 ['installation','安装与维护',/安装|维护|保养|维修|installation|maintenance/i],
 ['commercial','交付与售后',/交期|保修|售后|包装|停产|warranty|delivery|packaging/i]
];
export function expertProfile(product){
 const findings=product.findings||[];
 const dimensions=DIMENSIONS.map(([id,label,pattern])=>{
  const evidence=findings.filter(f=>pattern.test(f.field));
  return {id,label,status:evidence.length?'unverified':'not_retrieved',evidence};
 });
 return {scope:'current_authorized_retrieval',human_verified:false,dimensions,
  gaps:dimensions.filter(d=>!d.evidence.length).map(d=>({dimension:d.id,label:d.label,action:`补充或检索该型号的${d.label}资料，并核对版本及适用条件`})),
  selection_ready:false,
  blockers:[...(product.partial?['来源存在解析缺口']:[]),...(product.conflicts?.length?['存在不同表述，需核对条件和版本']:[]),'产品归属与参数尚未人工核验','尚无经过核验的选型规则']};
}
export function expertProfileText(profile){
 if(!profile)return '';
 const present=profile.dimensions.filter(d=>d.evidence.length);
 return '\n产品专家档案（仅本次检索范围）\n'+present.map(d=>`${d.label}：`+d.evidence.slice(0,2).map(f=>`${f.field}：${f.value}（${f.asset}，第${f.page}页${f.version?`，${f.version}`:''}${f.current===false?'，历史版本':f.current===true?'，当前版本':'，版本状态未知'}）`).join('；')).join('\n')
 +'\n本次未取得依据：'+(profile.gaps.map(g=>g.label).join('、')||'各维度均有候选摘录，但不代表信息完整')
 +'。未取得不代表物料库不存在。\n选型结论待补充：'+profile.blockers.join('；')+'。';
}
