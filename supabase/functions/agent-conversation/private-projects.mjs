import {projectIntent} from './catalog-projects.mjs';
const SOURCE='https://www.wonlyglobal.com/projects';
// Only the original user's private, source-bound evidence is read. No model calls.
export function privateProjectAnswer(rows,question){
 const intent=projectIntent(question);if(!intent)return null;
 const documents=(rows||[]).filter(r=>r.document?.kind==='evidence'&&/工程案例|项目案例/.test(r.document.title||'')&&r.document.evidence?.some(e=>e.url===SOURCE));
 if(!documents.length)return null;
 const row=documents[0],doc=row.document;
 const entries=(doc.sections||[]).filter(s=>/案例列表|项目列表/.test(s.title)).flatMap(s=>s.body.split('\n')).map(s=>s.match(/^\s*\d+[.、]\s*(.+)$/)?.[1]).filter(Boolean);
 if(!entries.length)return null;
 const match=(s,w)=>/[a-z]/i.test(w)?new RegExp('\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(s):s.includes(w);
 const selected=[...new Set(entries)].filter(s=>!intent.terms.length||intent.terms.some(w=>match(s,w)));
 const source='来源：'+SOURCE+'（'+doc.period.to+'检查；官网自述）';
 let answer;
 if(!selected.length)answer='这份已同步的官网资料未列出'+(intent.geography||'该地区')+'案例，不代表没有。';
 else if(intent.presentation==='supply')answer='这些项目的具体供货产品、数量和配置尚未核实，不能由项目名称推定。';
 else if(/来源|出处|页码/.test(question.split(' ').at(-1)||''))answer='这些案例来自官网项目页；它们不是画册页码记录。项目供货和履约情况待核实。';
 else {
  const names=selected.slice(0,10).map(s=>s.replace(/\s*[—–]\s*.*$/,'').replace(/[。.]$/,''));
  answer=intent.presentation==='table'?'| 项目 |\n| --- |\n'+names.map(s=>`| ${s.replace(/\|/g,'／')} |`).join('\n'):names.map((s,i)=>`${i+1}. ${s}`).join('\n');
  answer+='\n供货及履约情况待核实；这不是全部项目清单。';
 }
 return {answer:answer+'\n'+source,receipts:[{id:row.id,digest:row.digest,key:doc.key}],count:selected.length};
}
export async function readPrivateProjects(client,question){
 const {data,error}=await client.rpc('read_agent_private_intelligence',{p_kind:'evidence',p_from:null,p_to:null,p_key:null,p_limit:5});
 if(error)throw Error('已同步项目资料暂时读取失败，请重试。');
 return privateProjectAnswer(data?.documents||[],question);
}
