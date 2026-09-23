// Fixed WONLY channel; no caller-controlled URLs, credentials, or channel IDs.
const CHANNEL='UCoUw2uc9lSK2qj4xXPrAvFw';
export async function youtubeAnalytics(get,fetcher=fetch,now=new Date()){
 const keys=['YT_ANALYTICS_CLIENT_ID','YT_ANALYTICS_CLIENT_SECRET','YT_ANALYTICS_REFRESH_TOKEN'].map(get);
 if(keys.some(x=>!x))return {status:'not_configured'};
 const signal=AbortSignal.timeout(6500);
 async function read(url,options={}){
  const r=await fetcher(url,{...options,signal,redirect:'error'});
  if(!r.ok)throw Error('upstream');
  const text=await r.text();if(text.length>100000)throw Error('oversize');return JSON.parse(text);
 }
 try{
  const token=await read('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:keys[0],client_secret:keys[1],refresh_token:keys[2],grant_type:'refresh_token'})});
  if(typeof token.access_token!=='string'||!token.access_token)throw Error('token');
  const options={headers:{Authorization:`Bearer ${token.access_token}`}};
  const channels=await read('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',options);
  if(channels.items?.length!==1||channels.items[0].id!==CHANNEL)return {status:'channel_mismatch'};
  const end=new Date(now.getTime()-3*86400000).toISOString().slice(0,10),start=new Date(now.getTime()-30*86400000).toISOString().slice(0,10);
  const params=new URLSearchParams({ids:`channel==${CHANNEL}`,startDate:start,endDate:end,metrics:'views,estimatedMinutesWatched',dimensions:'day',sort:'day'});
  const report=await read(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`,options);
  if(JSON.stringify(report.columnHeaders?.map(x=>x.name))!==JSON.stringify(['day','views','estimatedMinutesWatched']))throw Error('schema');
  const rows=report.rows||[];
  if(!Array.isArray(rows)||rows.length>31||rows.some(r=>!Array.isArray(r)||r.length!==3||!/^\d{4}-\d{2}-\d{2}$/.test(r[0])||r[0]<start||r[0]>end||r.slice(1).some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0)))throw Error('schema');
  return {status:'available',source:'YouTube Analytics API',channel_id:CHANNEL,fetched_at:now.toISOString(),requested_period:{start,end},data_through:rows.at(-1)?.[0]||null,daily:rows.map(([day,views,watch_minutes])=>({day,views,watch_minutes})),totals:rows.length?{views:rows.reduce((s,r)=>s+r[1],0),watch_minutes:rows.reduce((s,r)=>s+r[2],0)}:null,limits:'仅返回日期的观看次数及估算观看分钟数；缺失日期不等于零，非实时数据，不含受众、广告、私信或收入。OAuth测试模式可能需要定期重新授权。'};
 }catch{return {status:'unavailable',reason:'authorization_or_api_unavailable',totals:null}};
}
