const MARK='grace-company-draft-v1';
export async function latestWriting(db,actor){
 const {data,error}=await db.from('grace_chat_turns').select('thread_id,turn_id,question,answer,material_context,created_at').eq('actor',actor).eq('memory_note',MARK).order('created_at',{ascending:false}).order('turn_id',{ascending:false}).limit(1);
 if(error)throw Error('当前稿件读取失败，请稍后重试');return data?.[0]||null;
}
export function restoredWriting(row,status='restored'){
 if(!row)return null;
 return {answer:(status==='version_conflict'?'稿件已更新，下面是最新保存版本。请核对后重新确认；本次没有翻译旧稿。\n\n':'已恢复上次保存的稿件，可继续修改、确认或翻译。\n\n')+row.answer,provider:'internal',model:'work-scenarios',context:{route:'work_writing',status,material_question:row.material_context}};
}
export async function saveWriting(db,actor,previous,input,result,newDraft){
 const {data,error}=await db.rpc('save_grace_writing_turn',{p_actor:actor,p_expected:previous?.turn_id||null,p_thread:newDraft?crypto.randomUUID():previous?.thread_id||crypto.randomUUID(),p_question:input.question,p_answer:result.answer,p_material:result.context.material_question});
 if(error)throw Error('稿件未保存，请稍后重试；本次结果尚未确认');return data===true;
}
