import {publicPostUrl} from './post-details.mjs';
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const safeText=x=>typeof x==='string'?x.replace(/Bearer\s+\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{10,}\d/g,'[隐藏]').slice(0,600):null;
const failure=(reason)=>({status:'unavailable',reason});
const DENIED=['permission_required','reauthorization_required'];
// Bounded 28-day window: fixed page caps plus a soft deadline so pagination never consumes the whole request budget.
export const WINDOW_DAYS=28;
const LIMITS={facebook:{pageSize:25,maxPages:4,detail:12},instagram:{pageSize:25,maxPages:4,detail:12},tiktok:{pageSize:20,maxPages:5,detail:20}};
const PAGINATION_BUDGET_MS=3500;
const cursorOk=c=>typeof c==='string'&&c.length>0&&c.length<=512&&/^[\w=%-]+$/.test(c);
function reason(d,status){const code=d?.error?.code;if(code===190||status===401||code==='access_token_invalid')return 'reauthorization_required';if(status===403||[10,200].includes(code)||code==='scope_not_authorized')return 'permission_required';return 'platform_request_failed';}
const errorCode=e=>['reauthorization_required','permission_required','response_too_large','timeout'].includes(e?.message)?e.message:'platform_request_failed';

// Window aggregates. Unknown metrics are excluded from sums and reported through known_posts, never counted as zero.
export function windowSummary(rows,metricKeys,{start,end,pagesRead,complete,stopReason,rankBy}){
 const inWindow=rows.filter(p=>{const t=Date.parse(p.published_at);return Number.isFinite(t)&&t>=start.getTime()&&t<=end.getTime()});
 const undated=rows.filter(p=>!Number.isFinite(Date.parse(p.published_at))).length;
 const totals=Object.fromEntries(metricKeys.map(k=>{const known=inWindow.map(p=>p.metrics?.[k]).filter(v=>numeric(v)!==null);const sum=known.reduce((s,v)=>s+v,0);return [k,{sum:known.length?sum:null,known_posts:known.length,avg_per_known_post:known.length?Math.round(sum/known.length*10)/10:null}]}));
 const key=rankBy.find(k=>totals[k]?.known_posts>0);
 const top=key?inWindow.filter(p=>numeric(p.metrics?.[key])!==null).sort((a,b)=>b.metrics[key]-a.metrics[key]).slice(0,3).map(p=>({url:p.url,published_at:p.published_at,metric:key,value:p.metrics[key]})):[];
 return {days:WINDOW_DAYS,start:start.toISOString(),end:end.toISOString(),posts_in_window:inWindow.length,posts_scanned:rows.length,undated_posts:undated,pages_read:pagesRead,complete,stop_reason:complete?null:stopReason,totals,top_posts:top,
  note:complete?'已按分页读完窗口内全部返回帖子；指标为抓取时累计值，不是窗口内新增。':'窗口未读完（见stop_reason），合计只覆盖已读取帖子，不能当作28天全量。'};
}

export async function livePlatforms({get,accounts,tiktokToken,fetcher=fetch,now=new Date(),clock=()=>Date.now(),metricsOnly=false}){
 const signal=AbortSignal.timeout(metricsOnly?8000:6000);
 const started=clock();const budgetLeft=()=>clock()-started<PAGINATION_BUDGET_MS;
 const start=new Date(now.getTime()-WINDOW_DAYS*86400000);
 async function read(url,token,body){
  const r=await fetcher(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{},redirect:'error',signal});
  const reader=r.body.getReader();let size=0,chunks=[];while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>160000){await reader.cancel();throw Error('response_too_large')}chunks.push(x.value)}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}const d=JSON.parse(new TextDecoder().decode(bytes));
  if(!r.ok||(d.error&&d.error.code!=='ok'))throw Error(reason(d,r.status));return d;
 }
 const graph=(path,fields,token)=>read(`https://graph.facebook.com/v23.0/${path}?${new URLSearchParams(fields)}`,token);
 // Graph cursor pagination. paging.next is never followed (it embeds the token); only the opaque "after" cursor is reused.
 async function graphPages(path,fields,token,platform,dateOf){
  const {pageSize,maxPages}=LIMITS[platform];let rows=[],after=null,pages=0,stop=null,hasMore=false;
  while(true){
   let d;try{d=await graph(path,{...fields,limit:String(pageSize),...after?{after}:{}},token)}catch(e){if(pages===0)throw e;stop=errorCode(e);break}
   if(!Array.isArray(d.data)){if(pages===0)return null;stop='invalid_response';break}
   pages++;rows.push(...d.data);hasMore=!!d.paging?.next;
   const oldest=d.data.length?Date.parse(dateOf(d.data[d.data.length-1])):NaN;
   if(!hasMore||(Number.isFinite(oldest)&&oldest<start.getTime()))break;
   after=d.paging?.cursors?.after;if(!cursorOk(after)){stop='cursor_missing';break}
   if(pages>=maxPages){stop='page_cap';break}
   if(!budgetLeft()){stop='time_budget';break}
  }
  return {rows,pages,stop,hasMore};
 }
 async function run(platform,fn){try{return await fn()}catch(e){return failure(['reauthorization_required','permission_required','response_too_large'].includes(e.message)?e.message:signal.aborted?'timeout':'platform_request_failed')}}
 async function optional(fn){try{return await fn()}catch(e){return {error:DENIED.includes(e.message)?e.message:'unavailable'}}}
 const matched=(platform,id)=>accounts.some(a=>a.platform?.toLowerCase()===platform&&String(a.external_id)===String(id));
 const handleMatches=(platform,handle)=>typeof handle==='string'&&/^[a-zA-Z0-9._]+$/.test(handle)&&accounts.some(a=>a.platform?.toLowerCase()===platform&&typeof a.handle==='string'&&a.handle.replace(/^@/,'').toLowerCase()===handle.toLowerCase());
 const common=source=>({source,fetched_at:now.toISOString(),metric_period:'platform cumulative values at fetch; not period growth',limits:`分页读取最近${WINDOW_DAYS}天已发布内容（有页数与时间上限，未读完会在window.complete标明）；posts只列最近若干条明细。不是全平台历史全量，不含私信、用户身份、广告、归因或视频画面理解。未返回指标为未知，不能按零计算。`});
 const inWindow=p=>{const t=Date.parse(p.published_at);return Number.isFinite(t)&&t>=start.getTime()&&t<=now.getTime()};
 async function boundedMap(rows,fn){let next=0;await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(next<rows.length){const row=rows[next++];await fn(row)}}))}
 const [facebook,instagram,tiktok]=await Promise.all([
 metricsOnly?Promise.resolve({status:'not_requested'}):run('facebook',async()=>{
  let token=get('FB_PAGE_TOKEN');if(!token)return failure('not_configured');
  let me=await graph('me',{fields:'id'},token);
  if(!me.id)return failure('account_binding_mismatch');
  if(!matched('facebook',me.id)){const page=await graph('me',{fields:'id,link,name'},token);let handle='';try{const u=new URL(page.link);if(u.protocol==='https:'&&['facebook.com','www.facebook.com'].includes(u.hostname))handle=u.pathname.replace(/^\/|\/$/g,'')}catch{}if(page.id!==me.id||!handleMatches('facebook',handle)){
   const pages=await graph('me/accounts',{fields:'id,link,access_token',limit:'25'},token);
   const matches=(pages.data||[]).filter(p=>{if(matched('facebook',p.id))return true;try{const u=new URL(p.link);return u.protocol==='https:'&&['facebook.com','www.facebook.com'].includes(u.hostname)&&handleMatches('facebook',u.pathname.replace(/^\/|\/$/g,''))}catch{return false}});
   if(matches.length!==1||typeof matches[0].access_token!=='string')return failure('wonly_page_authorization_required');
   token=matches[0].access_token;me={id:matches[0].id};
  }}
  const [feed,profile]=await Promise.all([
   graphPages(`${me.id}/published_posts`,{fields:'id,message,permalink_url,created_time,shares,likes.limit(0).summary(true),comments.limit(0).summary(true)',since:String(Math.floor(start.getTime()/1000))},token,'facebook',p=>p.created_time),
   optional(()=>graph(me.id,{fields:'followers_count,fan_count'},token))]);
  if(!feed)return failure('invalid_response');
  const rows=feed.rows.map(p=>({id:typeof p.id==='string'&&/^[\d_]+$/.test(p.id)?p.id:null,url:publicPostUrl(p.permalink_url),content:safeText(p.message),published_at:p.created_time,metrics:{likes:numeric(p.likes?.summary?.total_count),comments:numeric(p.comments?.summary?.total_count),shares:numeric(p.shares?.count)}}));
  const detail=rows.slice(0,LIMITS.facebook.detail);
  // Post insights need read_insights; missing permission leaves views/viewers/clicks unknown. Current metric names (2026): post_media_view, post_total_media_view_unique.
  const insightKeys={post_media_view:'views',post_total_media_view_unique:'viewers',post_clicks:'clicks'};
  const insightErrors=new Set();
  await Promise.all(detail.map(async p=>{if(!p.id){p.metric_errors={insights:'post_id_missing'};return}try{const d=await graph(`${p.id}/insights`,{metric:Object.keys(insightKeys).join(',')},token);for(const [name,key] of Object.entries(insightKeys)){const row=d.data?.find(x=>x.name===name);p.metrics[key]=numeric(row?.values?.[0]?.value??row?.total_value?.value)}}catch(e){const code=DENIED.includes(e.message)?e.message:'metric_unavailable';insightErrors.add(code);for(const key of Object.values(insightKeys))p.metrics[key]=null;p.metric_errors={insights:code}}}));
  const complete=!feed.stop;
  return {...common('Facebook Graph API'),status:'available',has_more:feed.hasMore,
   account:profile.error?{status:'unavailable',reason:profile.error}:{status:'available',followers:numeric(profile.followers_count),page_likes:numeric(profile.fan_count)},
   window:windowSummary(rows,['likes','comments','shares','views'],{start,end:now,pagesRead:feed.pages,complete,stopReason:feed.stop,rankBy:['views','likes']}),
   insights_status:detail.some(p=>p.metrics.views!==null||p.metrics.viewers!==null)?'available':insightErrors.size?[...insightErrors][0]:'unavailable',
   posts:detail.map(({id,...p})=>p),missing:['retention','watch_time','attributed_conversions','insights_beyond_detail_posts']};
 }),
 run('instagram',async()=>{
  const token=get('IG_ACCESS_TOKEN'),id=get('IG_BUSINESS_ID');if(!token||!id)return failure('not_configured');
  if(!/^\d+$/.test(id)||!matched('instagram',id))return failure('account_binding_mismatch');
  const [feed,profile]=await Promise.all([
   graphPages(`${id}/media`,{fields:metricsOnly?'id,permalink,timestamp,like_count,comments_count':'id,caption,permalink,timestamp,like_count,comments_count'},token,'instagram',p=>p.timestamp),
   optional(()=>graph(id,{fields:'followers_count,media_count'},token))]);
  if(!feed)return failure('invalid_response');
  const INSIGHTS=['views','reach','saved','shares'];
  const rows=feed.rows.map(p=>({id:typeof p.id==='string'&&/^\d+$/.test(p.id)?p.id:null,url:publicPostUrl(p.permalink),content:safeText(p.caption),published_at:p.timestamp,metrics:{likes:numeric(p.like_count),comments:numeric(p.comments_count)}}));
  const selected=metricsOnly?rows.filter(inWindow):rows;
  const detail=selected.slice(0,metricsOnly?100:LIMITS.instagram.detail);
  const pick=(d,name)=>{const row=d.data?.find(x=>x.name===name);return numeric(row?.total_value?.value??row?.values?.[0]?.value)};
  await boundedMap(detail,async p=>{
   const errors={};
   if(signal.aborted){for(const k of INSIGHTS){p.metrics[k]=null;errors[k]='timeout'}p.metric_errors=errors;return}
   if(!p.id){for(const k of INSIGHTS){p.metrics[k]=null;errors[k]='post_id_missing'}p.metric_errors=errors;return}
   // One combined request per post; only an unsupported-metric error falls back to per-metric reads.
   try{const d=await graph(`${p.id}/insights`,{metric:INSIGHTS.join(',')},token);for(const k of INSIGHTS)p.metrics[k]=pick(d,k)}
   catch(e){
    if(signal.aborted||DENIED.includes(e.message)){for(const k of INSIGHTS){p.metrics[k]=null;errors[k]=signal.aborted?'timeout':e.message}}
    else for(const k of INSIGHTS){try{p.metrics[k]=pick(await graph(`${p.id}/insights`,{metric:k},token),k)}catch(x){p.metrics[k]=null;errors[k]=DENIED.includes(x.message)?x.message:'metric_unavailable'}}
   }
   for(const k of INSIGHTS)if(p.metrics[k]===null&&!errors[k])errors[k]='not_returned';
   p.metric_errors=errors;
  });
  const complete=!feed.stop;
  return {...common('Instagram Graph API'),status:'available',has_more:feed.hasMore,
   account:profile.error?{status:'unavailable',reason:profile.error}:{status:'available',followers:numeric(profile.followers_count),lifetime_media:numeric(profile.media_count)},
   window:windowSummary(rows,['likes','comments','views','reach','saved','shares'],{start,end:now,pagesRead:feed.pages,complete,stopReason:feed.stop,rankBy:['views','reach','likes']}),
   details_returned:detail.length,details_total:selected.length,details_complete:complete&&selected.length===detail.length,
   posts:detail.map(({id,content,...p})=>metricsOnly?p:{...p,content}),insights_status:detail.some(p=>INSIGHTS.some(k=>p.metrics[k]!==null))?'available':'unavailable',missing:['insights_beyond_detail_posts','watch_time','audience_regions','attributed_conversions']};
 }),
 run('tiktok',async()=>{
  let record=await tiktokToken();if(!record?.access_token)return failure('not_authorized');
  if(!Number.isFinite(Date.parse(record.expires_at))||Date.parse(record.expires_at)<=now.getTime()){record=await tiktokToken(true);if(!record?.access_token)return failure('reauthorization_required');}
  let renewed=false;const tikRead=async(url,body)=>{try{return await read(url,record.access_token,body)}catch(e){if(e.message!=='reauthorization_required'||renewed)throw e;renewed=true;record=await tiktokToken(true);if(!record?.access_token)throw e;return read(url,record.access_token,body)}};
  // user.info.stats is part of the existing grant; failure only drops the account block.
  let me;try{me=await tikRead('https://open.tiktokapis.com/v2/user/info/?fields=open_id,follower_count,likes_count,video_count')}catch(e){if(e.message!=='permission_required')throw e;me=await tikRead('https://open.tiktokapis.com/v2/user/info/?fields=open_id')}
  const id=me.data?.user?.open_id;if(!id)return failure('account_binding_mismatch');
  const listUrl='https://open.tiktokapis.com/v2/video/list/?fields=id,'+(metricsOnly?'':'title,')+'share_url,create_time,view_count,like_count,comment_count,share_count';
  let videos=[],pages=0,stop=null,hasMore=false,cursor=null;
  while(true){
   let d;try{d=await tikRead(listUrl,{max_count:LIMITS.tiktok.pageSize,...cursor!==null?{cursor}:{}})}catch(e){if(pages===0)throw e;stop=errorCode(e);break}
   if(!Array.isArray(d.data?.videos)){if(pages===0)return failure('invalid_response');stop='invalid_response';break}
   pages++;videos.push(...d.data.videos);hasMore=d.data.has_more===true;
   const last=d.data.videos[d.data.videos.length-1];
   if(!hasMore||(typeof last?.create_time==='number'&&last.create_time*1000<start.getTime()))break;
   cursor=d.data.cursor;if(!(Number.isSafeInteger(cursor)&&cursor>0)){stop='cursor_missing';break}
   if(pages>=LIMITS.tiktok.maxPages){stop='page_cap';break}
   if(!budgetLeft()){stop='time_budget';break}
  }
  const ownVideo=p=>{try{const u=new URL(p.share_url);const m=u.pathname.match(/^\/@([^/]+)\/(?:video|photo)\/\d+/);return u.protocol==='https:'&&['www.tiktok.com','tiktok.com'].includes(u.hostname)&&m&&handleMatches('tiktok',m[1])}catch{return false}};
  if(!matched('tiktok',id)){const verified=videos.length>0&&videos.every(ownVideo);if(!verified)return failure('account_binding_mismatch');}
  const rows=videos.map(p=>({url:publicPostUrl(p.share_url),content:safeText(p.title),published_at:typeof p.create_time==='number'&&p.create_time>0&&p.create_time<1e11?new Date(p.create_time*1000).toISOString():null,metrics:{views:numeric(p.view_count),likes:numeric(p.like_count),comments:numeric(p.comment_count),shares:numeric(p.share_count)}}));
  const selected=metricsOnly?rows.filter(inWindow):rows;
  const detail=selected.slice(0,metricsOnly?100:LIMITS.tiktok.detail);
  const u=me.data.user;
  return {...common('TikTok Display API'),status:'available',has_more:hasMore,
   account:[u.follower_count,u.likes_count,u.video_count].some(v=>numeric(v)!==null)?{status:'available',followers:numeric(u.follower_count),lifetime_likes:numeric(u.likes_count),lifetime_videos:numeric(u.video_count)}:{status:'unavailable',reason:'stats_not_returned'},
   window:windowSummary(rows,['views','likes','comments','shares'],{start,end:now,pagesRead:pages,complete:!stop,stopReason:stop,rankBy:['views','likes']}),
   details_returned:detail.length,details_total:selected.length,details_complete:!stop&&detail.length===selected.length,
   posts:detail.map(({content,...p})=>metricsOnly?p:{...p,content}),missing:['watch_time','retention','audience_regions','attributed_conversions']};
 })]);
 return {checked_at:now.toISOString(),window_days:WINDOW_DAYS,facebook,instagram,tiktok};
}
