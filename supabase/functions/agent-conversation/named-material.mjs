const EXT='pdf|pptx?|docx?|xlsx?';
const FILE=new RegExp(`[^\\n《》“”"！？?，。；;]{1,118}\\.(?:${EXT})(?![a-z0-9])`,'iu');
const QUOTED=new RegExp(`[《“"]([^\\n《》“”"]{1,118}\\.(?:${EXT}))[》”"]`,'iu');
const LEADING=/^(?:(?:请问|请|帮我|企业物料库里|物料库里|资料库里|资料库|物料库|公司资料里|物料\s*[:：]?|有无|有没有|是否有|有没有收录|我想看|找一下|找|查一下|查|检索|下载|打开|发给我|把|文件|概括)\s*)+/u;
const DELIVERY=/给我文件卡片|只列(?:正确的)?文件|发给我|下载|打开|有没有|是否有|资料库有|找一下文件|找一下|文件卡片|^(?:查)?$/u;
const SOURCE_BOILERPLATE=/^(?:请|只|并)?(?:标明|给出|给|附|保留|查看)?(?:正确)?(?:出处|来源|文件|页码)(?:和页码)?[。！!？?]?$/u;
const ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const MAX_QUOTE=180;
const norm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/gu,'').trim();

export function namedMaterialRequest(question=''){
 const q=String(question||'').trim().normalize('NFKC');
 const quoted=QUOTED.exec(q);
 const unquoted=quoted?null:FILE.exec(q);
 if(!quoted&&!unquoted)return null;
 const raw=quoted?quoted[1]:unquoted[0].replace(LEADING,'').trim();
 if(!raw||raw.length>120||/[\\/<>\x00-\x1f]/u.test(raw))return null;
 // Two explicit documents need a separate comparison flow.
 const match=quoted||unquoted;
 const suffix=q.slice(match.index+match[0].length);
 if(FILE.test(suffix)||FILE.test(q.slice(0,match.index)))return null;
 const before=q.slice(0,match.index)+(quoted?'':unquoted[0].slice(0,unquoted[0].indexOf(raw)));
 const rest=suffix.trim();
 if(/(?:根据|结合|参照|基于).*(?:写|起草|翻译|设计)|(?:对比|比较|写一封|写一段|起草)/u.test(before+rest))return null;
 const content=rest.match(/^(?:\s*(?:文件|资料)?\s*(?:里|中|内)(?:的)?|\s*的)\s*[，,：:\s]?[“"「]?([^，,。？?；;”"」]+)(?:[”"」])?/u);
 if(content){
  const subject=content[1].trim().replace(/(?:写了什么|是什么|有哪些|怎么说|说了什么|如何回答)$/u,'').trim();
  if(subject)return {name:raw,kind:'content',subject};
 }
 if(/概括|总结|写了什么|原文是什么/u.test(before+rest)&&!DELIVERY.test(before+rest)){
  return {name:raw,kind:'content',subject:''};
 }
 if(!rest||DELIVERY.test(before+rest)||SOURCE_BOILERPLATE.test(rest.replace(/^[,，\s]+/,'')))return {name:raw,kind:'file'};
 return null;
}

export function matchingNamedMaterials(data,request){
 const expected=norm(request.name);
 return (data.assets||[]).filter(asset=>ID.test(asset.id)&&asset.isCurrentVersion===true&&norm(asset.name)===expected);
}

const SYNO=[
 [/工作语言|语言要求/u,/英语\s*可\s*作工作语言|工作语言[^。；\n]{0,40}|英语\s*作为工作语言/u],
];
function evidenceRows(asset){
 return (asset.document?.pages||[]).filter(page=>!page.truncated).flatMap(page=>(page.chunks||[]).map(text=>({text,page:page.page,kind:page.kind})));
}
const safeExcerpt=text=>!/PRIVATE KEY|Bearer\s+\S+|\bapi[_ -]?key\s*[:=]|password\s*[:=]|密码\s*[:：]\s*\S|\b(?:SELECT\s+.+\s+FROM|console\.)|[`]{3}/iu.test(text);
function exactExcerpt(asset,subject){
 if(!subject)return null;
 const alias=SYNO.find(([input])=>input.test(subject))?.[1];
 const wanted=norm(subject);
 for(const {text,page,kind} of evidenceRows(asset)){
  const segments=String(text).split(/[。；;\n]+/u).map(s=>s.trim()).filter(Boolean);
  for(const segment of segments){
   const specific=alias?.exec(segment)?.[0]||null;
   if(specific&&safeExcerpt(specific))return {quote:specific.slice(0,MAX_QUOTE),page,kind};
   if(segment.length<=MAX_QUOTE&&wanted.length>=2&&norm(segment).includes(wanted)&&
    norm(segment.replace(/^\s*\d+[.)、]\s*/u,'').replace(/[:：]$/u,''))!==wanted&&safeExcerpt(segment))return {quote:segment,page,kind};
  }
 }
 return null;
}

export function namedMaterialReply(data,request,answerEvidence){
 if(data.status!=='available')return null;
 const files=matchingNamedMaterials(data,request);
 const materials=files.slice(0,6).map(({id,name,type})=>({id,name,type}));
 if(!files.length)return {answer:'这次暂未找到匹配的文件。',materials};
 if(request.kind==='file')return {answer:materials.length===1
  ?`找到了《${materials[0].name}》。可通过文件卡片打开或下载。`
  :`找到 ${materials.length} 份同名文件，请在卡片中核对后打开。`,materials};
 if(files.length!==1)return {answer:'有多份同名文件，请先用卡片核对需要的版本。',materials};
 const [asset]=files;
 const targeted=answerEvidence?.({...data,assets:[asset]},request.subject);
 if(targeted)return {answer:targeted.answer,materials};
 const quote=exactExcerpt(asset,request.subject);
 if(quote){
  const location=quote.kind==='sheet_cells'?`第 ${quote.page} 张工作表`:`第 ${quote.page} 页`;
  const source=`出处：《${asset.name}》${location}`;
  return {answer:`${quote.quote.replace(/[。！？]$/u,'')}。\n${source}`,materials};
 }
 return {answer:`已找到《${asset.name}》。当前可用索引里暂未定位到能回答这项问题的原文。`,materials};
}
