// Concise, page-scoped facts from the existing private catalogue. No model call.
const NAMES={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const normalized=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const safe=value=>typeof value==='string'&&value.length<=500&&!/[{}]|```|\b(?:export|import)\s|console\.|\bSELECT\b.*\bFROM\b/i.test(value);
export function conciseCatalogFacts(intent,catalog,question=''){
 if(intent?.kind!=='facts'||!catalog||!intent.topics.every(topic=>['capacity','factory','lock_core','standards','design_awards'].includes(topic)))return null;
 const q=String(question).normalize('NFKC');
 const pageMatch=q.match(/第\s*(\d{1,3})\s*页|\bpage\s*(\d{1,3})\b/i);
 const page=pageMatch?Number(pageMatch[1]||pageMatch[2]):null;
 const named=/工程画册/.test(q)?'c1':/零售画册/.test(q)?'c2':/静音木门画册|木门画册/.test(q)?'c3':/真智能锁画册|智能锁画册/.test(q)?'c4':null;
 const candidates=(catalog.facts||[]).filter(f=>intent.topics.includes(f.topic)&&(!named||f.catalog===named)&&(page===null||f.page===page));
 if(!candidates.length)return page!==null?'该画册指定页暂未找到这一项的可核对摘录，不能用其他页代答。':null;
 const facts=candidates.filter(f=>safe(f.text)&&NAMES[f.catalog]&&Number.isInteger(f.page));
 if(!facts.length)return '这次未取得可引用的画册原文，暂时无法核对。';
 const shown=facts.slice(0,3),refs=new Set();let unaligned=false;
 const lines=shown.map(f=>{
  const source=(catalog.pages||[]).find(p=>p.catalog===f.catalog&&p.page===f.page);
  const exact=normalized(source?.text).includes(normalized(f.text));
  if(!exact)unaligned=true;
  refs.add(`${NAMES[f.catalog]} PDF第${f.page}页`);
  return `- ${exact?'画册原文':'索引摘要（原页待核对）'}：“${f.text}”`;
 });
 const edition=catalog.sources?.find(s=>s.id===shown[0].catalog)?.edition||'已收录版本';
 const hasConflict=(catalog.conflicts||[]).some(c=>/lock_core/.test(c.topic)&&intent.topics.includes('lock_core'));
 return lines.join('\n')+`\n来源：${edition}，${[...refs].join('；')}。`+
  (hasConflict?'\n不同画册的锁芯倍数口径有差异，勿混用。':'')+
  (facts.length>shown.length?'\n先列相关的3条，其他内容可继续询问。':'')+
  (unaligned?'\n含待核对摘要，待产品负责人确认。':'\n画册宣传口径，待产品负责人确认。');
}
