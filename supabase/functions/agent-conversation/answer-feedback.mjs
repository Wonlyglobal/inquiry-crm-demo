// Owner ratings of agent answers ("有用 / 没用 + 原因"), and a deterministic weekly summary in chat.
// Text is kept only for "没用" ratings, in a private table; nothing here is sent to an external model.
export const REASONS={wrong_data:'数据或事实不对',off_topic:'没回答我的问题',too_long:'太长',too_vague:'太空泛、不具体',tone:'语气不合适',other:'其他'};
const CREDENTIAL=/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}|(?:密码|密钥|口令)\s*[:：=]/i;
export function validateFeedback(input){
 const ok=input&&['Grace','Brian','Jay'].includes(input.persona)&&['up','down'].includes(input.rating)
  &&(input.rating==='up'||Object.hasOwn(REASONS,input.reason))
  &&['route','model'].every(k=>input[k]==null||(typeof input[k]==='string'&&input[k].length<=60))
  &&['question','answer','note'].every(k=>input[k]==null||typeof input[k]==='string')
  &&(input.note==null||input.note.length<=200);
 if(!ok)throw Error('反馈格式不正确');
 if(CREDENTIAL.test([input.question,input.answer,input.note].join('\n')))throw Error('反馈内容疑似包含凭据，请删除后再提交');
 const down=input.rating==='down';
 return {p_persona:input.persona,p_rating:input.rating,p_reason:down?input.reason:null,p_route:input.route||null,p_model:input.model||null,
  p_question:down?String(input.question||'').slice(0,1000)||null:null,p_answer:down?String(input.answer||'').slice(0,2000)||null:null,p_note:input.note?.trim()||null};
}
export function feedbackSummaryIntent(question){
 const q=String(question||'').trim();const m=q.match(/^(?:查看|看看)?(?:最近(\d{1,2})天|本周|这周|本月)?(?:的)?(?:回答)?反馈(?:汇总|统计|情况)?[。？?]*$/);
 if(!m)return null;return {days:m[1]?Number(m[1]):/本月/.test(q)?30:7};
}
const pct=(a,b)=>b?Math.round(a*100/b)+'%':'—';
export function feedbackSummaryAnswer(s){
 if(!s)return '反馈统计暂时读取不到。';
 const total=(s.by_persona||[]).reduce((n,r)=>n+r.up+r.down,0);
 if(!total)return `最近 ${s.days} 天还没有回答反馈。回答下方点“有用 / 没用”，我就能帮你找出答得不好的地方。`;
 const lines=[`最近 ${s.days} 天共 ${total} 条回答反馈（本统计在系统内计算，未发送给外部模型）。`,
  '按智能体：'+(s.by_persona||[]).map(r=>`${r.persona} 有用 ${r.up} / 没用 ${r.down}（没用占 ${pct(r.down,r.up+r.down)}）`).join('；'),
  '按回答来源：'+(s.by_route||[]).map(r=>`${r.route} ${r.up}/${r.down}`).join('；')];
 if(s.reasons?.length)lines.push('“没用”的主要原因：'+s.reasons.map(r=>`${REASONS[r.reason]||r.reason} ${r.n} 次`).join('、'));
 if(s.recent_down?.length)lines.push('最近被标“没用”的问题：\n'+s.recent_down.map(r=>`- #${r.id}｜${r.day}｜${r.persona}｜${REASONS[r.reason]||r.reason}｜${r.question||'（未保存问题）'}${r.note?`｜备注：${r.note}`:''}`).join('\n'));
 const top=s.reasons?.[0]?.reason;
 const advice={wrong_data:'先核对这些问题用到的数据源和日期，必要时用“纠正：……”提交审核纠错。',off_topic:'这些问题可能被分到了不合适的回答来源，适合加进考试题检查路由。',too_long:'可以说“记住：以后回答控制在200字以内”。',too_vague:'可以说“记住：以后建议都写具体动作和验证指标”。',tone:'可以告诉我你希望的语气，我会记成长期偏好。',other:'看一下备注，挑两三条加进考试题。'}[top];
 if(advice)lines.push('建议：'+advice);
 return lines.join('\n\n');
}
