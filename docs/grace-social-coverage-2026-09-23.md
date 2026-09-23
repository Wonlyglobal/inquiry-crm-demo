# Grace 社媒内容覆盖与待接入项

2026-09-23；授权人：项目负责人（逐条内容/后台数据接入、让 Grace 最了解社媒）；执行：Codex。

本次变更：Grace 每次对话自动读取已批准的 WONLY 发布内容接口，多页上限100条，每条文案摘录最多1200字。附读取数/源端总数、截断标记、失败与不完整标记。仅入库范围，不是平台全量、后台定时采集或持久记忆。已有单页全文接口仍用于逐条核对。数据目的仍为百炼北京的市场分析；不增加私信、访客身份、草稿、员工或平台凭据字段，不更改源端、数据库、RLS或发布权限。

验证：461离线回归、浏览器模块语法、diff check通过。生产验证与版本见WORKLOG。回滚：回退本次agent-conversation函数及前端覆盖页脚，不删除业务数据和审计。主要剩余风险：5页非原子快照；数量变动/重复链接/分页失败只报告partial，仍不能保证并发修改时完全一致；最多100条和1200字摘录不能代表无限历史全文；增加只读请求与模型上下文成本；事实门禁并非完整真实性保证。

## 接入缺口（不能表述为已完成）

- 视频画面：现有posts只有封面/公开帖子链接；不能以封面代替视频。需取得已发布视频原文件或平台官方允许的媒体访问，再以北京地域视觉模型提取带时间戳证据。
- 字幕：发布文案不是转写。YouTube字幕/自有视频音轨需要对应授权或已发布原素材；TikTok当前Display API不提供通用转写。
- 留存/受众：YouTube现有API key公开视频统计不足以读取频道Analytics，需要频道OAuth的yt-analytics.readonly；TikTok当前user.info.basic/user.info.stats/video.list不是后台广告/受众授权；Meta需核验实际账号和Insights权限。
- 广告：2026-09-23用户明确五个平台暂未投放。当前按自然增长推进，不申请广告权限；此为用户陈述，未以广告后台验证。
- 每帖同步：当前登记指标无独立同步时间，仍标recorded_not_verified；账号同步日期不能替代。
- 竞品：只读公开数据与已获许可的数据，不能获取其私有后台。无法证实的打法为假设。

以上依赖真实平台权限及已发布媒体来源；不得用提示词、猜测或空表代替数据接入。

## SEO 独立核验

真实CRM Chloe会话服务端页脚已显示available，generated_at 2026-09-23T07:42:41.012Z，GA4截至2026-09-22、GSC截至2026-09-20。Secrets自动生效；未输出密钥、原始查询词或个人数据，未提交询盘。

## 五平台实际连接准备（2026-09-23）

用户指定TikTok、Instagram、Facebook、YouTube、LinkedIn，确认暂未广告投放。业务背景已作为独立带日期资料接入候选；不自动变成“后台已连接”。

源码核验：有sync-tiktok/sync-instagram/sync-facebook/sync-youtube；没有LinkedIn连接器。Settings的API集成仅占位，不能完成授权。YouTube发布模块虽引用OAuth配置，但配置是否存在及是否包含Analytics权限尚未核验，不能认定必须重新申请。社媒生产网页当前登录页；已请用户登录管理员账号，未读取员工凭据。

LinkedIn官方Community Management需要应用获得相应产品准入和组织授权；先核对已有应用，不创建重复应用或申请发布权限。参考：https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
YouTube报表范围需核对实际OAuth授权及账号归属；公开API key不足以证明后台权限。参考：https://developers.google.com/youtube/analytics/channel_reports

后续验收必须有：自有品牌/账号范围、实际请求返回、权限缺口、统计口径/时间窗/更新时间、匿名拒绝及Grace端到端来源。账号connected标签、密钥存在或离线测试均不能替代平台API证据。
