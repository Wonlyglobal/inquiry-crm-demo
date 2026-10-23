// Presentation only: read the immutable private snapshot, never fetch or rewrite it.
const PLATFORMS={facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube'};
const METRICS={views:'观看量',viewers:'独立观看者',clicks:'点击数',likes:'点赞数',comments:'评论数',shares:'分享数',saves:'收藏数',reach:'触达人数',impressions:'曝光次数',watch_minutes:'观看分钟'};
const REASONS={permission_required:'缺少读取权限',reauthorization_required:'授权需更新',not_returned:'平台未返回',metric_unavailable:'该指标暂不可用',timeout:'读取超时',platform_request_failed:'平台读取失败',not_configured:'来源未配置',not_authorized:'尚未授权',wonly_page_authorization_required:'WONLY主页授权待核对',account_binding_mismatch:'账号绑定待核对',incomplete_source_window:'本次窗口读取不完整',private_document_limit:'知识包容量限制',page_cap:'达到分页上限',time_budget:'达到读取时间上限',cursor_missing:'分页标记缺失',source_unavailable:'来源不可用'};
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const show=v=>v===null||v===undefined?'未提供':String(v);
const reason=v=>REASONS[v]||'来源未说明';
export function privateSocialTime(value){
 if(typeof value!=='string')return '未知';
 if(/^20\d{2}-\d{2}-\d{2}$/.test(value))return value+'（仅日期）';
 if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return '未知';
 return new Date(Date.parse(value)+8*3600000).toISOString().slice(0,19).replace('T',' ')+'（北京时间）';
}
function parsePosts(sections){
 const rows=[];
 for(const s of sections){
  const lines=s.body.split('\n');
  for(let i=0;i<lines.length;i++){
   if(!/^https:\/\//.test(lines[i]))continue;
   const detail=lines[i+1]||'',published=detail.match(/^发布：([^；\n]+)/);
   if(!published)return null;
   const metrics=Object.fromEntries([...detail.matchAll(/(?:^|；)([a-z_]+)=(\d+(?:\.\d+)?)(?=；|$)/g)].filter(m=>Object.hasOwn(METRICS,m[1])&&Number.isFinite(Number(m[2]))).map(m=>[m[1],Number(m[2])]));
   const errors=[...detail.matchAll(/([a-z_]+):([a-z_]+)/g)].filter(m=>Object.hasOwn(METRICS,m[1])).map(m=>`${METRICS[m[1]]}：${reason(m[2])}`);
   rows.push({url:lines[i],published:published[1],metrics,errors});
  }
 }
 return rows;
}
export function privateSocialDisplay(d,question=''){
 if(!Object.hasOwn(PLATFORMS,d?.kind))return null;
 let m;try{m=JSON.parse(d.sections.find(s=>s.title==='来源日期与覆盖')?.body||'null')}catch{return null}
 if(!m||m.platform!==d.kind)return null;
 const details=d.sections.filter(s=>/^(?:已发布逐帖明细|历史逐帖明细)/.test(s.title));
 const rows=parsePosts(details);if(!rows)return null;
 const historical=m.status==='unavailable',window=m.window;
 const saved=count(historical?m.historical_saved_posts:m.saved_posts);
 // An unfamiliar stored layout falls back to the original report, never a lossy preview.
 if(saved!==null&&saved!==rows.length)return null;
 const title=PLATFORMS[d.kind],out=[`${title} · ${d.period.from} 已同步逐帖指标`,'自动汇总，未经人工事实核验；同步成功不代表所有指标均有数据。'];
 out.push(`\n来源数据时间：${privateSocialTime(m.source_date)}`,`知识包生成：${privateSocialTime(d.generated_at)}（生成时间不代表来源更新）`);
 if(historical){out.push(`本次读取未成功：${reason(m.reason)}；未将未返回的数据记为0。`,`来源最近成功时间：${privateSocialTime(m.source_last_success_sync)}`)}
 if(window){out.push(`帖子发布窗口：${privateSocialTime(window.start)} 至 ${privateSocialTime(window.end)}`,`窗口分页：${window.complete===true?'已读完':window.complete===false?'未读完':'未确认'}${window.stop_reason?'；'+reason(window.stop_reason):''}`)}
 out.push(historical?'本次帖子数量未知；以下仅展示上次保存明细。':`本次取得帖子：${show(count(m.post_count))}条；${m.post_coverage_complete===true?'窗口明细覆盖完整':m.post_coverage_complete===false?'窗口明细未完整':'窗口明细完整性未确认'}。`);
 if(count(m.omitted_posts)>0)out.push(`因知识包容量未保存：${m.omitted_posts}条；以下仅覆盖实际保存明细。`);
 if(!historical&&m.reason)out.push(`覆盖限制：${reason(m.reason)}`);
 out.push(`\n${historical?'历史保存明细的':'已保存明细的'}指标覆盖（已知 / 可展示帖子数）`);
 if(!rows.length)out.push('没有可核对的逐帖明细；空结果不证明平台没有发布。');
 else for(const [key,label] of Object.entries(METRICS)){
  if(key==='viewers'&&d.kind!=='facebook')continue;
  const known=rows.filter(r=>Object.hasOwn(r.metrics,key)).length;
  out.push(`${label}：${known}/${rows.length}${known<rows.length?`；${rows.length-known}条未知`:''}`);
 }
 out.push('口径：以上为读取时的逐帖累计值，不是窗口内新增；独立观看者按单帖去重，不能跨帖相加当作总受众。未列出或未返回的指标均为未知，真实返回0仍显示0。');
 const focused=/查看私有知识 (?:facebook|instagram|tiktok|youtube)-/.test(question),follow=question.split('，').at(-1)||'';
 const sourcesOnly=focused&&/^(?:来源有哪些|来源与缺口|数据日期|缺口|有什么缺口)(?:呢|吗)?[？?。]?$/.test(follow);
 const expanded=/展开|全部逐帖|所有帖|每一帖|每条帖/.test(question);
 if(!sourcesOnly&&rows.length){
  const visible=expanded?rows:rows.slice(0,5);
  out.push(`\n${historical?'历史逐帖明细（非本次更新）':'逐帖明细'} · 显示${visible.length}/${rows.length}条`);
  for(const r of visible)out.push(r.url,`发布：${privateSocialTime(r.published)}`,Object.entries(METRICS).filter(([k])=>Object.hasOwn(r.metrics,k)).map(([k,label])=>`${label}：${r.metrics[k]}`).join('；')||'指标全部未知',...(r.errors.length?['缺口：'+r.errors.join('；')]:[]),'');
  if(visible.length<rows.length)out.push(`其余${rows.length-visible.length}条已保存在同份快照中，点“展开逐帖”查看。`);
 }
 if(sourcesOnly||expanded){const history=d.sections.find(s=>s.title==='同口径历史与验证指标');if(history)out.push('\n同口径历史与验证指标',history.body.replace(/20\d{2}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})/g,privateSocialTime))}
 // Unknown future sections stay visible rather than being silently dropped by this presenter.
 for(const s of d.sections.filter(s=>s.title!=='来源日期与覆盖'&&s.title!=='同口径历史与验证指标'&&!details.includes(s)))out.push('\n'+s.title,s.body);
 return out.join('\n');
}
