// Deterministic private retrieval; no document text is sent to a model.
const fields=[['核心价值观',/核心价值观|价值观/],['企业使命',/企业使命|公司使命|使命/],['企业愿景',/企业愿景|公司愿景|愿景/],['企业精神',/企业精神/],['经营理念',/经营理念/],['企业宗旨',/企业宗旨/],['英文名称',/英文名|英文名称/],['成立信息',/成立时间|成立日期|成立年份|哪年成立|什么时候成立/],['经营范围',/经营范围/],['公司名称',/公司全称|企业名称|中文名称/]];
export const companyFields=q=>fields.filter(([,r])=>r.test(q));
export function companyQuestion(q=''){
 q=String(q).normalize('NFKC');
 if(/客户|竞品|别的公司|另一家|其他公司|哪个公司|新闻|天气|背调|霍曼|hormann|kaadas|凯迪仕/i.test(q))return false;
 const own=/王力|wonly|wangli|我们公司|我司|本公司|企业文化|查看私有知识 evidence-/i.test(q);
 const bare=/^(?:请问|请|那么|那)?(?:公司|企业)?(?:的)?(?:核心价值观|价值观|使命|愿景|英文名|英文名称|成立时间|经营范围)(?:是什么|有哪些|呢|吗|[？?。\s])*$/;
 return (own&&(companyFields(q).length>0||/企业文化|公司信息|企业信息/.test(q)))||bare.test(q);
}
export function companyDocuments(rows=[]){
 return rows.filter(r=>r?.document?.kind==='evidence'&&r.document.sections?.some(s=>/企业文化公司知识|来源与主体边界/.test(s.title))).slice(0,1);
}
export function companyDirectAnswer(rows,q){
 const row=companyDocuments(rows)[0];
 if(!row)return '本次未找到可核对的公司资料，暂不能准确回答。已检查当前账号可读的最近5份证据；未命中不表示原资料不存在，也不会据此编造公司信息。';
 const d=row.document,wanted=companyFields(q),out=[],hits=[];
 for(const s of d.sections||[]){
  if(!/企业文化公司知识|来源与主体边界/.test(s.title))continue;
  const blocks=String(s.body||'').split(/(?=【[^\n]+】)/);
  for(const b of blocks){
   if(!wanted.length&&/^【/.test(b)||wanted.some(([,r])=>r.test(b))){
    const answer=b.match(/原表答案：([^\n]+)/)?.[1];
    if(answer){hits.push(...wanted.filter(([,r])=>r.test(b)).map(([n])=>n));out.push(answer+'\n出处：'+s.title+' '+(b.match(/^【[^\n]+】/)?.[0]||''));}
    else if(!/原题：/.test(b)&&wanted.some(([n])=>n==='英文名称')){const name=b.match(/[A-Z][A-Za-z &-]{2,100} Co\.,? Ltd\.?/)?.[0];if(name){hits.push('英文名称');out.push('公司英文名称：'+name+'\n出处：'+s.title+'（用户确认；不自动等同其他法人主体）');}}
   }
  }
 }
 if(!out.length)out.push('本次资料未返回该问题可直接核对的答案，暂不作推断。');
 for(const [n] of wanted)if(!hits.includes(n))out.push(n+'：当前已读资料未定位到明确答案，保持未知。');
 const files=new Set();
 for(const section of d.sections||[]){
  if(!/企业文化公司知识/.test(section.title))continue;
  const header=String(section.body||'').split('\n')[0];
  const location=header.match(/(?:来源\s*[:：]\s*)+([^；;\n]+?\.(?:xlsx|xls|pdf|docx|pptx))(?=\s*[；;，,。]|\s*SHA256\b|\s*$)/iu)?.[1];
  if(location){
   const name=location.split(/[\\/]/u).at(-1).trim();
   if(name)files.add(name);
  }
 }
 if(files.size)out.push('来源：'+[...files].join('、'));
 return out.join('\n\n');
}
