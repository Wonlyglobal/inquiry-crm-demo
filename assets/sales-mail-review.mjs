import {mailTypeEsc,renderMailTypeWorkspace} from './sales-mail-types.mjs?v=20261023-2';
export const REVIEW_FILTERS=Object.freeze({review:'全部待复核',skipped:'安全跳过',uncertain:'AI待人工确认',human:'已人工复核'});
export function reviewReason(item){
 if(item.method==='human')return '已人工复核；如需纠正请保留新的真实依据。';
 if(item.method==='skipped')return String(item.reason||'').includes('高敏')?'规则命中高敏信号，未发送外部AI。请在原权限内人工判断，不抄录银行、证件或密钥等敏感值。':'缺少可安全外发的通用短语，不代表垃圾邮件。请人工阅读原件确认类型。';
 return '证据或置信度不足，AI未作确定分类。请区分当前正文、引用历史及收发方向；无法判断可保留待人工确认。';
}
export function renderReviewControls(people,sales,month,filter='review'){
 return `<div class="form-grid"><label>业务员<select class="input" id="mail-review-sales">${people.map(p=>`<option value="${mailTypeEsc(p.id)}" ${p.id===sales?'selected':''}>${mailTypeEsc(p.full_name||'未命名')}</option>`).join('')}</select></label><label>月份<input class="input" type="month" id="mail-review-month" value="${mailTypeEsc(month)}"></label><label>复核状态<select class="input" id="mail-review-filter">${Object.entries(REVIEW_FILTERS).map(([k,v])=>`<option value="${k}" ${k===filter?'selected':''}>${v}</option>`).join('')}</select></label></div><p class="hint">只显示当前权限内邮件；主管的未授权私人邮件不会开放。跳过不代表垃圾，AI不计绩效。查看原文不会标已读，不发送外部AI。</p><div class="form-actions"><button class="ghost" id="mail-review-refresh">刷新清单</button><button class="ghost" id="mail-review-prev">上一页</button><button class="ghost" id="mail-review-next">下一页</button></div><p id="mail-review-status" class="hint" role="status"></p><div id="mail-review-list"></div>`;
}
export function renderReviewItems(items){
 return items.map(item=>`<section data-review-item="${mailTypeEsc(item.id)}"><p class="hint">${mailTypeEsc(reviewReason(item))}</p><button class="ghost" data-review-original="${mailTypeEsc(item.id)}">查看原邮件</button><div data-review-body="${mailTypeEsc(item.id)}" hidden></div>${renderMailTypeWorkspace([item])}</section>`).join('')||'<p class="hint">当前筛选下没有权限内的复核记录；不代表源邮箱没有邮件。</p>';
}
export function renderReviewOriginal(message){
 return `<p class="hint">完整纯文本正文（含可能的引用历史）；附件和无纯文本的HTML未在此解析。</p><pre class="email-detail-body" dir="auto" style="font-family:inherit">${mailTypeEsc(message.body_text||'无纯文本正文，请在原邮箱查看HTML或附件。')}</pre>`;
}
// Drop late responses after filter changes / closing. No persisted mail body cache.
export function createReviewRequests(){let version=0;return {begin:()=>++version,current:token=>token===version,cancel:()=>++version};}
