// Internal, deterministic drafting. No model, SMTP, arbitrary URLs, or implicit product approval.
export const REVIEW_MARKER='【Grace 产品证据草稿｜仅内部审核，不可直接发送】';
export const PRODUCT_CATEGORIES={wooden_door:{query:'木门',label:'wooden doors',terms:/木门|wood(?:en)?\s*doors?/i},smart_lock:{query:'智能锁',label:'smart locks',terms:/智能锁|smart\s*locks?/i},security_door:{query:'防盗门',label:'security doors',terms:/防盗门|安全门|security\s*doors?/i},medical_door:{query:'医用门',label:'hospital doors',terms:/医用门|医疗门|hospital\s*doors?|medical\s*doors?/i},fire_door:{query:'防火门',label:'fire doors',terms:/防火门|fire\s*doors?/i},steel_door:{query:'钢质门',label:'steel doors',terms:/钢质门|金属门|steel\s*doors?|metal\s*doors?/i},armored_door:{query:'装甲门',label:'armored doors',terms:/装甲门|armou?red\s*doors?/i},cast_aluminum_door:{query:'铸铝门',label:'cast aluminum doors',terms:/铸铝门|cast\s*alumin(?:um|ium)\s*doors?/i},copper_door:{query:'铜门',label:'copper doors',terms:/铜门|copper\s*doors?/i},aluminum_windows:{query:'铝合金门窗',label:'aluminum doors and windows',terms:/铝合金门窗|铝合金窗|alumin(?:um|ium)\s*(?:doors?\s*and\s*)?windows?/i},aluminum_wood_windows:{query:'铝木门窗',label:'aluminum-wood doors and windows',terms:/铝木门窗|alumin(?:um|ium)[ -]wood/i},mechanical_hardware:{query:'机械锁 五金',label:'mechanical locks and door hardware',terms:/机械锁|门用五金|门锁五金|mechanical\s*locks?|door\s*hardware/i}};
export function outreachProductRequest(input){
 if(!input||Object.keys(input).some(k=>!['action','inquiry_id','category','categories','model','application','requirements','recipient','angle','signer'].includes(k)))throw Error('产品草稿请求字段无效');
 const categories=input.categories===undefined?[input.category]:input.categories;
 if(!Array.isArray(categories)||!categories.length||categories.length>Object.keys(PRODUCT_CATEGORIES).length||categories.some(c=>typeof c!=='string'||!Object.hasOwn(PRODUCT_CATEGORIES,c))||new Set(categories).size!==categories.length)throw Error('请选择明确产品门类；待确认/其他需先核实');
 input={...input,category:categories[0]};
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.inquiry_id||'')||!Object.hasOwn(PRODUCT_CATEGORIES,input.category))throw Error('产品草稿询盘或门类无效');
 const recipient=String(input.recipient||'').trim();if(!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]{2,30}$/.test(recipient))throw Error('产品草稿邮箱格式无效');
 const angle=String(input.angle||'').trim();if(angle.length<15||angle.length>400||/[\r\n]/.test(angle)||!/[a-z]/i.test(angle))throw Error('请填写15至400字的英文客户切入点，并人工核对其来源');
 const signer=String(input.signer||'WONLY Sales').trim();if(signer.length>80||/[\r\n]/.test(signer))throw Error('签名无效');
 const context={};for(const [key,max] of [['model',80],['application',200],['requirements',400]]){const value=String(input[key]||'').trim();if(value.length>max||/[\r\n\x00-\x1f]/.test(value))throw Error('型号/场景/需求超长或含无效换行');context[key]=value;}
 return {inquiry_id:input.inquiry_id,category:input.category,categories,recipient,angle,signer,...context};
}
export function outreachEvidenceRequest(input){
 if(!input||Object.keys(input).some(k=>!['action','inquiry_id','categories','model'].includes(k)))throw Error('画册预览字段无效');
 return outreachProductRequest({...input,action:'outreach-product-draft',recipient:'internal@example.invalid',angle:'internal catalogue evidence preview',signer:'Internal'});
}
export function productCatalogueQueries(category){
 if(['security_door','steel_door','armored_door','cast_aluminum_door','copper_door'].includes(category))return ['海外零售画册','Retail Product Catalogue'];
 if(category==='wooden_door')return ['静音木门画册','Soundproof Wooden Doors'];
 if(category==='smart_lock')return ['智能锁画册','True Smart Locks'];
 return ['海外工程画册','Project Solutions'];
}
export function outreachProductEvidence(data,category,model='',catalogueOnly=false){
 const c=Object.hasOwn(PRODUCT_CATEGORIES,category)?PRODUCT_CATEGORIES[category]:null;if(!c||data?.status!=='available')return [];
 const normalized=s=>String(s).toLowerCase().replace(/[\s_-]+/g,'');
 const baseline=/^(?:metaldoor|金属门)1\.0$/.test(normalized(model));
 return (data.assets||[]).filter(a=>a.isCurrentVersion===true&&a.versionLabel&&/^[a-f0-9]{64}$/.test(a.document?.sha256||'')&&['ready','partial'].includes(a.document?.status)&&!/logo|标志|标识|展会|进度|计划|exhibition|schedule/i.test(a.name)&&(!catalogueOnly||/画册|catalog|brochure/i.test(a.name))).slice(0,12).flatMap(a=>(a.document.pages||[]).filter(p=>{
  if(!Number.isInteger(p.page)||!p.chunks?.some(s=>s.trim()))return false;
  const page=p.chunks.join(' '),categoryMatch=c.terms.test(a.name)||c.terms.test(page)||(baseline&&['security_door','steel_door'].includes(category)&&/金属门|metal\s*doors?/i.test(page));
  const modelMatch=!model||normalized(a.name+' '+page).includes(normalized(model))||(baseline&&/(?:^|[^\d])1\.0(?:[^\d]|$)/.test(page));
  return categoryMatch&&modelMatch;
 }).slice(0,3).map(p=>({category,asset_id:a.id,name:a.name,version:a.versionLabel,page:p.page,sha256:a.document.sha256,partial:a.document.status==='partial',quote:p.chunks.filter(s=>s.trim()).join('\n').slice(0,1800),human_verified:false,source_freshness_verified:false})));
}
export function buildProductReviewDraft(input,evidence,now=new Date().toISOString()){
 const categories=input.categories||[input.category];const c={label:categories.map(k=>PRODUCT_CATEGORIES[k]?.label).filter(Boolean).join(' / ')};if(!c.label||!evidence.length||categories.some(k=>!evidence.some(e=>e.category===k||categories.length===1&&!e.category)))throw Error('所选门类尚缺当前版可定位产品证据，不能生成完整产品开发信');
 const subject=`WONLY ${c.label} — requirements discussion`;
 // Product parameters/certifications are deliberately not inferred from extraction.
 const letter=`Hello,\n\nI am reaching out about ${input.angle.replace(/[.!?]+$/,'')}. I would like to explore whether WONLY ${c.label} could be relevant to your requirements. Before recommending a specific model, we would need to confirm your intended application and installation conditions. Could you share the main requirement you would like us to review first? We can then identify the appropriate product information for your evaluation.\n\nBest regards,\n${input.signer}\nWONLY International Sales Team\nwww.wonlyglobal.com`;
 // Shared CRM draft RLS is not material-library membership. Store opaque references only,
 // never filenames or excerpts. Reading source text again requires the original material gateway.
 const notes=evidence.map((e,i)=>`${i+1}. 资料ID：${e.asset_id}；版本：${e.version}；第${e.page}页\n索引版本摘要：${e.sha256}\n${e.partial?'部分解析，仍有缺口；':''}机器提取，未人工核验；未复验原文件实时版本。原文件与摘录不存入共享草稿，重新查阅须通过原物料授权。`).join('\n\n');
 return {subject,letter,body:`${REVIEW_MARKER}\n\n待审核英文正文\n${letter}\n\n内部产品证据与审核步骤（不对客转发）\n生成时间：${now}\n客户/市场切入点：${input.angle}\n\n${notes}\n\n审核步骤：\n1. 核对客户切入点与原始背调/市场来源；本工具不重新核实该输入。\n2. 阅读上述原文并确认门类、型号、配置、当前版本与可披露范围。摘录不等于性能或认证结论。\n3. 仅将获准对外的主张整理为另一份客户正文，再按既有人工审核与触达规则处理。本证据草稿被服务端禁止发送。`,status:'pending_human_review',external_model_called:false,send_allowed:false,evidence_count:evidence.length};
}
