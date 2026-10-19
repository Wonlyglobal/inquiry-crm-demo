// Bounded read/analysis requests only. Never split memory, write or approval commands.
export function questionPlan(question){
 const q=String(question||'').trim();
 const parts=q.split(/[；;\n]+|[，,]?\s*(?:并且|并|同时|另外|以及|然后|还要)\s*(?=请|介绍|说明|告诉|查询|检查|列出|解释|给出|比较|分析|如何|怎么|帮我)/).map(s=>s.trim().replace(/^[，,、]+|[，,。]+$/g,'')).filter(Boolean);
 const read=/^(?:请)?(?:帮我)?(?:介绍|说明|告诉|查询|检查|列出|解释|给出|比较|分析|如何|怎么|看|找|总结|推荐|对比|了解|打开|调出|调取|搜索|给我)/;
 if(parts.length<2||parts.some(s=>!read.test(s))||parts.some(s=>/^(?:请)?(?:帮我)?(?:记住|忘记|删除|清空|保存|提交|批准|发送|发布|撤销|纠错)/.test(s)))return {parts:[],overflow:false};
 return {parts,overflow:parts.length>3};
}
export function nextMaterialHistory(result,previous=[]){
 const c=result?.context;
 if(result?.provider==='internal'&&typeof c?.material_question==='string'&&c.material_question.trim())return [c.material_question.slice(0,500)];
 return result?.provider==='internal'&&c?.route==='conversation'?previous:[];
}
// All children run through the same authenticated handler. Answers stay server-side and
// are never used as another child's history or sent to a model/TTS as a combined report.
export async function runQuestionPlan(plan,{run,materialHistory=[],signal}){
 if(plan.overflow)return {answer:'这次包含超过 3 项独立要求。为避免漏答，请每次选择最多 3 项；本次尚未执行。',results:[],materialHistory:[]};
 const results=[];let context=materialHistory;
 for(const question of plan.parts){
  let result;if(signal?.aborted)result={error:'对话已停止'};else try{result=await run(question,context)}catch{result={error:'请求未完成，请重试'}}
  if(signal?.aborted)result={error:'对话已停止'};
  const ok=!!String(result?.answer||'').trim()&&!result?.error;
  results.push({question,result,ok});context=ok?nextMaterialHistory(result,context):[];
 }
 return {answer:results.map((r,i)=>`${i+1}. ${r.question}\n${r.ok?r.result.answer:'本项未完成：'+(r.result?.error||'没有取得回答')}`).join('\n\n'),results,materialHistory:context};
}
