// Reviewed correction memory. Commands are typed in conversation by the approved owner (Chloe):
//   纠正：<正确说法>；原说法：<错误说法，可省略>；出处：<来源>
//   查看待审核纠错 / 查看已生效纠错
//   批准纠错 #12 [备注] / 驳回纠错 #12 [原因] / 撤销纠错 #12 [原因]
// Nothing takes effect until approved. Only approved rows reach the model context.
const SENSITIVE=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|00)\d[\d \-]{7,}|sk-[A-Za-z0-9_-]{12,}|(?:密码|密钥|口令)\s*[:：=]/;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();

export function correctionCommand(question){
 const q=clean(question).slice(0,1600);
 let m=q.match(/^纠正[:：]\s*(.+)$/);
 if(m){
  const parts=m[1].split(/[；;]\s*(?=(?:原说法|错误说法|出处|来源)[:：])/);
  const field=re=>parts.map(p=>p.match(re)?.[1]).find(Boolean);
  const correction=clean(parts[0].replace(/^(?:正确说法|应为)[:：]/,''));
  const wrong=clean(field(/^(?:原说法|错误说法)[:：]\s*(.+)$/)||'');
  const source=clean(field(/^(?:出处|来源)[:：]\s*(.+)$/)||'');
  if(!source)return {kind:'invalid',message:'纠错需要写明出处，例如：纠正：FD-120 的门扇厚度为 50mm；出处：2026 产品手册第 12 页。'};
  if(correction.length<4||correction.length>800||source.length>300||wrong.length>500)return {kind:'invalid',message:'纠错内容长度不符合要求（正确说法 4–800 字，出处不超过 300 字）。'};
  if(SENSITIVE.test(correction+wrong+source))return {kind:'invalid',message:'纠错内容疑似包含联系方式或凭据，请去掉后再提交。'};
  return {kind:'submit',correction,wrong:wrong||null,source};
 }
 if(/^(?:查看|审核)?待审核纠错[。？?]*$/.test(q))return {kind:'list',status:'pending'};
 if(/^(?:查看)?已生效纠错[。？?]*$/.test(q))return {kind:'list',status:'approved'};
 m=q.match(/^(批准|通过|驳回|拒绝|撤销)纠错\s*#?(\d{1,9})\s*(.*)$/);
 if(m)return {kind:'review',decision:{批准:'approve',通过:'approve',驳回:'reject',拒绝:'reject',撤销:'revoke'}[m[1]],id:Number(m[2]),note:clean(m[3]).slice(0,300)||null};
 return null;
}

const fmt=r=>`#${r.id}｜${r.persona}｜${r.status==='pending'?'待审核':r.status==='approved'?'已生效':r.status==='rejected'?'已驳回':'已撤销'}\n正确说法：${r.correction}${r.wrong_claim?`\n原说法：${r.wrong_claim}`:''}\n出处：${r.source_note}\n提交：${String(r.created_at).slice(0,10)}${r.reviewed_at?`｜审核：${String(r.reviewed_at).slice(0,10)}`:''}`;

// `client` is the caller's own authenticated Supabase client: the database re-checks the reviewer.
export async function runCorrectionCommand(cmd,{client,persona}){
 if(cmd.kind==='invalid')return cmd.message;
 if(cmd.kind==='submit'){
  const {data,error}=await client.rpc('submit_agent_correction',{p_persona:persona,p_wrong_claim:cmd.wrong,p_correction:cmd.correction,p_source_note:cmd.source});
  if(error)return '纠错未保存：'+String(error.message||'').slice(0,120);
  return `已记录纠错 #${data.id}，状态：待审核，尚未生效。\n确认无误后请说“批准纠错 #${data.id}”，生效后 Grace、Brian、Jay 回答相关问题时会优先采用，并注明出处。`;
 }
 if(cmd.kind==='list'){
  const {data,error}=await client.rpc('list_agent_corrections',{p_status:cmd.status});
  if(error)return '纠错列表读取失败：'+String(error.message||'').slice(0,120);
  if(!data?.length)return cmd.status==='pending'?'目前没有待审核的纠错。':'目前没有已生效的纠错。';
  return `${cmd.status==='pending'?'待审核':'已生效'}纠错 ${data.length} 条（最多显示 50 条）：\n\n`+data.map(fmt).join('\n\n')+(cmd.status==='pending'?'\n\n逐条说“批准纠错 #编号”或“驳回纠错 #编号 原因”。':'\n\n需要撤回时说“撤销纠错 #编号 原因”。');
 }
 if(cmd.kind==='review'){
  const {data,error}=await client.rpc('review_agent_correction',{p_id:cmd.id,p_decision:cmd.decision,p_note:cmd.note});
  if(error)return '操作未完成：'+String(error.message||'').slice(0,120);
  return {approved:`纠错 #${data.id} 已生效。`,rejected:`纠错 #${data.id} 已驳回，不会被使用。`,revoked:`纠错 #${data.id} 已撤销，之后的回答不再采用。`}[data.status]||`纠错 #${data.id} 状态：${data.status}`;
 }
 return null;
}

// Relevance: shared CJK bigrams / latin words between the question and the correction text.
const grams=s=>{const t=String(s).toLowerCase(),out=new Set();for(const w of t.match(/[a-z0-9][a-z0-9.\-]{1,}/g)||[])out.add(w);const cjk=t.replace(/[^一-鿿]/g,'');for(let i=0;i<cjk.length-1;i++)out.add(cjk.slice(i,i+2));return out};
export function relevantCorrections(question,rows,limit=5){
 const q=grams(question);
 return (rows||[]).map(r=>{const g=grams(`${r.correction} ${r.wrong_claim||''}`);let hit=0;for(const x of g)if(q.has(x))hit++;return {r,hit}}).filter(x=>x.hit>=2).sort((a,b)=>b.hit-a.hit||b.r.id-a.r.id).slice(0,limit)
  .map(({r})=>({id:r.id,persona:r.persona,correction:r.correction,wrong_claim:r.wrong_claim,source:r.source_note,approved_at:String(r.reviewed_at||'').slice(0,10)}));
}
export async function loadApprovedCorrections(admin){
 try{const {data,error}=await admin.from('agent_knowledge_corrections').select('id,persona,correction,wrong_claim,source_note,reviewed_at').eq('status','approved').order('id',{ascending:false}).limit(200);return error?[]:data||[]}catch{return []}
}
export const correctionsInstruction='reviewedCorrections 是 Chloe 审核通过的纠错知识：与模型记忆或旧资料冲突时以它为准，引用时写“已审核纠错 #编号”及出处；它不覆盖本轮实时数据源（CRM、SEO、社媒、物料）的数值，冲突时两者并列说明。';
