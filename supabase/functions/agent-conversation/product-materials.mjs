// Product -> materials (owner, 2026-10-03: "继续补充物料系统的产品理解"). When Grace answers a catalogue model
// card she also looks the model up in the material library (signed, in-company search) and lists the files
// that actually mention it - name, file name or extracted text. Nothing is sent to an external model.
const norm=s=>String(s||'').toUpperCase().replace(/[\s\-_/.]+/g,'');
export function mentions(asset,model){
 const n=norm(model);if(n.length<3)return false;
 // Keep field boundaries: deleting every separator can join unrelated words or model variants.
 const pattern=[...n].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\s_-]*');
 const re=new RegExp('(?<![A-Z0-9])'+pattern+'(?![A-Z0-9]|[\\s_-]+(?:PRO|MAX|PLUS|ULTRA|LITE)\\b)','i');
 const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
 return strings([asset?.name,asset?.relativePath,asset?.excerpt,asset?.document,asset?.video?.segments]).some(text=>re.test(text));
}
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
