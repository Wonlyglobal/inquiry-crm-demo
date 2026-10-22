// Internal, deterministic drafting. No model, SMTP, arbitrary URLs, or implicit product approval.
export const REVIEW_MARKER='【Grace 产品证据草稿｜仅内部审核，不可直接发送】';
export const PRODUCT_CATEGORIES={wooden_door:{query:'木门',label:'wooden doors',terms:/木门|wood(?:en)?\s*doors?/i},smart_lock:{query:'智能锁',label:'smart locks',terms:/智能锁|smart\s*locks?/i},security_door:{query:'防盗门',label:'security doors',terms:/防盗门|安全门|security\s*doors?/i},medical_door:{query:'医用门',label:'hospital doors',terms:/医用门|医疗门|hospital\s*doors?|medical\s*doors?/i},fire_door:{query:'防火门',label:'fire doors',terms:/防火门|fire\s*doors?/i}};
export function outreachProductRequest(input){
 if(!input||Object.keys(input).some(k=>!['action','inquiry_id','category','recipient','angle','signer'].includes(k)))throw Error('产品草稿请求字段无效');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.inquiry_id||'')||!Object.hasOwn(PRODUCT_CATEGORIES,input.category))throw Error('产品草稿询盘或门类无效');
 const recipient=String(input.recipient||'').trim();if(!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]{2,30}$/.test(recipient))throw Error('产品草稿邮箱格式无效');
 const angle=String(input.angle||'').trim();if(angle.length<15||angle.length>400||/[\r\n]/.test(angle)||!/[a-z]/i.test(angle))throw Error('请填写15至400字的英文客户切入点，并人工核对其来源');
 const signer=String(input.signer||'WONLY Sales').trim();if(signer.length>80||/[\r\n]/.test(signer))throw Error('签名无效');
 return {inquiry_id:input.inquiry_id,category:input.category,recipient,angle,signer};
}
export function outreachProductEvidence(data,category){
 const c=Object.hasOwn(PRODUCT_CATEGORIES,category)?PRODUCT_CATEGORIES[category]:null;if(!c||data?.status!=='available')return [];
 return (data.assets||[]).filter(a=>a.isCurrentVersion===true&&a.versionLabel&&a.document?.sha256&&['ready','partial'].includes(a.document?.status)&&!/logo|标志|标识/i.test(a.name)&&c.terms.test(a.name)).slice(0,3).flatMap(a=>(a.document.pages||[]).filter(p=>Number.isInteger(p.page)&&p.chunks?.some(s=>s.trim())).slice(0,2).map(p=>({asset_id:a.id,name:a.name,version:a.versionLabel,page:p.page,sha256:a.document.sha256,partial:a.document.status==='partial',quote:p.chunks.find(s=>s.trim()).slice(0,600),human_verified:false,source_freshness_verified:false})));
}
export function buildProductReviewDraft(input,evidence,now=new Date().toISOString()){
 const c=PRODUCT_CATEGORIES[input.category];if(!c||!evidence.length)throw Error('未取得当前版可定位产品证据，不能生成产品开发信');
 const subject=`WONLY ${c.label} — requirements discussion`;
 // Product parameters/certifications are deliberately not inferred from extraction.
 const letter=`Hello,\n\nI am reaching out about ${input.angle.replace(/[.!?]+$/,'')}. I would like to explore whether WONLY ${c.label} could be relevant to your requirements. Before recommending a specific model, we would need to confirm your intended application and installation conditions. Could you share the main requirement you would like us to review first? We can then identify the appropriate product information for your evaluation.\n\nBest regards,\n${input.signer}\nWONLY International Sales Team\nwww.wonlyglobal.com`;
 // Shared CRM draft RLS is not material-library membership. Store opaque references only,
 // never filenames or excerpts. Reading source text again requires the original material gateway.
 const notes=evidence.map((e,i)=>`${i+1}. 资料ID：${e.asset_id}；版本：${e.version}；第${e.page}页\n索引版本摘要：${e.sha256}\n${e.partial?'部分解析，仍有缺口；':''}机器提取，未人工核验；未复验原文件实时版本。原文件与摘录不存入共享草稿，重新查阅须通过原物料授权。`).join('\n\n');
 return {subject,letter,body:`${REVIEW_MARKER}\n\n待审核英文正文\n${letter}\n\n内部产品证据与审核步骤（不对客转发）\n生成时间：${now}\n客户/市场切入点：${input.angle}\n\n${notes}\n\n审核步骤：\n1. 核对客户切入点与原始背调/市场来源；本工具不重新核实该输入。\n2. 阅读上述原文并确认门类、型号、配置、当前版本与可披露范围。摘录不等于性能或认证结论。\n3. 仅将获准对外的主张整理为另一份客户正文，再按既有人工审核与触达规则处理。本证据草稿被服务端禁止发送。`,status:'pending_human_review',external_model_called:false,send_allowed:false,evidence_count:evidence.length};
}
