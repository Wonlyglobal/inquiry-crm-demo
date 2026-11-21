import {mailCompanyWebsite} from './mail-company-website.mjs';
// Internal customer claims only; never public facts, verified identity or AI approval.
export function mailResearchContext(inquiry={}){
 const text=String(inquiry.original_message||'').slice(0,200000),lines=text.split(/\r?\n/).map(s=>s.trim().replace(/^\*+|\*+$/g,''));
 const signatureStart=lines.findIndex(s=>/^(best regards|kind regards|regards|sincerely|此致)[,，！!]?$/i.test(s)),signature=signatureStart<0?[]:lines.slice(signatureStart+1,signatureStart+13).filter(Boolean);
 const labelled=label=>lines.map(s=>s.match(new RegExp('^(?:'+label+')\\s*[:：]\\s*(.{1,300})$','i'))?.[1]).find(Boolean)||'';
 const company=labelled('company(?: name)?|公司(?:名称)?')||signature.find(s=>/\b(?:ltd\.?|limited|llc|inc\.?|corporation|company)\b|有限公司/i.test(s))||'';
 const job=String(inquiry.contact_job_title||'')||signature.find(s=>/\b(?:manager|director|business development|international sales|president|officer|engineer|procurement)\b/i.test(s))||'';
 const name=String(inquiry.contact_name||'')||labelled('name|姓名')||signature.find(s=>s!==company&&s!==job&&/^[\p{L}][\p{L} .'’-]{2,100}$/u.test(s))||'';
 const email=labelled('email|e-mail|邮箱').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'';
 const phone=labelled('tel(?:ephone)?|phone|mobile(?:/whatsapp)?|whatsapp|电话');
 const website=mailCompanyWebsite(text,company);
 return {company,name,job,email,phone,website,demand:String(inquiry.demand_summary||'').slice(0,2000),source:'客户邮件正文/签名（客户自述，待独立核验）'};
}
export function renderMailResearchContext(container,context){
 container.replaceChildren();const title=document.createElement('h4');title.textContent='原文已知信息 · 待核验';container.append(title);
 const note=document.createElement('p');note.className='hint';note.textContent='以下仅整理客户原文，不代表已确认事实；不自动存入 Business 或作为公开产品/市场证据。';container.append(note);
 const list=document.createElement('dl');
 for(const [label,value] of [['公司',context.company],['联系人',context.name],['职位',context.job],['邮箱',context.email],['电话',context.phone],['候选官网',context.website.domain||context.website.candidates.join('；')],['客户需求',context.demand]]){if(!value)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dd.style.overflowWrap='anywhere';list.append(dt,dd)}
 if(!list.children.length){const empty=document.createElement('p');empty.textContent='原文尚未识别出身份信息，请在原文与整理中补充；不从发件邮箱推定公司官网。';container.append(empty)}else container.append(list);
}
