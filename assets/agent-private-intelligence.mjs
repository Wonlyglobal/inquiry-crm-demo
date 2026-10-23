// Explicit file selection; same authenticated internal endpoint. No browser persistence or AI calls.
export function validPrivateReceipt(r){return !!r&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id||'')&&/^[0-9a-f]{64}$/.test(r.digest||'')&&/^(weekly|daily|evidence|tiktok|instagram|facebook|youtube)-20\d{2}-\d{2}-\d{2}(?:-20\d{2}-\d{2}-\d{2})?$/.test(r.key||'')}
export function privateReceiptLabel(key){const m=String(key).match(/^(weekly|daily|evidence|tiktok|instagram|facebook|youtube)-(20\d{2}-\d{2}-\d{2})(?:-(20\d{2}-\d{2}-\d{2}))?$/);return m?`${{weekly:'周报',daily:'日报',evidence:'证据',tiktok:'TikTok逐帖',instagram:'Instagram逐帖',facebook:'Facebook逐帖',youtube:'YouTube逐帖'}[m[1]]} · ${m[2]}${m[3]?'—'+m[3]:''}`:'未知报告'}
export function privateReportButtons(receipts,onAsk){
 if(receipts?.length!==1||!validPrivateReceipt(receipts[0]))return null;
 const bar=document.createElement('div');bar.className='private-report-actions';bar.setAttribute('aria-label','继续查看这份报告');
 const options=/^(tiktok|instagram|facebook|youtube)-/.test(receipts[0].key)?[['指标概览','指标概览'],['展开逐帖','展开逐帖明细'],['来源与缺口','来源与缺口']]:[['查看风险','风险呢'],['查看下一步','下一步呢'],['查看来源与缺口','来源有哪些']];
 for(const [label,q] of options){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>onAsk(`查看私有知识 ${receipts[0].key}，${q}`);bar.append(b)}return bar;
}
export function mountPrivateIntelligence(host,{invoke,isAllowed}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
 const box=el('details');box.className='voice-settings-card';box.dataset.privateKnowledge='true';
 box.append(el('summary','私有知识同步'),el('p','导入内部日报、周报与证据包。仅当前授权账号可查，不公开物料，不发送给外部模型。'));
 const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','选择内部知识包');
 const submit=el('button','同步并回读验证');submit.type='button';
 const syncSocial=el('button','同步社媒逐帖并回读');syncSocial.type='button';
 const refresh=el('button','回读已同步知识');refresh.type='button';
 const status=el('p','选择由内部简报生成的知识包后同步。');status.setAttribute('role','status');
 const receipts=el('div');receipts.setAttribute('aria-label','私有知识同步回执');box.append(syncSocial,input,submit,refresh,status,receipts);host.append(box);
 const busy=v=>{submit.disabled=syncSocial.disabled=refresh.disabled=input.disabled=v;box.setAttribute('aria-busy',String(v))};
 const allowed=()=>{if(!isAllowed()){receipts.replaceChildren();throw Error('账号已退出，未继续读取')} };
 async function verify(rows){
  if(!Array.isArray(rows)||rows.length>5||rows.some(r=>!validPrivateReceipt(r))||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('回执格式或编号不完整');
  const cards=[];for(const r of rows){allowed();const check=await invoke({action:'private-intelligence-receipt',id:r.id});allowed();
   if(!validPrivateReceipt(check.receipt)||check.receipt.id!==r.id||check.receipt.digest!==r.digest||check.receipt.key!==r.key)throw Error('回读校验不一致，请重新检查同步状态');
   const card=el('div');card.className='private-receipt';card.dataset.evidenceId=r.id;
   card.append(el('strong',privateReceiptLabel(r.key)),el('p','已回读 · 版本校验一致'));
   const detail=el('details');detail.append(el('summary','查看编号与校验详情'),el('p',`知识编号 ${r.id}`),el('p',`SHA-256 ${r.digest}`));card.append(detail);cards.push(card);
  }
  allowed();receipts.replaceChildren(...cards);
 }
 syncSocial.onclick=async()=>{
  if(!isAllowed())return;busy(true);receipts.replaceChildren();status.textContent='正在获取TikTok、Instagram、Facebook、YouTube逐帖指标，写入后回读…';
  try{const result=await invoke({action:'social-metrics-sync'});allowed();if(result.verified!==true)throw Error('服务端未完成内容回读');await verify(result.receipts);
   const coverage=result.coverage||[];const limited=coverage.some(x=>x.status!=='available'||!x.post_coverage_complete||Object.keys(x.metric_gaps||{}).length);
   status.textContent=`已同步并回读验证 ${result.receipts.length} 份社媒快照${limited?'（含部分范围或指标缺口）':''}。可问“查看今天已同步的TikTok指标”、“查看今天已同步的Instagram指标”、“查看今天已同步的Facebook指标”或“查看今天已同步的YouTube指标”。`;
  }catch(e){status.textContent='社媒同步/回读未完成。保留原知识与来源成功时间；先点回读已同步知识核对，勿重复写入。'}finally{busy(false)}
 };
 refresh.onclick=async()=>{
  if(!isAllowed())return;busy(true);receipts.replaceChildren();status.textContent='正在回读已同步知识…';
  try{const result=await invoke({action:'private-intelligence-list'});await verify(result.receipts);status.textContent=result.receipts.length?`已从私有库回读验证 ${result.receipts.length} 份已同步报告/证据。`:'私有库中暂无已同步报告。'}
  catch(e){status.textContent='回读未完成：'+(e.message||'请稍后再试')+'。未改变已保存的报告。'}finally{busy(false)}
 };
 submit.onclick=async()=>{
  if(!isAllowed())return;const file=input.files?.[0];if(!file){status.textContent='请先选择内部知识包。';return}
  if(file.size>262144){status.textContent='知识包超过256KB，请按日期分包。';return}
  busy(true);receipts.replaceChildren();status.textContent='正在同步并核对私有检索结果…';
  try{
   const bundle=JSON.parse(await file.text());if(bundle.schema!=='grace-private-intelligence-bundle-v1'||!Array.isArray(bundle.documents)||!bundle.documents.length||bundle.documents.length>5)throw Error('知识包格式不正确');
   if(!isAllowed())throw Error('账号已退出，未提交');
   const result=await invoke({action:'private-intelligence-import',documents:bundle.documents});
   if(!Array.isArray(result.receipts)||result.receipts.length!==bundle.documents.length)throw Error('未取得完整同步回执');
   await verify(result.receipts);
   status.textContent=`已同步并回读验证 ${result.receipts.length} 份报告/证据。可在对话中问“查看上周周报”或“查看新增证据”。`;input.value='';
  }catch(e){status.textContent='同步或回读未完成：'+(e.message||'请稍后再试')+'。尚不能据此认定Grace已收到全部内容。'}finally{busy(false)}
 };
 return box;
}
