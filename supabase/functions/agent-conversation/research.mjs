import {boundedBytes} from './bailian.mjs';
export const RESEARCH_URL='https://business.foreverdoodle.com/api/index.json';
const CATEGORIES=new Set(['进口商/经销商','五金/建材零售','安防/门禁集成商','建筑总包','地产开发商','酒店集团','大型建筑承包商']);
// Fixed vocabularies prevent arbitrary source fields becoming model instructions.
const COUNTRIES=new Set('KZ MX BR US AE OM SA QA UZ KW BH NG IN GH ID VN MY PH GE AZ KG EG TH ET TZ BD DZ KE PK LK ZA MM MA KH RU PE CO TR PL AF CL EC RO TJ MV UA LA CI JO LB UG MZ MN SN CM AO NP IQ TM'.split(' '));
export function researchSummary(payload){
 if(!Array.isArray(payload?.companies)||payload.companies.length>20000)throw Error('背调索引格式不支持');
 const countries={},categories={};let missing=0;
 for(const c of payload.companies){const country=COUNTRIES.has(c.country)?c.country:'其他/未核验';const category=CATEGORIES.has(c.categoryName)?c.categoryName:'其他/未核验';countries[country]=(countries[country]||0)+1;categories[category]=(categories[category]||0)+1;if(country==='其他/未核验'||category==='其他/未核验')missing++}
 const grouped=o=>Object.entries(o).filter(([,n])=>n>=5).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count}));
 return {source:RESEARCH_URL,as_of:/^\d{4}-\d{2}-\d{2}$/.test(payload.generatedAt)?payload.generatedAt:null,sample_count:payload.companies.length,countries:grouped(countries),categories:grouped(categories),country_group_count:grouped(countries).length,category_group_count:grouped(categories).length,unverified_count:missing,limits:'背调索引样本，非市场总量或成交概率；小于5条的分组不披露；无企业名称、域名、联系人、联系方式、商业判断或CRM客户关联。'};
}
export async function loadResearch(fetcher=fetch){try{const response=await fetcher(RESEARCH_URL,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('unavailable');return researchSummary(JSON.parse(new TextDecoder().decode(await boundedBytes(response,8*1024*1024))))}catch{return {source:RESEARCH_URL,status:'unavailable',limits:'背调数据暂不可用，不能据此声称已掌握市场。'}}}
