import {dimensionRows,dimensionPart} from './parameter-table.mjs';
import {materialFields,materialModelCodes,materialVersion} from './product-input.mjs';
import {sourceNamesModel} from './product-materials.mjs';
const canonical=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s_/.-]+/g,'');
// Render numeric products using × so the app's Markdown cleanup cannot
// remove asterisks and concatenate the dimensions.
const displayValue=(field,value)=>field==='尺寸'
 ?value.replace(/(\d(?:[ \t]*(?:mm|cm|in|毫米|厘米))?)[ \t]*[*×][ \t]*(?=\d)/gi,'$1 × ')
 :value;
// Input is an authorized, evidence-gated response, never raw index snippets.
export function productParameterAnswer(data,question,native=null){
 const models=materialModelCodes(question),wanted=materialFields(question).filter(f=>!['型号','参数','规格','来源','版本','页码'].includes(f));
 if(models.length!==1||!wanted.length||data.evidence_gate?.version!==1)return null;
 const model=models[0],version=materialVersion(question),values=new Map();
 const requestedPart=dimensionPart(question);
 const acceptsPart=value=>requestedPart==='尺寸'||dimensionPart(value)===requestedPart;
 for(const a of data.assets||[]){
  // Historic editions remain separate; don't silently replace a current fact.
  if(!version&&a.isCurrentVersion!==true)continue;
  if(version&&canonical(materialVersion(a.versionLabel))!==canonical(version))continue;
  const doc=a.document;
  for(const p of doc?.pages||[]){
   const candidates=[...(doc.product_understanding?.findings||[]).filter(f=>f.page===p.page&&canonical(f.product)===canonical(model)),...(p.facts||[]).map(f=>({...f,value:f.quote}))];
   for(const f of candidates){
    const quote=String(f.quote||'');
    if(!quote||!sourceNamesModel(p.chunks||[],quote,model))continue;
    const matching=wanted.filter(w=>f.field===w||materialFields(f.field||'').includes(w));
    for(const field of matching){
     if(field==='尺寸'&&/门厚|door\s*thickness/i.test(f.field))continue;
     const rowValues=field==='尺寸'?dimensionRows(quote):[];
     for(const value of rowValues.length?rowValues:[String(f.value||quote).trim()]){
     if(field==='尺寸'&&!acceptsPart(value))continue;
     const item={value,source:a.name,page:p.page,version:a.versionLabel||'版本未标注',sha:doc.sha256};
     const list=values.get(field)||[];
     if(!list.some(x=>x.value===value&&x.sha===item.sha&&x.page===item.page))list.push(item);
     values.set(field,list);
     }
    }
   }
  }
 }
 // Only accept native facts already matched to the current authorized source.
 // An unrelated native field must not suppress a document's requested answer.
 if(!native?.retrieval_incomplete)for(const f of native?.facts||[]){
  if(f.analysis_eligible!==true||canonical(f.model)!==canonical(model))continue;
  if(version&&canonical(materialVersion(f.edition))!==canonical(version))continue;
  for(const field of wanted){
   if(f.field!==field&&!materialFields(f.field||'').includes(field))continue;
   if(field==='尺寸'&&/门厚|door\s*thickness/i.test(f.field))continue;
   const value=String(f.value||'').trim();if(!value||field==='尺寸'&&!acceptsPart(value))continue;
   const list=values.get(field)||[];
   if(!list.some(x=>x.value===value&&x.sha===f.sha256&&x.page===f.source_page))
    list.push({value,source:f.ref,page:f.source_page,version:f.edition||'版本未标注',sha:f.sha256,native:true});
   values.set(field,list);
  }
 }
 if(!values.size)return null;
 const lines=[`${model}：`];
 for(const field of wanted){
  const list=values.get(field)||[];
  if(!list.length){lines.push(`- ${field}：本次原页证据未取得，暂不能确认。`);continue;}
  const grouped=new Map();for(const item of list){const k=item.value;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(item);}
  const parts=new Map();for(const value of grouped.keys()){const part=field==='尺寸'?dimensionPart(value):field;parts.set(part,(parts.get(part)||0)+1)}
  const conflict=[...parts.values()].some(n=>n>1);
  lines.push(`${field}${conflict?'（来源表述不同，分别列出，不能认定为同一配置）':''}：`);
  for(const [value,refs] of grouped)lines.push(`- ${displayValue(field,value)}\n  来源：${refs.map(r=>`${r.source}${r.native?'':`，第 ${r.page} 页`}，${r.version}`).join('；')}`);
 }
 lines.push('以上依据本次有权读取的原页摘录整理，未经人工参数核验。'+(data.has_more?'仍有后续资料未读取，不代表完整参数清单。':''),'需要我打开对应画册给你核对吗？');
 return lines.join('\n');
}
