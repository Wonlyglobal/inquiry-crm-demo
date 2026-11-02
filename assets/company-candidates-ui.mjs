import {candidateLabels,candidateSourceLabels,publicCandidateUrl} from './company-candidates.mjs?v=20261028-1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=item=>candidateLabels[item.state]||'状态待核对';
const link=(url,text)=>publicCandidateUrl(String(url||''))?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text||url)} ↗</a>`:esc(text||url||'待补充');
export function candidateMetrics(view){
 return [['筛选结果',view.total,'当前查询可见的候选'],['待核实',view.pending,'公开公司身份尚待核对'],['可领取',view.verified,'已核实的公司候选'],['本页展示',view.items.length,'每页最多 50 家']].map(([title,value,note])=>`<article><span>${title}</span><strong>${Number(value)||0}</strong><small>${note}</small></article>`).join('');
}
export function candidateTable(items){
 if(!items.length)return '<tr><td colspan="7"><div class="candidate-empty"><strong>没有符合条件的候选</strong><span>尝试调整关键词或状态筛选。</span></div></td></tr>';
 return items.map(item=>{
  if(item.masked)return `<tr class="candidate-masked"><td><b>公司信息已遮蔽</b><small>已有负责人，仅展示允许查看的信息</small></td><td>—</td><td>—</td><td>—</td><td><span class="candidate-badge">${esc(label(item))}</span></td><td>${esc(item.responsible_name||'—')}</td><td>—</td></tr>`;
  return `<tr><td><button class="candidate-company" data-detail="${esc(item.id)}">${esc(item.company)}</button><small>${link(item.official_url||item.website)}</small></td><td>${esc(item.country||'待核实')}<small>${esc(item.category||'品类待核实')}</small></td><td>${esc(candidateSourceLabels[item.source_kind]||'来源待核对')}<small>${link(item.source_url,'公开来源')}</small></td><td>${esc(item.snapshot_date||'未记录')}<small>来源快照，非当前核验</small></td><td><span class="candidate-badge ${item.state==='verified'?'is-verified':''}">${esc(label(item))}</span></td><td>${esc(item.responsible_name||(item.mine?'本人':'—'))}</td><td><button class="candidate-table-open button-secondary" data-detail="${esc(item.id)}">查看档案</button></td></tr>`;
 }).join('');
}
export function candidateDetail(item,stamp){
 if(!item||item.masked)return '';
 return `<div class="candidate-detail-identity"><span class="candidate-eyebrow">公司研究档案</span><h2>${esc(item.company)}</h2><p>${esc(item.country||'国家待核实')} · ${esc(item.category||'品类待核实')}</p><span class="candidate-badge">${esc(label(item))}</span></div><div class="candidate-detail-actions">${item.can_review?`<button data-review="${esc(item.id)}" class="button-secondary">核对官网与公司身份</button>`:''}${item.can_claim?`<button data-claim="${esc(item.id)}">本人领取</button>`:''}${item.mine&&!item.lead_id?`<button data-promote="${esc(item.id)}">补充需求转个人线索</button>`:''}${item.lead_id?'<a href="sales-leads.html#lead-dashboard">打开个人线索工作台</a>':''}</div><div class="candidate-facts"><section><h3>公司身份与来源</h3><dl><dt>官网候选</dt><dd>${link(item.official_url||item.website)}</dd><dt>公开证据</dt><dd>${link(item.source_url,'查看来源原文')}</dd><dt>来源类型</dt><dd>${esc(candidateSourceLabels[item.source_kind]||'待核对')}</dd><dt>快照日期</dt><dd>${esc(item.snapshot_date||'未记录')}</dd></dl><p>来源快照不等于资料当前已核实，也不代表客户有当前采购意向。</p></section><section><h3>核验记录</h3>${item.reviewed_at?`<p>${esc(stamp(item.reviewed_at))}</p><p class="candidate-note">${esc(item.review_note||'未填写说明')}</p>`:'<p>暂无已保存的人工核验记录，请先核对官网与公司身份。</p>'}${item.existing?'<p>已有客户或线索，不能再次转入计数。</p>':''}</section></div>`;
}
