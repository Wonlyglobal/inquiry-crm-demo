// Read the existing signed material index. No SSH, media download, external model or new source operation.
import {signMaterialRequest} from './material-request-proof.mjs';
import {boundedBytes} from './bailian.mjs';
import {readPrivateSocialSnapshot,privateSocialTime,SOCIAL_METRIC_LABELS} from './private-social-display.mjs';
const UUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const platforms=['facebook','instagram','tiktok','youtube'];
const text=v=>typeof v==='string'?v.replace(/Bearer\s+\S+|sk-[\w.-]{12,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{10,}\d/g,'[已隐藏标识]').replace(/[\u0000-\u001f\u007f<>`\[\]{}*_#]/g,' ').slice(0,500):'';
export function existingVideoIntent(q=''){q=String(q||'').normalize('NFKC');return /TikTok|Instagram|Facebook|YouTube|社媒|查看私有知识 (?:tiktok|instagram|facebook|youtube)-/i.test(q)&&/视频|画面|口播|字幕|前三秒|前\s*3\s*秒/.test(q)&&/分析|复盘|改进|建议|优化|怎么|查看|视频证据/.test(q)}
export function existingVideoPage(q=''){const m=String(q).normalize('NFKC').match(/物料第\s*(\d+)\s*页/);return m?Math.min(20,Math.max(1,Number(m[1]))):1}
export async function loadExistingVideoIndex(config,q='',fetcher=fetch,now=Date.now()){
 if(!config?.actor||!config.privateJwk||!config.secret||!config.serviceUrl)return {status:'unavailable',reason:'not_configured',videos:[]};
 let url;try{url=new URL(config.serviceUrl);if(url.protocol!=='https:'||url.hostname!=='file.foreverdoodle.com'||url.username||url.password||!['','8088'].includes(url.port))throw Error();url.pathname='/api/integrations/crm/knowledge';url.search='';url.hash=''}catch{return {status:'unavailable',reason:'invalid_source',videos:[]}}
 const first=existingVideoPage(q),pages=[first,first+1].filter(n=>n<=20);
 const results=await Promise.all(pages.map(async page=>{let reason='request_failed';try{
  // Empty query is essential: legacy source otherwise filters each segment by the filename search term.
  const body=JSON.stringify({query:'',terms:[],page,catalogue:false}),proof=await signMaterialRequest({body,actor:config.actor,privateJwk:config.privateJwk});
  const r=await fetcher(url.href,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.secret}`,'X-CRM-Proof':proof,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(18000)});if(!r.ok){reason='http_'+r.status;throw Error()}
  reason='response_unreadable';const data=JSON.parse(new TextDecoder().decode(await boundedBytes(r,1048576))),read=Date.parse(data.read_at);
  reason='invalid_source_contract';if(data.status!=='available'||data.scope!=='authorized_material_library'||data.page!==page||!Array.isArray(data.assets)||data.assets.length>20||!Number.isFinite(read)||read>now+30000||now-read>48*3600000)throw Error();
  const videos=data.assets.filter(a=>a.type==='视频'&&UUID.test(a.id||'')).map(a=>{
   const raw=a.video||{},segments=(Array.isArray(raw.segments)?raw.segments:[]).slice(0,6).filter(s=>['speech','screen_text','visual_inference'].includes(s.kind)&&typeof s.start==='number'&&Number.isFinite(s.start)&&s.start>=0&&s.start<=3600&&typeof s.text==='string'&&s.text.trim()).map(s=>({kind:s.kind,start:s.start,end:typeof s.end==='number'&&Number.isFinite(s.end)&&s.end>=s.start&&s.end<=3600?s.end:null,text:text(s.text),truncated:s.text.length>500}));
   const usable=['ready','partial'].includes(raw.status);return {id:a.id,name:text(a.name).slice(0,180),updated_at:typeof a.updatedAt==='string'?a.updatedAt:null,version:text(a.versionLabel),current:a.isCurrentVersion===true,page,read_at:data.read_at,status:usable?raw.status:'not_ready',segments:usable?segments:[],coverage:{audio:['transcribed','no_audio_stream'].includes(raw.coverage?.audio)?raw.coverage.audio:'unknown',frame_count:Number.isSafeInteger(raw.coverage?.frame_count)&&raw.coverage.frame_count>=0?raw.coverage.frame_count:null,visual_failed_frames:Number.isSafeInteger(raw.coverage?.visual_failed_frames)&&raw.coverage.visual_failed_frames>=0?raw.coverage.visual_failed_frames:null}};
  });return {page,read_at:data.read_at,assets:data.assets.length,has_more:data.has_more===true,videos,status:'available'};
 }catch{return {page,status:'unavailable',reason,videos:[]}}}));
 const seen=new Map(),conflicts=new Set();for(const p of results)for(const v of p.videos){if(seen.has(v.id)&&JSON.stringify({...seen.get(v.id),page:0,read_at:''})!==JSON.stringify({...v,page:0,read_at:''}))conflicts.add(v.id);else seen.set(v.id,v)}
 const videos=[...seen.values()].filter(v=>!conflicts.has(v.id));
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(videos))))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {status:results.some(p=>p.status==='available')?'available':'unavailable',pages:results.map(p=>({page:p.page,status:p.status,reason:p.reason,read_at:p.read_at,has_more:p.has_more})),read_at:results.filter(p=>p.read_at).map(p=>p.read_at).sort().at(-1)||null,videos,conflicts:conflicts.size,digest};
}
const time=n=>n.toFixed(2)+'秒';

// Evidence-local editing signals only. No inferred product capability, retention, visual layout or post binding.
export function videoEditingSignals(v){
 const segments=v.segments||[],speech=segments.filter(s=>s.kind==='speech'),ocr=segments.filter(s=>s.kind==='screen_text'),visual=segments.filter(s=>s.kind==='visual_inference'),notes=[];
 const units=t=>(t.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|[\u3400-\u9fff]/g)||[]).length;
 const filler=/\b(?:basically|you know|actually)\b|(?:那么|就是说|然后呢|这个呢)/i;
 const first=speech[0];
 if(first){
  const n=units(first.text),duration=first.end!==null?first.end-first.start:null;
  notes.push(`口播表达核对：[${time(first.start)}${first.end!==null?'—'+time(first.end):''}]转写约${n}个字词单位（中文按字、英文按词，含识别误差）。${duration>0?`片段平均约${(n/duration).toFixed(1)}单位/秒，不能当逐词对齐或实际前三秒字数。`:'段落终点缺失，暂不估算语速。'}`);
  if(filler.test(first.text))notes.push(`口播可测试项：[${time(first.start)}]转写含口头衔接词；先听校是否识别正确，再试删去不承载条件的衔接词，保留原操作及限制条件。`);
  if(duration>0&&n/duration>4)notes.push(`口播可测试项：该ASR段字词单位较密，先核对分段和识别；另做减半信息点、保留一个问题加一个动作的版本，对比同龄表现，不直接判定用户听不懂。`);
 }
 const firstOcr=ocr[0];if(firstOcr){const n=units(firstOcr.text);notes.push(`字幕表达核对：[${time(firstOcr.start)}]OCR约${n}个字词单位，先确认是字幕。${n>20?'候选文字较长，可按原句语义拆屏、每屏只保留一个信息点；缺少显示时长，不能认定阅读时间不足。':'先按原词句与同时间ASR核对型号、数字和术语，不补写画面没有的产品承诺。'}`)}
 if(visual.length){const opening=visual.filter(s=>s.start<3);if(!opening.length)notes.push('开头画面验收缺口：已有画面采样均在3秒之后。先取得首帧和0—3秒采样，再决定是否应前移演示动作；不能用后段机器描述评价实际开头。')}
 if(!speech.length||!ocr.length)notes.push('音画对应核对：当前缺少'+(!speech.length?'口播转写':'')+(!speech.length&&!ocr.length?'和':'')+(!ocr.length?'字幕候选':'')+'，该模态修改建议暂缓；不能用帖子文案补齐。');
 return notes;
}

export function existingVideoAnalysis(d,index,q='',now=Date.now()){
 if(!platforms.includes(d?.kind))return null;
 const snap=readPrivateSocialSnapshot(d);if(!snap)return '视频复盘未通过原指标快照结构校验，没有推断视频内容。';
 const {posts,metadata:m,platform,historical}=snap,source=Date.parse(m.source_date),out=[`${platform} · 内部视频片段与逐帖指标复盘`,`指标来源：${privateSocialTime(m.source_date)}；物料接口读取：${privateSocialTime(index?.read_at)}`,'本次仅读取公司既有采样索引，没有下载视频或调用外部模型。原帖与物料尚无可核验发布绑定，不自动按文件名或相似标题配对。'];
 if(historical||!Number.isFinite(source)||source>now||now-source>48*3600000){out.push('指标来源失败、过期或日期异常，暂缓当前表现建议；旧快照不冒充今日。');return out.join('\n')}
 out.push(`帖子发布窗口：${privateSocialTime(m.window?.start)} 至 ${privateSocialTime(m.window?.end)}；分页${m.window?.complete===true?'已读完':m.window?.complete===false?'未读完':'未确认'}；明细${m.post_coverage_complete===true?'完整':m.post_coverage_complete===false?'不完整':'完整性未确认'}。`, `知识包未保存条数：${Number.isSafeInteger(m.omitted_posts)?m.omitted_posts:'未知'}；来源最近成功：${privateSocialTime(m.source_last_success_sync)}（未被本次物料读取推进）。`);
 for(const [k,label] of Object.entries(SOCIAL_METRIC_LABELS)){if(k==='viewers'&&d.kind!=='facebook')continue;const known=posts.filter(p=>Object.hasOwn(p.metrics,k)).length;out.push(`${label}指标覆盖：${known}/${posts.length}；${posts.length-known}条未知`)}
 const metricErrors=[...new Set(posts.flatMap(p=>p.errors||[]))];if(metricErrors.length)out.push('指标缺口原因：'+metricErrors.join('；'));
 out.push(`已保存指标帖：${posts.length}条；按已知累计观看量列最多3条优先复盘线索，发布时间不同，不是同龄效率或内容质量排名。`);
 for(const [i,p] of [...posts].sort((a,b)=>(b.metrics.views??-1)-(a.metrics.views??-1)).slice(0,3).entries())out.push(`原帖${i+1}：${p.url}\n发布：${privateSocialTime(p.published)}；观看：${p.metrics.views??'未知'}；点赞：${p.metrics.likes??'未知'}；评论：${p.metrics.comments??'未知'}；点击：${p.metrics.clicks??'未知'}`);
 if(index?.status!=='available'){out.push('\n视频索引本次读取失败或未配置；画面、口播、字幕证据未取得，不把文案当转写，不更新来源成功时间。');return out.join('\n')}
 out.push(`\n物料范围：${index.pages.map(p=>`第${p.page}页${p.status==='available'?'可读':`失败（${p.reason||'原因未提供'}）`}`).join('、')}，每页最多20项，仅展示其中视频；不是全视频库。${index.conflicts}个分页冲突已排除。`,`视频索引投影SHA-256：${index.digest}（仅本次返回片段的校验，不是源视频文件哈希或已同步知识版本）。`);
 const usable=index.videos.filter(v=>v.current&&v.segments.length&&['ready','partial'].includes(v.status));
 out.push(`视频覆盖：返回${index.videos.length}条视频元数据，${usable.length}条当前登记版本有可读片段。解析完成不等于片段完整、线上发布版本一致或人工已核验。`);
 if(!usable.length){out.push('当前两页没有可分析的当前视频片段。可继续查看后续物料页；未取得片段不等于没有视频或没有字幕。');return out.join('\n')}
 out.push('\n以下为当前物料片段的独立修改建议；尚不能认定它们对应上述任何原帖，不能解释具体帖子的观看量原因。');
 for(const [i,v] of usable.slice(0,3).entries()){
  const visual=v.segments.filter(s=>s.kind==='visual_inference'),speech=v.segments.filter(s=>s.kind==='speech'),ocr=v.segments.filter(s=>s.kind==='screen_text');
  out.push(`\n素材${i+1}：${v.name}；素材ID：${v.id}`,`物料第${v.page}页；登记版本：${v.version||'未知'}；物料更新：${privateSocialTime(v.updated_at)}；解析完成时间/源文件哈希：接口未提供；状态：${v.status}。`);
  const quote=(s,kind)=>`[${time(s.start)}${s.end!==null&&s.end!==s.start?'—'+time(s.end):''} ${kind}] ${s.text}${s.truncated?'（已截断）':''}`;
  out.push('画面机器描述：'+(visual.map(s=>quote(s,'采样推测')).join('；')||'未返回，不能判断动作和镜头。'),'口播ASR：'+(speech.map(s=>quote(s,'转写待听校')).join('；')||'未返回；不认定无口播。'),'画面文字OCR候选：'+(ocr.map(s=>quote(s,'不等于已确认字幕')).join('；')||'未返回；不认定无字幕。'));
  const opening=visual.filter(s=>s.start<3),inside=speech.filter(s=>s.start<3&&s.end!==null&&s.end<=3),cross=speech.filter(s=>s.start<3&&(s.end===null||s.end>3));
  out.push(`前三秒证据：${opening.length}个画面采样点、${inside.length}个完整语音段、${cross.length}个跨界或终点未知语音段。没有连续0—3秒覆盖证明，暂缓完整前三秒判断；跨界段不能整体作前三秒原话。`);
  if(visual.length)out.push(`画面改法：以[${time(visual[0].start)}]的可见场景/动作为对照，另剪一个首帧展示该具体操作或结果的版本；先人工核对模型描述。没有相邻镜头证据，不断言当前镜头拖沓、黑屏或动作出现太晚。`);
  if(speech.length)out.push(`口播改法：对[${time(speech[0].start)}]转写先听校，再只保留一个有原片依据的问题或操作说明，随后展示相应动作；删减重复信息时保留必要条件，不补写型号功能、认证、价格或性能承诺。`);
  else out.push('口播改进暂缓：先取得音轨或转写，不用发布文案代写原口播。');
  if(ocr.length)out.push(`字幕改法：先确认[${time(ocr[0].start)}]文字是字幕还是包装/背景，再测试一屏一句核心信息并与同时间语音核对；OCR过长时拆成两屏。没有坐标/字号或逐词对齐，不断言字幕过小、遮挡或不同步。`);
  else out.push('字幕改进暂缓：先核对实际字幕/画面OCR覆盖，不能从空结果断言没有字幕。');
  out.push(...videoEditingSignals(v));
 }
 out.push(`\n未展开：另外${Math.max(0,usable.length-3)}条可读视频；其他历史版本/未就绪/空片段${index.videos.length-usable.length}条未分析。`,'结合指标的下一步：先逐一确认原帖与原始发布视频版本的对应，再优先复盘上述有观看量的原帖。每次只改画面、口播或字幕一个变量，按相同发布后24小时/72小时记录观看、已知互动和点击；缺少留存、曝光、投放及归因，不能把累计观看当前三秒留存或内容因果。','缺口：每文件最多6段；采样非逐帧，OCR非确认字幕，转写/机器描述待核验；未提供源文件哈希、解析日期和原帖绑定。没有自动保存新知识、改写原快照、发帖、投放或公开物料。');
 return out.join('\n');
}
