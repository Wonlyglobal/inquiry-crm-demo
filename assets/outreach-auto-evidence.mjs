import {publicEvidenceItem} from './outreach-compose-policy.mjs';
import {researchCompanyDomain} from './business-public-research.mjs';
import {PUBLIC_PRODUCT_TERMS,publicMarketCode} from './outreach-research-plan.mjs';
// Category synonyms only identify a publicly described range; never infer
// configuration, certification or performance from a category match.
export function publicProductPageMatches(categories,text){
 const aliases={security_door:['security door','steel door','metal door'],steel_door:['steel door','metal door'],wooden_door:['wooden door','wood door']};
 const normalized=String(text||'').toLowerCase();
 return categories.some(category=>(aliases[category]||[PUBLIC_PRODUCT_TERMS[category]?.replace(/s$/,'')]).filter(Boolean).some(term=>normalized.includes(term)));
}
// Internal retrieval and public page candidates stay separate. Catalogue quotes
// are never converted into external-model input or public claims automatically.
export async function collectOutreachEvidence({inquiryId,company,domain,country,categories,invoke,isCurrent,progress=()=>{}}){
 const items=[],gaps=[],internal={};const day=new Date().toISOString().slice(0,10);
 const add=(kind,statement,source,date=day)=>{try{items.push({...publicEvidenceItem({statement,source,date}),kind})}catch{}};
 const current=()=>!isCurrent||isCurrent();
 const call=async(name,body)=>{const response=await invoke(name,{body});if(!current())throw Error('询盘已切换，已停止补齐');if(response.error||response.data?.error)throw Error(response.data?.error||'检索服务未完成');return response.data};
 const chosen=[...new Set(categories||[])].filter(c=>Object.hasOwn(PUBLIC_PRODUCT_TERMS,c));
 const host=researchCompanyDomain(domain||'');
 let publicCompany='';try{if(host&&company)publicCompany=publicEvidenceItem({statement:company,source:'https://'+host,date:day}).statement}catch{gaps.push('公司名称格式含非公开信息，检索只使用官网域名')}

 if(host){
  progress('1/3 正在重新读取当前公司官网及公开市场线索…');
  try{
   const data=await call('company-website-images',{inquiry_id:inquiryId,website:'https://'+host,company_name:publicCompany,market_code:publicMarketCode(country),focus_category:chosen[0]||''});
   for(const page of data.website_evidence||[])if(page.description)add('company_facts','Company website description: '+page.description.slice(0,480),page.url,'Accessed '+day);
   for(const news of data.market_headlines||[])add('market_facts','HEADLINE ONLY (not a customer purchase claim): '+news.title,news.source_url,news.date||'Accessed '+day);
   internal.company=data;
  }catch(e){if(!current())throw e;gaps.push('公司/市场检索：'+e.message)}
 }else gaps.push('公司官网缺失或为邮箱/表单服务商，未猜测域名');
 if(!chosen.length)gaps.push('产品门类待确认，未任意选择全门类');
 else{
  progress('2/3 正在内部检索 Grace 当前画册页，并核对 WONLY 公开产品页面…');
  try{internal.catalogue=await call('agent-conversation',{action:'outreach-product-evidence',inquiry_id:inquiryId,categories:chosen,model:''})}catch(e){if(!current())throw e;gaps.push('Grace 产品检索：'+e.message)}
  try{
   const data=await call('company-website-images',{inquiry_id:inquiryId,website:'https://www.wonlyglobal.com/',company_name:'WONLY',focus_category:chosen[0]});
   for(const page of data.website_evidence||[]){
    const text=[page.title,page.description].filter(Boolean).join(' · ');
    if(publicProductPageMatches(chosen,text)&&page.description)add('product_facts','WONLY public product page description: '+page.description.slice(0,460),page.url,'Accessed '+day);
   }
  }catch(e){if(!current())throw e;gaps.push('公开产品检索：'+e.message)}
 }
 if(!current())throw Error('询盘已切换，未采用补齐结果');
 progress('3/3 正在按来源去重，分开公开候选与内部画册证据…');
 const unique=[...new Map(items.map(item=>[item.kind+'|'+item.source+'|'+item.statement,item])).values()];
 const counts=Object.fromEntries(['company_facts','market_facts','product_facts'].map(kind=>[kind,unique.filter(i=>i.kind===kind).length]));
 if(!counts.market_facts)gaps.push('未取得有来源的相关市场新闻；未用公司介绍冒充市场调研');
 if(!counts.product_facts)gaps.push('未取得匹配门类的公开产品主张；内部画册未自动外发');
 return {items:unique,gaps,internal,counts,readAt:new Date().toISOString(),requiresReview:true};
}
