import test from 'node:test';import assert from 'node:assert/strict';
import {transcriptionEmotion,emotionInstruction,ttsInstruction,introIntent,introReply,introSpoken,dialogueStyle,VOICE_EMOTIONS} from '../supabase/functions/agent-conversation/persona-dialogue.mjs';
import {validateDialogue} from '../supabase/functions/agent-conversation/policy.mjs';
import {speechBody,MODELS} from '../supabase/functions/agent-conversation/bailian.mjs';
import {conversationStyle} from '../supabase/functions/agent-conversation/conversation-style.mjs';
const base={action:'chat',persona:'Grace',question:'本月渠道怎么样',history:[]};

test('emotion is read only from the ASR audio_info annotation and only known labels pass',()=>{
 assert.equal(transcriptionEmotion({choices:[{message:{content:'你好',annotations:[{type:'audio_info',emotion:'angry',language:'zh'}]}}]}),'angry');
 assert.equal(transcriptionEmotion({choices:[{message:{annotations:[{type:'audio_info',emotion:'furious'}]}}]}),null);
 assert.equal(transcriptionEmotion({choices:[{message:{content:'x'}}]}),null);
});
test('tone guidance adapts the reply but forbids diagnosis or claiming detection',()=>{
 const a=emotionInstruction('angry');assert.match(a,/仅为估计/);assert.match(a,/不要说“我检测到/);assert.match(a,/不做心理判断/);assert.match(a,/承认/);
 assert.equal(emotionInstruction('neutral'),'');assert.equal(emotionInstruction('bogus'),'');
 assert.match(ttsInstruction('sad'),/温和/);assert.match(ttsInstruction(undefined),/自然亲切/);
});
test('voiceEmotion is accepted only for voice questions with a known label',()=>{
 assert.doesNotThrow(()=>validateDialogue({...base,voice:true,voiceEmotion:'happy'}));
 assert.throws(()=>validateDialogue({...base,voiceEmotion:'happy'}),/语气/);
 assert.throws(()=>validateDialogue({...base,voice:true,voiceEmotion:'<script>'}),/语气/);
});
test('expressive speech uses the instruct model only with a fixed tone template',()=>{
 assert.equal(speechBody('你好','Cherry').model,MODELS.speech);assert.equal(speechBody('你好','Cherry').input.instructions,undefined);
 const b=speechBody('你好','Cherry',ttsInstruction('happy'));assert.equal(b.model,'qwen3-tts-instruct-flash');assert.match(b.input.instructions,/明亮/);
 assert.equal(speechBody('你好','Cherry','x'.repeat(300)).model,MODELS.speech);
});
test('self-introduction is recognised and ends with a follow-up question',()=>{
 for(const q of ['介绍一下你自己','Grace，介绍一下自己吧','你是谁？','你能做什么','自我介绍一下','who are you'])assert.equal(introIntent(q),true,q);
 for(const q of ['介绍一下沙特市场','你是谁的客户经理负责的这个询盘','介绍一下X60 Pro'])assert.equal(introIntent(q),false,q);
 for(const p of ['Grace','Brian','Jay']){const a=introReply(p);assert.match(a,/AI 助手/);assert.match(a,/？$/);assert.match(introSpoken(p),/？$/)}
 assert.match(introReply('Grace'),/画册/);assert.ok(introSpoken('Grace').length<=120);
});
test('dialogue style: warm but honest AI, candid advice, follows instructions without claiming actions',()=>{
 assert.match(dialogueStyle,/如实说自己是AI智能体/);assert.match(dialogueStyle,/不附和/);assert.match(dialogueStyle,/先明确表态/);
 assert.match(dialogueStyle,/直接照做/);assert.match(dialogueStyle,/绝不声称已经执行/);assert.ok(conversationStyle.includes(dialogueStyle));
 assert.deepEqual(VOICE_EMOTIONS.length,7);
});
