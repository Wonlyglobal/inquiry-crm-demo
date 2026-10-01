// "Grace 直连 CRM" (owner, 2026-10-01): questions that ask for CRM numbers or lists (who sold most, how many
// inquiries, which deals are at risk, the funnel, channel counts) are answered from the live CRM data already
// loaded in this browser under the user's own permissions - computed locally, never sent to an external model.
// Advice questions ("为什么/怎么/建议…") still go to the model, which only sees desensitised summaries.
const DATA=/排名|排行|销售额|成交额|业绩|成交(?:了)?(?:多少|几)|谁.{0,8}(?:最高|最多|最好|最少|最低|第一)|风险|超时|逾期|未跟进|没跟进|漏斗|阶段|转化率|成交率|商机|进行中|询盘(?:数|量|有多少|多少|几)|新增(?:了)?(?:多少|几)?(?:条)?询盘|响应率|首次响应|来源|渠道.{0,6}(?:询盘|分布|多少|几)|经营(?:摘要|情况|数据)|数据看板/;
const LOOKUP=/多少|几|谁|哪|排名|排行|最高|最低|最多|最少|列出|列一下|统计|汇总|分布|情况|数据|本月|上月|本周|上周|今天|昨天|今年|本季|季度|最近|当前|现在|有哪些/;
const ADVICE=/为什么|怎么(?:办|做|提升|改|起量|优化)|如何|建议|策略|方案|值不值|值得|要不要|该不该|分析一下原因|原因/;

const VIEWS=[
 [/排名|排行|销售额|成交额|业绩|谁.{0,8}(?:最高|最多|最好|最少|最低|第一)|成交/,'dashboard','经营看板'],
 [/风险|超时|逾期|未跟进|没跟进/,'risk-review','风险审查中心'],
 [/进行中|询盘|商机|漏斗|阶段|转化/,'inquiries','询盘商机'],
 [/来源|渠道/,'dashboard','经营看板'],
];

export function crmDataIntent(question){
 const q=String(question||'').trim();
 if(!q||q.length>120||!DATA.test(q)||!LOOKUP.test(q)||ADVICE.test(q))return null;
 const hit=VIEWS.find(([re])=>re.test(q));
 return {view:hit?.[1]||'dashboard',label:hit?.[2]||'经营看板'};
}

// Builds the answer object the conversation shows; `compute` is the CRM's own local statistics.
export function crmLiveAnswer(question,{compute,ready}){
 const intent=crmDataIntent(question);if(!intent)return null;
 if(!ready)return {answer:'CRM 实时数据还在加载，稍等几秒再问我一次。',windows:[],labels:['CRM 实时数据']};
 const text=String(compute(question)||'').trim();if(!text)return null;
 return {answer:text+'\n\n以上是 CRM 实时数据，在你的浏览器里按你的权限计算，没有发送给外部模型。',windows:[{type:'crm_view',view:intent.view,label:intent.label}],labels:['CRM 实时数据']};
}
