// Internal, bounded read of published WONLY text. No model, persistence or caller-selected URL.
import {boundedBytes} from './bailian.mjs';
import {SOCIAL_URL} from './social.mjs';
import {readPrivateSocialSnapshot,privateSocialTime} from './private-social-display.mjs';
const PLATFORMS=['tiktok','instagram','facebook','youtube'];
export function socialPostIdentity(platform,value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const host=u.hostname.replace(/^www\./,'');let id;
  if(platform==='youtube'&&['youtube.com','youtu.be'].includes(host)){id=host==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/shorts\/([\w-]+)\/?$/)?.[1];return /^[\w-]{11}$/.test(id||'')?'youtube:'+id:null}
  if(platform==='facebook'&&host==='facebook.com'){id=u.pathname.match(/^\/(?:reel|watch|videos)\/(\d+)\/?$/)?.[1]||u.pathname.match(/^\/[^/]+\/(?:posts|videos)\/(\d+)\/?$/)?.[1];return id?'facebook:'+id:null}
  if(platform==='instagram'&&host==='instagram.com'){id=u.pathname.match(/^\/(?:reel|p|tv)\/([\w-]+)\/?$/)?.[1];return id?'instagram:'+id:null}
  if(platform==='tiktok'&&host==='tiktok.com'){id=u.pathname.match(/^\/@[\w.-]+\/(?:video|photo)\/(\d+)\/?$/)?.[1];return id?'tiktok:'+id:null}
 }catch{}return null;
}
const safeText=v=>typeof v==='string'?v.replace(/sk-[\w.-]{12,}|Bearer\s+\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{10,}\d/g,'[已隐藏标识]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,1200):null;
export async function loadSocialContent(authorization,fetcher=fetch,now=Date.now()){
 if(!authorization)return {status:'unavailable'};
 try{const r=await fetcher(SOCIAL_URL+'?content=1',{headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('source');const d=JSON.parse(new TextDecoder().decode(await boundedBytes(r,524288)));
  if(d.schema_version!=='wonly-social-content-v1'||d.site!=='socialwonly.foreverdoodle.com'||d.status!=='available'||!Array.isArray(d.platforms)||d.platforms.length!==4||new Set(d.platforms.map(p=>p.platform)).size!==4)throw Error('schema');
  const platforms=d.platforms.map(p=>{if(!PLATFORMS.includes(p.platform)||!Array.isArray(p.posts)||p.posts.length>100)throw Error('scope');const time=Date.parse(p.fetched_at);const valid=['available','partial'].includes(p.status)&&Number.isFinite(time)&&time<=now+5000&&now-time<=48*3600000;
   return {platform:p.platform,status:valid?p.status:'unavailable',fetched_at:valid?p.fetched_at:null,source:typeof p.source==='string'?p.source.slice(0,80):null,details_complete:p.details_complete===true,window:p.window&&typeof p.window==='object'?{start:p.window.start,end:p.window.end,complete:p.window.complete===true}:null,posts:valid?p.posts.filter(x=>socialPostIdentity(p.platform,x.url)&&Number.isFinite(Date.parse(x.published_at))&&Date.parse(x.published_at)<=now).map(x=>({url:x.url,published_at:x.published_at,text:safeText(x.text),text_truncated:!!x.text_truncated||(x.text?.length||0)>1200,text_kind:['title','caption','title_description'].includes(x.text_kind)?x.text_kind:'unknown'})):[]};
  });for(const p of platforms){p.digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p.posts))))].map(b=>b.toString(16).padStart(2,'0')).join('')}return {status:'available',platforms};
 }catch{return {status:'unavailable'}}
}
export function socialContentIntent(q=''){return /TikTok|Instagram|Facebook|YouTube|社媒|查看私有知识 (?:tiktok|instagram|facebook|youtube)-/i.test(q)&&/内容|选题|开头|表达|文案|标题|改写/.test(q)&&/分析|改进|建议|优化|复盘|怎么|改写|内容与改进/.test(q)}
const topics=[
 ['安装操作',/install|installation|安装|装配|接线|调试/i,'安装演示先看操作步骤，再核对适用条件。','把一个可验证的安装步骤拆成“前提—操作—检查结果”，其他步骤另做一帖。'],
 ['开锁与使用',/unlock|fingerprint|face recognition|passcode|开锁|解锁|指纹|人脸|密码/i,'这次解锁演示，先看实际操作。','先演示文案已提及的一种操作，再说明适用场景；不同开锁方式分开比较。'],
 ['安全与测试',/secur|test|protect|safe|安全|测试|防盗|防护/i,'这次测试怎么做？先看条件与过程。','把测试条件、过程及可核对结果放在同一内容中，未核验前不加认证或性能承诺。'],
 ['外观与设计',/design|finish|color|colour|style|设计|外观|颜色|饰面|颜值/i,'这款设计有哪些细节？先看局部展示。','以一个可见设计细节为主题，给出具体对照；材料、尺寸与适配仍以已核验产品资料为准。'],
 ['连接与智能场景',/smart home|wifi|wi-fi|bluetooth|tuya|app\b|智能家居|联网|蓝牙|远程/i,'这个智能场景如何操作？先看演示流程。','明确文案提及的场景、操作前提和演示结果，不补写未证实的联网能力。'],
 ['品牌与产品介绍',/wonly|smart lock|door|brand|王力|智能锁|门/i,'这次产品介绍，先看一个具体使用场景。','把泛品牌介绍收窄为一个产品场景或用户问题，再展示原文已有依据。']
];
const quote=v=>'“'+String(v||'').replace(/\s+/g,' ').replace(/[<>`\[\]{}*_#]/g,'').slice(0,150)+'”';
function textReview(text){
 const topic=topics.find(([,r])=>r.test(text)),lines=text.split(/[\n。！？!?]|\.(?:\s+|$)/).map(x=>x.trim()).filter(Boolean),opening=lines[0]||text;
 const tags=text.match(/#[\p{L}\p{N}_]+/gu)||[],words=text.match(/[A-Za-z]+(?:'[a-z]+)?/g)||[];
 const cta=/(?:comment|tell us|which|what do you|learn more|see|watch|click|contact|留言|评论|你会|你想|了解|查看|点击|咨询)/i.test(text);
 const generic=/^(?:welcome|discover|introducing|experience|hello|wonly|欢迎|探索|重磅|王力)/i.test(opening),long=opening.length>140||(opening.match(/[A-Za-z]+/g)||[]).length>25;
 const claims=/\b(?:best|perfect|unbreakable|guaranteed|100%)\b|最安全|绝对|百分之百|永不|第一品牌/i.test(text);
 const tagHeavy=tags.length>=6||tags.join('').length>text.length*0.45;
 const issues=[];if(generic)issues.push('文案以品牌/泛化介绍起句，具体场景可提前');if(long)issues.push('文案首句较长，可先保留一个主信息');if(tagHeavy)issues.push(`有${tags.length}个话题标签或标签占比较高，可把正文主信息放在标签前`);if(!cta)issues.push('未识别到明确的提问或下一步提示；这是规则观察，需结合原文人工确认');if(claims)issues.push('出现绝对化或极限表达，发布新版本前应核对证明并改为可核对描述');
 const english=(text.match(/[A-Za-z]/g)||[]).length>(text.match(/[\u4e00-\u9fff]/g)||[]).length*3;
 const englishDrafts=['Installation demo: start with the operating steps.','Unlocking demo: watch the actual operation first.','How was this test done? Start with the conditions and process.','A closer look at the design details.','How does this smart scenario work? Start with the demonstration.','Start with one real product use scenario.'];
 return {english,topic:topic?.[0]||'主题待人工归类',opening,issues,topicAdvice:topic?.[3]||'围绕原文中的一个实际用户问题组织一帖，暂不由观看量推断选题原因。',openingDraft:english?(topic?englishDrafts[topics.indexOf(topic)]:'Which product use question would you like us to demonstrate?'):topic?.[2]||'你希望了解这个产品的哪一个实际使用问题？',cta,words:words.length};
}
export function privateSocialContentAnalysis(d,content,now=Date.now()){
 if(!PLATFORMS.includes(d?.kind))return null;
 const snapshot=readPrivateSocialSnapshot(d);if(!snapshot)return '内容分析未通过原指标快照结构校验，未按标题相似度猜配。';
 const {metadata:m,posts,platform,historical}=snapshot,metricTime=Date.parse(m.source_date),p=content?.platforms?.find(p=>p.platform===d.kind);
 const out=[`${platform} · 内容与逐帖指标联合复盘`,`指标来源时间：${privateSocialTime(m.source_date)}；文案读取时间：${privateSocialTime(p?.fetched_at)}`,'指标来自原已保存快照；文案是本次官方接口可读文本，两者时间不同，不声称还原指标时点的历史文案。'];
 if(p?.digest)out.push(`本次文案投影SHA-256：${p.digest}（仅校验本次可读文本，未保存为私有知识版本）。`);
 if(p?.source)out.push(`文案来源：${p.source}；原帖链接列在逐帖证据中。`);
 if(m.window)out.push(`指标帖子窗口：${privateSocialTime(m.window.start)} 至 ${privateSocialTime(m.window.end)}`);
 if(p?.window)out.push(`内容帖子窗口：${privateSocialTime(p.window.start)} 至 ${privateSocialTime(p.window.end)}；${p.window.complete?'分页登记已完成':'分页完整性未确认'}`);
 if(historical||!Number.isFinite(metricTime)||metricTime>now||now-metricTime>48*3600000){out.push('当前指标来源失败、过期或日期异常，暂缓当前内容表现结论；恢复同口径快照后再配对。');return out.join('\n')}
 if(!p||!['available','partial'].includes(p.status)||!Number.isFinite(Date.parse(p.fetched_at))||Date.parse(p.fetched_at)>now+5000||now-Date.parse(p.fetched_at)>48*3600000){out.push('内容来源未接通或读取失败：选题、开头和表达证据仍缺失。本次不把指标推断成内容原因，不冒充已阅读正文。');return out.join('\n')}
 const byId=new Map(),duplicates=new Set();for(const x of p.posts){const id=socialPostIdentity(d.kind,x.url);if(!id)continue;if(byId.has(id))duplicates.add(id);byId.set(id,x)}
 const matched=[],missing=[];
 for(const metric of posts){const id=socialPostIdentity(d.kind,metric.url),x=byId.get(id),published=Date.parse(metric.published),contentPublished=Date.parse(x?.published_at);
  if(!id||duplicates.has(id)||!x||!x.text?.trim()||!Number.isFinite(published)||!Number.isFinite(contentPublished)||Math.abs(published-contentPublished)>2000){missing.push(metric);continue}matched.push({metric,content:x,review:textReview(x.text)})}
 out.push(`配对覆盖：${matched.length}/${posts.length}条已保存指标帖有同平台、同帖子标识及一致发布时间的可读文案；${missing.length}条未配对。${p.details_complete?'来源登记的本次窗口明细完整。':'内容窗口明细不完整，不能代表整个发布窗口。'}`,
  '内容类型：标题/发布文案/说明文本；不是视频口播、字幕转写、封面或画面。下文“开头”仅指文案第一句，视频前三秒待补证据。规则归类与改写草案未经人工核验。');
 if(!matched.length){out.push('没有可靠配对，不以标题相似或跨平台重复内容补配；保留原指标结果。建议先核对帖子链接、发布时间与官方文本缺口。');return out.join('\n')}
 const groups=new Map();for(const x of matched){const a=groups.get(x.review.topic)||[];a.push(x);groups.set(x.review.topic,a)}
 out.push('\n选题线索（仅匹配文本，不是效果归因）');
 for(const [topic,rows] of groups){const known=rows.filter(x=>Number.isFinite(x.metric.metrics.views));const sorted=known.map(x=>x.metric.metrics.views).sort((a,b)=>a-b);const mid=sorted.length?sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2:null;out.push(`${topic}：${rows.length}条文案；${known.length}条观看量可读${mid!==null?'，累计观看量中位数'+mid:''}。${rows.length<3?'少于3条，不判断选题优劣。':'发布时间、投放、画面与受众未控制，不能说明选题导致差异。'}`)}
 const ranked=[...matched].sort((a,b)=>(b.metric.metrics.views??-1)-(a.metric.metrics.views??-1)||a.metric.url.localeCompare(b.metric.url));
 const lower=[...matched].filter(x=>x.review.issues.length).sort((a,b)=>(a.metric.metrics.views??Infinity)-(b.metric.metrics.views??Infinity));
 const selected=[...new Map([...ranked.slice(0,2),...lower.slice(0,2)].map(x=>[x.metric.url,x])).values()].slice(0,4);
 out.push('\n逐帖证据与具体修改草案（最多4条；包含累计观看候选及有可改文案线索的帖子）');
 for(const [i,x] of selected.entries()){
  const {metric:r,content:c,review:v}=x;out.push(`${i+1}. ${r.url}`,`发布：${privateSocialTime(r.published)}；累计观看：${r.metrics.views??'未知'}；点赞：${r.metrics.likes??'未知'}；评论：${r.metrics.comments??'未知'}`,
   `选题线索：${v.topic}；文案开头原文：${quote(v.opening)}`,`文本覆盖：${c.text_kind}${c.text_truncated?'；已截断，结尾及未读部分不能判断':'；本次返回文本未标截断（不证明视频内容完整）'}`,
   `值得保留：${v.topic==='主题待人工归类'?'保留原帖可核对的具体信息；主题需人工确认。':`围绕“${v.topic}”的明确内容线索，可作为后续同类实验的起点。`}观看量不证明这段表达造成效果。`,
   `问题/待核对：${v.issues.join('；')||'未命中预设文本问题，不表示内容已优秀或无需改进。'}`,
   `选题建议：${v.topicAdvice}`,`文案开头草案：${quote(v.openingDraft)}（建议稿，需与真实产品/演示相符后采用）`,
   `表达建议：先写一个场景，再给原文有依据的动作或证据；${v.cta?'保留现有行动提示，一次只测试一句更具体的问法。':(v.english?'结尾草案：“Which would you like to see next: the operating steps or the setup requirements? Tell us in the comments.”':'结尾草案：“你更想看操作步骤，还是适用条件？请留言说明。”')}不补写性能、认证、价格或销售承诺。`);
 }
 if(matched.some(x=>x.content.text_truncated))out.push('截断缺口：部分文本仅有前段，不能凭未显示结尾认定没有行动提示；上述规则问题仅限已读片段。');
 out.push(`未配对链接（最多3条）：${missing.slice(0,3).map(x=>x.url).join('；')||'无'}${missing.length>3?'；另有'+(missing.length-3)+'条，未用其他内容代替。':''}`,
  '\n后续验证：同平台、相似选题与发布条件，一次只修改文案开头/行动提示中的一个变量，保留原版对照；发布后相同24小时/72小时记录观看、点赞、评论、已知点击及样本数。需另补开头画面/口播与留存，才能检验视频前三秒；缺少曝光和归因时不计算转化或承诺提升。',
  '仅公司内部处理，不发送外部模型；未自动保存或公开文案、发帖、投放、修改客户或知识原件。');
 return out.join('\n');
}
