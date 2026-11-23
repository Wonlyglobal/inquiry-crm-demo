import {validateDialogue,PERSONAS} from './policy.mjs';
import {knowledgeRoute,generalSystem} from './knowledge-routing.mjs';
import {loadCrmStats} from './crm-stats.mjs';
import {crmStatisticQuestion,crmStatisticReply} from './data-charts.mjs';
import {crmGuideIntent,crmGuideAnswer} from './crm-guide.mjs';

// Explicitly authorised members use only their caller-JWT RLS view plus generic dialogue.
// Owner-private intelligence, social/SEO sources, memories, files and write actions stay denied.
export async function memberDialogue({user,profile,input,client,audit,answerGeneral}){
 if(input.action!=='chat')return {status:403,body:{error:'当前成员仅可使用 Grace 问答入口'}};
 if(!PERSONAS[input.persona])return {status:400,body:{error:'智能体无效'}};
 const question=typeof input.question==='string'?input.question.trim():'';
 if(!question||question.length>3000)return {status:400,body:{error:'问题需为1—3000字'}};
 const guide=crmGuideIntent(question);
 const statistics=!guide&&crmStatisticQuestion(question);
 const route=knowledgeRoute(question,input.history||[]);
 const general=!guide&&!statistics&&route.mode==='general'&&!route.materials;
 if(!guide&&!statistics&&!general)return {status:403,body:{error:'此企业资料能力尚未向当前成员开放；可询问通用问题、CRM使用方法或本人权限内统计。'}};
 await audit({actor_id:user.id,entity_type:'profile',entity_id:user.id,action:'grace_member_query',after_data:{operation:guide?'crm_guide':general?'general':'crm_statistics',role:profile.role},reason:general?'已授权成员通用问答；不包含企业资料或服务端业务数据':'按调用者JWT与RLS读取当前成员有权查看的CRM汇总'});
 if(guide)return {status:200,body:{answer:crmGuideAnswer(guide),provider:'internal',model:'crm-usage-guide',context:{route:'crm_guide'}}};
 if(statistics){
  const crm=await loadCrmStats(client);
  if(crm.status==='unavailable')return {status:503,body:{error:'暂时未能完整读取你有权限的 CRM 数据，请稍后重试'}};
  const result=crmStatisticReply(question,crm);
  if(!result)return {status:400,body:{error:'请补充需要统计的指标'}};
  return {status:200,body:{...result,provider:'internal',model:'crm-stat-summary',context:{route:'crm_stat_summary',crm_status:crm.status,crm_period:crm.period}}};
 }
 try{validateDialogue(input)}catch{return {status:400,body:{error:'请缩短问题或历史内容，并移除敏感信息后重试'}}}
 return {status:200,body:{answer:await answerGeneral(input),provider:'bailian',model:'qwen-plus',context:{route:'general'}}};
}
