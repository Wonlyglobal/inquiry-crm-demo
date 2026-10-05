// "资料理解进度" on Grace's live board (owner, 2026-10-03). Counts only, from the material library's
// own index, refreshed at most every 5 minutes. Honest about what is not live yet.
const SEG=[['ready','读完','mp-ready'],['partial','部分','mp-partial'],['processing','在读','mp-busy'],['queued','排队','mp-queue'],['failed','失败','mp-fail'],['not_indexed','不支持','mp-none']];
const pct=(a,b)=>b?Math.round(a/b*100):0;
export function progressRows(p){
 if(!p)return {state:'loading',rows:[]};
 if(p.status!=='available')return {state:'error',rows:[],text:{denied:'物料库授权未通过',not_configured:'物料库连接未配置'}[p.status]||'物料库暂时没连上，稍后自动重试'};
 const rows=[];const d=p.documents;
 rows.push({label:'文档/图片',total:d.total,done:d.ready+d.partial,pct:pct(d.ready+d.partial,d.total),segs:SEG.map(([k,l,c])=>({k,label:l,cls:c,n:d[k]||0})).filter(s=>s.n),detail:`${d.total} 份，读到文字 ${d.ready+d.partial}（完整 ${d.ready}，部分 ${d.partial}），排队 ${d.queued+d.processing}，失败 ${d.failed}，不支持 ${d.not_indexed}`});
 if(p.videos){const v=p.videos;rows.push({label:'视频',total:v.total,done:v.ready+v.partial,pct:pct(v.ready+v.partial,v.total),segs:SEG.map(([k,l,c])=>({k,label:l,cls:c,n:v[k]||0})).filter(s=>s.n),detail:`${v.total} 条，采样解析完成 ${v.ready}，部分 ${v.partial}，排队 ${v.queued+v.processing}，失败 ${v.failed}`})}
 else rows.push({label:'视频',pending:true,detail:'视频解析进度未知；当前接口未提供统计，无法确认后台是否正在运行'});
 if(p.products){const q=p.products,t=q.processed+q.processing+q.partial+q.waiting;rows.push({label:'产品提取',total:t,done:q.processed+q.partial,pct:pct(q.processed+q.partial,t),segs:[['processed','完成','mp-ready'],['partial','有缺口','mp-partial'],['processing','进行中','mp-busy'],['waiting','排队','mp-queue']].map(([k,l,c])=>({k,label:l,cls:c,n:q[k]||0})).filter(s=>s.n),detail:`产品资料 ${t} 份：完成 ${q.processed}，有缺口 ${q.partial}，进行中 ${q.processing}，排队 ${q.waiting}；暂缓 ${q.deferred}`})}
 else rows.push({label:'产品提取',pending:true,detail:'未上线：需在公司内网部署物料服务器的产品提取'});
 return {state:'ok',rows,at:p.read_at};
}
export function progressBlock(p,doc=document){
 const el=(t,c,x)=>{const n=doc.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
 const box=el('div','mat-progress');const head=el('div','mp-head');head.append(el('strong',null,'资料理解进度'));
 const r=progressRows(p);
 if(r.at){const d=new Date(r.at);head.append(el('span',null,Number.isNaN(+d)?'':`${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} 更新`))}
 box.append(head);
 if(r.state!=='ok'){box.append(el('p','mp-note',r.state==='loading'?'正在读取物料库进度…':r.text));return box}
 for(const row of r.rows){
  const line=el('div','mp-row');line.title=row.detail;
  line.append(el('span','mp-label',row.label));
  if(row.pending){line.append(el('span','mp-pending',row.detail));box.append(line);continue}
  const bar=el('div','mp-bar');bar.setAttribute('role','img');bar.setAttribute('aria-label',row.detail);
  for(const s of row.segs){const seg=el('i',s.cls);seg.style.width=(row.total?s.n/row.total*100:0)+'%';seg.title=`${s.label} ${s.n}`;bar.append(seg)}
  line.append(bar,el('b','mp-pct',`${row.pct}%`));box.append(line);
 }
 box.append(el('p','mp-note','读到文字≠读懂产品；参数与型号归属均未人工核验。'));
 return box;
}
