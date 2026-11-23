import {memoryNote,summarizeThread} from './thread-memory.mjs';
const idPattern=/^(?:old-\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export async function threadOperation(db:any,actor:string,input:any){
 const {op,thread,turn}=input;
 if (!['list','open','save','visibility','hide','clear'].includes(op)||(!['list','visibility','clear'].includes(op)&&!idPattern.test(thread||'')))throw Error('记录参数无效');
 const table=()=>db.from('grace_chat_turns');
 if(op==='hide'||op==='clear'){
  const {error}=await db.from('grace_history_visibility').insert({actor,thread_id:op==='clear'?null:thread});
  if(error)throw Error('记录未移除');return true;
 }
 if(op==='visibility'){
  const events=[];for(let offset=0;;offset+=500){const {data,error}=await db.from('grace_history_visibility').select('thread_id,hidden_at').eq('actor',actor).order('hidden_at').order('event_id').range(offset,offset+499);if(error)throw Error('记录状态不可用');events.push(...data);if(data.length<500)break}return events;
 }
 if(op==='save'){
  if(!idPattern.test(turn||'')||turn.startsWith('old-')||typeof input.question!=='string'||!input.question.trim()||input.question.length>3000||typeof input.answer!=='string'||!input.answer.trim()||input.answer.length>150000)throw Error('问答无法保存');
  const scrub=(text:string)=>text.replace(/https?:\/\/[^\s]+(?:token=|signature=|X-Amz-Signature=)[^\s]*/gi,'[临时链接，请重新打开资料]');
  const question=scrub(input.question),answer=scrub(input.answer),material=scrub(String(input.material||'')).slice(0,500);
  const {error}=await table().upsert({actor,thread_id:thread,turn_id:turn,question,answer,material_context:material,memory_note:memoryNote(question,answer)},{onConflict:'actor,turn_id',ignoreDuplicates:true});
  if(error)throw Error('问答未保存');return true;
 }
 const rows:any[]=[];
 for(let offset=0;;offset+=500){
  let query=table().select(op==='list'?'thread_id,created_at,question,memory_note':'question,answer,material_context,memory_note,created_at').eq('actor',actor);
  if(op==='open')query=query.eq('thread_id',thread);
  const {data,error}=await query.order('created_at').order('turn_id').range(offset,offset+499);
  if(error)throw Error('读取会话失败');rows.push(...data);if(data.length<500)break;
 }
 if(op==='open')return {summary:summarizeThread(rows),turns:rows.map(r=>({question:r.question,answer:r.answer,material:r.material_context,created:r.created_at}))};
 const grouped=new Map<string,any>();
 for(const r of rows){const g=grouped.get(r.thread_id)||{id:r.thread_id,first_question:r.question,count:0};Object.assign(g,{last_question:r.question,updated:r.created_at,count:g.count+1});grouped.set(g.id,g)}
 return [...grouped.values()].sort((a,b)=>b.updated.localeCompare(a.updated));
}
