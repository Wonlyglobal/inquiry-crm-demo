import {publicPostUrl} from './post-details.mjs';
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const safeText=x=>typeof x==='string'?x.replace(/Bearer\s+\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{10,}\d/g,'[隐藏]').slice(0,600):null;
const failure=(reason)=>({status:'unavailable',reason});
function reason(d,status){const code=d?.error?.code;if(code===190||status===401||code==='access_token_invalid')return 'reauthorization_required';if(status===403||[10,200].includes(code)||code==='scope_not_authorized')return 'permission_required';return 'platform_request_failed';}
export async function livePlatforms({get,accounts,tiktokToken,fetcher=fetch,now=new Date()}){
 const signal=AbortSignal.timeout(6000);
 async function read(url,token,body){
  const r=await fetcher(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{},redirect:'error',signal});
  const reader=r.body.getReader();let size=0,chunks=[];while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>160000){await reader.cancel();throw Error('response_too_large')}chunks.push(x.value)}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}const d=JSON.parse(new TextDecoder().decode(bytes));
  if(!r.ok||(d.error&&d.error.code!=='ok'))throw Error(reason(d,r.status));return d;
 }
 const graph=(path,fields,token)=>read(`https://graph.facebook.com/v23.0/${path}?${new URLSearchParams(fields)}`,token);
 async function run(platform,fn){try{return await fn()}catch(e){return failure(['reauthorization_required','permission_required','response_too_large'].includes(e.message)?e.message:signal.aborted?'timeout':'platform_request_failed')}}
 const matched=(platform,id)=>accounts.some(a=>a.platform?.toLowerCase()===platform&&String(a.external_id)===String(id));
 const handleMatches=(platform,handle)=>typeof handle==='string'&&/^[a-zA-Z0-9._]+$/.test(handle)&&accounts.some(a=>a.platform?.toLowerCase()===platform&&typeof a.handle==='string'&&a.handle.replace(/^@/,'').toLowerCase()===handle.toLowerCase());
 const common=source=>({source,fetched_at:now.toISOString(),metric_period:'platform cumulative values at fetch; not period growth',limits:'仅本次返回的已发布内容；不是全平台全量，不含私信、用户身份、广告、归因或视频画面理解。未返回指标为未知，不能按零计算。'});
 const [facebook,instagram,tiktok]=await Promise.all([
 run('facebook',async()=>{
  const token=get('FB_PAGE_TOKEN');if(!token)return failure('not_configured');
  const me=await graph('me',{fields:'id'},token);
  if(!me.id)return failure('account_binding_mismatch');
  if(!matched('facebook',me.id)){const page=await graph('me',{fields:'id,link'},token);let handle='';try{const u=new URL(page.link);if(u.protocol==='https:'&&['facebook.com','www.facebook.com'].includes(u.hostname))handle=u.pathname.replace(/^\/|\/$/g,'')}catch{}if(page.id!==me.id||!handleMatches('facebook',handle))return failure('account_binding_mismatch');}
  const feed=await graph(`${me.id}/published_posts`,{fields:'id,message,permalink_url,created_time,shares,likes.limit(0).summary(true),comments.limit(0).summary(true)',limit:'12'},token);
  if(!Array.isArray(feed.data))return failure('invalid_response');
  return {...common('Facebook Graph API'),status:'available',has_more:!!feed.paging?.next,posts:feed.data.slice(0,12).map(p=>({url:publicPostUrl(p.permalink_url),content:safeText(p.message),published_at:p.created_time,metrics:{likes:numeric(p.likes?.summary?.total_count),comments:numeric(p.comments?.summary?.total_count),shares:numeric(p.shares?.count)}})),missing:['reach','views','retention','attributed_conversions']};
 }),
 run('instagram',async()=>{
  const token=get('IG_ACCESS_TOKEN'),id=get('IG_BUSINESS_ID');if(!token||!id)return failure('not_configured');
  if(!/^\d+$/.test(id)||!matched('instagram',id))return failure('account_binding_mismatch');
  const feed=await graph(`${id}/media`,{fields:'id,caption,permalink,timestamp,like_count,comments_count',limit:'6'},token);
  if(!Array.isArray(feed.data))return failure('invalid_response');
  const posts=await Promise.all(feed.data.slice(0,6).map(async p=>{
   const metrics={likes:numeric(p.like_count),comments:numeric(p.comments_count)};
   const result=await Promise.all(['views','reach','saved','shares'].map(async name=>{try{const d=await graph(`${p.id}/insights`,{metric:name},token);const row=d.data?.find(x=>x.name===name);return [name,numeric(row?.total_value?.value??row?.values?.[0]?.value),null]}catch(e){return [name,null,['permission_required','reauthorization_required'].includes(e.message)?e.message:'metric_unavailable']}}));
   return {url:publicPostUrl(p.permalink),content:safeText(p.caption),published_at:p.timestamp,metrics:{...metrics,...Object.fromEntries(result.map(([k,v])=>[k,v]))},metric_errors:Object.fromEntries(result.filter(x=>x[2]).map(([k,,v])=>[k,v]))};
  }));
  return {...common('Instagram Graph API'),status:'available',has_more:!!feed.paging?.next,posts,insights_status:posts.some(p=>['views','reach','saved','shares'].some(k=>p.metrics[k]!==null))?'available':'unavailable'};
 }),
 run('tiktok',async()=>{
  const record=await tiktokToken();if(!record?.access_token)return failure('not_authorized');
  if(!Number.isFinite(Date.parse(record.expires_at))||Date.parse(record.expires_at)<=now.getTime())return failure('reauthorization_required');
  const me=await read('https://open.tiktokapis.com/v2/user/info/?fields=open_id',record.access_token);
  const id=me.data?.user?.open_id;if(!id)return failure('account_binding_mismatch');
  if(!matched('tiktok',id)){const profile=await read('https://open.tiktokapis.com/v2/user/info/?fields=open_id,username',record.access_token);if(profile.data?.user?.open_id!==id||!handleMatches('tiktok',profile.data?.user?.username))return failure('account_binding_mismatch');}
  const d=await read('https://open.tiktokapis.com/v2/video/list/?fields=id,title,share_url,create_time,view_count,like_count,comment_count,share_count',record.access_token,{max_count:20});
  if(!Array.isArray(d.data?.videos))return failure('invalid_response');
  return {...common('TikTok Display API'),status:'available',has_more:d.data.has_more===true,posts:d.data.videos.slice(0,20).map(p=>({url:publicPostUrl(p.share_url),content:safeText(p.title),published_at:typeof p.create_time==='number'&&p.create_time>0&&p.create_time<1e11?new Date(p.create_time*1000).toISOString():null,metrics:{views:numeric(p.view_count),likes:numeric(p.like_count),comments:numeric(p.comment_count),shares:numeric(p.share_count)}})),missing:['watch_time','retention','audience_regions','attributed_conversions']};
 })]);
 return {checked_at:now.toISOString(),facebook,instagram,tiktok};
}
