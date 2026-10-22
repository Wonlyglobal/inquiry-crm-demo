// A report key is a selector, never authority or model memory. The RPC still authenticates every read.
export const PRIVATE_REPORT_KEY=/^(?:weekly|daily|evidence|tiktok|instagram)-20\d{2}-\d{2}-\d{2}(?:-20\d{2}-\d{2}-\d{2})?$/;
export function privateReportQuestion(question='',key=''){
 if(typeof question!=='string'||typeof key!=='string'||!PRIVATE_REPORT_KEY.test(key))return question;
 const q=question.trim().replace(/[。？！?!，,\s]+$/g,'');
 // A new date, task, product or multi-part request must not inherit a previous report.
 if(/20\d{2}|上周|本周|这周|今天|昨天|上月|本月|新需求|另外|还有|并且|以及/.test(q))return question;
 if(/^(?:请|再|那)?(?:这份(?:周报|日报|报告)(?:的)?|它的)?(?:风险(?:有哪些|是什么)?|有哪些风险|下一步(?:呢|做什么)?|优先做什么|建议动作|证据(?:有哪些)?|有哪些证据|来源(?:有哪些)?|有哪些来源|数据日期|有什么缺口|缺口|展开(?:这份报告)?)(?:呢|吗)?$/.test(q))return `查看私有知识 ${key}，${q}`;
 return question;
}
