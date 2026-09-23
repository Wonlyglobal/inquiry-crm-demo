import {boundedBytes} from './bailian.mjs';
const STATES=new Set(['ok','partial','missing','stale']);
const EVENTS=['cta_click','form_open','form_start','inquiry_prompt_select','form_submit','generate_lead','form_error','form_abandon','contact_click'];
const BRANDS=new Set(['hormann.com','dierre.com','oikos.it','kaadas.com','cdfdistributors.com']);
const number=(x,max=1e12)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max?x:null;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))?x:null;
const time=x=>typeof x==='string'&&x.length<=40&&Number.isFinite(Date.parse(x))?x:null;
const state=x=>STATES.has(x)?x:'missing';
const path=x=>typeof x==='string'&&x.length<=200&&/^\/(?:[a-z0-9_-]+\/?)*$/i.test(x)?x:null;
const gsc=x=>({clicks:number(x?.clicks),impressions:number(x?.impressions),ctr:number(x?.ctr,1),avg_position:number(x?.avg_position,1000)});
const ga4=x=>({organic_sessions:number(x?.organic_sessions)});
const events=x=>Object.fromEntries(EVENTS.map(k=>[k,number(x?.[k])]));
const safeText=x=>typeof x==='string'&&!/@|sk-[\w.-]{12,}|Bearer\s|PRIVATE KEY|https?:|<|(?:密码|密钥|银行卡号|身份证号)\s*[:：=]/i.test(x)?x.slice(0,350):null;
const metrics=x=>({gsc:gsc(x?.gsc),ga4:ga4(x?.ga4),funnel:events(x?.funnel)});
export function seoSummary(raw,now=Date.now()){
 if(raw?.schema_version!=='1.0'||raw.site!=='wonlyglobal.com'||!time(raw.generated_at)||Date.parse(raw.generated_at)>now+300000)throw Error('invalid_seo_snapshot');
 const freshness=Object.fromEntries(['ga4','gsc','semrush'].map(k=>{const x=raw.freshness?.[k];return [k,{through:date(x?.through),lag_days:number(x?.lag_days,365),status:state(x?.status)}]}));
 const windows=Object.fromEntries(['7d','28d'].map(k=>[k,{gsc:gsc(raw.windows?.[k]?.gsc),ga4:ga4(raw.windows?.[k]?.ga4)}]));
 const experiments=(Array.isArray(raw.experiments)?raw.experiments:[]).slice(0,15).map(x=>({id:/^[a-z0-9_-]{1,80}$/i.test(x?.id)?x.id:null,target_paths:(Array.isArray(x?.target_paths)?x.target_paths:[]).slice(0,5).map(path).filter(Boolean),hypothesis:safeText(x?.hypothesis),status:['planned','live','observing_7d','observing_14d','won','lost','inconclusive'].includes(x?.status)?x.status:'inconclusive',baseline:metrics(x?.baseline),latest:metrics(x?.latest),launched_at:time(x?.launched_at),observe_7d_at:time(x?.observe_7d_at),observe_14d_at:time(x?.observe_14d_at),decision:safeText(x?.decision)}));
 return {site:'wonlyglobal.com',status:now-Date.parse(raw.generated_at)>48*3600000?'stale':'available',generated_at:raw.generated_at,freshness,windows,
  funnel:Object.fromEntries(['organic_7d','organic_28d','all_channels_7d','all_channels_28d'].map(k=>[k,events(raw.funnel?.[k])])),
  markets:(Array.isArray(raw.markets)?raw.markets:[]).slice(0,20).filter(x=>/^[A-Z]{2}$/.test(x?.country)).map(x=>({country:x.country,status:state(x.status),gsc_7d:gsc(x.gsc_7d),ga4_7d:ga4(x.ga4_7d)})),
  pages:(Array.isArray(raw.pages)?raw.pages:[]).slice(0,20).filter(x=>path(x?.path)).map(x=>({path:x.path,role:['commercial','article'].includes(x.role)?x.role:null,gsc_7d:gsc(x.gsc_7d),gsc_28d:gsc(x.gsc_28d),issues:(Array.isArray(x.issues)?x.issues:[]).slice(0,8).map(i=>({code:/^[A-Z_]{1,50}$/.test(i?.code)?i.code:'UNVERIFIED',severity:['P1','P2'].includes(i?.severity)?i.severity:null,detected_at:time(i?.detected_at)}))})),experiments,
  competitors:(Array.isArray(raw.competitors)?raw.competitors:[]).filter(x=>BRANDS.has(x)),
  gaps:(Array.isArray(raw.gaps)?raw.gaps:[]).slice(0,30).map(x=>({field:/^[a-zA-Z0-9_.]{1,100}$/.test(x?.field)?x.field:'unspecified',reason:['not_acquired','permission','data_lag'].includes(x?.reason)?x.reason:'not_acquired',since:time(x?.since)})),
  sources:(Array.isArray(raw.sources)?raw.sources:[]).slice(0,10).filter(x=>['GA4','GSC','SEMrush','production_audit','worklog'].includes(x?.name)).map(x=>({name:x.name,captured_at:time(x.captured_at),through:date(x.through),status:state(x.status)})),
  limits:'SEO源端摘要；不是实时全网。以各来源through为数据截止，不以generated_at替代。null为未取得，0仅代表源端明确零。CTR为0..1比例；平均排名不可用TopN简单平均反推。自然和全渠道、7天和28天不能混用；事件数不是唯一用户数或严格顺序漏斗，form_open只是展示，generate_lead不等于CRM成交。小样本、实验未满观察期不可断言因果。'};
}
const b64=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function seoHeaders({keyId,secret,pathname,search='',timestamp=Math.floor(Date.now()/1000),nonce=crypto.randomUUID().replaceAll('-','')}){
 const enc=new TextEncoder(),digest=b64(await crypto.subtle.digest('SHA-256',enc.encode('')));
 const canonical=['GET',pathname+search,String(timestamp),nonce,digest].join('\n');
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return {'x-wonly-key-id':keyId,'x-wonly-timestamp':String(timestamp),'x-wonly-nonce':nonce,'x-wonly-signature':b64(await crypto.subtle.sign('HMAC',key,enc.encode(canonical)))};
}
export async function loadSeo({url,keyId,secret,fetcher=fetch,now=Date.now()}={}){
 if(!url||!keyId||!secret)return {status:'not_configured',limits:'SEO只读通道尚未配置，不能声称已获取网站最新表现。'};
 try{
  const target=new URL(url);
  if(target.origin!=='https://seo-api.wonlyglobal.com'||target.pathname!=='/seo-summary/v1/current'||target.search||target.hash||target.username||target.password)throw Error('invalid_endpoint');
  const headers=await seoHeaders({keyId,secret,pathname:target.pathname});
  const response=await fetcher(target.href,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('unavailable');
  return {...seoSummary(JSON.parse(new TextDecoder().decode(await boundedBytes(response,256*1024))),now),source:target.href};
 }catch{return {status:'unavailable',limits:'SEO摘要读取或核验失败；不是零流量，也不是已完成刷新。'}}
}
