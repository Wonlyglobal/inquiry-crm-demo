> 2026-09-23：本方案已由 [百炼候选](agent-bailian-voice.md) 替代。本文保留历史，不能用于当前发布。

# OpenAI 通用推理与语音接入候选

2026-09-23；状态：代码候选，未部署，尚无真实API/音频验收。用户明确选择统一OpenAI推理和语音，并请求协助配置。OPENAI_API_KEY已配置；最新合成测试返回credit_balance_exhausted，账户额度仍不可用。API密钥须仅存Supabase Secrets，不进入源码、浏览器或审计正文。

## 使用流程

智能体对话增加“CRM资料分析 / OpenAI通用推理”。本地资料模式继续使用现有权限内统计；OpenAI模式使用各自角色、当前模式最近8条对话与随函数发布的公开来源快照。两个模式不自动互传CRM证据或历史。Grace/ Brian/ Jay分别使用coral/ cedar/ marin合成语音。文字默认不自动播报；点击开始语音、结束并提问后转写并回复播报，最长60秒/2.5MB。可停止、重播，角色/模式切换、关闭面板和页面隐藏终止当前本机录音与播放。新增Hello唤醒：明确点击开启后，仅通过processLocally=true本机识别Hello Grace / Brian / Jay，固定OpenAI播报Hello Chloe完成后才继续本机中文识别并发送主动话语，回答播报完成后恢复聆听。说“结束对话”关闭，10分钟自动关闭。需要浏览器中英文本机语音包；不支持时拒绝唤醒并保留按钮录音，不回退到云端监听。当前不是全双工Realtime。

Responses默认gpt-5.4-mini、low reasoning、store:false；转写gpt-4o-mini-transcribe，播报gpt-4o-mini-tts。API可用性和额度须配置后实测。store:false不等于供应商零保留承诺。真实语音由用户授权麦克风后验收，不擅自采集环境声音。

## 已批准的数据范围

新增独立策略版本openai-public-dialogue-v1：仅现有获准智能体世界身份，主动提交的非机密文字/近期同模式对话、公开资料，以及主动录制的非机密语音可发送至OpenAI；模型答案可用于OpenAI语音合成。不自动读取或发送CRM客户、联系人、邮件、报价、合同、付款、人员评分或密钥；L3/L4原路径仍默认阻断。

这是一项新的外部数据处理范围，须负责人明确批准后在服务端设置OPENAI_AGENT_POLICY=openai-public-dialogue-v1。缺少该值或API密钥即拒绝调用；请求中的自报审批字段不生效。输入模式和UI提醒不能证明数据已分级，敏感模式检测仅为补充，不能保证识别所有机密，使用者须遵守已批准非机密范围。2026-09-23用户明确批准以上非机密主动文字、近期对话和录音范围；不自动发送CRM客户记录。未降低既有customer-data-ai默认阻断。

## 技术与审计

新agent-conversation Edge Function：auth.getUser后核对启用owner及已批准精确身份；固定OpenAI域名和API路径；拒绝附加CRM上下文或任意工具字段；不持有业务执行工具。限输入/历史/音频大小、响应超时、每分钟12次审计计数（非原子预算封顶，单账户并发可能短暂超出）。审计成功后才向外请求，只记主体、策略、模型、操作、字节数和请求ID，不保存问题/音频/答案正文。上线如需严格金额预算，应另设供应商预算与原子配额，不声称已有消费硬上限。

播报仅接受服务端签名的模型回答凭据，校验用户、角色和5分钟有效期；不能提交任意CRM文本给TTS。浏览器历史与音频仅内存，停止或页面卸载释放麦克风和对象URL。取消只中止客户端等待，不保证供应商已取消或不计费。公开快照随函数部署更新，未实现实时搜索。

## 部署与回滚

1. 在目标Supabase项目plhverjihjilnuhlhlxi配置OPENAI_API_KEY；可选OPENAI_AGENT_MODEL。
2. 完成本文件数据范围审批，再设置OPENAI_AGENT_POLICY精确版本；不是任意绕过开关。
3. 发布新函数与前端，匿名/非授权身份拒绝，获准身份status及合成文字真实API验收；用户语音验收。
4. 检查账单/额度与错误消息；不把配置存在等同实际连接成功。
5. 回滚先删除OPENAI_AGENT_POLICY，退回页面和函数版本；保留审计；不删客户数据。

验证：424项离线回归、HTML模块与Edge TS语法通过；合成浏览器核验未配置阻断、模型状态、请求仅含主动问题及空历史、回答来源标签。真实模型、录音转写和播放尚未验收。

来源：OpenAI Docs官方接口文档：
- https://developers.openai.com/api/docs/guides/text
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/guides/text-to-speech

唤醒依据：https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally 。默认false可能使用远端识别，因此显式要求true且验证本机语言包。
