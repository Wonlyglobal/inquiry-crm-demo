import {materialModelCodes,materialVersion,explicitMaterialDocument} from './product-input.mjs';
import {writingPrimaryTask,writingSourceName} from './writing-request.mjs';
import {targetedMaterialAnswer} from './targeted-material-answer.mjs';
import {materialConnectionUnavailable} from './materials.mjs';
import {questionPlan} from './question-plan.mjs';
import {materialConstraints,relevantMaterial} from './material-relevance.mjs';
// Query planning and extractive answers only. No external model, inferred fields,
// global-absence claim, or source instruction execution.
const TOPICS=[
 ['care',/保养|清洁|打理/,'维护和保养',['保养','清洁','维护','日常使用']],
 ['fit',/关不严|关不上|门扇.*(?:变形|下垂)|留缝|缝隙/,'空隙',['空隙','缝隙','留缝','关不严','合页']],
 ['recognition',/指纹|人脸|识别不稳|识别失败/,'识别',['指纹','人脸','识别']],
 ['power',/没电|断电|供电|应急开门|应急方案/,'供电',['供电','电池','应急','没电','电源']],
 ['password',/管理员密码|忘记密码/,'管理员',['管理员','密码','身份']],
 ['service',/售后|保修|质保|服务网点/,'售后',['售后','保修','质保','服务网点']],
 ['interface',/第三方.*平台|平台.*(?:接口|对接)|接口|远程授权|撤销权限|短租/,'授权',['接口','平台','授权','离线','撤销']],
 ['certificate',/认证|证书|检测报告|防火要求/,'认证',['认证','证书','检测报告','测试报告','防火']],
 ['coastal',/沿海|靠海|腐蚀|盐雾/,'涂层',['涂层','腐蚀','盐雾','沿海']],
 ['damp',/潮湿|地下.*仓库/,'防潮',['防潮','潮湿','湿度']],
 ['elderly',/养老|老人|适老/,'老人',['老人','适老','养老','紧急']],
 ['dormitory',/宿舍|学校.*门锁/,'宿舍',['宿舍','权限','管理']],
 ['installation',/安装|装配|尺寸不符/,'安装',['安装','装配','测量','洞口']],
];
// Negative output constraints are not a request to search for those facts.
export function taskSubject(value){return writingPrimaryTask(value).split(/[，,；;。]/).filter(x=>!/^\s*(?:不编|不要编|不承诺|不要承诺|不能承诺|不虚构|未知.*(?:不编|留空|占位))/.test(x)).join('，');}
export function sourceTaskPlan(input){
 if(input?.action!=='chat'||input.voice||input.privateReportKey||typeof input.question!=='string')return null;
 const priorTask=(input.materialHistory||[]).find(x=>String(x).startsWith('资料任务：'));
 if(priorTask&&/核对刚才|再精简|短一点|详细一点|展开/.test(input.question)&&!/(?:新的|另外|另一个|重新写|帮我写)/.test(input.question)){
  const resumed=sourceTaskPlan({...input,question:priorTask.slice(5),materialHistory:[]});if(resumed)return {...resumed,question:input.question,continuing:true};
 }
 const full=input.question.trim(),q=taskSubject(full);
 const sourceName=writingSourceName(q);if(explicitMaterialDocument(q)&&!sourceName)return null;
 if(/翻译|译成|西班牙语|西语|Spanish/i.test(q)&&/已确认英文稿|这段|提供|不要添加/.test(q)&&!/查.{0,8}资料|核对.{0,8}原文/.test(q))return null;
 if(questionPlan(full).parts.length>1)return null;
 const prior=(input.materialHistory||[]).find(x=>!String(x).startsWith('work-writing:v1.')&&materialModelCodes(String(x)).length===1);
 if(prior&&!materialModelCodes(q).length&&q.length<=100&&/^(?:请|那|它|这款|还有|说明|安装|认证|尺寸|供电|电池|材质|功能|配置|来源|出处|怎么|如何)/.test(q))return null;
 if(/指令|检索日志|全部客户资料|忽略规则|英西双语核对清单/.test(q))return null;
 if(/^(?:删掉|去掉|这版|这段|这稿|改得|再精简|翻译成|译成|现在确认|确认最新|英文稿已确认|已确认|暂时不要翻译)/.test(q))return null;
 if(/公司介绍|品牌.{0,8}介绍|介绍.{0,5}王力/.test(q)&&!/(?:和|以及|同时|再).{0,10}(?:保养|售后|安装|接口)/.test(q))return null;
 if(/(?:只有|只要|仅).{0,4}(?:问法|沟通建议|澄清问题)|不查资料/.test(q))return null;
 if(!/客户|产品|门|锁|项目|型号|售后|认证|证书|接口|保养|识别/.test(q))return null;
 const matched=TOPICS.filter(([,re])=>re.test(q)),topics=matched.slice(0,2);if(!topics.length)return null;
 const models=materialModelCodes(q);if(models.length>1)return null; // existing scoped comparison handles this
 const product=/木门/.test(q)?'木门':/智能锁|门锁/.test(q)?'智能锁':'';
 const version=materialVersion(q);
 const constraints={...materialConstraints(q),exactDocument:sourceName};constraints.english=/(?:英文|英语|English).{0,6}(?:手册|画册|资料|报告|证书|原文)|(?:手册|画册|资料|报告|证书).{0,6}(?:英文|英语|English)/i.test(q);
 const searches=topics.map(([, ,search])=>search);if(topics.length===1){const alternate=topics[0][3].find(term=>term!==topics[0][2]);if(alternate)searches.push(alternate);}
 // The live adapter treats a query ending in a filename as a whole-file lookup
 // and returns its first six pages. Keep the filename in the AND terms, and the
 // content topic in query, so a late matching page is selected before that cap.
 return {question:full,subject:q,models,product,version,constraints,companyRequested:/公司介绍|品牌.{0,8}介绍|介绍.{0,5}王力/.test(q),overflow:matched.length>2,topics:topics.map(([id,,search,terms])=>({id,search,terms})),requests:searches.slice(0,2).map(search=>({query:[models[0]||product,search].filter(Boolean).join(' '),terms:[...(sourceName?[sourceName]:[]),...(models.length?[models[0]]:!sourceName&&product?[product]:[]),search],page:1,constraints}))};
}
const canon=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s_/.-]+/g,'');
const ref=(a,p)=>`${a.name}，${a.versionLabel||'版本未标注'}，第${p.page}页`;
export function sourceTaskMaterials(responses,constraints={}){
 const available=responses.filter(r=>r.status==='available'&&r.evidence_gate?.version===1);
 const assets=[];for(const r of available)for(const a of r.assets||[]){if(constraints.exactDocument&&String(a.name).normalize('NFKC').toLowerCase()!==constraints.exactDocument.normalize('NFKC').toLowerCase()||!relevantMaterial(a,constraints))continue;const key=[a.id,a.document?.sha256,a.versionLabel,a.isCurrentVersion,a.updatedAt].join('|');const prior=assets.find(x=>x.key===key);if(!prior)assets.push({key,asset:structuredClone(a)});else for(const p of a.document?.pages||[]){const page=prior.asset.document.pages.find(x=>x.page===p.page);if(!page)prior.asset.document.pages.push(structuredClone(p));else{page.chunks=[...new Set([...(page.chunks||[]),...(p.chunks||[])])];page.facts=[...(page.facts||[]),...(p.facts||[])];}}}
 return {status:'available',assets:assets.map(x=>x.asset),evidence_gate:{version:1},has_more:available.some(r=>r.has_more)};
}
export function sourceTaskAnswer(plan,responses,{targeted=targetedMaterialAnswer,native=null}={}){
 if(!plan)return null;
 const available=responses.filter(r=>r.status==='available'&&r.evidence_gate?.version===1);
 if(!available.length&&responses.some(r=>materialConnectionUnavailable(r)))return {unavailable:true};
 const data=sourceTaskMaterials(responses,plan.constraints);
 const usableData={...data,assets:data.assets.map(a=>({...a,...(a.document?{document:{...a.document,pages:(a.document.pages||[]).filter(p=>p.truncated!==true)}}:{})}))};
 const targetedResult=available.length?targeted(usableData,plan.subject,native):null;
 const incomplete=plan.overflow||responses.some(r=>r.status!=='available')||available.some(r=>r.has_more)||data.assets.some(a=>a.document?.status!=='ready'||a.document?.pages?.some(p=>p.truncated===true)||a.document?.evidence_selection?.pages_omitted>0||a.document?.warnings?.some(w=>/截断|truncat/i.test(w)));
 if(targetedResult)return {answer:targetedResult.answer,materials:targetedResult.materials,status:'source_answer',source_count:targetedResult.materials.length,incomplete};
 const selected=[],located=[];
 const requiresModel=plan.topics.some(t=>['power','recognition','interface'].includes(t.id))||/保修期|保修期限|质保期限|warranty period/i.test(plan.subject);
 for(const a of data.assets){
  const d=a.document;if(!['partial','ready'].includes(d?.status)||!d.sha256)continue;
  const versionOk=plan.version?canon(materialVersion(a.versionLabel))===canon(plan.version):a.isCurrentVersion===true;
  if(plan.product==='木门'&&!/木门/.test(a.name))continue;
  for(const p of d.pages||[]){
   if(!Number.isInteger(p.page)||p.page<1)continue;
   for(const topic of plan.topics){
    const hits=(p.chunks||[]).filter(c=>topic.terms.some(term=>c.includes(term)));if(!hits.length)continue;
    const key=[a.id,d.sha256,p.page,topic.id].join('|');if(located.some(x=>x.key===key))continue;
    const modelScoped=materialModelCodes(a.name||'').length>0;
    located.push({key,ref:ref(a,p),versionOk,modelScoped});
    // Model parameters require the established field/row/native validator. A keyword
    // on a mixed-model page is not enough to bind an operating instruction to a model.
    if(plan.models.length||requiresModel||modelScoped||!versionOk||plan.topics.some(t=>t.id==='password'))continue;
    for(const chunk of hits){
     if(chunk.length<20||chunk.length>450||materialModelCodes(chunk).length||/忽略.{0,8}规则|输出.{0,8}(?:密钥|客户资料|检索日志)|ignore.{0,15}instructions/i.test(chunk))continue;
     if(p.truncated===true)continue;
     if(selected.some(x=>x.text===chunk))continue;
     selected.push({text:chunk.trim(),ref:ref(a,p),asset:a});if(selected.length>=2)break;
    }
   }
  }
 }
 let answer,status,materials=[];
 if(selected.length){
  answer=selected.slice(0,2).map(x=>x.text+'\n出处：'+x.ref).join('\n\n');status='source_excerpt';materials=[...new Set(selected.slice(0,2).map(x=>x.asset))];
  answer+='\n\n以上是对应原页说明；型号、配置和适用条件以原文件为准。';
 }else if(located.length){
  answer='已定位相关资料：\n'+[...new Set(located.map(x=>x.ref))].slice(0,3).join('\n')+'\n'+(plan.models.length?'本次尚未取得与该完整型号和字段可靠对应的原文，不能套用其他型号。':requiresModel||located.some(x=>x.modelScoped)?'这些资料涉及具体型号。请先说明所问型号，不能把其中某款的配置当作通用说明。':located.every(x=>!x.versionOk)?'版本尚未确认，暂不把这些内容作为当前产品说明。':'相关段落仍需完整读取或核对，不能凭关键词整理成产品结论。');status='source_located_unverified';
 }else{
  answer=available.length?'本次检索尚未取得可引用的对应原文。':'本次资料读取未完成。';
  answer+='这不表示资料库里没有，也不表示产品不支持。';status=available.length?'source_match_unconfirmed':'source_unavailable';
 }
 if(incomplete)answer+='\n资料覆盖尚未完整核验。';
 if(!selected.length)answer+='\n请提供具体型号或资料名，我会继续按对应版本核对。';
 if(plan.topics.some(t=>t.id==='certificate'))answer+='\n宣传页不替代具体型号、配置和市场要求的有效检测报告。';
 if(plan.topics.some(t=>t.id==='password'))answer+='\n账号或管理员权限问题请通过身份核验及官方服务处理。';
 return {answer,materials,status,source_count:located.length,incomplete};
}
