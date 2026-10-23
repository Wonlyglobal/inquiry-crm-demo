// Company-local video evidence only. A caption/title is never a video observation.
import {socialPostIdentity} from './social-content.mjs';
import {readPrivateSocialSnapshot,privateSocialTime} from './private-social-display.mjs';
import {signMaterialRequest} from './material-request-proof.mjs';
import {boundedBytes} from './bailian.mjs';
export const SOCIAL_VIDEO_SCHEMA='wonly-social-video-evidence-v1';
const platforms=['facebook','instagram','tiktok','youtube'];
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const safe=x=>String(x||'').replace(/Bearer\s+\S+|sk-[\w.-]{12,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{10,}\d/g,'[已隐藏标识]').replace(/[\u0000-\u001f\u007f<>`\[\]{}*_#]/g,' ').slice(0,500);
export function socialVideoIntent(question=''){
 const q=String(question||'').normalize('NFKC');
 return /TikTok|Instagram|Facebook|YouTube|社媒|查看私有知识 (?:tiktok|instagram|facebook|youtube)-/i.test(q)&&/视频|画面|口播|字幕|前三秒|前3秒|前 3 秒|video|transcript|subtitle/i.test(q)&&/分析|检查|改进|建议|优化|复盘|怎么|查看|视频前三秒|analy[sz]e|review/i.test(q);
}
export async function loadSocialVideoEvidence(config,documents,fetcher=fetch,now=Date.now()){
 // Activate only after the company route and exact bindings have been verified. No arbitrary URLs or cloud fallback.
 if(config?.policy!=='company-social-video-v1'||!config.actor||!config.privateJwk||!config.secret)return {status:'unavailable',reason:'video_source_not_configured',posts:[]};
 let url;try{url=new URL(config.serviceUrl);if(url.protocol!=='https:'||url.hostname!=='file.foreverdoodle.com'||url.username||url.password||!['','8088'].includes(url.port))throw Error();url.pathname='/api/integrations/crm/knowledge';url.search='';url.hash=''}catch{return {status:'unavailable',reason:'invalid_video_source',posts:[]}}
 const requested=[];for(const d of documents){const s=readPrivateSocialSnapshot(d);if(!s||s.historical)continue;for(const p of [...s.posts].sort((a,b)=>(b.metrics.views??-1)-(a.metrics.views??-1)).slice(0,3)){if(socialPostIdentity(d.kind,p.url))requested.push({platform:d.kind,url:p.url,published_at:p.published})}}
 if(!requested.length)return {status:'unavailable',reason:'no_saved_posts',posts:[]};
 try{const body=JSON.stringify({operation:'social_video_evidence',posts:requested.slice(0,12)});if(new TextEncoder().encode(body).length>4000)throw Error();const proof=await signMaterialRequest({body,actor:config.actor,privateJwk:config.privateJwk});const r=await fetcher(url.href,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.secret}`,'X-CRM-Proof':proof,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error();const validated=validateVideoEvidence(JSON.parse(new TextDecoder().decode(await boundedBytes(r,524288))),now);if(validated.status!=='available')return validated;
  const allowed=new Set(requested.map(p=>socialPostIdentity(p.platform,p.url)));return {...validated,requested:requested.length,posts:validated.posts.filter(p=>allowed.has(socialPostIdentity(p.platform,p.url)))};
 }catch{return {status:'unavailable',reason:'video_read_failed',posts:[]}}
}
export function validateVideoEvidence(input,now=Date.now()){
 if(input?.schema_version!==SOCIAL_VIDEO_SCHEMA||input?.scope!=='authorized_wonly_published_video'||!Array.isArray(input.posts)||input.posts.length>12)return {status:'unavailable',reason:'invalid_video_evidence',posts:[]};
 const read=Date.parse(input.read_at);if(!Number.isFinite(read)||read>now+5000||now-read>48*3600000)return {status:'unavailable',reason:'invalid_video_date',posts:[]};
 const posts=[],rejected=[];const ids=new Set();
 for(const p of input.posts){
  const id=socialPostIdentity(p.platform,p.url),t=Date.parse(p.published_at),parsed=Date.parse(p.parsed_at),binding=p.binding;
  if(!platforms.includes(p.platform)||!id||ids.has(id)||!Number.isFinite(t)||t>now||!uuid(p.asset_id)||!hash(p.source_sha256)||!hash(p.index_sha256)||p.source_sha256!==p.index_sha256||!finite(p.duration)||p.duration<=0||p.duration>3600||!Number.isFinite(parsed)||parsed>now+5000||!['ready','partial'].includes(p.status)||!['publisher_receipt','owner_verified'].includes(binding?.method)||!uuid(binding?.id)||binding.post_identity!==id||binding.asset_id!==p.asset_id||binding.source_sha256!==p.source_sha256||!Number.isFinite(Date.parse(binding.verified_at))||Date.parse(binding.verified_at)>now+5000||typeof p.parser_version!=='string'||p.parser_version!=='opening-evidence-v2'||!Array.isArray(p.segments)||p.segments.length>500||!Array.isArray(p.coverage?.sample_times)||p.coverage.sample_times.length>24){rejected.push(id||'invalid_post');continue}
  // Duplicate entries invalidate all evidence for that post, not just the last one.
  ids.add(id);
  const samples=p.coverage.sample_times;if(samples.some(x=>!finite(x)||x<0||x>=p.duration)||new Set(samples).size!==samples.length){rejected.push(id);continue}
  const segments=[];let malformed=false;
  for(const s of p.segments){if(!['speech','screen_text','visual_inference'].includes(s.kind)||!finite(s.start)||!finite(s.end)||s.start<0||s.end<s.start||s.end>p.duration||typeof s.text!=='string'||s.text.length>3000||!s.text.trim()||(s.kind!=='speech'&&(!samples.includes(s.start)||s.end!==s.start||!hash(s.frame_sha256)))){malformed=true;break}segments.push({kind:s.kind,start:s.start,end:s.end,text:safe(s.text),...(s.kind!=='speech'?{frame_sha256:s.frame_sha256}:{})})}
  if(malformed){rejected.push(id);continue}
  posts.push({platform:p.platform,url:p.url,published_at:p.published_at,asset_id:p.asset_id,source_sha256:p.source_sha256,parsed_at:p.parsed_at,duration:p.duration,status:p.status,parser_version:p.parser_version,binding:{id:binding.id,method:binding.method,verified_at:binding.verified_at},segments,coverage:{sample_times:samples,audio:['transcribed','no_audio_stream'].includes(p.coverage.audio)?p.coverage.audio:'not_processed',screen_text:p.coverage.screen_text==='sampled_ocr'?'sampled_ocr':'not_processed',ocr_failed_frames:Number.isSafeInteger(p.coverage.ocr_failed_frames)&&p.coverage.ocr_failed_frames>=0?p.coverage.ocr_failed_frames:null,visual_failed_frames:Number.isSafeInteger(p.coverage.visual_failed_frames)&&p.coverage.visual_failed_frames>=0?p.coverage.visual_failed_frames:null}});
 }
 return {status:'available',read_at:input.read_at,posts:posts.filter(p=>!rejected.includes(socialPostIdentity(p.platform,p.url))),rejected:rejected.length};
}
const stamp=n=>n.toFixed(2)+'秒';
export function privateSocialVideoAnalysis(d,evidence,now=Date.now()){
 if(!platforms.includes(d?.kind))return null;
 const snapshot=readPrivateSocialSnapshot(d);if(!snapshot)return '视频分析未通过原指标快照校验，未生成画面或口播结论。';
 const {metadata:m,posts,platform,historical}=snapshot;
 const out=[`${platform} · 视频画面、口播与画面文字复盘`,`指标来源日期：${privateSocialTime(m.source_date)}；视频证据读取：${privateSocialTime(evidence?.read_at)}`,'发布文案不是口播，画面OCR只是字幕候选；模型画面描述未经人工核验。仅内部处理，不发送外部模型。'];
 const source=Date.parse(m.source_date);
 if(historical||!Number.isFinite(source)||source>now||now-source>48*3600000){out.push('指标来源失败、过期或日期异常，暂缓当前视频表现分析；不把旧数据当作今日。');return out.join('\n')}
 if(evidence?.status!=='available'){out.push('视频证据尚未接通或本次读取失败：没有可核对的原帖—视频文件绑定、文件版本和时间点证据。本次不以发布文案或观看量代替画面、口播和字幕分析。','待补齐：原帖标识与发布版本的精确对应、公司内解析结果、0—3秒采样与完整性、音轨转写及画面OCR。指标快照和原编号保持可读；本次没有修改知识或来源成功时间。');return out.join('\n')}
 const matched=posts.map(metric=>({metric,video:evidence.posts.find(p=>p.platform===d.kind&&socialPostIdentity(d.kind,p.url)===socialPostIdentity(d.kind,metric.url)&&Math.abs(Date.parse(p.published_at)-Date.parse(metric.published))<=2000)})).filter(x=>x.video);
 out.push(`配对覆盖：${matched.length}/${posts.length}条保存指标帖有精确绑定且文件SHA-256一致的视频证据；${posts.length-matched.length}条缺失或未配对。${evidence.rejected||0}份视频记录未通过校验，不采用标题相似配对。`);
 if(!matched.length){out.push('未取得可靠配对的视频，暂不能给出针对某帖前三秒的改法；没有匹配不等于没有发布或视频表现差。');return out.join('\n')}
 const ranked=[...matched].sort((a,b)=>(b.metric.metrics.views??-1)-(a.metric.metrics.views??-1));
 out.push(`逐帖抽查：以下最多4条按已知累计观看量优先；不同发布年龄不作效果因果或同龄排名。另${Math.max(0,matched.length-4)}条本次未展开。`);
 for(const [i,{metric,video:v}] of ranked.slice(0,4).entries()){
  const visuals=v.segments.filter(s=>s.kind==='visual_inference'&&s.start<3),ocr=v.segments.filter(s=>s.kind==='screen_text'&&s.start<3),speech=v.segments.filter(s=>s.kind==='speech'&&s.start<3),inside=speech.filter(s=>s.end<=3),cross=speech.filter(s=>s.end>3),coverage=[0,1,2,2.9].filter(t=>t<v.duration).every(t=>visuals.some(s=>Math.abs(s.start-t)<.1));
  out.push(`\n${i+1}. ${metric.url}`,`发布：${privateSocialTime(metric.published)}；累计观看：${metric.metrics.views??'未知'}；点赞：${metric.metrics.likes??'未知'}；评论：${metric.metrics.comments??'未知'}`,`素材：${v.asset_id}；文件SHA-256：${v.source_sha256}`,`解析：${privateSocialTime(v.parsed_at)}；版本：${v.parser_version}；状态：${v.status}；时长：${v.duration}秒；配对凭据：${v.binding.id}（${v.binding.method}）。`,
   `前三秒画面采样：${visuals.length?visuals.map(s=>`[${stamp(s.start)} 机器描述] ${s.text}`).join('；'):'未知；未返回开头画面'}`,
   `前三秒内完整转写段：${inside.length?inside.map(s=>`[${stamp(s.start)}—${stamp(s.end)} ASR] ${s.text}`).join('；'):v.coverage.audio==='no_audio_stream'?'原文件没有音轨，不代表平台未另加声音':'未取得完整位于0—3秒的语音段，不能认定无口播'}`,
   `跨3秒语音段：${cross.length?cross.map(s=>`[${stamp(s.start)}—${stamp(s.end)}] ${s.text}`).join('；')+'（不能确定哪些词落在前三秒）':'本次未返回'}`,
   `开头画面文字候选：${ocr.length?ocr.map(s=>`[${stamp(s.start)} OCR] ${s.text}`).join('；'):'未识别到；不能认定无字幕'}`,
   `画面覆盖：${coverage?'0、1、2及约2.9秒均有采样；仍非逐帧':'开头关键采样不完整，暂缓完整前三秒判断'}；OCR失败帧：${v.coverage.ocr_failed_frames??'未知'}；视觉失败帧：${v.coverage.visual_failed_frames??'未知'}。`);
  const earliest=visuals.toSorted((a,b)=>a.start-b.start)[0],firstSpeech=inside[0];
  if(earliest)out.push(`画面建议（待人工核对）：以[${stamp(earliest.start)}]的实际可见内容为对照，另剪一个“首帧就展示该具体动作/结果”的版本；若该帧仅为标题或Logo，再测试提前到动作镜头。未有相邻帧前，不断言当前镜头拖沓或动作开始太晚。`);
  if(firstSpeech)out.push(`口播建议：围绕[${stamp(firstSpeech.start)}—${stamp(firstSpeech.end)}]转写的一项信息，压成一句可核对的场景或操作问题，随后展示证据；保留原句作对照。转写需先人工听校，不补写产品性能、价格或认证。`);
  else out.push('口播建议暂缓：先核对原音轨及跨界语音段，避免用发布文案代写“原口播”。');
  const crowded=ocr.filter(s=>s.text.length>42||(s.text.match(/\s+/g)||[]).length>12);
  if(crowded.length)out.push(`字幕候选问题：[${crowded.map(s=>stamp(s.start)).join('、')}]识别文字较多，可能包含产品包装/背景而非字幕；人工确认后再测试只保留一句核心信息、拆分两段，并检查小屏可读性。无坐标/字号证据，不能断言字号过小、遮挡或安全区违规。`);
  else out.push('字幕建议：先确认OCR文字中哪些是真正字幕，再与同时间语音逐句核对；只测试一句核心字幕与原版对照。缺少坐标/字号/逐词对齐，不判断字号、遮挡或字幕准确率。');
  out.push(`表达与选题：只围绕上列画面/转写已支持的一项使用场景组织“问题—操作—结果”，将无视频证据的型号或功能标为待核验；不要用累计观看量证明该表达造成效果。`);
 }
 out.push('\n验证与缺口：留存曲线、前三秒留存/跳出、曝光、投放及归因尚未接通；累计观看量不等于开头吸引力。每次只改画面/口播/字幕一个变量，按同平台相同发布后24小时/72小时比较已知指标和样本数，补齐留存后再验证前三秒假设。没有自动剪辑、发帖、投放、公开物料或保存新知识。');
 return out.join('\n');
}
