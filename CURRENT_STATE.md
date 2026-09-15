# 询盘 CRM 当前状态

更新时间：2026-09-15（Asia/Shanghai）

## 2026-09-15 每日计划写入权限闭环

- 日历中的每日计划不再允许登录用户直接新增、修改或删除底层表；创建计划与填写关键成果只能经过 `create_sales_daily_plan`、`save_sales_daily_plan_result` 两个受控事务函数，避免绕过角色、内容和日期校验或漏写审计。
- 两个函数都会重新核验当前账号仍为活跃的老板、主管或业务员；创建和完成动作继续生成 `daily_plan_created`、`daily_plan_completed` 审计证据，现有 CRM 日历操作路径不变。
- 生产迁移 `20260915234500_lock_daily_plans_to_workflow.sql` 已应用。事务回滚验收结果：`table=t; anon_execute=f; authenticated_execute=t; authenticated_insert=f; authenticated_update=f; rollback_plans=0`。完整自动化回归 199/199 通过。

## 2026-09-15 个人经营看板偏好安全持久化

- 经营看板的组件顺序、可折叠区块状态和核心指标页签已统一保存到独立的 `dashboard_preferences` 表，不再把业务偏好写入 Supabase Auth 用户元数据；更换浏览器或设备后仍按当前登录账号恢复。
- 浏览器只有本人只读权限，新增和更新必须通过 `save_dashboard_preferences` 原子函数；服务端校验账号启用状态、角色、组件白名单、重复项和页签值，并写入 `dashboard_preferences_updated` 审计。
- 旧版用户元数据与本机缓存只在首次加载时兼容迁移一次；保存请求串行化，避免快速拖动、折叠或切换页签时旧请求覆盖新状态。
- 生产迁移 `20260915233000_personal_dashboard_preferences.sql` 已应用。事务回滚验收结果：`table=t; function=t; anon_execute=f; authenticated_execute=t; authenticated_insert=f; authenticated_update=f`；无测试偏好遗留。完整自动化回归 197/197 通过。

## 2026-09-15 销售知识库生产权限验收

- 为现有销售知识库补充独立安全回归与生产事务回滚验收，覆盖表级 RLS、登录用户读取、授权角色新增、普通销售越权新增拦截和审计证据。
- 生产验收结果：`table=t; authenticated_select=t; authenticated_insert=t; anon_select=f; rollback_articles=0`；临时文章已完整回滚，没有改写真实知识库内容。

## 2026-09-15 邮件 AI 草稿持久化

- 邮件智能助手每次生成客户回复或翻译草稿后，必须先通过仅 `service_role` 可调用的 `record_email_ai_draft` 原子函数持久化草稿并写入审计，保存失败时不会向浏览器伪装成生成成功。
- 草稿完整保留作者、关联询盘、来源来信、生成类型、语言、主题、正文、中文生成说明及业务员补充要求；登录用户只能读取自己的草稿，没有直接新增或修改权限。
- 写信窗口新增“最近 AI 草稿”，可恢复当前账号最近 20 条生成结果继续编辑；恢复客户回复时会重新附上当前原始来信引用，不会丢失线程上下文。
- 迁移 `20260915230000_persist_mail_ai_drafts.sql` 已应用生产，`mailbox-ai-draft` Worker 已重新部署。生产回滚验收结果：`table=true`、`function=true`、`anon/authenticated_execute=false`、`service_execute=true`、`authenticated_insert=false`、`rollback_drafts=0`；未登录 Worker 探针返回 HTTP 403。完整自动化回归 189/189 通过。

## 2026-09-15 客户档案全渠道沟通历史

- 客户资料库的沟通记录从仅展示最近 20 封邮件，升级为完整分页加载并统一按时间排列全部邮件与 WhatsApp 消息；每条记录明确显示渠道、收发方向、联系人、主题或消息正文及 WhatsApp 投递状态。
- 查询仍通过询盘关联公司，并继续由邮件、WhatsApp 和询盘现有 RLS 按当前负责人或主管权限裁剪，客户档案不会扩大数据可见范围。
- 生产只读核验确认查询链路存在 66 个已关联客户公司、70 封关联邮件和 14 条关联 WhatsApp 消息（入站 11、出站 3）；未修改真实客户或沟通数据。
- 完整自动化回归 182/182 通过。

## 2026-09-15 分角色资格核验与主管定级

- “市场预审 / 销售确认 / 主管定级”不再依赖前端只读状态：新增 `save_inquiry_qualification` 原子 RPC，市场部只能维护企业身份、客户需求和业务匹配，业务员只能维护本人负责询盘的联系人角色、项目价值、采购时间和下一步，主管与老板可复核全部字段并确认优先级。
- 资格成熟度由服务端根据 7 项持久化证据重新计算；只有主管或老板在全部字段完整时保存，才会写入真实的 `qualification_manager_confirmed_at/by`。任何后续非主管修改都会清除旧确认，避免默认 `P2` 被误显示为主管已定级。
- 资格字段、成熟度、优先级和主管确认均禁止浏览器直接改表；每次授权保存都会生成 `qualification_updated` 审计记录。
- 生产迁移 `20260915220000_secure_qualification_workflow.sql` 已应用。事务回滚验收结果：`function=t; trigger=t; anon_execute=f; authenticated_execute=t; rollback_audits=0`；直接绕过被拦截，主管完整定级与审计写入成功后全部回滚。
- 完整自动化回归 182/182 通过。

## 2026-09-15 WhatsApp 客户回复提醒闭环

- WhatsApp Webhook 收到已匹配询盘的客户消息后，会为当前负责人生成持久化的 `whatsapp_reply_reminders` 待回复任务，并发送一次去重的“WhatsApp 客户新回复”站内通知；同一客户的新消息会更新任务，不会堆积重复待办。
- 当前负责人通过 Cloud API 回复同一号码后，对应待办自动关闭并保留回复消息与时间证据；询盘转交、关闭或失效时，未完成待办会同步转交或失效，避免遗留给旧负责人。
- 超过 24 小时仍未回复的 WhatsApp 客户消息由每小时后台任务生成一次逾期提醒，不依赖用户打开 CRM。
- “今日工作台 → 客户新回复”现在统一展示邮件与 WhatsApp 的持久化待办；报价回复判断也同时读取两种渠道的真实入站消息。
- 生产迁移 `20260915213000_whatsapp_reply_reminders.sql` 已应用。事务回滚验收结果：`table=t; trigger=t; anon_select=f; authenticated_select=t; rollback_messages=0; rollback_reminders=0`；未发送真实 WhatsApp 消息，也未留下测试消息或提醒。
- 完整自动化回归 179/179 通过。

## 2026-09-15 销售订单原子创建

- 销售订单不再由浏览器直接写表；新增 `create_sales_order` 事务 RPC，在同一锁定流程中校验登录人角色、当前负责人、主管已审批成交、币种、金额与交付时间。
- 订单与“创建销售订单”首条订单事件保证同时成功或同时失败；普通登录用户的 `sales_orders` 直接 `insert` 权限已撤销，仍只能通过受控 RPC 创建。
- 生产迁移 `20260915210000_atomic_sales_order_creation.sql` 已应用。事务回滚验收结果：`function=t; anon_execute=f; authenticated_execute=t; authenticated_insert=f; rollback_orders=0; rollback_events=0`；未改写真实订单或事件。
- 完整自动化回归 175/175 通过。

## 2026-09-15 WhatsApp 主动触达与首次响应证据

- WhatsApp Cloud API 主动发送现在会在调用 Meta 前执行询盘触达规则；已退订、禁止联系、频控期内或缺失合法联系依据时会服务端拦截，不会向客户发消息。
- 成功提交 Meta 的消息保存真实发送人 `sent_by`，并通过仅 `service_role` 可执行的 `record_sent_whatsapp_followup` 写入去重的 WhatsApp 跟进证据；只有当前负责人在分配后发出的真实 Cloud API 消息才能记录首次有效联系。
- 发送后跟进证据或触达状态回写失败会在 CRM 明确显示警告，避免用户因误以为“未发送”而重复联系客户。
- 迁移 `20260915203000_record_whatsapp_contact_evidence.sql` 已应用生产；事务回滚验收结果为 `function=t; anon_execute=f; authenticated_execute=f; service_execute=t; rollback_messages=0; rollback_followups=0`，幂等调用只生成一条跟进且没有留下测试数据。
- `whatsapp-send` 已部署生产，无凭据空请求返回 `401 / 未登录`。完整自动化回归 174/174 通过；验收全程未向真实客户发送 WhatsApp 消息。

## 2026-09-15 真实已发送邮件联动首次响应

- 邮件同步不再直接改写 `first_valid_contact_at`；新增仅 `service_role` 可调用的 `record_synced_email_followup`，在同一事务内锁定询盘、写入邮件跟进证据、确认首次有效联系并生成审计日志。
- 只有已匹配询盘、负责人本人邮箱、分配后发出且询盘已确认有效的真实已发送箱邮件才会关闭首次响应超时；同一邮件重复同步不会重复记录。
- 迁移 `20260915200000_record_synced_email_contact_evidence.sql` 已应用生产。生产事务回滚验收结果：`function=t; anon_execute=f; authenticated_execute=f; service_execute=t; rollback_messages=0; rollback_followups=0`，未改动真实邮件、询盘或跟进数据。
- 邮件 worker 已改为调用该事务函数并在生产重建，启动后已完整同步 8 个企业邮箱且无错误日志；回滚文件保存在 `/home/linux/wonly-mail-sync/deploy-audit/20260915-a4684a7-email-first-response/`。完整自动化回归 173/173 通过，本次未向真实客户发送邮件。

## 2026-09-15 结构化售后工单闭环

- 履约跟踪新增独立 `after_sales_cases` 售后工单：按质量、物流、数量、付款和其他问题分类，完整保存问题描述、处理状态、解决方案、创建/更新人员及各阶段时间。
- 已交付订单可登记一张或多张售后工单；工单按“待处理 → 处理中 → 已解决 → 已结案”推进。存在未解决工单时禁止完成订单，最后一张未解决工单解决后自动把订单设为“已完成 / 售后已解决”。
- 销售仅可处理本人当前负责客户，主管和老板可处理全局；登录用户只能读取授权范围内工单并调用受控 RPC，不能直接插入或改写售后表。每次登记和推进同时写入不可由浏览器伪造的订单事件。
- 生产迁移 `20260915190000_structured_after_sales_cases.sql` 已执行。生产事务回滚验收通过：临时订单完成交付、登记工单、验证未解决时绕过失败、处理、解决和结案，共形成 9 条事件后全部回滚。
- 生产权限证据：`table=t; index=t; case_guard=t; order_guard=t; anon_create=f; auth_create=t; anon_update=f; auth_update=t; auth_select=t; auth_insert=f; auth_update_table=f; rollback_cases=0; rollback_orders=0`。完整自动化回归 167/167 通过，未改写真实客户、订单或售后数据。

## 2026-09-15 首次有效联系证据防伪

- `first_valid_contact_at` 现在是不可直接改写的 KPI 事实：只能由 `record_inquiry_followup_v2` 在同一事务先创建“首次有效联系”跟进证据后写入，写入时间必须不早于分配时间，并与证据创建时间匹配。
- 首次联系时间一旦写入便不能清空或改成其他时间；私有触发器不授予浏览器角色执行权限，避免伪造 30 分钟首次响应率。
- 生产事务回滚验收已证明：直接更新被拒绝、授权跟进流程成功、二次清空被拒绝；结果为 `trigger=t; function_private=t; rollback_followups=0; eligible_unchanged=2`，没有改变两条真实询盘。
- 迁移为 `20260915193000_protect_first_valid_contact_evidence.sql`，完整自动化回归 170/170 通过。

## 2026-09-15 个人看板折叠状态持久化

- 经营看板的拖动顺序原已按登录账号保存到 Supabase Auth 用户元数据；本次将“经营趋势”、“无效与丢单原因分析”、“2026 海外事业部目标”和“最新询盘”的收起/展开状态也保存到当前账号。
- 用户更换浏览器或设备后会读取云端状态；云端保存失败时仍保留本机缓存，不影响当前操作。状态由 Supabase Auth 限制为登录用户本人，不会改写其他成员的看板。
- 定时邮件生产队列另行只读核验：到期待发 0、发送中 0、超过 10 分钟卡死 0、失败 0、历史成功 1，当前无重复发送或人工核验待办。

## 2026-09-15 履约进展原子保存收紧

- 删除订单进展表单中遗留的“先改订单、再写进展日志”非事务死代码，只保留 `update_sales_order_progress` 服务端事务 RPC。
- 回归测试已收紧为订单进展只允许绑定一个事务处理器，防止以后重构时重新出现“状态成功、日志失败”的半成功状态。
- 生产权限只读核验：匿名角色可执行的 `public` 高权限函数为 0；所有 `public` 业务表均启用 RLS，且匿名角色没有表级增删改查权限。
- 售后关闭约束已通过迁移 `20260915143000_harden_after_sales_resolution.sql` 部署生产：售后中订单必须明确标记“已解决”才能完成，未进入售后的订单不能伪造“售后已解决”。
- 生产回滚验证通过：未解决关闭被拦截，已解决关闭成功，最终测试订单 0 条；证据为 `trigger=t; function_private=t; rollback_rows=0`。全量自动化测试 141 项全部通过。

## 2026-09-15 定时邮件执行时安全校验

- 定时邮件不再只依赖预约时的权限：worker 在真正发送前会重新核对发送账号仍启用、发送人仍负责该询盘（主管/老板除外），并依据最新邮件方向判断本次是客户回复还是主动跟进。
- 主动跟进会在执行时重新调用触达规则；退订、禁止联系、频控未到期或联系依据缺失会直接永久拦截，不会继续重试。网络或邮箱临时故障仍最多重试 3 次。
- 主动定时邮件成功后会推进 `last_contact_at` 与 `next_allowed_at`；成功及最终失败均写入审计日志。
- 代码提交为 `e257be8`，112 项自动化测试全部通过；生产邮件同步容器已重建并恢复 `healthy`，容器内已核验新版安全标记。
- 生产旧版与新版 worker 分别保存在 `/home/linux/wonly-mail-sync/deploy-audit/20260915-e257be8-scheduled-mail-safety/`。本次部署未发送测试邮件或主动改写真实客户数据。
- worker 中断后超过 10 分钟仍处于 `sending` 的任务现在会转为“发送结果待人工确认”，不会自动重发而造成客户收到重复邮件；对应审计动作是 `mailbox_scheduled_message_delivery_uncertain`。
- CRM“定时发送”列表会直接展示失败原因。提交 `ebec5ca` 已发布，GitHub Pages 构建 `34913772198` 成功；生产容器为 `healthy`，回滚文件位于 `/home/linux/wonly-mail-sync/deploy-audit/20260915-ebec5ca-interrupted-delivery/`。
- 定时报价邮件现在持久化 `quotation_id`；预约和实际发送时都会确认报价仍处于主管批准状态，成功后自动将报价设为已发送并推进询盘的已报价阶段、金额、币种和报价时间。迁移 `20260915090000_scheduled_quotation_delivery.sql` 已通过生产 SQL Editor 执行并验证：列与两个 RPC 均存在，普通登录用户不能调用完成函数，`service_role` 可以调用。
- 前端与 worker 提交为 `b612e70`，115 项测试通过，GitHub Pages 构建 `34914101580` 成功；生产容器恢复 `healthy`，回滚文件位于 `/home/linux/wonly-mail-sync/deploy-audit/20260915-b612e70-scheduled-quotation/`。本次未创建报价或发送邮件。
- 立即发送报价不再把 SMTP Message-ID 字符串误传给 UUID 参数；报价 ID 由前端提交给 `mailbox-compose-send`，服务端重新校验询盘权限、报价批准状态和主动触达规则，发送后以空消息 UUID 推进报价状态，待 IMAP 同步后再绑定真实 `email_messages.id`。状态回写异常会返回“邮件已发送”的明确警告，避免重复发送。
- 修复提交 `e09e158`，117 项测试通过；`mailbox-compose-send` 生产版本 16 为 `ACTIVE`，GitHub Pages 构建 `34914635407` 成功，匿名空请求返回 401。本次未发送真实邮件。

## 线上环境

- CRM：`http://crm.foreverdoodle.com/`
- Supabase 项目：`plhverjihjilnuhlhlxi`
- 邮件同步服务：`linux@10.88.100.80`，容器 `wonly-mail-sync-mail-sync-1`
- 公共询盘邮箱：`inquiry@wonlyglobal.com`

## 最近完成

- 官网表单邮件解析已部署到邮件同步服务：从正文提取真实客户、公司、国家、产品、数量和渠道，不再把 Web3Forms 通知邮箱当成客户。
- 询盘时间改为邮件实际到达时间，不再使用延迟入库时间。
- 原 #000046 已确认为第 2 条真实业务询盘并改号为 #000002：Rafael Guerra / Mineracao Canaa / Brasil / Security Doors / 1–50 units / quote_modal，日期为 2026-08-31 23:22:06（中国时间）。
- 数据库触发器中的错误阶段值 `sampled` 已修正为 `sample_sent`。
- Instantly 养号邮件拦截已部署：公共询盘邮箱收到包含 `Chloe` 或 `50JPRYT` 的邮件时，只归档邮件，不创建询盘、任务、通知或看板数据。
- 已识别并隔离 48 条历史养号询盘，设为无效并排除统计；相关通知已清理，修改前后数据保存在审计日志。

## 尚需完成

- 使用市场部、主管、业务员和老板四个可安全用于测试的账号完成交互式回归；当前生产环境未发现专用测试账号，不应冒用员工真实身份。
- 使用一封新的测试官网表单邮件验证生产端到端流程。

## 2026-09-02 发布与验证

- GitHub Pages 源仓库已确认为 `Wonlyglobal/inquiry-crm-demo`，生产分支为 `main`。
- `index.html` 过滤已通过提交 `7b9890e6f5715429b74b4ce2a0b76453aa02a384` 发布，GitHub Pages 构建状态为 `built`，线上文件与发布提交 SHA-256 一致。
- 修正了经营看板先限制 100 条再过滤可能造成的漏计，并为自动每日线索汇总补充同样过滤。
- 48 条 Instantly 隔离记录均有完整 before/after/reason/time 审计，且关联通知为 0；数据库另有 1 条其他原因的排除记录，未纳入本次处理。
- 生产数据断言确认这 48 条在询盘管理、经营看板、销售日报和历史线索查询中的可见数均为 0。
- 市场部浏览器回归发现并修复了经营看板“市场待处理事项”仍从 `email_intake` 显示隔离邮件标题的遗漏；修复已通过提交 `aa72cf2a83346cc73fd183767bbf1724eba7cb99` 发布。
- 市场部页面发布后刷新保持登录，询盘列表为 5 条正常记录，询盘列表、经营看板和市场待办均不再出现 `50JPRYT` / `Chloe`；#000046 独立详情页、Tab、流水线和秒级时间正常，浏览器控制台无错误。
- 邮件同步服务修改前文件及部署说明已保存在服务器 `deploy-audit/20260902-144200-exclude-warmup/`，重建后容器为 `healthy`。
- 业务确认当前真实询盘仅 #000001 与 Mineracao Canaa；生产事务已将 Mineracao Canaa 从 #000046 校正为 #000002，并将原占用 #000002 的隔离养号记录改为 #000046。
- #000007 系统回环测试、#000050 和 #000051 重复/测试官网表单均已标记无效并排除，相关通知为 0；事务生成 5 条含 before/after/reason/time 的审计记录。
- 校正后数据库断言：`excluded_from_dashboard=false` 正好 2 条；`inquiry_no` 仍为 `GENERATED ALWAYS`，`inquiries_enforce_update_scope` 触发器已恢复启用。
- 国家/地区展示已统一为“中文 / English”（例如“巴西 / Brazil”“阿根廷 / Argentina”）；数据库原始国家值保持不变。
- 询盘详情流水线的全部阶段均有独立色块；历史数据缺失前置阶段时间时按当前阶段顺序显示“流程已通过”，不伪造进入时间，当前阶段仍使用加粗边框突出。
- 自动背调不再把 Gmail、Outlook 等公共邮箱域名当作公司官网；域名不可用时改按公司名称与国家做唯一匹配。#000002 Mineracao Canaa 已交叉确认企业邮件域名 `mineracaocanaa.com.br`，保存 4 条事实、1 条需求信号和 3 个来源；官网不可访问且 Gmail 联系人待核验，因此状态保持 `research_required`。
- “公司大事件”已改为有公开来源的公司关键时间线，并逐条判断与当前询盘“直接相关 / 可能相关 / 暂无关联 / 待判断”；系统失败提示和重复询盘信号不再计为事件。#000002 当前包含 2004-04-20 成立、2020-04-24 矿业许可及本次询盘锚点。

## 最近修改文件

- `mail-sync/src/index.mjs`
- `mail-sync/src/website-form.mjs`
- `mail-sync/scripts/repair-website-inquiry-000046.mjs`
- `mail-sync/scripts/quarantine-instantly-warmup.mjs`
- `supabase/migrations/20260902054044_fix_inquiry_sample_status_trigger.sql`
- `supabase/migrations/20260902070000_reclassify_non_business_inquiries.sql`
- `index.html`

## 2026-09-04 邮件分拣与人工转询盘

- 原“邮件待处理”统一更名为“邮件分拣”；市场任务入口与指标同步改为“进入邮件分拣”“待分拣邮件”。
- 公共询盘邮箱继续自动同步，服务轮询间隔保持约 60 秒；前端停留在邮件分拣页时每 60 秒自动刷新，用户正在勾选邮件时不会打断操作。
- 普通邮箱来信改为先写入 `email_intake`，不再自动创建询盘、公司背调或经营看板数据；官网表单属于客户明确提交，继续自动解析并生成询盘。
- 市场部或老板可单封或批量点击“一键转为询盘商机”；转换事务具备幂等处理，已有关联询盘的邮件不会重复创建，养号/已排除邮件禁止转换。
- 人工转换不再用邮箱后缀冒充已核实公司域名；新客户先建立“待核实邮件客户”占位公司且域名为空，后续通过客户背调核实真实公司与域名。
- 生产数据库修改前不存在 `convert_email_intakes_to_inquiries`；执行主体为 Codex（经用户明确要求），时间为 2026-09-04 09:54 CST，原因为“邮件人工分拣后再生成询盘商机”。迁移文件为 `supabase/migrations/20260904113000_email_intake_manual_conversion.sql`。
- 邮件同步服务修改前后文件、执行主体、时间和原因保存在服务器 `deploy-audit/20260904-095436-email-triage/`；容器重建后状态为 `healthy`。
- 前端发布提交为 `e60fe44`；内置浏览器已核验“邮件分拣”、自动接收说明、“一键转为询盘商机”和“标记养号邮件”均已显示。本次未使用真实邮件执行转换，避免误生成生产业务数据。

## 2026-09-04 按钮点击回归与确认框兼容

- 发现内置浏览器不提供原生 `window.confirm`、`window.alert` 和 `window.prompt`，导致“标记养号邮件”等按钮在确认步骤报错但界面无反馈。
- 已用 CRM 自身弹窗替换全部原生确认、说明和一次性密码展示；养号标记弹窗明确显示所选邮件数量，取消不会清空勾选或修改数据。
- 当前市场部账号已完成安全点击回归：9 个主导航、5 个统计周期、筛选应用、列表搜索/清除/状态筛选、刷新、邮件全选/取消、无选择校验、养号确认/取消、新建询盘弹窗、指标说明、成本弹窗、通知、AI 助手、市场快捷入口、公共/业务员邮箱连接、询盘详情打开/返回及 12 个详情页签。
- 写入、发信、成员禁用/恢复、客户释放、有效性改变等高风险按钮仅验证至必填校验或确认弹窗，未在真实生产数据上执行最终提交。回归期间浏览器控制台错误为 0。
- 前端兼容修复发布提交为 `382930d`；修改人为 Codex，时间为 2026-09-04，原因为“修复内置浏览器中所有依赖原生对话框的按钮无响应”。

## 2026-09-04 邮件分类清理

- 生产核对确认 `email_intake` 共 52 封；关联未排除真实询盘的邮件正好 2 封：#000001 Proforma Invoice Request 与 #000002 New WONLY Website Enquiry。
- 经用户明确要求，当前市场部登录账号将其余 50 封全部标记为养号邮件，并将上述 2 封确认分类为真实邮件；结果为真实邮件 2、养号邮件 50、待分拣 0。50 条养号修改和 2 条真实邮件确认均记录操作人、执行时间、修改前后分类及原因。
- “邮件分拣”新增分类 Tab：待分拣、真实邮件、养号邮件、全部，并展示实时数量；默认进入待分拣，切换后只显示对应分类。
- 前端发布提交为 `ad13623`；线上逐一点击验证结果为待分拣 0、真实邮件 2、养号邮件 50、全部 52，浏览器控制台错误为 0。

## 2026-09-04 邮件垃圾箱

- 邮件分拣支持当前分类全选后批量“移入垃圾箱”；垃圾箱分类支持批量恢复。老板角色额外显示“彻底删除”，且只能删除垃圾箱中未关联询盘的邮件。
- 批量选择“全部”时，数据库自动跳过关联未排除真实询盘的邮件，因此 #000001、#000002 的原始邮件不会被误删；其他符合条件的邮件正常进入垃圾箱。
- 移入、恢复和彻底删除均为数据库事务并写入操作人、时间、修改前后状态和原因；永久删除前仍保留不含正文的审计元数据。
- 生产数据库修改前无垃圾箱字段与事务；执行主体为 Codex（经用户明确要求），时间为 2026-09-04，迁移文件为 `supabase/migrations/20260904133000_email_intake_trash.sql`。前端提交为 `c445eba`，真实邮件保护规则提交为 `6a946b4`。
- 线上安全回归验证：养号分类全选 50 封会显示准确确认数量，取消后未修改数据；垃圾箱 0、恢复按钮仅在垃圾箱显示，市场部不显示彻底删除按钮，浏览器控制台错误为 0。

## 2026-09-03 界面与头像发布

- 前端按用户提供的现代 CRM 参考图完成一致性换肤：浅灰蓝背景、深色胶囊导航、玻璃感卡片、柔和分类色与更强个人主页层级；保留现有功能和角色权限。
- 每个登录成员可点击顶部头像上传本人 JPG、PNG 或 WebP，上限 3 MB；个人业务主页同步展示，其他成员的头像只读。
- 生产 Supabase 已新增 `profiles.avatar_url` 及公开头像存储桶 `profile-avatars`；上传和覆盖策略均限制为登录成员本人 UUID 目录。
- 数据库修改由 Codex 根据用户当次明确授权于 2026-09-03 通过 Supabase SQL Editor 执行；修改前为无 `avatar_url` 字段、无 `profile-avatars` 存储桶和相关策略，原因为“支持每个成员自主上传个人头像”。
- 前端发布提交为 `5df3e4b`；线上已核对新头像入口、文件控件、样式网格与脚本加载，未登录页面无控制台错误。
- 登录页参考同一 UI 风格改为品牌/业务预览与登录表单双栏布局，发布提交 `cf896de`。
- 市场待办背调队列已改为只从 `excluded_from_dashboard=false` 的可见询盘所关联公司生成，并将长标题、原因、时间和操作改为独立换行/分栏布局；发布提交 `69d148e`。生产数据断言为可见询盘 2 条、关联公司 2 家（Mineracao Canaa 和 Imprac），养号公司不再进入待办。

## 2026-09-03 MTL 第一阶段发布

- 按数字营销策略新增“资格核验”页签，采用公司身份、明确需求、联系人角色、价值/预算、时间窗口、业务匹配与明确下一步的 6+1 渐进式核验；所有补充项均可留空，不把资料补充设为一次性必填。
- 新增独立成熟度分数、P0–P3 线索优先级与 SLA 提示；价值评分仍保留在客户背调中，避免把“客户价值”和“当前成熟度”混成一个分数。
- 新增销售“接受为销售线索 / 退回市场培育”处理。只有已确认有效且已分配的询盘可处理，销售仅能处理本人询盘；两种操作都要求填写原因并写入操作人、时间及 before/after 审计。
- 生产数据库修改前不存在上述资格核验、优先级和销售处理字段；执行主体为 Codex（经用户明确授权），时间为 2026-09-03，原因为“将 MTL 核验、销售接收与回收闭环落入 CRM”。迁移文件为 `supabase/migrations/20260903093000_mtl_qualification_and_sales_disposition.sql`。
- 前端发布提交为 `015d66c`。线上源码已确认包含资格核验与销售处理函数，未登录页控制台无错误。
- 生产只读断言：可见询盘仍为 2 条、排除询盘共 52 条（其中包含既有 48 条 Instantly 养号记录及 4 条其他测试/无效记录）；两条可见询盘默认优先级均为 P2、销售处理状态均为 pending，未对真实询盘业务内容作自动改写。

## 2026-09-03 MTL 第二阶段发布

- 新增独立“市场培育池”，仅展示销售明确退回且未被排除的有效线索；展示优先级、成熟度、退回原因、建议复联时间和培育状态。
- 市场部、主管和老板可保存复联时间及培育动作；线索成熟后可重新提交待分配池。重新提交会清除当前负责人并重置为待分配，但完整保留原退回、培育与审计记录。
- 生产数据库修改前不存在培育状态、复联时间和培育动作字段；执行主体为 Codex（经用户“继续做下个功能”授权），时间为 2026-09-03，原因为“承接销售退回线索并形成市场培育闭环”。迁移文件为 `supabase/migrations/20260903103000_marketing_nurture_pool.sql`。
- 前端发布提交为 `c185f22`。线上源码已确认包含培育池导航、计划保存和重新提交函数。
- 生产只读断言：可见真实询盘仍为 2 条，当前培育池 0 条、执行中培育计划 0 条；本次发布未改写现有询盘业务数据。

## 2026-09-03 MTL 第三阶段发布

- 询盘详情新增“营销归因”页签，可保存多次可核验营销触点，并按 Program → Campaign → Tactic → Offer 组织；触点包含时间、渠道、落地页/证据、记录人及主触点标识。
- 每条询盘最多一个主触点，其他触点继续保留，用于后续首触点、主触点和多触点口径分析。销售可查看归因，市场部、主管和老板可新增。
- 已排除记录禁止写入营销触点，避免 48 条 Instantly 养号记录及其他测试/无效数据污染渠道统计。
- 生产数据库修改前无营销触点表；执行主体为 Codex（经用户“继续下个功能”授权），时间为 2026-09-03，原因为“建立可追溯的多触点营销归因”。迁移文件为 `supabase/migrations/20260903113000_marketing_touch_attribution.sql`。
- 前端发布提交为 `24c029c`。生产只读断言：营销触点 0 条、可见询盘仍为 2 条；系统未推测或自动补造历史渠道证据。

## 2026-09-03 MTL 第四阶段发布

- 经营看板“渠道表现与 ROI”升级为营销质量看板：在询盘量、有效率、成交额、成本和 ROI 基础上，新增主触点覆盖率、销售接受率、退回培育率与平均成熟度。
- 渠道优先使用有证据的主营销触点；未补充主触点时保留原主来源作为兼容口径，并明确展示缺少主触点的询盘数量。
- 前端发布提交为 `4c1c128`；本阶段未修改数据库结构和现有询盘内容，继续只读取 `excluded_from_dashboard=false` 的记录。

## 2026-09-03 MTL 第五阶段发布

- 询盘详情新增“触达规则”：记录联系依据、明确同意/退订、禁止联系、最短触达间隔、下次允许触达时间和规则说明。
- 开发信发送前强制调用数据库规则检查；未设置规则、联系依据未知、客户已退订/禁止联系或尚未到复联时间时均阻止发送。邮件成功发送或进入队列后自动推进下一次允许触达时间并留痕。
- 默认采用安全关闭策略，不会因为新增功能自动允许现有询盘发送。生产只读断言：触达规则 0 条、可见询盘 2 条，抽查现有询盘返回 `allowed=false` 且原因为“尚未设置触达同意与频控规则”。
- 生产数据库修改前无触达策略表和频控函数；执行主体为 Codex（经用户“继续做下一功能”授权），时间为 2026-09-03，原因为“防止重复骚扰及向退订联系人发送营销邮件”。迁移文件为 `supabase/migrations/20260903123000_contact_frequency_and_suppression.sql`，前端提交为 `b993d09`。

## 2026-09-04 官网询盘用户路径

- 新增隐私安全的官网询盘用户路径：CTA 点击、打开表单、开始填写、提交、生成询盘，并兼容表单错误、放弃填写和 WhatsApp/邮箱/电话等联系入口点击。
- CRM 询盘详情新增“用户路径”页签，展示步骤、时间、来源页面、CTA、所在板块、语言和产品上下文，并标识标准路径完整度及异常节点；旧询盘或非官网询盘保持“暂无路径”，不伪造历史行为。
- 路径数据不保存姓名、邮箱、电话或留言正文；最多接收 100 个事件，并限制为允许的事件类型。
- 生产数据库修改前不存在 inquiry_user_journey_events；执行主体为 Codex（经用户“继续做用户路径”授权），时间为 2026-09-04，原因为“让后续官网询盘可追溯客户如何进入并提交表单”。迁移文件为 supabase/migrations/20260904090000_inquiry_user_journey.sql。
- 邮件同步服务修改前文件、执行主体、时间和原因保存在服务器 deploy-audit/20260904-092553-user-journey/。

## 2026-09-03 弹窗关闭按钮修复

- 所有弹窗标题栏改为顶部吸附，关闭/返回按钮滚动时始终可见；正文继续在弹窗内部滚动，长内容不再需要回到顶部才能关闭。
- 修改前标题栏随正文滚动离开视口；修改人为 Codex，时间为 2026-09-03，原因为用户反馈“长弹窗关闭按钮不可见”。前端提交为 `f3951df`。

## 2026-09-07 邮件分拣详情

- 邮件分拣列表的整行及“查看详情”按钮均可打开完整邮件详情，不再依赖询盘 ID；尚未转成询盘的待分拣邮件也能查看。
- 详情展示发件人、收件人、主题、收件时间、当前分类/处理状态和完整纯文本正文。
- 未关联询盘的邮件可在读完正文后确认“转为询盘商机”“标记养号邮件”或“移入垃圾箱”；已关联邮件可直接打开询盘，垃圾箱邮件可恢复。
- 本次只做只读详情与界面逻辑验证，未对任何真实邮件执行分类、转换或删除。
- 修复详情内操作按钮点击后确认框被详情弹窗遮挡的问题：系统确认框提高到独立顶层，三个分类操作均能正常显示二次确认。
- 调整邮件分拣工具区间距：搜索区、批量操作和分类标签之间增加纵向留白，按钮横向间隔同步放宽；移动端采用紧凑但不拥挤的独立间距。
- 修复经营看板时间切换未作用于市场任务中心：新邮件、待分拣、有效性待确认、背调待完成、待主管分配、任务列表和询盘来源结构统一按当前选择的今日/本周/本月/本季度/本年度范围计算，新邮件指标标题同步显示当前周期。
- 市场任务中心从经营看板拆为左侧独立 Tab，仅市场部角色可见；其周期切换独立于经营看板，保留邮件分拣、邮箱连接、客户背调和待分配入口。经营看板移除市场专属区块并统一副标题。
- 经营看板支持每个账号独立调整模块顺序：点击“调整布局”后可直接拖动模块，或使用模块右上角上下箭头；顺序同时保存在当前浏览器和登录账号元数据中，可跨设备恢复，并提供“恢复默认”。顶部周期与筛选栏保持固定，避免影响筛选操作。
- 拖动入口采用独立“⠿ 拖动”手柄和 Pointer Events，兼容鼠标与触屏；原生整块拖放及上下箭头仍保留为辅助方式。
- 询盘详情横向页签新增“调整页签”：编辑模式下可横向拖动，顺序按账号同时保存在浏览器和账号元数据，支持跨设备恢复及一键恢复默认。
- 全站深绿色承载面的白色文字统一改为深橘色 `#e67817`，覆盖主按钮、侧栏/导航激活态、各类激活页签、绿色数据卡、头像、成功提示与 AI 深绿消息；红色告警和蓝色展示卡保留白字以维持语义。页签拖动改为鼠标/触屏统一的 Pointer 拖动，修复按钮原生拖放不触发的问题；修复提交为 `2a2e113`。
# 官网询盘实时接入与精确归因（2026-09-10）

- 新增服务端入口 `website-inquiry-intake`，官网后端通过共享密钥提交，禁止浏览器暴露密钥。
- 每次提交必须携带稳定的 `submission_id`；重复请求返回原询盘，不重复创建客户或商机。
- 接入保存 UTM source / medium / campaign / content / term、落地页、来源页、会话标识和隐私安全的访问事件。
- `website_intake_attempts` 持久记录成功、失败、重试次数、错误和端到端延迟；市场端“官网实时接入监控”可查看并重试失败记录。
- 官网直连接口返回 `503` 时，上游应按相同 `submission_id` 重试；原公共询盘邮箱解析仍作为降级兜底，并同步保存 UTM 归因。
- 2026-09-11：迁移已通过 Supabase Management API 应用到生产；`website-inquiry-intake` Edge Function 已部署；生产回滚验收 SQL 为 `tests/production-website-intake-rollback.sql`，已验证首次接入、Google Ads UTM 归因和重复提交幂等，事务最终回滚。
- 新增渠道已去除“飞书”，增加“SEO 自然搜索”；历史数据中的旧渠道值仍可只读展示。

## 2026-09-11 持续回归与界面清理

- 生产数据库和 `website-inquiry-intake` Edge Function 已验证：迁移对象存在，浏览器来源携带 CRM publishable key 时可通过 CORS/鉴权检查，缺少字段会返回明确的 400，而不是无响应。
- CRM 本地自动化回归保持 60/60 通过；官网实时接入事务回滚验收保持通过，未向生产写入测试客户。
- 修正询盘分配弹窗仍显示“飞书/钉钉”的过时文案，统一改为“已配置的群机器人”；新建询盘渠道说明同步加入 SEO 自然搜索，保留历史飞书值仅用于旧记录只读展示。
- 前端修复提交 `6623081` 已推送 `inquiry-crm-demo/main`，GitHub Pages 构建 `34552245608` 已成功部署。
- 官网表单直连 CRM 的代码已在本地完成类型检查并保存在提交 `6212b32`；官网远端主线与本地历史存在分叉，尚未未经审核推送主分支，避免覆盖官网现有未提交改动。
- `website-inquiry-intake` 已再次部署到 Supabase 生产（部署输出确认 `website-inquiry-intake`），现在同时兼容 `SUPABASE_PUBLISHABLE_KEY` 与旧版 `SUPABASE_ANON_KEY`；本地回归仍为 61/61 通过。
- 2026-09-11 页面可用性探针：`http://crm.foreverdoodle.com/` 返回 HTTP 200，`https://www.wonlyglobal.com/` 返回 HTTP 200，官网实际引用的 JS/CSS 资源均返回 HTTP 200；内置浏览器当时的安全检查未通过，不能据此判定线上页面宕机。
- 同日追加 HTTPS 诊断：权威 DNS 已正确返回 `crm.foreverdoodle.com CNAME wonlyglobal.github.io` 及 GitHub Pages 四个地址；HTTP 页面正常，但自定义域名 TLS 证书当前仅包含 `*.github.io`，不包含 `crm.foreverdoodle.com`。因此浏览器强制 HTTPS 或证书校验严格时会打不开；需要在 GitHub Pages 的 Custom domain 设置中重新校验并启用 HTTPS 后再复测。
- 生产 Edge Function 实测（官网 Origin + publishable key）：返回 HTTP 400 `submission_id is required`，说明浏览器鉴权已通过并进入业务校验；未提交有效客户字段，因此未产生生产数据。
- Supabase 安全顾问发现旧邮件分拣/维护 `SECURITY DEFINER` RPC 继承了 `PUBLIC` 的执行权限；已新增 `supabase/migrations/20260911021806_revoke_anon_email_triage_mutations.sql`。生产权限复核为五个业务函数 `anon_exec=false`、`auth_exec=true`，无应用调用的 `rls_auto_enable()` 为 `anon_exec=false`、`auth_exec=false`，未影响已登录业务员的操作。
- 进一步复核发现邮件、跟进总结、跟进记录和报价的旧读取策略只检查“询盘存在”，存在跨业务员读取风险；已新增 `supabase/migrations/20260911033612_tighten_sales_data_read_policies.sql` 并应用生产。现在这些记录统一按询盘负责人可见，主管/老板/市场角色可见未分配邮件；生产 `pg_policies` 已确认新策略生效。
- 同一 RLS 修复同时收紧 `outreach_drafts`：开发信草稿仅对创建人、询盘负责人及主管/老板/市场角色可读/新建，生产策略已核验，避免个性化开发信跨业务员泄露。
- 本次权限修复后完整回归测试为 63/63 通过；安全顾问未新增 RLS 告警，剩余项仅为预期的已登录 `SECURITY DEFINER` 业务 RPC 提示和 Supabase Auth 的泄露密码保护开关提示。

## 2026-09-15 报价邮件发送最终校验

- 即时报价邮件由 `mailbox-compose-send` 在服务端重新读取报价、询盘和客户邮箱，不再信任浏览器提交的报价状态或收件人。
- 报价必须处于主管已批准状态，且只能发送到该询盘最新登记的客户邮箱；修改收件人不能再把报价错误标记为已发送。
- 发送权限按当前询盘负责人或主管角色判断，不再错误要求业务员必须是报价记录的创建人，因此主管创建并批准的报价可由负责该询盘的业务员发送。
- 完整自动化回归为 117/117 通过；代码提交 `87c1198` 已推送 `main`。
- Supabase 生产函数 `mailbox-compose-send` 已部署为版本 17，状态 `ACTIVE`，`verify_jwt=true`。本次验证未向真实客户发送邮件。
- 经营看板次要模块支持点击整个标题栏收起；折叠后整条标题可点击展开，键盘 Enter/Space 同样可操作，标题内帮助按钮保持独立。生产页面已实际完成“无效与丢单原因分析”收起、展开双向回归。
- 撤销浏览器角色直接调用 `mark_quotation_sent(uuid,uuid)` 的权限，避免在没有完成真实 SMTP 投递时伪造“已发送”状态；权限迁移为 `20260915093000_restrict_quotation_sent_finalization.sql`，代码提交 `7074c62`。
- 生产数据库只读 ACL 核验：`anon_can_finalize=false`、`authenticated_can_finalize=false`、`service_can_finalize=true`；完整回归更新为 118/118 通过。
- 关闭旧版仅总额报价函数 `create_quotation_version(uuid,text,text,numeric,text,date,text)` 的浏览器执行权，并撤销登录用户对 `quotation_versions` 的直接新增、修改和删除权限，防止绕过明细校验、审批和投递状态机；受控的新版创建、提交审批和审核 RPC 保持可用。权限迁移为 `20260915094500_lock_quotation_writes_to_workflow.sql`，代码提交 `202c8e3`。
- 生产数据库 ACL 实测结果：`legacy=false`、`can_read=true`、`can_insert=false`、`can_update=false`、`can_create_v2=true`、`can_submit=true`、`can_review=true`；完整自动化回归更新为 119/119 通过。
- 继续收紧 4 个 `private` 高权限内部函数：询盘更新约束触发器、邮件回复提醒同步触发器、负责人同步触发器及超时提醒定时函数均禁止 `PUBLIC`、匿名和登录用户直接调用；后台定时提醒仅保留 `service_role` 执行权。迁移为 `20260915103000_restrict_private_maintenance_functions.sql`，代码提交 `afe701f`。
- 生产库复核：`private` schema 的 `SECURITY DEFINER` 函数匿名可执行数已从 4 降为 0；登录用户仅保留业务策略所需的 `can_read_fulfillment(uuid)`、`can_write_fulfillment(uuid)` 和 `current_crm_role()` 三个辅助函数。完整自动化回归更新为 120/120 通过。
- Supabase 官方安全顾问与自定义 ACL 查询交叉复核：`public` schema 匿名可执行的 `SECURITY DEFINER` 函数为 0，登录用户可写但未启用 RLS 的业务表为 0，具备表写权限且策略无条件放行的生产表为 0。
- 关闭已被 V2 取代的 `record_inquiry_followup(uuid,text,text,text,timestamptz,boolean)`，防止绕过跟进优先级、提醒时间和自动顺延元数据；当前页面继续只调用 `record_inquiry_followup_v2`。迁移为 `20260915104500_disable_legacy_followup_writer.sql`，提交 `743f316`；生产 ACL 实测 `legacy_followup=false`、`v2_followup=true`，完整回归更新为 121/121 通过。
- 恢复询盘详情中的“触达规则”操作页：可查看和维护客户同意依据、退订/禁联、最小联系间隔和下次允许触达时间，保存继续调用生产已有的 `save_inquiry_contact_policy` 审计 RPC。未配置、待核实、已退订和频控中状态都会明确提示；销售仅能维护自己负责的询盘。本次未修改任何真实客户授权数据，完整自动化回归更新为 122/122 通过。
- 修复跨渠道客户跟进助手：后端现在会分页读取当前询盘的全部邮件与 WhatsApp 收发记录，按时间统一分析，并用最新跨渠道消息作为自动生成去重键。前端同步分页加载 WhatsApp 历史，不再因最新消息来自 WhatsApp 而每次打开询盘都误判为总结过期。完整自动化回归更新为 123/123 通过。
- 完成数据质量提醒的生产回滚回归：使用现有 `[功能测试]` 询盘在事务内清空并补齐目标国家，实测 `missing_country` 会自动生成并自动解决，所有测试写入均已回滚；同时确认匿名与普通登录用户都不能执行私有全量刷新函数。可复用脚本为 `tests/production-data-quality-rollback.sql`，每日刷新任务保持启用，完整自动化回归更新为 124/124 通过。
- 加固成交/丢单审批完整性：任何角色都不能再通过直接更新询盘绕过申请与主管审批；成交金额、币种、锁定汇率和成交时间也只能由审批流程写入。成交申请现在必须基于已审批且已发送客户的报价，并处于已报价、已寄样或谈判阶段；主管批准时重新核对商机仍有效、未关闭、负责人未变化、报价仍完整和成交凭证仍存在。丢单批准同样会重新核对商机状态及当前负责人，旧负责人留下的过期申请不能覆盖新负责人数据；驳回旧申请仍可正常执行。
- 迁移 `20260915120000_harden_outcome_approval_integrity.sql` 已通过生产 SQL Editor 先事务编译回滚、再正式应用。生产回滚验收脚本 `tests/production-outcome-approval-rollback.sql` 实测直接进入成交和丢单均被拦截，所有测试写入已回滚；生产函数定义与 ACL 复核为 `direct_outcome_guard=true`、`sample_sent_current=true`、`sent_quote_required=true`、两类过期负责人保护均为 true、匿名不可提交成交申请、登录用户可按角色调用。完整自动化回归更新为 128/128 通过。
- 加固客户保留与公海流转：负责人、保留截止日期和进入公海时间只能由已审计的分配、释放、领取或保留审批流程修改，主管和老板也不能直接改表绕过审批。保留审批与公海审批统一采用“先锁询盘、再锁申请”的顺序，并在批准时重新核对商机有效性、当前负责人、公海状态、申请截止日期及申请人仍为在职业务员，避免并发死锁和旧申请覆盖新状态；驳回过期申请仍保持可用。
- 迁移 `20260915123000_harden_retention_public_pool_integrity.sql` 已通过生产 SQL Editor 事务编译回滚后正式应用。生产回滚验收脚本 `tests/production-retention-public-pool-rollback.sql` 实测直接修改保留期限和直接释放公海均被拦截，所有测试写入已回滚；生产证据为 `field_guard=true`、`trigger_live=true`、`inquiry_first_lock=true`、负责人变化/日期过期/停用业务员保护均为 true、匿名不可审核、登录用户可按角色调用。完整自动化回归更新为 131/131 通过。
- 客户保留期提醒不再依赖成员打开 CRM：新增每日北京时间 00:20 的后台任务，为当前负责人以及所有在职老板/销售主管生成即将到期或已经到期提醒；同一客户、接收人、提醒类型和业务日期只生成一次。页面登录时的即时补偿同步也统一改用 Asia/Shanghai 业务日期，并排除已关闭、已进入公海或不计入经营数据的询盘。
- 迁移 `20260915130000_automatic_retention_expiry_notifications.sql` 已在生产 SQL Editor 完成事务编译回滚及正式应用。生产回滚验收脚本 `tests/production-retention-expiry-rollback.sql` 实测负责人和所有在职主管各收到且仅收到一条提醒，全部测试写入已回滚；生产证据为 `cron_active=true`、批处理及即时同步均使用上海时区、批处理仅 `service_role` 可执行、匿名不可执行。完整自动化回归更新为 135/135 通过。
- 修复通知中心固定只读取最近 30 条的问题：现在分页读取当前账号可见的全部通知，因此较早的未读审批、客户回复、跟进和保留期提醒不会从角标及未读列表中消失。“全部标记已读”改为服务端按 `auth.uid()` 原子更新，不再把任意长度的通知 ID 列表交给浏览器。
- 迁移 `20260915133000_complete_notification_inbox.sql` 已在生产 SQL Editor 完成事务编译回滚及正式应用，并为未读通知建立接收人/时间索引。生产回滚验收脚本 `tests/production-notification-inbox-rollback.sql` 用两个不同成员验证仅当前登录人的通知被更新，全部测试写入已回滚；生产证据为 `index_live=true`、接收人和启用账号保护均生效、匿名不可执行、登录用户可执行。完整自动化回归更新为 139/139 通过。
- 收款与退款改为受控状态流程：待收款必须填写银行流水号后才能确认到账；到账后付款类型、金额、币种、到账时间和原始流水号不可改写。退款只允许老板/销售主管登记，单独保存退款时间、退款流水和原因；业务员仅能处理自己负责的询盘。浏览器对 `order_payments` 的直接修改权限已撤销，统一调用 `update_order_payment_status` 审计 RPC。
- 迁移 `20260915150000_secure_payment_status_workflow.sql` 已正式应用生产。回滚验收脚本 `tests/production-payment-workflow-rollback.sql` 实测到账、核心凭证不可改写及主管退款全部通过，所有测试写入已回滚；生产证据为 `columns=4`、`trigger=true`、`anon_exec=false`、`auth_exec=true`、`auth_update=false`、`rollback_payments=0`。完整自动化回归更新为 145/145 通过。
- 订单与回款一致性改为数据库强校验：回款币种必须与订单币种一致，同一订单的待收及已收回款合计不能超过订单总额，并通过锁定订单行防止并发重复登记；没有真实已到账定金时，订单不能标记为“已收定金”。
- 迁移 `20260915153000_enforce_payment_order_totals.sql` 已正式应用生产。回滚验收脚本 `tests/production-payment-order-integrity-rollback.sql` 实测币种不一致、超订单总额及无到账凭证的“已收定金”均被拦截，真实定金到账后可正常流转，所有测试写入已回滚。生产证据为两个保护触发器均启用、两个私有函数对匿名和登录用户均不可直接执行、`rollback_orders=0`、`rollback_payments=0`。完整自动化回归更新为 148/148 通过。
- 订单交付履约补齐承运商、运单号和发货时间；进入已发货及后续状态必须保留全部发货凭证，进入已交付、售后或完成状态必须保留实际交付时间。前端订单进展表单可录入并回显这些凭证，订单列表直接展示承运商与运单号。
- 订单直接 UPDATE 权限已从登录用户撤销，状态和履约凭证统一由服务端 `update_sales_order_progress` 在锁定订单后同时更新状态并写入进展事件；业务员仅可处理自己当前负责的询盘。迁移 `20260915160000_secure_order_delivery_evidence.sql` 已应用生产，回滚验收 `tests/production-order-delivery-evidence-rollback.sql` 通过；生产证据为 `columns=3`、`trigger=true`、旧 RPC 已移除、`anon_rpc=false`、`auth_rpc=true`、`auth_update=false`、`rollback_orders=0`、`rollback_events=0`。完整自动化回归更新为 152/152 通过。
- 样品履约改为受控原子流程：新增样品会自动写入首条历史；寄出、签收、收到反馈和关闭均由 `update_sample_shipment_progress` 在锁定样品记录后同时保存证据与进展事件。业务员仅可处理自己当前负责的询盘，匿名用户不可调用，登录用户不能再直接修改 `sample_shipments`。
- 样品进入签收及后续状态必须永久保留签收时间；进入已反馈必须同时保留客户反馈与反馈时间，关闭时不能清除既有反馈。履约窗口新增“样品进展历史”，并对样品、订单、回款和进展明细统一分页读取，避免超过 API 默认页大小后丢失旧记录。
- 迁移 `20260915170000_atomic_sample_progress.sql` 已正式应用生产。回滚验收 `tests/production-sample-progress-rollback.sql` 实测缺少发货凭证和缺少客户反馈都会被拒绝，合法五步时间线完整生成，随后全部回滚；生产证据为 `table=true`、`index=true`、两个触发器均启用、`anon_rpc=false`、`auth_rpc=true`、`auth_update=false`、`rollback_samples=0`、`rollback_events=0`。完整自动化回归更新为 156/156 通过。
- 关闭新建回款时直接选择“已到账”的绕过入口：浏览器只能先登记待回款，实际到账必须再通过受控确认流程填写到账时间、流水号和确认说明；数据库同时拒绝在新增待回款时预埋到账或退款凭证。迁移 `20260915173000_require_pending_payment_creation.sql` 已应用生产，回滚验收 `tests/production-payment-creation-rollback.sql` 通过；生产证据为新增状态和到账证据保护均启用、私有保护函数匿名/登录用户均不可直接执行、`rollback_orders=0`、`rollback_payments=0`。完整自动化回归更新为 159/159 通过。
- 销售订单现在必须关联已由主管审批的正式成交：未成交询盘不能建单，订单币种必须等于锁定的成交币种，同一成交下全部未取消订单合计不能超过审批成交额，并通过锁定询盘行避免并发超额。前端在未成交阶段不再显示建单表单，而是提示先完成成交审批。
- 迁移 `20260915180000_require_approved_win_for_orders.sql` 已应用生产。回滚验收 `tests/production-order-creation-rollback.sql` 实测未成交、币种错误和累计超额均被拦截，审批成交后的合法订单可创建，随后全部回滚；生产证据为资格/币种/金额保护均启用、私有函数匿名和登录用户均不可直接执行、`orders=0`、`rollback_orders=0`、`won_inquiries=0`。既有订单/回款/交付/售后回滚脚本同步补充成交前置夹具，保持可重复执行；完整自动化回归更新为 162/162 通过。
- 订单进展历史只能由原子订单状态流程生成：撤销登录用户对 `order_events` 的新增、修改和删除权限，保留负责人范围内的只读权限；后台服务仍可维护。迁移 `20260915183000_lock_order_events_to_workflow.sql` 已应用生产，回滚验收 `tests/production-order-event-integrity-rollback.sql` 实测受控状态更新会生成事件、浏览器身份直接伪造事件会被拒绝，随后全部回滚。生产 ACL 为 `auth_select=true`、`auth_insert/update/delete=false`、`service_insert=true`、`rollback_orders=0`、`rollback_events=0`；完整自动化回归更新为 164/164 通过。
- 邮箱已读状态改为服务端受控写入：登录用户不再拥有 `email_message_reads` 的直接新增或更新权限；打开来信统一调用 `mark_email_message_read`，后端按本人邮箱、本人负责询盘或主管/老板/市场的既有邮件可见范围重新鉴权，并仅在首次阅读时留审计记录。迁移 `20260915223000_secure_email_read_receipts.sql` 已应用生产，回滚验收 `tests/production-email-read-receipt-rollback.sql` 使用真实同步来信验证已读和审计均能生成且全部回滚；生产证据为 `function=true`、`anon_execute=false`、`authenticated_execute=true`、`authenticated_insert/update=false`、`rollback_audits=0`。完整自动化回归更新为 185/185 通过。
