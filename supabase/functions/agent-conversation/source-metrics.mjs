// Only approved source projections. No model call, credentials, content bodies or LinkedIn.
const PLATFORMS=['tiktok','instagram','facebook','youtube'];
const HOSTS={tiktok:['tiktok.com','www.tiktok.com'],instagram:['instagram.com','www.instagram.com'],facebook:['facebook.com','www.facebook.com'],youtube:['youtube.com','www.youtube.com','youtu.be']};
const METRICS=['views','likes','comments','shares','saves','reach','impressions','clicks','watch_minutes'];
const n=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export const stamp=(v,now=Date.now())=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?$/.test(v)&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now?v:null;
const reason=v=>['not_configured','not_authorized','reauthorization_required','permission_required','timeout','platform_request_failed','response_too_large','wonly_page_authorization_required','account_binding_mismatch','invalid_response','permission_or_quota_required','not_returned','metric_unavailable','time_budget','page_cap','cursor_missing','unavailable_video','post_id_missing','incomplete_source_window'].includes(v)?v:'source_unavailable';
export function sourceMetricsIntent(q=''){
 return /(?:竞品.*(?:SEO|SEMrush|关键词|自然搜索)|(?:SEO|SEMrush).*竞品|(?:社媒|TikTok|Instagram|Facebook|YouTube|帖子).*(?:逐帖|逐条|每帖|单帖|指标|播放量|互动|点赞|观看))/i.test(q)&&!/发布|删帖|私信|投放/.test(q);
}
function publicUrl(value,platform){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!HOSTS[platform]?.includes(u.hostname))return null;const video=u.searchParams.get('v');u.search='';u.hash='';if(u.hostname.endsWith('youtube.com')&&u.pathname==='/watch'&&video&&/^[\w-]+$/.test(video))u.searchParams.set('v',video);return u.href}catch{return null}}
function post(p,platform,kind,fetched,now){
 const url=publicUrl(p?.url,platform);if(!url)return null;
 const m=p?.metrics||{};
 return {platform,url,published_at:stamp(p.published_at,now),metric_status:kind,metrics_synced_at:kind==='platform_api'?fetched:null,metrics:Object.fromEntries((platform==='facebook'?[...METRICS,'viewers']:METRICS).map(k=>[k,n(m[k==='saves'&&m.saves===undefined?'saved':k])])),metric_errors:Object.fromEntries(Object.entries(p.metric_errors||{}).filter(([k])=>METRICS.includes(k)||k==='viewers'||k==='saved'||k==='insights').map(([k,v])=>[k,reason(v)]))};
}
export function socialMetrics(summary,library,now=Date.now()){
 const platforms=PLATFORMS.map(platform=>{
  const raw=summary?.live_platforms?.[platform],fetched=stamp(raw?.fetched_at,now);
  const valid=summary?.status==='available'&&['available','partial'].includes(raw?.status)&&fetched&&Array.isArray(raw.posts);
  const input=valid?raw.posts.slice(0,100):[];
  const projected=input.map(p=>post(p,platform,'platform_api',fetched,now)).filter(Boolean);
  const seen=new Set();const posts=projected.filter(p=>!seen.has(p.url)&&seen.add(p.url));
  const complete=valid&&raw.status==='available'&&(raw.details_complete===true||raw.details_complete===undefined&&raw.has_more===false)&&raw.window?.complete!==false&&!(raw.window?.undated_posts>0)&&raw.posts.length<=100&&posts.length===input.length;
  return {platform,status:!valid?'unavailable':complete?'available':'partial',reason:valid?(complete?null:'incomplete_source_window'):reason(raw?.reason),source:valid?{facebook:'Facebook Graph API',instagram:'Instagram Graph API',tiktok:'TikTok Display API',youtube:'YouTube API'}[platform]:null,fetched_at:valid?fetched:null,period:valid?'platform_cumulative_at_fetch':null,complete:!!complete,window:valid?{start:stamp(raw.window?.start,now),end:stamp(raw.window?.end,now),complete:raw.window?.complete===true,posts_in_window:n(raw.window?.posts_in_window),posts_scanned:n(raw.window?.posts_scanned),undated_posts:n(raw.window?.undated_posts),pages_read:n(raw.window?.pages_read),stop_reason:raw.window?.stop_reason?reason(raw.window.stop_reason):null}:null,details_total:valid?n(raw.details_total):null,metric_gaps:valid?posts.flatMap(p=>Object.entries(p.metrics).filter(([,v])=>v===null).map(([k])=>k)).reduce((a,k)=>(a[k]=(a[k]||0)+1,a),{}):{},posts};
 });
 const rawStored=Array.isArray(library?.posts)?library.posts:[];
 const stored=rawStored.filter(p=>PLATFORMS.includes(p?.platform?.toLowerCase())).slice(0,100).map(p=>post(p,p.platform.toLowerCase(),'recorded_not_verified',null,now)).filter(Boolean);
 return {status:summary?.status||'unavailable',generated_at:stamp(summary?.generated_at,now),platforms,stored:{status:library?.status||'unavailable',source_total:library?.total_records??null,records_read:library?.records_read??null,eligible_records:stored.length,complete:library?.all_stored_records_read===true,posts:stored},limits:'官方本次累计值与入库登记值分开，不叠加、不当作区间增长。登记值未核验，0可能是默认值；没有单帖同步时间。平台获取时间不是后台定时同步成功时间。缺失不等于0；分页/无链接/失败/超限不算全量。仅WONLY四个平台已发布公开帖子，不含LinkedIn、私信、草稿、用户身份或画面内容。'};
}
const show=v=>v===null||v===undefined?'未知':String(v);
export function sourceMetricsAnswer(seo,social){
 const lines=['公司内部逐帖与竞品 SEO 直读：本回答未发送给外部模型。',`SEO 摘要生成：${show(seo?.generated_at)}；SEMrush 数据截止：${show(seo?.freshness?.semrush?.through)}。`,`SEO 系统当前名单：${(seo?.competitors||[]).join('、')||'未取得'}。`];
 const rows=seo?.competitor_metrics||[];
 if(!rows.length)lines.push('竞品 SEO 指标未接通：没有可核验的获准 API 或导出快照；不把过期标记当成流量、关键词或外链数据。');
 for(const r of rows)lines.push(`${r.domain}｜${r.database}/${r.device}｜${r.period.start}—${r.period.end}｜来源日期 ${r.captured_at}｜估算数据；自然流量 ${show(r.organic_traffic)}；关键词数 ${show(r.organic_keywords)}；外链 ${show(r.backlinks)}；引用域 ${show(r.referring_domains)}。`,...r.keywords.map(k=>`关键词 ${k.query}｜排名 ${show(k.position)}｜上期 ${show(k.previous_position)}`),...r.top_pages.map(p=>`落地页 ${p.url}｜流量估算 ${show(p.traffic)}`),'缺口：关键词差距和未返回项目均未知；只有同数据库、设备、周期和指标定义的历史快照可比较。');
 lines.push(`社媒摘要生成：${show(social.generated_at)}。`);
 const labels={views:'观看/播放',likes:'点赞',comments:'评论',shares:'分享',saves:'收藏',reach:'触达',impressions:'曝光',clicks:'点击',watch_minutes:'观看分钟',viewers:'独立观看者'};
 function render(p){lines.push(`${p.url}｜发布 ${show(p.published_at)}｜指标时间 ${show(p.metrics_synced_at)}`,Object.entries(p.metrics).map(([k,v])=>`${labels[k]} ${show(v)}`).join('；'));}
 for(const p of social.platforms){lines.push(`\n${p.platform} 官方逐帖：${p.status}；本次获取 ${show(p.fetched_at)}；已返回 ${p.posts.length} 条；${p.complete?'本次源分页已结束（不证明平台全历史完整）':'范围不完整或未取得'}；失败原因 ${show(p.reason)}。`);for(const row of p.posts)render(row);}
 lines.push(`\n入库登记逐帖（未核验，不能称最新平台值）：本次读取 ${show(social.stored.records_read)} / 源端记录 ${show(social.stored.source_total)}；四平台有公开链接 ${social.stored.eligible_records} 条；${social.stored.complete?'入库分页已读完':'读取不完整'}。`);
 for(const p of social.stored.posts){lines.push(p.platform);render(p);}
 lines.push(social.limits,'本次直读尚未写入私有知识库；知识同步成功必须另有编号及回读校验。');return lines.join('\n');
}
