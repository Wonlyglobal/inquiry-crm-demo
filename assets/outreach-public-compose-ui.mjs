import {composeRequest,publicEvidenceItem} from './outreach-compose-policy.mjs?v=20261024-1';
let state={inquiryId:null,items:[]};
function render(ctx){
 const {find:$}=ctx,container=$('#outreach-public-evidence-list');container.replaceChildren();
 const names={company_facts:'公司公开事实',market_facts:'相关市场信息',product_facts:'公开产品主张'};
 for(const [index,item] of state.items.entries()){
  const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span');box.type='checkbox';box.dataset.publicEvidenceIndex=String(index);
  box.addEventListener('change',()=>{$('#outreach-public-confirm').checked=false});
  text.textContent=` ${names[item.kind]}：${item.statement}｜日期：${item.date}｜来源：${item.source}`;label.append(box,text);label.style.cssText='display:block;margin:12px 0;overflow-wrap:anywhere';container.append(label);
 }
 if(!state.items.length)container.textContent='没有符合最小公开格式的候选。可人工补充已核实摘要、公开来源和日期；不能用原邮件或内部画册替代。';
 $('#outreach-public-confirm').checked=false;
}
export function preparePublicOutreachEvidence(ctx){
 const inquiry=ctx.getInquiry();if(!inquiry)return;
 state={inquiryId:inquiry.id,items:[]};
 const groups={company_facts:ctx.research().facts,market_facts:[...ctx.research().signals,...ctx.lines('#detail-research-news'),...ctx.lines('#detail-research-project-categories')]};
 const seen=new Set();
 for(const [kind,lines] of Object.entries(groups))for(const line of lines){
  const parsed=ctx.parse(line,kind==='company_facts'?'fact':'signal');
  try{const item=publicEvidenceItem({statement:parsed.statement,source:parsed.sourceUrl,date:parsed.date});const key=item.source+'|'+item.statement;if(seen.has(key))continue;seen.add(key);state.items.push({...item,kind})}catch{}
 }
 render(ctx);ctx.find('#outreach-public-panel').open=true;
 ctx.toast('已列出带公开来源及日期的候选，请核实内容并勾选；未向模型发送');
}
export function addPublicOutreachEvidence(ctx){
 const inquiry=ctx.getInquiry();if(!inquiry)return;if(state.inquiryId!==inquiry.id)preparePublicOutreachEvidence(ctx);
 try{
  const $=ctx.find,item=publicEvidenceItem({statement:$('#outreach-public-statement').value,source:$('#outreach-public-source').value,date:$('#outreach-public-date').value}),kind=$('#outreach-public-kind').value;
  if(!['company_facts','market_facts','product_facts'].includes(kind))throw Error('请选择公开依据类型');
  state.items.push({...item,kind});render(ctx);$('#outreach-public-statement').value='';$('#outreach-public-source').value='';ctx.toast('已加入待核对列表，请勾选并确认允许用于生成');
 }catch(e){ctx.toast(e.message)}
}
export async function generatePublicOutreach(ctx){
 const inquiry=ctx.getInquiry(),$=ctx.find;if(!inquiry)return;
 if(!ctx.research().generated)return ctx.toast('请先完成客户背调资料整理');
 if(state.inquiryId!==inquiry.id){preparePublicOutreachEvidence(ctx);return}
 if(!$('#outreach-public-confirm').checked){$('#outreach-public-panel').open=true;return ctx.toast('请先核实并确认本次选中的最小公开依据')}
 const button=$('#generate-outreach');let input;
 try{
  const selected=[...document.querySelectorAll('[data-public-evidence-index]:checked')].map(box=>state.items[Number(box.dataset.publicEvidenceIndex)]).filter(Boolean);
  input=composeRequest({inquiry_id:inquiry.id,objective:$('#outreach-objective').value,tone:$('#outreach-tone').value,confirmed_public:true,...Object.fromEntries(['company_facts','market_facts','product_facts'].map(kind=>[kind,selected.filter(item=>item.kind===kind).map(({statement,source,date})=>({statement,source,date}))]))});
 }catch(e){return ctx.toast(e.message)}
 const recipient=ctx.recipient();if(!recipient)return ctx.toast('缺少客户邮箱，未生成');
 const id=inquiry.id;button.disabled=true;button.textContent='正在按公开依据生成…';$('#outreach-status').textContent='仅发送已确认的公开摘要；不会发送客户邮箱电话、原邮件或内部画册。';
 try{
  const response=await ctx.invoke('outreach-compose',{body:input});
  if(response.error||response.data?.error)throw Error(response.data?.error||await ctx.edgeError(response));
  if(ctx.getInquiry()?.id!==id)return;
  const result=response.data;if(!result?.subject||!result?.body||result.pending_human_review!==true)throw Error('未收到有效的待审核草稿');
  const name=String(ctx.contactName()||'Customer').trim().split(/\s+/)[0];
  const body=`Dear ${name},\n\n${result.body}\n\n${ctx.signature()}`;
  $('#outreach-subject-a').value=result.subject;$('#outreach-subject-b').value=result.subject;$('#outreach-selected-subject').value='a';$('#outreach-body').value=body;$('#outreach-recipient').value=recipient;$('#outreach-target-language').value='英文';$('#outreach-body-label').textContent='英文正文';
  inquiry.outreachDraftId=null;inquiry.latestOutreachDraft=null;ctx.setMode('outreach');
  $('#outreach-draft').classList.remove('hidden');$('#outreach-draft-title').textContent='研究型开发信草稿';
  await ctx.save();if(ctx.getInquiry()?.id!==id)return;
  ctx.quality(result.subject,body);$('#save-outreach').disabled=false;$('#send-outreach').disabled=false;$('#send-outreach').classList.remove('hidden');
  $('#outreach-status').textContent='已保存并回读 · 保留所选公开研究依据 · 待人工审核，未发送';ctx.toast('开发信已保存，请核对研究事实、产品主张与沟通目标；未发送');
 }catch(e){if(ctx.getInquiry()?.id===id)$('#outreach-status').textContent='生成或保存未完成，请检查提示；未发送';ctx.toast(e.message)}finally{button.disabled=false;button.textContent='一键生成开发信'}
}
