// A report key is a selector, never authority or model memory. The RPC still authenticates every read.
export const PRIVATE_REPORT_KEY=/^(?:(?:weekly|daily|evidence|tiktok|instagram|facebook|youtube)-20\d{2}-\d{2}-\d{2}(?:-20\d{2}-\d{2}-\d{2})?|product-[0-9a-f]{64})$/;
export function privateReportQuestion(question='',key=''){
 if(typeof question!=='string'||typeof key!=='string'||!PRIVATE_REPORT_KEY.test(key))return question;
 const q=question.trim().replace(/[。？！?!，,\s]+$/g,'');
 // A new date, task, product or multi-part request must not inherit a previous report.
 if(/20\d{2}|上周|本周|这周|今天|昨天|上月|本月|新需求|另外|还有|并且|以及/.test(q))return question;
 // Named company fields are safe selectors for the same evidence document, not new model memory.
 // Keep this anchored: another company, a new task, or an arbitrary instruction must not inherit it.
 const companyFollow=/^(?:请问|请|再说说|再|那么|那)?(?:这家公司(?:的)?|我们公司(?:的)?|公司(?:的)?|它的|这份(?:企业文化表|文化表|资料)(?:中|里|的)*)?(?:核心价值观|价值观|企业使命|公司使命|使命|企业愿景|公司愿景|愿景|企业精神|经营理念|企业宗旨|公司英文名|英文名称)(?:是什么|有哪些|怎么说|呢|吗)?(?:[，。？！?!\s]*(?:请)?(?:给出|保留|注明|附上|说明)(?:原表|原文|资料)?(?:出处|来源|来源和缺口|来源与缺口))?$/;
 if(/^evidence-/.test(key)&&companyFollow.test(q))return `查看私有知识 ${key}，${q}`;
 if(/^product-/.test(key))return /^(?:请|再|那)?(?:这份产品证据的|它的)?(?:来源(?:有哪些)?|有哪些来源|证据(?:有哪些)?|有哪些证据|数据日期|有什么缺口|缺口|来源与缺口|展开(?:这份产品证据)?)(?:呢|吗)?$/.test(q)?`查看私有知识 ${key}，${q}`:question;
 if(/^(?:tiktok|instagram|facebook|youtube)-/.test(key)&&/^(?:请|再|那)?(?:视频证据|视频前三秒|画面怎么改|口播怎么改|字幕怎么改|内容与改进|结合内容分析|选题怎么改|开头怎么改|表达怎么改|分析帖子表现|分析表现|哪些帖子表现好|有什么问题|怎么改进|改进建议|具体建议|怎么优化|指标概览|展开逐帖(?:明细)?|来源与缺口|观看量|播放量|独立观看者|观看人数|点击(?:量|数)?|点赞(?:数)?|评论(?:数)?|分享(?:数)?|收藏(?:数)?|触达(?:人数)?|曝光(?:次数)?)(?:呢|吗)?$/.test(q))return `查看私有知识 ${key}，${q}`;
 if(/^(?:请|再|那)?(?:这份(?:周报|日报|报告)(?:的)?|它的)?(?:风险(?:有哪些|是什么)?|有哪些风险|下一步(?:呢|做什么)?|优先做什么|建议动作|证据(?:有哪些)?|有哪些证据|来源(?:有哪些)?|有哪些来源|数据日期|有什么缺口|缺口|展开(?:这份报告)?)(?:呢|吗)?$/.test(q))return `查看私有知识 ${key}，${q}`;
 return question;
}
