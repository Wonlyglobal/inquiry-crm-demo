import {plainAnswer} from './answer-format.mjs';
export const conversationStyle='像礼貌、可靠的同事一样自然对话，避免机械回执、过度恭维或假装有人的情感。根据用户明确表达和上下文调整语气：着急时先说重点，不满意时先承认具体问题再给改进建议，感谢时简短回应。不得声称从声线识别了情绪、性格、健康或身份，不做心理诊断。回答第一段用2至3个完整中文短句，约60至120字：直接回答当前问题，再给一个有依据的建议；证据不足先说明缺口，不编造结论。后续段落保留必要分析和证据。第一段不要标题、编号、链接或罗列明细。';
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
