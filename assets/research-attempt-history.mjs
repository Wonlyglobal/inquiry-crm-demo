export function attemptText(row){
 const result=row.result||{},status=row.status==='completed'?'检索完成，身份待核验':'检索未完成，身份待核验';
 return `${new Date(row.created_at||result.accessed_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间） · ${status}\n客户自述：${row.company_claim} · ${row.location_claim||'所在地未提供'}\n已独立验证事实：尚无；未公开入库。`;
}
export function renderAttemptHistory(panel,rows){
 panel.replaceChildren();const heading=document.createElement('h4');heading.textContent='已保存的私有背调检索记录';panel.append(heading);
 if(!rows.length){const note=document.createElement('p');note.textContent='暂无已保存检索；旧版临时结果不会冒充历史记录。';panel.append(note);return}
 for(const row of rows){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=attemptText(row);summary.style.whiteSpace='pre-line';details.append(summary);
  for(const item of row.result?.candidates||[]){let url;try{url=new URL(item.url);if(url.protocol!=='https:'||url.username||url.password)continue}catch{continue}
   const p=document.createElement('p'),a=document.createElement('a'),note=document.createElement('span');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title||url.hostname;note.textContent=' — 搜索线索，未核验：'+(item.summary||'');p.append(a,note);details.append(p)}panel.append(details)
 }
}
export async function loadAttemptHistory({client,inquiryId,panel,isCurrent}){
 panel.textContent='正在读取已保存背调检索记录…';
 const {data,error}=await client.from('inquiry_research_attempts').select('id,created_at,company_claim,location_claim,status,result').eq('inquiry_id',inquiryId).order('created_at',{ascending:false}).limit(20);
 if(!isCurrent())return;
 if(error){panel.textContent='背调检索历史读取失败，请重新打开后重试；不能据此认为没有背调记录。';return}
 renderAttemptHistory(panel,data||[]);
}
