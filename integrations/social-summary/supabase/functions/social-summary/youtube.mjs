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

// Public statistics for the same fixed WONLY channel. Reuses the existing source-side API key.
// No OAuth expansion, post bodies, comment identities, new channel IDs, writes or model calls.
export async function youtubePosts(get,fetcher=fetch,now=new Date()){
 const apiKey=get('YOUTUBE_API_KEY');if(!apiKey)return {status:'unavailable',reason:'not_configured'};
 const signal=AbortSignal.timeout(6000);
 const numeric=v=>typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
 async function read(resource,params){
  const url=`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams({...params,key:apiKey})}`;
  const response=await fetcher(url,{redirect:'error',signal});
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>120000){await reader.cancel();throw Error('response_too_large')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(!response.ok||data.error)throw Error(response.status===403?'permission_or_quota_required':'platform_request_failed');return data;
 }
 try{
  const channel=await read('channels',{id:CHANNEL,part:'contentDetails',fields:'items(id,contentDetails/relatedPlaylists/uploads)'});
  if(channel.items?.length!==1||channel.items[0].id!==CHANNEL)throw Error('account_binding_mismatch');
  const playlist=channel.items[0].contentDetails?.relatedPlaylists?.uploads;
  if(typeof playlist!=='string'||!/^UU[\w-]{22}$/.test(playlist))throw Error('invalid_response');
  const feed=await read('playlistItems',{playlistId:playlist,part:'contentDetails',maxResults:'50',fields:'nextPageToken,items/contentDetails/videoId'});
  if(!Array.isArray(feed.items)||feed.items.length>50)throw Error('invalid_response');
  const ids=feed.items.map(p=>p?.contentDetails?.videoId);if(ids.some(id=>typeof id!=='string'||!/^[\w-]{11}$/.test(id))||new Set(ids).size!==ids.length)throw Error('invalid_response');
  const videos=ids.length?await read('videos',{id:ids.join(','),part:'statistics,snippet,status',fields:'items(id,snippet(channelId,publishedAt),status/privacyStatus,statistics(viewCount,likeCount,commentCount))'}):{items:[]};
  if(!Array.isArray(videos.items)||videos.items.length>ids.length||videos.items.some(v=>!ids.includes(v.id)||v.snippet?.channelId!==CHANNEL)||new Set(videos.items.map(v=>v.id)).size!==videos.items.length)throw Error('account_binding_mismatch');
  const visible=videos.items.filter(v=>v.status?.privacyStatus==='public'&&Number.isFinite(Date.parse(v.snippet?.publishedAt))&&Date.parse(v.snippet.publishedAt)<=now.getTime());
  const complete=!feed.nextPageToken&&visible.length===ids.length;
  return {source:'YouTube Data API v3',status:'available',fetched_at:now.toISOString(),has_more:!!feed.nextPageToken,window:{complete,stop_reason:complete?null:feed.nextPageToken?'page_cap':'unavailable_video'},metric_period:'platform cumulative values at fetch; not period growth',posts:visible.map(v=>({url:`https://www.youtube.com/watch?v=${v.id}`,published_at:v.snippet.publishedAt,metrics:{views:numeric(v.statistics?.viewCount),likes:numeric(v.statistics?.likeCount),comments:numeric(v.statistics?.commentCount)}})),missing:['shares','saves','reach','impressions','watch_time','retention','attributed_conversions'],limits:'只读固定WONLY频道最近最多50条公开上传，非全历史。播放/点赞/评论是本次获取的累计值；隐藏、禁用、未返回指标为未知，不填0；不含私有Analytics、评论正文、用户身份或广告。'};
 }catch(e){return {status:'unavailable',reason:['account_binding_mismatch','invalid_response','permission_or_quota_required','response_too_large'].includes(e?.message)?e.message:signal.aborted?'timeout':'platform_request_failed'}}
}
