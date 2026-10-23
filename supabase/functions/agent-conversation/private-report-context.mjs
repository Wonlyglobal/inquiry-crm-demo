// A report key is a selector, never authority or model memory. The RPC still authenticates every read.
export const PRIVATE_REPORT_KEY=/^(?:weekly|daily|evidence|tiktok|instagram|facebook|youtube)-20\d{2}-\d{2}-\d{2}(?:-20\d{2}-\d{2}-\d{2})?$/;
export function privateReportQuestion(question='',key=''){
 if(typeof question!=='string'||typeof key!=='string'||!PRIVATE_REPORT_KEY.test(key))return question;
 const q=question.trim().replace(/[。？！?!，,\s]+$/g,'');
 // A new date, task, product or multi-part request must not inherit a previous report.
 if(/20\d{2}|上周|本周|这周|今天|昨天|上月|本月|新需求|另外|还有|并且|以及/.test(q))return question;
 if(/^(?:tiktok|instagram|facebook|youtube)-/.test(key)&&/^(?:请|再|那)?(?:视频证据|视频前三秒|画面怎么改|口播怎么改|字幕怎么改|内容与改进|结合内容分析|选题怎么改|开头怎么改|表达怎么改|分析帖子表现|分析表现|哪些帖子表现好|有什么问题|怎么改进|改进建议|具体建议|怎么优化|指标概览|展开逐帖(?:明细)?|来源与缺口|观看量|播放量|独立观看者|观看人数|点击(?:量|数)?|点赞(?:数)?|评论(?:数)?|分享(?:数)?|收藏(?:数)?|触达(?:人数)?|曝光(?:次数)?)(?:呢|吗)?$/.test(q))return `查看私有知识 ${key}，${q}`;
 if(/^(?:请|再|那)?(?:这份(?:周报|日报|报告)(?:的)?|它的)?(?:风险(?:有哪些|是什么)?|有哪些风险|下一步(?:呢|做什么)?|优先做什么|建议动作|证据(?:有哪些)?|有哪些证据|来源(?:有哪些)?|有哪些来源|数据日期|有什么缺口|缺口|展开(?:这份报告)?)(?:呢|吗)?$/.test(q))return `查看私有知识 ${key}，${q}`;
 return question;
}
