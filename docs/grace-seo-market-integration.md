# Grace 网站与海外打法接入（2026-09-23，候选，未部署）

用户要求接入自己的 SEO 系统并研究海外竞品，并指定与 seo 任务交流。2026-09-23该任务回复确认实际来源为 /private/tmp/wonly-inquiry-funnel-20260923（核验HEAD 25cabad）。下方旧CMS调查仅为历史候选，不作为此次接入依据。

## 已核验与接入边界

CMS 源码位于 /Volumes/T7/ai/ai项目/wonly后台/WONLY-CMS。google-seo 读取服务器缓存，要求 CMS 管理员会话；不能拿 CRM 会话冒充，也不能公开缓存。同步工作流 sync-google-seo.yml 最近一次 2026-09-23T04:45:21Z 成功；服务 healthz 返回 200。未读取真实受保护 SEO 数字、没有改 CMS 身份或授权。

现有同步计划每6小时运行，实际调度可能延迟。GA4 最近28天及上期对比；GSC 延迟3天的28天最终数据。模型必须同时看到抓取时间、数据截止日和统计区间，禁止称为秒级实时。失败、未授权、旧数据和真实零值必须分开。

建议服务端最少只读契约：版本、站点、source_checked_at、GA4/GSC周期；会话/活跃用户/关键事件/参与率、点击/展示/CTR/平均排名，巡检问题代码与数量。可公开页面路径仅允许 wonlyglobal.com 且去掉查询参数和片段。先不发送搜索词原文、用户或会话标识、表单内容、客户名单、草稿或任何凭证。关键事件不等于询盘或成交，CTR和平均排名须沿用Google汇总，不能平均Top10行反推。

接入需确认系统身份及源端只读通道。当前 CRM 不具备 CMS 管理员授权；不把该缺口包装为已接通。

## 已整理的海外打法知识

候选模型知识文件 market-playbooks.json 包含3个有来源、有核验日期的样本：
- Hörmann 英国：经销商查找、Partner Standard、安装与售后承接。
- dormakaba 美国：设计/规格阶段、合规资料、BIM、行业场景与专家咨询。
- ASSA ABLOY 美国：建筑师入口、技术资料、项目案例、BIM与咨询路径。

每个样本区分事实、推断、王力可验证实验、验收指标及资料缺口。它们不是全部海外市场的通用模板，也不是持续监测。不能声称已掌握竞品流量、广告预算、成本、转化率或ROI。来源在JSON内。

后续上线验收：源端匿名拒绝、错误凭证拒绝、仅允许固定汇总、过期/异常/缺失数据标记、模型回答保留来源日期、真实CRM身份端到端。回滚恢复原agent-conversation函数并撤销新增源端授权，保留审计。此候选未修改生产函数、CMS系统或数据权限。


## SEO 任务正式对接结果（替代旧接口假设）

来源任务 seo（01a07f90-3583-7881-8826-7ae176ab0d84）经用户授权发送脱敏核验结果；接收方仍需核验接口/实现，不把回复当作已上线证明。

- 最新官网源码：/private/tmp/wonly-inquiry-funnel-20260923，报告 scripts/seo-report.mjs，工作流 seo-daily.yml（北京时间09:17）；SEO自动化09:30，7/14天观察。
- 当前CMS入口 POST https://cms.wonlyglobal.com/api/analytics/analytics/sync 是受限Origin + CMS角色 + pending sync_id 的同步写入，不供CRM复用。
- 尚无CRM只读API；建议 GET /api/seo-summary/v1/current 及 history?days=14，使用独立可撤销服务凭据，服务器之间访问。
- GSC截至2026-09-20：7天13点击/441展示/CTR2.9%/平均排名9.6；28天29/1302/2.2%/16.9。
- GA4截至2026-09-22：7天自然22会话，28天自然75会话；自然28天form_open13、form_start2。form_open表示表单显示/打开，不等于主动高意向。主要候选掉点为open到start；小样本不归因。
- 缺失页面级GSC、墨西哥当期流量及部分桌面排名必须为null，不得填0。GA4约1天、GSC约3天延迟。
- 正式对标名单：hormann.com、dierre.com、oikos.it、kaadas.com；网站架构标杆cdfdistributors.com。既有SEMrush2026-09-07与CDF2026-09-18报告仅历史快照。
- 已请求SEO任务准备源端快照/只读契约与合成样例、鉴权和测试结果，先不部署。CRM将验证白名单、比例单位、null/gaps、时间、响应上限及身份限制后接入百炼。原3品牌market-playbooks候选仅补充公开行业样本，不冒充SEO既有竞品库。

当前状态：沟通完成，源端实现准备中；CRM未接通，未部署。不得声称已能实时掌握网站情况。


## 可审阅生产范围（待确认，不执行）

目标源端为候选 https://seo-api.wonlyglobal.com/seo-summary/v1/current（history保留源端能力，CRM第一版仅current）。接收方为Supabase项目plhverjihjilnuhlhlxi的agent-conversation服务端函数；独立HMAC客户端crm-grace-prod，只读SEO摘要，时间戳+nonce防重放，不赋CMS/Google/CRM写权限。Secrets仅存源端服务与Supabase；浏览器不持有服务凭据。模型接收方为阿里云百炼北京地域。

白名单输出为网站7/28天GA4/GSC汇总、自然/全渠道漏斗、国家汇总、公开页面路径与问题代码、非机密实验描述/基线/状态/观察日期、固定竞品域名、数据日期和缺口。剔除客户/访客身份、查询词、URL参数、联系方式、令牌和额外字段。请求8秒超时，256KiB上限，固定HTTPS目标且拒绝跳转。未配置、错误鉴权、读取失败和过期快照有明确状态；SEO供应方数据仍有延迟。

本地445项回归及浏览器语法通过；HMAC以源端canonical格式与Node crypto独立对账，验证缺失与零值、字段投影、SSRF目的地拒绝及异常状态。生产源端/Secrets/函数/页面均未变更。自动审批拒绝了跨任务部署和凭据交接消息，要求用户明确生产地址、字段、接收方与范围；完成候选后再提交该具体范围确认。
