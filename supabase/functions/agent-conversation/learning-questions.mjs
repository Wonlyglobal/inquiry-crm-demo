const BOOKS=[
 '企业文化学习考试','制度类学习考试','安全门智能锁产品试题','木门全员产品知识学习','门窗全员产品知识学习(第二阶段)'
];
const TYPES=['单选题','多选题','判断题','填空题','简答题'];
const BOOK_SUFFIX=/(?:\d{15,22})?(?:\s*\(\d+\))*?(?:\.xlsx)?$/i;
export const LEARNING_ROW_PREFIX='学习题库行 ';
const normalized=value=>String(value??'').normalize('NFKC').trim();
const bookTitle=value=>normalized(value).replace(BOOK_SUFFIX,'');

export function learningQuestion(question){
 const text=normalized(question);
 const books=BOOKS.filter(name=>text.includes(name));
 const numbered=[...text.matchAll(/(单选|多选|判断|填空|简答)(?:题)?\s*第?\s*([1-9]\d{0,2})\s*题/gu)];
 if(!books.length||!numbered.length)return null;
 if(books.length!==1||numbered.length!==1)return {clarify:true};
 const [,kind,number]=numbered[0];
 const type=kind+'题';
 const label=type+'第'+number+'题';
 const query=books[0].replace('(第二阶段)','');
 return {title:books[0],type,label,namesOnly:/只列.{0,10}(材料|名称|名字)/u.test(text),
  retrieval:{query,terms:[query,LEARNING_ROW_PREFIX+label+'｜'],page:1,constraints:{}}};
}

function indexedRow(chunk,request){
 const prefix=LEARNING_ROW_PREFIX+request.label+'｜';
 if(typeof chunk!=='string'||!chunk.startsWith(prefix))return null;
 try{
  const row=JSON.parse(chunk.slice(prefix.length));
  if(!Number.isInteger(row.row)||row.row<4||!Array.isArray(row.values)||!row.values.length||row.values.length>12||
   row.values.some(v=>typeof v!=='string'||!v.trim()||v.length>400||/[\r\n]/u.test(v)))return null;
  const unit=['个工作日','个自然日','工作日','自然日','天','个月','年','小时','分钟','秒'].includes(row.unit)?row.unit:'';
  return {...row,unit};
 }catch{return null}
}

export function learningReply(data,request){
 if(request.clarify)return {status:'clarification',answer:'请指定一份学习题库和一个题号。'};
 if(data?.status!=='available')return {status:'unavailable',answer:'暂时无法读取学习资料，请稍后重试。'};
 const files=data.assets.filter(a=>a.isCurrentVersion&&a.visibility==='internal'&&
  /(?:^|\/)公司文件\/学习资料\//u.test(a.relativePath)&&/\.xlsx$/i.test(a.name)&&bookTitle(a.name)===request.title);
 if(files.length!==1)return {status:'source_gap',answer:'暂未找到可唯一核对的学习题库原件。'};
 const [file]=files;
 const rows=(file.document?.pages||[])
  .filter(p=>p.kind==='sheet_cells'&&!p.truncated&&p.page===TYPES.indexOf(request.type)+1)
  .flatMap(p=>p.chunks.map(chunk=>indexedRow(chunk,request)).filter(Boolean));
 if(rows.length!==1)return {status:'row_gap',answer:`暂未在《${file.name}》的正文索引中找到可核对的${request.label}。`};
 const [{row,values,unit}]=rows;
 const useNames=request.namesOnly&&values.every(v=>/^[^：:]{1,24}[：:]/u.test(v));
 const content=useNames?values.map(v=>v.split(/[：:]/u,1)[0]):values;
 const suffix=unit&&content.length===1&&/^\d+(?:\.\d+)?$/u.test(content[0])?' '+unit:'';
 const answer=content.join('、').replace(/[；;。]$/u,'')+suffix+'。';
 return {status:'answered',answer:`${request.type==='判断题'?'题库判定为':''}${answer}\n出处：《${file.name}》· ${request.label}（第 ${row} 行）`};
}
