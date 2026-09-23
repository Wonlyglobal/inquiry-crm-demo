# 百炼智能体空间、推理与语音候选

2026-09-23。替代 PR82 中的 OpenAI 候选方案；旧文档仅为历史。尚未部署。

## 已实现
- Grace / Brian / Jay 独立空间、返回大厅、分角色会话，沿用原精确身份门禁。
- 北京固定域名：qwen-plus 通用推理（标准非思考模式）、qwen3-asr-flash、qwen3-tts-flash。
- Grace=Cherry（女），Brian=Ethan（男），Jay=Andre（男）。音色依据阿里云官方列表；并非克隆任何真人。
- Hello + 名字：本机识别 → 固定 Hello Chloe → 连续对话；浏览器必须支持本机语音识别及已安装语言包，无静默云端唤醒回退。
- 录音60秒/2.4MB。WebM或OGG；不支持这两种录音格式的浏览器可用文字。停止/离开页面关闭麦克风和播放。TTS最多1800字。
- 语音使用服务端签名短期票据，绑定用户/角色/到期时间。音频下载仅接受北京官方结果域名，强制HTTPS、拒绝跳转，不发送API密钥到存储站点，并校验大小及WAV头。

## 授权与数据边界
授权人：项目负责人。执行：Codex。用户明确批准百炼北京地域接收主动非机密文字、近期对话、录音及本人权限内的脱敏统计。DASHSCOPE_API_KEY已配置；BAILIAN_AGENT_POLICY=bailian-public-dialogue-v1尚未设置。

CRM由用户JWT客户端执行RLS读取最少字段，不用服务角色读取客户表。模型仅收到近30天新增批次的数量、固定渠道/国家/阶段分类、已关闭批次成交率及跟进逾期数。少于5条的分组不发送；不足样本/读取失败/超过5000条明确标记，不能当作零。此周期独立于看板筛选，未做自定义周期。没有客户名称、ID、联系人、正文、报价、合同、金额、付款或凭证。旧客户AI默认阻断保持。

背调数据来自固定公开索引 https://business.foreverdoodle.com/api/index.json ，每次模型提问读取，8秒超时；仅汇总国家/企业类别及样本量，不发送企业名单、联系方式、内部判断或CRM关联。当前索引2026-09-07、2384条。不能作为全部市场规模、真实采购意愿或实时情报。来源读取失败明确缺口。具体单公司背调与外部模型字段审批不在此实现中。

用户模式历史每角色最多8条，仅内存保存；本地CRM分析历史不进入模型上下文。请求前审计记录模型/操作/字节数/数据源状态，不记录对话或录音。12次/分钟审计计数为软限流，非原子硬配额。

## 验证
- 434项离线回归通过；HTML模块及Edge TS语法检查通过（不是Deno类型检查）。
- 实际北京API：三角色文字返回成功；三种最终音色中英合成→HTTPS下载→ASR成功，均识别Hello Chloe和各自名字。WebM与OGG合成音频亦通过真实ASR。合成样例位于项目 artifacts/agent-voice-samples；无真实客户/录音外发。
- 合成本机浏览器验证大厅→Grace空间→返回→Brian空间，角色标题/脑核/会话独立。
- 尚未：生产Edge部署、真实JWT端到端统计查询、真实麦克风/本机唤醒实测、生产页面验收。不能把上述测试写成已上线。

## 发布与回退
候选发布必须部署agent-conversation及前端，并设置正确策略后核验原精确身份、其他身份拒绝、RLS汇总口径、账单/音频；无数据库迁移。出现问题先撤销BAILIAN_AGENT_POLICY，再回退前端/函数；保留审计，不删除业务数据。CRM和Supabase基础设施位置不因百炼北京接口而改变，不能宣称完整数据链路均在境内。

官方依据：
- https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
- https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference
- https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide
- https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list
