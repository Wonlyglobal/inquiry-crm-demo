// Explicit file selection; same authenticated internal endpoint. No browser persistence or AI calls.
export function validPrivateReceipt(r){return !!r&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id||'')&&/^[0-9a-f]{64}$/.test(r.digest||'')&&/^(weekly|daily|evidence)-20\d{2}-\d{2}-\d{2}(?:-20\d{2}-\d{2}-\d{2})?$/.test(r.key||'')}
export function mountPrivateIntelligence(host,{invoke,isAllowed}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
 const box=el('details');box.className='voice-settings-card';box.dataset.privateKnowledge='true';
 box.append(el('summary','私有知识同步'),el('p','导入内部日报、周报与证据包。仅当前授权账号可查，不公开物料，不发送给外部模型。'));
 const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','选择内部知识包');
 const submit=el('button','同步并回读验证');submit.type='button';
 const refresh=el('button','回读已同步知识');refresh.type='button';
 const status=el('p','选择由内部简报生成的知识包后同步。');status.setAttribute('role','status');
 const receipts=el('div');receipts.setAttribute('aria-label','私有知识同步回执');box.append(input,submit,refresh,status,receipts);host.append(box);
 const busy=v=>{submit.disabled=refresh.disabled=v};
 async function verify(rows){
  if(!Array.isArray(rows)||rows.length>5||rows.some(r=>!validPrivateReceipt(r))||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('回执格式或编号不完整');
  for(const r of rows){const check=await invoke({action:'private-intelligence-receipt',id:r.id});
   if(!validPrivateReceipt(check.receipt)||check.receipt.id!==r.id||check.receipt.digest!==r.digest||check.receipt.key!==r.key)throw Error('回读校验不一致，请重新检查同步状态');
   const p=el('p',`${r.key}｜知识编号 ${r.id}｜校验 ${r.digest}`);p.dataset.evidenceId=r.id;receipts.append(p);
  }
 }
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
