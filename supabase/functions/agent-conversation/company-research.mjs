// Company lookup in the internal background-research system (国家背调系统).
// Answers are rendered locally and never sent to an external model. Personal contact fields
// (email, phone, decision makers, key contacts and their methods) are never read into the answer.
import {boundedBytes} from './bailian.mjs';
import {RESEARCH_URL} from './research.mjs';
const DOMAIN=/^(?!.*\.\.)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9一-鿿]/g,'');
const FIELDS=[['countryName','国家'],['city','城市'],['categoryName','客户类型'],['productFocus','产品方向'],['website','官网'],['scale','规模线索'],['brandsCarried','代理/品牌'],['projects','项目线索'],['importSignal','进口信号'],['fitReason','匹配理由'],['angle','切入角度'],['risk','风险']];

export function companyLookupIntent(question){
 const q=String(question).slice(0,500);
 return /背调|查一下|查查|了解一下|这家|该公司|客户资料|采购商|买家|公司情况|靠谱/.test(q)||/[a-z0-9-]+\.[a-z]{2,}/i.test(q);
}
export function matchCompanies(question,index){
 const q=String(question).slice(0,500).toLowerCase(),nq=norm(q),out=[];
 for(const c of Array.isArray(index?.companies)?index.companies.slice(0,20000):[]){
  const domain=String(c.domain||'').toLowerCase(),root=domain.split('.')[0],name=norm(c.normName||c.company);
  let rank=0;
  if(domain&&DOMAIN.test(domain)&&q.includes(domain))rank=3;
  else if(name.length>=5&&nq.includes(name))rank=2;
  else if(root.length>=5&&new RegExp('(^|[^a-z0-9])'+root.replace(/[^a-z0-9-]/g,'')+'([^a-z0-9]|$)').test(q))rank=1;
  if(rank)out.push({row:c,rank,company:String(c.company).slice(0,120),domain:DOMAIN.test(domain)?domain:'',country:String(c.country||''),countryName:String(c.countryName||''),city:String(c.city||'').slice(0,60),categoryName:String(c.categoryName||''),fitScore:Number.isInteger(c.fitScore)?c.fitScore:null});
 }
 return out.sort((a,b)=>b.rank-a.rank).slice(0,3);
}
export function companyCard(detail,match){
 const d=detail&&typeof detail==='object'?detail:{};
 const line=([k,label])=>{const v=typeof d[k]==='string'?d[k].trim().slice(0,400):'';return v?`${label}：${v}`:null};
 const src=[...(Array.isArray(d.researchSources)?d.researchSources:[]),...(Array.isArray(d.checkedSources)?d.checkedSources:[]),d.sourceUrl].map(x=>typeof x==='string'?x:x?.url).filter(u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password}catch{return false}}).slice(0,5);
 const score=Number.isInteger(d.fitScore)?d.fitScore:match.fitScore;
 return [`${String(d.company||match.company).slice(0,120)}${match.domain?`（${match.domain}）`:''}`,
  ...FIELDS.map(line).filter(Boolean),
  score!=null?`匹配度评分：${score}/5（背调系统评分，非成交概率）`:null,
  d.researchStatus||d.researchConfidence?`调研状态：${String(d.researchStatus||'未标注').slice(0,40)}｜可信度：${String(d.researchConfidence||d.confidence||'未标注').slice(0,20)}`:null,
  d.addedDate?`加入背调系统：${String(d.addedDate).slice(0,10)}`:null,
  src.length?'来源：'+src.join('；'):'来源：背调系统未记录可引用链接，需人工核实。'].filter(Boolean).join('\n');
}
async function getJson(url,fetcher,max){const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('http_'+r.status);return JSON.parse(new TextDecoder().decode(await boundedBytes(r,max)))}
// Primary source: business-only export in the CRM private bucket (service role only).
// Fallback: the public index (country/city/category/score only). The public company/*.json
// detail files are not served, so they are no longer fetched.
export const PRIVATE_EXPORT={bucket:'background-research',path:'background-business-v1.json'};
export function validExport(data){return data?.schema==='background-business-v1'&&Array.isArray(data.companies)&&data.companies.length<=50000}
export async function loadPrivateExport(admin){
 try{const {data,error}=await admin.storage.from(PRIVATE_EXPORT.bucket).download(PRIVATE_EXPORT.path);if(error||!data||data.size>10*1024*1024)return null;const json=JSON.parse(await data.text());return validExport(json)?json:null}catch{return null}
}
const CONTACT_KEYS=['email','phone','contactSource','decisionContact','keyContacts','keyContactMethods','contacts','nextAction'];
export async function lookupCompanies(question,{admin,fetcher=fetch}={}){
 const exported=admin?await loadPrivateExport(admin):null;
 let index=exported;
 if(!index){try{index=await getJson(RESEARCH_URL,fetcher,8*1024*1024)}catch{return {status:'unavailable',matches:[]}}}
 const matches=matchCompanies(question,index);
 for(const m of matches){if(exported){const d={...m.row};for(const k of CONTACT_KEYS)delete d[k];d.researchSources=d.sources;m.detail=d}delete m.row}
 return {status:'available',source:exported?'private_export':'public_index',as_of:/^\d{4}-\d{2}-\d{2}$/.test(index.generatedAt)?index.generatedAt:null,matches};
}
export function companyAnswer(result){
 if(result.status!=='available'||!result.matches.length)return null;
 const head=`以下来自国家背调系统的研究记录${result.as_of?`（数据日期 ${result.as_of}）`:''}${result.source==='public_index'?'，本次只读到公开索引':''}，是团队此前整理的资料，本次未独立核验，不代表对方当前真实采购意向或信用。联系人与联系方式不在智能体中展示，请到背调系统查看。本回答未发送给外部模型。`;
 const cards=result.matches.slice(0,2).map((m,i)=>`${i+1}. `+(m.detail?companyCard(m.detail,m):companyCard({countryName:m.countryName,city:m.city,categoryName:m.categoryName},m)+(m.domain?'\n（CRM 私有背调数据未读取到，本次仅显示公开索引信息）':'\n（背调系统未收录该公司官网域名，只有索引信息）')));
 const more=result.matches.length>2?`\n\n另有 ${result.matches.length-2} 家名称相近，请提供官网域名以精确查找。`:'';
 const ambiguous=result.matches.length>1&&result.matches[0].rank<3?'\n\n按名称匹配到多家，请核对是否为你要找的公司；提供官网域名可精确匹配。':'';
 return head+'\n\n'+cards.join('\n\n')+more+ambiguous+'\n\n建议下一步：按核验清单复核官网与邮箱域名一致性、企业登记和实体地址，再决定报价或样品条款。';
}
