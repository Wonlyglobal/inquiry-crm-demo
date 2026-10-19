# Grace material followups

Material retrieval gets its own per-persona, in-memory context containing the last resolved user query only. No material response/excerpt is added to external model history. The gateway validates a bounded materialHistory field and resolves internal followups separately; requestBody never serializes that field. Switching topics clears it; clearing the conversation removes it. There is no new persistent memory or database permission.

Model/property followups preserve a single explicit model. Multiple/no candidate models prompt clarification rather than guessing. Next page preserves search terms, and expand shows detailed evidence. Default answers show three sources with page/version evidence; coverage and empty-result requests have dedicated short answers. Video excerpt timestamps remain available.

Difference alerts are tentative: only current-version documents, a single explicit model declaration on a page, differing exact field quotations found in the returned page text, and distinct source IDs. They do not establish factual contradiction, compare all records, or resolve certification/conditions automatically. Returned evidence is bounded; lack of an alert does not mean consistency.

Validation uses synthetic model names and excerpts. No company document text is checked into the repository. Rollback the gateway and frontend together; no migration is involved.

## 2026-10-19 连续问答与输入归一

画册直答与物料检索均返回仅含用户检索问题的 `material_question`，前端按角色保留；不保存内部回答作为模型历史。型号变体保留 Pro/Max 等后缀，V9不当作型号；明确选择型号与省略型号的追问沿用当前检索上下文。新需求、无关回答和失败清除旧型号；无上下文的“它的安装/尺寸”要求澄清。V9明确主资料不回退旧画册。

型号拼写归一覆盖大小写/全角/分隔符、中文逐位数字和十百数字、常见X/S音译与英文数字。只规范型号片段，不合并相近型号或推断产品参数；选型的“解锁/识别”同义词只转换用户要求，否定/选配证据仍不满足条件。

明确通过“并说明/另外查询/分号”等连接的只读子问题最多3项，逐项运行原处理器和鉴权，逐项报告失败/缺口。超过上限要求缩小范围；记忆、纠错、审批和写入命令不分拆。声纹先验证原始完整转写，再归一和分拆；内部子请求仅在服务端进程内执行，每项重新验证同一账号，客户端不能设置嵌套标志。前一项的内部回答不进入后一项历史或外部模型，合并结果使用固定语音回执。原权限、签名、配额和资料门禁不变。

上线与实际验收以项目WORKLOG为准；本节不代表所有产品参数已人工核验。
