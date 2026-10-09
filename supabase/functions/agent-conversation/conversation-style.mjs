import {plainAnswer} from './answer-format.mjs';
import {dialogueStyle} from './persona-dialogue.mjs';
// Language system: how the agents speak. Tone first, then shape by question type, then voice, then words to avoid.
export const LANGUAGE_SYSTEM=`说话方式：
- 像一位熟悉王力海外业务、可靠又有温度的同事在当面说话：自然、直接、有判断，用“你”，不打官腔，不过度恭维，不机械回执。根据对方的语气调整：着急时先说重点，不满意时先承认具体哪里没做好再改，感谢时简短回应。不从声音推断性格、健康或身份，不做心理诊断。
- 第一段用2至3个完整短句（约60至120字）直接回答：先给结论或答案，再给一个有依据的建议；证据不足就先说缺什么。第一段不放标题、编号、链接或明细。后面再放必要的依据和步骤。
- 按问题类型组织：
  闲聊或简单问题：一两句话，像同事聊天。
  查数据：先报数字、日期和来源，再用一句话说明这意味着什么。
  要分析：一句话判断，两三条最有力的依据，至少提一个可能的反例，最后是建议动作（做什么、看哪个指标、多久复看、什么情况停）和缺口。
  要方案：写清目标、依据、步骤、验收指标和待确认的假设。
  要建议或让你照做：按下面的“中肯建议”和“照做指令”规则。
- 把系统字段翻译成人话，不要直接写字段名：through 说成“数据截至某日”，generated_at 说成“读取时间”，records_read/total_records 说成“读了多少条、共多少条”，status 的 available/stale/partial 说成“可用/已过期/只读到一部分”，not_configured 说成“还没接通”。
- 数字要好懂：给出日期和口径；比例用百分数，必要时说“大约三成”；不要堆没有解释的数字。
- 注意事项一次说清：同一个提醒一轮只说一次、一句话，放在最需要的地方，不要每段都加免责声明。
- 少用这些套话：“根据您提供的数据”“作为一个AI”“综上所述”“希望对你有帮助”“以下是……”“值得注意的是”。不用星号、Markdown 加粗或斜体，用纯文本段落或数字编号。`;
export const conversationStyle=LANGUAGE_SYSTEM+'\n'+dialogueStyle;
export function courtesyReply(question){
 const q=String(question||'').trim().toLowerCase().replace(/[，。！？,.!？?\s]/g,'');
 if(/^(?:谢谢(?:你|您|啦|了)?|多谢(?:你)?|感谢(?:你)?|辛苦(?:了|你了)?|thanks|thankyou)(?:grace|brian|jay)?$/.test(q))return '不客气，随时为你效劳。';
 if(/^(?:你好|您好|嗨|hello|hi)(?:grace|brian|jay)?$/.test(q))return '你好，Chloe，我在。今天想先聊什么？';
 return null;
}
export function spokenReply(answer){
 const clean=plainAnswer(answer).replace(/https?:\/\/\S+/g,'').replace(/\[[^\]\n]{0,100}\]/g,'').trim();
 const first=clean.split(/\n\s*\n/)[0].replace(/^\s*(?:\d+[.、]\s*|[-•]\s*)/gm,'').replace(/\n/g,' ').trim();
 const sentences=first.match(/[^。！？!?]+[。！？!?]?/g)||[];let out='';
 for(const sentence of sentences.slice(0,3)){if(out.length+sentence.length>220)break;out+=sentence;}
 return out.trim()||'这次内容需要结合完整说明来看，我已经放在信息窗口里了。你想先讨论哪一点？';
}
// Only fixed non-sensitive templates reach cloud TTS for internal material results.
export function materialSpokenReply(data){
 if(data?.status!=='available')return '我暂时没能取得资料，不能据此判断产品情况。建议稍后重试。';
 if(!data.assets?.length)return '目前没有找到同时符合条件的资料。我建议补充产品型号或换一个关键词，避免拿其他产品的资料误导你。';
 return '找到相关资料了。建议先核对产品型号和版本，再比较具体参数；出处和资料入口已放在窗口里，尚未核实的内容我不会当作结论。';
}
