// Material understanding progress (owner, 2026-10-03: "grace每个资料都提取理解了吗，进度展示在前台").
// Counts only - no file names or content. Read from the material library through the signed knowledge
// interface under the user's own permissions.
const n=v=>Number.isInteger(v)&&v>=0&&v<=1e6?v:0;
const has=(c,keys)=>c&&typeof c==='object'&&keys.some(k=>k in c);
export function materialProgress(data){
 if(data?.status!=='available')return {status:data?.code==='http_401'||data?.code==='http_403'?'denied':data?.status==='not_configured'?'not_configured':'unavailable',read_at:null};
 const c=data.document_coverage||{},v=data.video_coverage||null;
 const documents={total:n(c.total),ready:n(c.ready),partial:n(c.partial),processing:n(c.processing),queued:n(c.queued),failed:n(c.failed),not_indexed:n(c.not_indexed)};
 const products=has(c,['semantic_processed','semantic_waiting'])?{processed:n(c.semantic_processed),processing:n(c.semantic_processing),partial:n(c.semantic_partial),waiting:n(c.semantic_waiting),deferred:n(c.semantic_deferred)}:null;
 const videos=v&&typeof v==='object'?{total:n(v.total),ready:n(v.ready),partial:n(v.partial),processing:n(v.processing),queued:n(v.queued),failed:n(v.failed),not_indexed:n(v.not_indexed)}:null;
 return {status:'available',read_at:typeof data.read_at==='string'?data.read_at.slice(0,40):new Date().toISOString(),documents,products,videos};
}
const pct=(a,b)=>b?Math.round(a/b*100):0;
export function progressAnswer(p){
 if(p.status!=='available')return {denied:'物料库没有通过你的账号授权校验，看不到理解进度。',not_configured:'物料库连接还没有配置好，看不到理解进度。'}[p.status]||'这次没连上物料库，理解进度稍后再看；Grace 页面左侧的“资料理解进度”会自动刷新。';
 const d=p.documents,done=d.ready+d.partial;
 const lines=[`还没有全部理解。按物料库 ${p.read_at.slice(0,16).replace('T',' ')} 的实时状态：`,
  `■ 文档和图片 ${d.total} 份：文字已读完 ${d.ready}，读了一部分 ${d.partial}，正在读 ${d.processing}，排队 ${d.queued}，失败 ${d.failed}，暂不支持 ${d.not_indexed}（读到文字的占 ${pct(done,d.total)}%）。`];
 if(p.products)lines.push(`■ 产品信息提取（型号、参数归到具体产品）：完成 ${p.products.processed}，进行中 ${p.products.processing}，有缺口 ${p.products.partial}，排队 ${p.products.waiting}，暂缓 ${p.products.deferred}（不像产品资料的先放后面）。`);
 else lines.push('■ 产品信息提取（型号、参数归到具体产品）：还没上线，要在公司内网部署物料服务器的产品提取后才开始。现在能做到的是按文字检索和画册型号对照。');
 if(p.videos)lines.push(`■ 视频 ${p.videos.total} 条：采样解析完成 ${p.videos.ready}，部分 ${p.videos.partial}，正在解析 ${p.videos.processing}，排队 ${p.videos.queued}，失败 ${p.videos.failed}。采样不是逐帧理解。`);
 else lines.push('■ 视频：当前接口未提供解析统计，无法确认后台是否正在运行；单条视频状态可在查资料时核对。');
 lines.push('“读完文字”不等于读懂产品：参数和型号归属都还没有人工核验。进度在 Grace 页面左侧“资料理解进度”里实时显示。');
 return lines.join('\n');
}
// Same numbers as a chart window for the answer.
export function progressChart(p){
 if(p.status!=='available')return null;const d=p.documents;
 const bars=[{label:'文字已读完',value:d.ready},{label:'读了一部分',value:d.partial},{label:'正在读',value:d.processing},{label:'排队',value:d.queued},{label:'失败',value:d.failed},{label:'暂不支持',value:d.not_indexed}];
 return {type:'data_chart',source:'material_progress',label:'资料理解进度',chart:{title:`文档和图片 ${d.total} 份的理解进度`,stat:`读到文字 ${pct(d.ready+d.partial,d.total)}%`,unit:'份',bars,
  sources:[{label:'物料库文档解析索引（实时）',detail:'按你的权限统计，只计数，不含文件内容'},{label:'说明',detail:'读完文字不等于读懂产品；产品参数都未人工核验'}]}};
}
export function progressIntent(question){
 const q=String(question||'');
 return /(资料|物料|文件|文档|视频).{0,10}(理解|提取|解析|读完|读懂|学完|看完).{0,6}(了吗|没有|多少|进度|情况|怎么样)|(理解|提取|解析|学习).{0,4}进度|每个资料.{0,10}(理解|提取|读)/.test(q);
}
