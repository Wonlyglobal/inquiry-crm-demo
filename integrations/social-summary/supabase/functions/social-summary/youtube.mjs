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
export async function youtubePosts(get,fetcher=fetch,now=new Date(),options={}){
 if(options.metricsOnly)return youtubeWindowPosts(get,fetcher,now,options.clock);
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

// Metrics-only daily projection: fixed channel, at most two upload pages / 100 videos, no titles or bodies.
async function youtubeWindowPosts(get,fetcher,now,clock=()=>Date.now()){
 const apiKey=get('YOUTUBE_API_KEY');if(!apiKey)return {status:'unavailable',reason:'not_configured'};
 const signal=AbortSignal.timeout(8000),started=clock(),start=new Date(now.getTime()-28*86400000),allowed=/^[\w-]{11}$/;
 const numeric=v=>typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
 const error=e=>['permission_or_quota_required','response_too_large','account_binding_mismatch','invalid_response'].includes(e?.message)?e.message:signal.aborted?'timeout':'platform_request_failed';
 async function read(resource,params){
  const r=await fetcher(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams({...params,key:apiKey})}`,{redirect:'error',signal});
  const reader=r.body.getReader();let size=0,chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>120000){await reader.cancel();throw Error('response_too_large')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}const d=JSON.parse(new TextDecoder().decode(bytes));
  if(!r.ok||d.error)throw Error(r.status===403?'permission_or_quota_required':'platform_request_failed');return d;
 }
 try{
  const channel=await read('channels',{id:CHANNEL,part:'contentDetails',fields:'items(id,contentDetails/relatedPlaylists/uploads)'});
  if(channel.items?.length!==1||channel.items[0].id!==CHANNEL)throw Error('account_binding_mismatch');
  const playlist=channel.items[0].contentDetails?.relatedPlaylists?.uploads;if(typeof playlist!=='string'||!/^UU[\w-]{22}$/.test(playlist))throw Error('invalid_response');
  let ids=[],pages=0,next=null,hasMore=false,stop=null;const cursors=new Set();
  do{
   let feed;try{feed=await read('playlistItems',{playlistId:playlist,part:'contentDetails',maxResults:'50',fields:'nextPageToken,items/contentDetails/videoId',...(next?{pageToken:next}:{})})}catch(e){if(!pages)throw e;stop=error(e);break}
   if(!Array.isArray(feed.items)||feed.items.length>50)throw Error('invalid_response');
   const batch=feed.items.map(p=>p?.contentDetails?.videoId);if(batch.some(id=>typeof id!=='string'||!allowed.test(id))||new Set([...ids,...batch]).size!==ids.length+batch.length)throw Error('invalid_response');
   ids.push(...batch);pages++;hasMore=!!feed.nextPageToken;if(!hasMore)break;
   next=feed.nextPageToken;if(typeof next!=='string'||next.length>512||!/^[\w=-]+$/.test(next)||cursors.has(next)){stop='cursor_missing';break}cursors.add(next);
   if(pages>=2){stop='page_cap';break}if(clock()-started>=3500){stop='time_budget';break}
  }while(hasMore);
  const all=[];
  for(let i=0;i<ids.length;i+=50){
   let d;try{d=await read('videos',{id:ids.slice(i,i+50).join(','),part:'statistics,snippet,status',fields:'items(id,snippet(channelId,publishedAt),status/privacyStatus,statistics(viewCount,likeCount,commentCount))'})}catch(e){if(!all.length)throw e;stop=error(e);break}
   if(!Array.isArray(d.items)||d.items.length>Math.min(50,ids.length-i)||d.items.some(v=>!ids.slice(i,i+50).includes(v.id)||v.snippet?.channelId!==CHANNEL)||new Set(d.items.map(v=>v.id)).size!==d.items.length)throw Error('account_binding_mismatch');
   all.push(...d.items);
  }
  const publicRows=all.filter(v=>v.status?.privacyStatus==='public'&&Number.isFinite(Date.parse(v.snippet?.publishedAt))&&Date.parse(v.snippet.publishedAt)<=now.getTime());
  if(publicRows.length!==ids.length&&!stop)stop='unavailable_video';
  const selected=publicRows.filter(v=>Date.parse(v.snippet.publishedAt)>=start.getTime());
  const posts=selected.map(v=>({url:`https://www.youtube.com/watch?v=${v.id}`,published_at:v.snippet.publishedAt,metrics:{views:numeric(v.statistics?.viewCount),likes:numeric(v.statistics?.likeCount),comments:numeric(v.statistics?.commentCount)}}));
  return {status:stop?'partial':'available',source:'YouTube Data API v3',fetched_at:now.toISOString(),has_more:hasMore,details_returned:posts.length,details_total:posts.length,details_complete:!stop,
   window:{days:28,start:start.toISOString(),end:now.toISOString(),posts_in_window:posts.length,posts_scanned:ids.length,undated_posts:all.filter(v=>!Number.isFinite(Date.parse(v.snippet?.publishedAt))).length,pages_read:pages,complete:!stop,stop_reason:stop},
   metric_period:'platform cumulative values at fetch; not period growth',posts,missing:['shares','saves','reach','impressions','clicks','watch_minutes'],limits:'固定WONLY频道，最近28天公开上传的本次累计指标；最多2页/100项，页数、时间或不可用视频缺口保留。无标题正文、用户身份或私有Analytics；未知不填0，不是平台全历史或区间增长。'};
 }catch(e){return {status:'unavailable',reason:error(e)}}
}
