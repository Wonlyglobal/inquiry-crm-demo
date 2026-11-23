// A standalone template request can cross from a private conversation into writing.
// Match the complete request, never extract a public-looking prefix from private text.
const topic = '(?:展会准备|展会|经销商培训|样品寄送|英文演示|周会|出差|市场调研|渠道推广|新品发布|售后培训|产品发布会|团队培训|项目启动会)';
const task = '(?:列(?:一份)?行动清单|写一段开场白|拟定议程|整理工作计划|设计培训提纲|准备会议纪要模板|写提醒文案|做一份复盘提纲|排出工作优先级|准备协作分工)';
const request = new RegExp('^(?:另外[，, ]*)?(?:请)?(?:为|给|帮)?(?:新同事|海外团队|团队|同事)?的?'+topic+'(?:的)?'+task+'[。！？?!]?$');
const revision = /^(?:改成英文[，, ]*保留三点|压缩到一百字以内|缩短一点|改成英文|翻译成英文)[。！？?!]?$/;
export function writingInput(input) {
 if(input?.action!=='chat'||input.voice||input.privateReportKey||typeof input.question!=='string'||!Array.isArray(input.history))return null;
 const q=input.question.trim();
 const base={action:'chat',persona:input.persona,question:q,history:[]};
 if(request.test(q))return base;
 if(!revision.test(q))return null;
 if(Array.isArray(input.materialHistory)&&input.materialHistory.at(-1)==='work-checklist:exhibition')return {...base,history:[{role:'user',content:'请为展会准备列行动清单'}]};
 const prev=input.history.filter(m=>m?.role==='user').at(-1)?.content;
 if(typeof prev!=='string'||!request.test(prev.trim()))return null;
 // Regenerate from the safe brief. Never forward unverified assistant text.
 return {...base,history:[{role:'user',content:prev.trim()}]};
}

export function exhibitionChecklist(writing) {
 const brief=writing.history.at(-1)?.content||writing.question;
 if(!/展会(?:准备)?列(?:一份)?行动清单[。！？?!]?$/.test(brief))return null;
 if(/英文/.test(writing.question))return [
  '1. Before the show: Assign a booth lead, confirm the venue and shipping deadlines, check the packing list, and agree on the visitor questions to record.',
  '2. During the show: Check the display each morning, record each visitor’s needs, and agree on one follow-up action and its owner.',
  '3. After the show: Reconcile samples and contacts, send the materials each visitor requested, and review outstanding actions with the team.'
 ].join('\n');
 if(/压缩|缩短/.test(writing.question))return '展前：定分工，核对展位、运输和展品清单。展中：记录访客需求、负责人和下一步。展后：清点样品，按约发送资料，复盘待办。';
 return '展前\n□ 指定展位、物流和接待负责人，把截止日期列入共享清单。\n□ 向主办方确认布展时间、收货地址和现场要求。按清单核对展品、演示设备和已批准的宣传资料。\n\n展中\n□ 每天开馆前测试设备，确认当天的预约和接待分工。\n□ 每次洽谈记下访客需求、承诺发送的资料、负责人及跟进日期。\n\n展后\n□ 清点样品和设备，按约发送资料。\n□ 集中检查未完成的跟进，记录下一次参展要改进的一件事。';
}
