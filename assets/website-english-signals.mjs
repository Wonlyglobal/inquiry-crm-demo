// Shared response/storage contract. Original quotes never become summary text.
import {WEBSITE_SIGNALS_SCHEMA,SIGNAL_EMPTY,SIGNAL_UNAVAILABLE,isEnglishSummary} from './website-signal-contract.mjs';
export {WEBSITE_SIGNALS_SCHEMA,WEBSITE_SIGNALS_POLICY,SIGNAL_EMPTY,SIGNAL_UNAVAILABLE,isEnglishSummary} from './website-signal-contract.mjs';
export function storedSignalEntries(values){return Array.isArray(values)?values.filter(v=>v?.schema===WEBSITE_SIGNALS_SCHEMA&&v.language==='en'&&isEnglishSummary(v.name||v.display)&&Array.isArray(v.evidence)&&v.evidence.every(e=>typeof e.quote==='string'&&e.quote.length<=500&&typeof e.source_url==='string'&&e.source_url.startsWith('https://')&&typeof e.accessed_at==='string')):[]}
export function savedWebsiteSignals(company){const seo=storedSignalEntries(company?.seo_focus_categories),projects=storedSignalEntries(company?.project_category_signals);return {seo,projects,website:seo[0]?.source_website||projects[0]?.source_website||'',status:seo.length&&projects.length?'ready':'legacy'}}
export function signalFieldText(entries,kind){return entries.length?entries.map(e=>e.name||e.display).join('\n'):SIGNAL_UNAVAILABLE}
export function signalSaveFields(state,before,website=''){
 let matches=true;if(website){try{matches=new URL(/^https?:/i.test(website)?website:'https://'+website).hostname===new URL(state?.website||'').hostname}catch{matches=false}}
 return state?.status==='ready'&&matches?{seo_focus_categories:state.seo,project_category_signals:state.projects}:{seo_focus_categories:before?.seo_focus_categories||[],project_category_signals:before?.project_category_signals||[]}}
export function generatedWebsiteSignals(result){
 if(result?.schema!==WEBSITE_SIGNALS_SCHEMA||result.status!=='ready')return null;
 const seo=storedSignalEntries(result.seo),projects=storedSignalEntries(result.projects);
 if(!seo.length||!projects.length||seo.length>6||projects.length>4||seo.length!==result.seo.length||projects.length!==result.projects.length)return null;
 return {status:'ready',seo,projects,website:seo[0]?.source_website||projects[0]?.source_website||'',input_hash:result.input_hash};
}
export function renderWebsiteSignalEvidence(container,state,{legacy=[]}={}){
 container.replaceChildren();const doc=container.ownerDocument;
 const records=[...(state?.seo||[]),...(state?.projects||[])],seen=new Set();
 for(const record of records)for(const e of record.evidence||[]){
  const key=e.source_url+'\n'+e.quote;if(seen.has(key))continue;seen.add(key);
  let url;try{url=new URL(e.source_url);if(url.protocol!=='https:'||url.username||url.password)continue}catch{continue}
  const block=doc.createElement('details'),heading=doc.createElement('summary'),quote=doc.createElement('blockquote'),link=doc.createElement('a');
  heading.textContent='原文依据 · '+url.hostname+' · '+e.accessed_at;quote.textContent=e.quote;
  link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='打开官网出处 ↗';block.append(heading,quote,link);container.append(block);
 }
 if(!records.length&&legacy.length){const block=doc.createElement('details'),heading=doc.createElement('summary'),quote=doc.createElement('pre');heading.textContent='历史原文摘录（尚未生成英文摘要）';quote.style.whiteSpace='pre-wrap';quote.textContent=legacy.slice(0,12).join('\n').slice(0,6000);block.append(heading,quote);container.append(block)}
 if(!container.childNodes.length){const p=doc.createElement('p');p.textContent='摘要生成后可在这里核对原文片段、官网链接和抓取日期。';container.append(p)}
}
