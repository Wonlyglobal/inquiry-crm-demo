# Grace 营销分析与背调能力训练（2026-09-28，候选未部署）

Grace 使用百炼 qwen-plus，不做模型微调。“训练”= 固定考题 + 自动评分 + 按失分改进方法/知识/规则，每轮对比分数。

## 考题
- `tests/evals/grace-eval-cases.json`：24 题（营销分析 12、国家市场背调 8、单公司背调 4），全部合成数据，可按已批准范围（非机密文字）发送北京百炼；禁止替换为真实 CRM 明细、客户名称或联系方式。
- 评分项：中文、纯文本、标明缺口、标明数据日期、区分假设、给验证指标、无基线写“待基线确认”、不编 ROI/市场份额/法规条款/公司注册信息、缺数据不写“零”、样本局限说明、公司背调给核验清单。规则为可审计正则，是底线检查，不替代人工评审。

## 运行（在有百炼密钥的本机，Codex 执行）
1. 基线（上线前的提示词）：`DASHSCOPE_API_KEY=… node scripts/grace-eval.mjs run --legacy`
2. 新版：`DASHSCOPE_API_KEY=… node scripts/grace-eval.mjs run`
3. 对比：`node scripts/grace-eval.mjs grade tests/evals/out/answers-<新>.json --baseline tests/evals/out/answers-legacy-<旧>.json`
密钥只放环境变量，不写文件；结果目录 tests/evals/out/ 已加入 .gitignore。

## 本轮改进（按考题设计）
- 国家市场背调：`background-research.mjs` 识别问题中的国家，生成 countryBriefs（背调索引该国类别分布，≥5 才披露；CRM 近30天该国线索，≥5 才披露；该国公开竞品证据；固定缺口清单），并要求按“结论—采购方结构—需求信号—竞争对标—准入认证（需核实）—缺口与下一步”输出。背调索引新增 country_categories。
- 单公司背调：不读取任何客户数据，只给核验清单（域名、登记、地址、主营、项目记录、社媒存续、付款与样品风险），禁止编造注册号/规模/营收，标注“基于用户提供信息，未独立核验”。把客户名称或联系人等真实客户数据发送给外部模型，需项目负责人另行批准（当前未开）。
- 营销分析：Grace 在营销问题上追加“渠道质量五问”（量/质/速/本/因），不可用整体成交率代替单渠道，无花费不算 ROI，无归因证据不写因果，实验要有观察期与停止条件。
- 含“背调/机会/打法/策略”的竞品问题不再走公开证据直答，改为完整背调分析。

## 验证
581 项离线回归（新增背调 4 项、考试 5 项）。模型实际得分尚未测：本会话无百炼密钥，待 Codex 按上面步骤跑基线与新版并记录分数。

## 2026-09-28 补充：接入背调系统客户（未部署）
- 问题含“背调/查一下/这家/采购商/买家/公司情况/靠谱”或带域名时，先在国家背调系统索引（2382 家，1537 家有官网域名与详细记录）中匹配：域名精确 > 完整名称 > 域名主体（≥5 字符）。命中后读取 api/company/<域名>.json，在本地生成答复，provider internal，model background-company-records，不发送外部模型。
- 只展示业务字段：国家城市、客户类型、产品方向、官网、规模线索、代理品牌、项目线索、进口信号、匹配理由、切入角度、风险、匹配度评分、调研状态与可信度、加入日期、https 来源。不展示 email、phone、decisionContact、keyContacts、keyContactMethods、contactSource，也不展示可能含人名的 nextAction。
- 每次命中写 audit_logs（operation background_company_lookup，只记匹配域名与数量）。未命中则回到“单公司背调核验清单”。
- 2026-09-28 用户确认：背调系统 api/company/*.json 公网打不开（联系人未公开暴露）。因此 CRM 函数同样读不到详细记录，当前只能展示公开索引字段（国家、城市、客户类型、匹配度、域名）。要显示产品方向、规模、风险等详细字段，需要背调系统提供受保护的业务字段接口（只返回白名单字段、签名校验，参照物料库一次性签名方案），待负责人决定。
- 验证：587 项离线回归（新增 6 项，含联系人字段不外露、无域名降级、严格域名路径）。

## 2026-09-28 补充：背调业务字段私有通道（未部署，负责人已同意方案）
- 背调系统是 GitHub Pages 静态站，无法在其上加受保护接口；改为“导出业务字段 → CRM 私有存储桶 → 服务端读取”。
- 导出：国家背调系统/scripts/export-crm-business.mjs（在 businesswonly 公开仓库之外），读取 crawler/leads.json，只保留业务字段，丢弃 email、phone、contactSource、decisionContact、keyContacts、keyContactMethods、contacts、nextAction，并把自由文本中的邮箱/电话替换为“[已移除联系方式]”；含邮箱形态文本即中止。输出 output/crm-export/background-business-v1.json（已加入该目录 .gitignore）。2026-09-28 试跑：2382 家，1537 家有域名，邮箱形态 0，替换 59 处。
- CRM：迁移 20260928120000_background_research_private_bucket.sql 建私有桶 background-research（不授予 anon/authenticated 任何策略）；agent-conversation 用 service role 读取，失败时回退公开索引。审计记录 source（private_export / public_index）。
- 同步频率：背调系统更新后重新导出并上传；文件带 generatedAt，回答显示数据日期。
- 回滚：删除桶内对象与桶；函数自动回退公开索引。

## 2026-09-28 补充：SEO 优化能力（未部署）
- 考试新增 8 道 SEO 题（共 32 题）；SEO 测试数据改为按源端 schema 构造、再经 seoSummary 校验的合成快照（含 P1 NOINDEX、低 CTR 商品页、到期标题实验、墨西哥无数据）。
- 新增 seo-opportunities.mjs：只基于 SEO 摘要确定性列机会——P1 技术问题 → 高展示低 CTR（28 天展示≥200 且 CTR 低于全站 28 天 CTR 六成）/ 已到观察期的实验 → 平均排名 4–15 且展示≥100 的内容补强；每条带页面、证据、指标、观察期；列出无数据市场。不编关键词搜索量、不承诺排名。
- Grace 的 SEO 问题附带 seoOpportunities 与“SEO 回答框架”（数据截止→需求面→机会清单→转化面→实验→关键词假设需 GSC 验证）。
- 新增评分项：数据截止日期、不承诺排名、引用具体页面、观察期、P1 优先、关键词须标待验证且不编搜索量。
- 验证：592 项离线回归（新增 4 项）。模型实测仍待 Codex 用 --legacy 与新版对比。

## 2026-09-28 补充：审核式纠错记忆（未部署；负责人批准，审核人 Chloe）
- 在对话中输入“纠正：<正确说法>；原说法：<可省略>；出处：<来源>”→ 记为待审核；“查看待审核纠错”“批准纠错 #编号”“驳回纠错 #编号 原因”“撤销纠错 #编号 原因”。只有批准后才生效。
- 数据库：agent_knowledge_corrections（anon/authenticated 无表权限），四个 security definer 函数只允许 Chloe 账号（与 agent-conversation 授权同一身份）；提交、批准、驳回、撤销都写 audit_logs；拒收含邮箱、电话、密钥的内容；待审核上限 50 条。
- 生效方式：agent-conversation 以 service role 读取已批准条目，按问题相关度选最多 5 条放入上下文，要求引用“已审核纠错 #编号”与出处；不覆盖实时数据源数值。纠错内容由 Chloe 主动输入，属已批准的“主动非机密文字”发送范围。
- 验收：tests/production-agent-corrections-rollback.sql（事务回滚）；599 项离线回归。

## 2026-09-28 补充：GSC 搜索词（负责人批准输出，源端待改）
- 负责人批准：SEO 源端向 CRM Grace 输出 GSC 搜索词 28 天汇总（查询词、展示、点击、CTR、平均排名，可含国家与落地页路径，最多 50 条），并随对话发送百炼北京。CRM 接收端已按此过滤（疑似网址/邮箱/凭据/长文本丢弃）。
- 源端代码不在本机（SEO 摘要服务由 seo 任务维护）；输出契约见交接单 F 节，由 Codex 在 Mac 上改源端。现有 scripts/seo-report.mjs 已按 dimensions ['query'] 取前 25 条，可复用。
