import {CATEGORIES,evidenceFor,comparisonRows,comparisonText,PUBLIC_EVIDENCE} from './public-research.mjs';
// Company-only product ledger built from gated, authorized material responses.
// It never merges similar names, never resolves differing values, and never marks
// anything as verified: human verification is outside this function.
const key=s=>String(s).normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const loose=s=>key(s).replace(/[\s_\-–—./]/g,'');
const norm=v=>String(v).normalize('NFKC').replace(/\s+/g,'').toLowerCase();

export function productLedger(data,evidence=PUBLIC_EVIDENCE){
 if(data?.status!=='available'||!Array.isArray(data.assets))return null;
 const products=new Map();let hidden=0;
 for(const a of data.assets){
  const u=a.document?.product_understanding;if(!u)continue;
  hidden+=Number(u.hidden_findings)||0;
  for(const f of u.findings||[]){
   const k=key(f.product);
   if(!products.has(k))products.set(k,{name:String(f.product).trim(),assets:new Set(),pages:new Set(),findings:[],partial:false,categories:new Set()});
   const p=products.get(k);
   p.assets.add(a.id);p.pages.add(a.id+'#'+f.page);for(const c of a.document.research_categories||[])p.categories.add(c);
   if(a.document.status==='partial'||u.status!=='processed')p.partial=true;
   p.findings.push({field:f.field,value:f.value,page:f.page,quote:f.quote,asset:a.name,assetId:a.id});
  }
 }
 const list=[...products.values()].slice(0,20).map(p=>{
  const byField=new Map();
  for(const f of p.findings){if(!byField.has(f.field))byField.set(f.field,[]);byField.get(f.field).push(f)}
  const categories=[...p.categories].sort(),pub=categories.flatMap(c=>evidenceFor(c,evidence)),comparisons=comparisonRows(p.findings,categories,evidence);
  const conflicts=[...byField].filter(([,v])=>new Set(v.map(x=>norm(x.value))).size>1).map(([field,v])=>({field,values:v.slice(0,4)}));
  return {name:p.name,asset_count:p.assets.size,page_count:p.pages.size,partial:p.partial,findings:p.findings,conflicts,categories,comparisons,states:{
   coverage:`${p.assets.size}份资料/${p.pages.size}页有依据${p.partial?'，部分资料仍有解析缺口':''}`,
   extraction:`${p.findings.length}条机器提取，均未人工核验`,
   model_check:conflicts.length?`${conflicts.length}个字段表述不同，待人工确认，不自动裁决`:'型号归属未经人工核对',
   competitor:pub.length?`${pub.length}条公开候选对标证据（${[...new Set(pub.map(e=>e.company))].join('、')}），同门类：${categories.map(c=>CATEGORIES[c]).join('、')}；未确认直接竞争`:categories.length?`未开始：${categories.map(c=>CATEGORIES[c]).join('、')}暂无已收录的公开竞品证据`:'未开始：资料未标注产品门类，无法匹配公开竞品',
   analysis:comparisons.length?`已列出${comparisons.length}个同维度并列事实，待人工判断；不排名、不下优劣结论`:'未开始：没有同维度的内部与公开证据时不做定位或优劣判断',
   pending:`${p.findings.length+conflicts.length}项待人工确认`}};
 });
 // Similar-looking names are surfaced, never merged.
 const similar=[];
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(loose(list[i].name)===loose(list[j].name))similar.push([list[i].name,list[j].name]);
 return {products:list,similar:similar.slice(0,5),hidden_findings:hidden,human_verified:false};
}

export function productLedgerText(ledger){
 if(!ledger)return '';
 const hiddenNote=ledger.hidden_findings?`另有${ledger.hidden_findings}条机器提取所在页未随本次检索返回，无法对照原文，已隐藏；可按型号加页码继续查询。\n`:'';
 if(!ledger.products.length)return hiddenNote;
 const lines=ledger.products.slice(0,5).map((p,i)=>`${i+1}. ${p.name}\n资料覆盖：${p.states.coverage}\n事实提取：${p.states.extraction}\n型号核对：${p.states.model_check}\n竞品证据：${p.states.competitor}\n分析：${p.states.analysis}\n待人工确认：${p.states.pending}`+p.conflicts.slice(0,2).map(c=>`\n待核对：${c.field}在不同出处的表述不同，可能涉及条件或版本差异，尚未判定矛盾。\n`+c.values.map(v=>`${v.asset} / 第${v.page}页：${v.quote}`).join('\n')).join('')+comparisonText(p.comparisons||[]));
 return '产品理解状态（内部机器提取，均未人工核验，不是完整产品理解）\n'+lines.join('\n\n')
  +(ledger.products.length>5?`\n另有${ledger.products.length-5}个产品候选未展开。`:'')
  +(ledger.similar.length?'\n名称相近但未合并，需人工确认是否同一产品：'+ledger.similar.map(x=>x.join(' / ')).join('；'):'')
  +'\n'+hiddenNote;
}
