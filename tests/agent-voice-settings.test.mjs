import test from 'node:test';import assert from 'node:assert/strict';
import {legacyVoiceNotice} from '../assets/agent-voice-settings.mjs';
test('only complete legacy operation notices are recognized, not user questions or real product replies',()=>{
 for(const t of ['声纹服务暂时不可用，请稍后再试。','已删除你的声纹（1 段样本特征），之后我不再按声音识别说话人。','已记录第 1 段，还需要 2 段。换一句话再录一次即可。'])assert.equal(legacyVoiceNotice(t),true,t);
 for(const t of ['为什么声纹服务暂时不可用，请稍后再试。','声纹服务暂时不可用，请稍后再试。\n这款产品的参数如下。','已记录第 1 段，还需要 2 段。','X60 Pro 支持声纹吗？','产品型号 X60 Pro，以下是画册参数。'])assert.equal(legacyVoiceNotice(t),false,t);
});
