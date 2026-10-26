// Product -> materials (owner, 2026-10-03: "继续补充物料系统的产品理解"). When Grace answers a catalogue model
// card she also looks the model up in the material library (signed, in-company search) and lists the files
// that actually mention it - name, file name or extracted text. Nothing is sent to an external model.
import {materialModelCodes} from './product-input.mjs';
const norm=s=>String(s||'').toUpperCase().replace(/[\s\-_/.]+/g,'');
function modelPattern(model,flags='i',minLength=3){
 const n=norm(model);if(n.length<minLength)return false;
 // Keep field boundaries: deleting every separator can join unrelated words or model variants.
 const pattern=[...n].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\s_/.\\-]*');
 return new RegExp('(?<![A-Z0-9])'+pattern+'(?![A-Z0-9]|[\\s_/.\\-]+(?:PRO|MAX|PLUS|ULTRA|LITE|BASIC|STANDARD)\\b)',flags);
}
export function mentions(asset,model){
 const re=modelPattern(model);if(!re)return false;
 const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
 return strings([asset?.name,asset?.relativePath,asset?.excerpt,asset?.document,asset?.video?.segments]).some(text=>re.test(text));
}
export function findingModelMatchesProduct(f){
 if(!f.model)return true;
 const codes=materialModelCodes(f.product);
 return !codes.length||codes.length===1&&norm(codes[0])===norm(f.model);
}
// A clipped quote such as a base code inside "CODE Pro" is not base-model evidence.
// Match the full source context, then require that exact occurrence to lie in the quote.
export function sourceQuoteAt(chunk,quote,model){
 if(typeof chunk!=='string'||typeof quote!=='string'||!quote)return -1;
 for(let at=chunk.indexOf(quote);at>=0;at=chunk.indexOf(quote,at+1)){
  const re=modelPattern(model,'gi',2);if(!re)return -1;
  for(const m of chunk.matchAll(re))if(m.index>=at&&m.index+m[0].length<=at+quote.length)return at;
 }return -1;
}
export const sourceNamesModel=(chunks,quote,model)=>(chunks||[]).some(chunk=>sourceQuoteAt(chunk,quote,model)>=0);
const KIND=[[/\.(mp4|mov|m4v|avi|webm)$/i,'视频'],[/\.(pdf)$/i,'PDF'],[/\.(pptx?|key)$/i,'PPT'],[/\.(docx?)$/i,'文档'],[/\.(xlsx?|csv)$/i,'表格'],[/\.(jpe?g|png|webp|heic)$/i,'图片']];
export const kindOf=name=>KIND.find(([re])=>re.test(String(name||'')))?.[1]||'文件';
export function relatedMaterials(models,results){
 const seen=new Set(),out=[];
 for(const r of results)for(const a of Array.isArray(r?.assets)?r.assets:[]){
  if(!a?.id||seen.has(a.id))continue;
  const hit=models.find(m=>mentions(a,m));if(!hit)continue;
  seen.add(a.id);out.push({asset:a,model:hit});
 }
 return out.sort((x,y)=>(y.asset.isCurrentVersion===true)-(x.asset.isCurrentVersion===true)).slice(0,8);
}
export function relatedText(models,related,status){
 if(status==='unavailable')return '\n\n相关物料：物料库这次没连上，稍后再问一次可以补上。';
 if(!related.length)return `\n\n相关物料：物料库里暂时没有找到写明 ${models.join('、')} 的文件（按文件名和已解析文字查找；视频和未解析的文件可能漏掉）。`;
 const by={};for(const r of related){const k=r.asset.type||kindOf(r.asset.name);(by[k]??=[]).push(r)}
 return `\n\n相关物料（物料库里提到这些型号的文件，共 ${related.length} 份，窗口里可以直接打开或下载）：\n`+Object.entries(by).map(([k,v])=>`- ${k}：${v.map(r=>`${r.asset.name}${models.length>1?'（'+r.model+'）':''}${r.asset.isCurrentVersion===false?'〔历史版本〕':''}`).join('；')}`).join('\n');
}
