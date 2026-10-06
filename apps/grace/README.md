# Grace App 0.1 开发候选

同一套网页对话控制器、CRM 本地统计、服务端身份校验、模型、内部物料检索、记忆与资料审计；手机界面通过 `?app=grace` 启用。App 容器只加载 `https://crm.foreverdoodle.com/?app=grace`，不持有模型密钥，不新增 AI 后端，不扩大账号范围。

## 参考物料 App 的制作过程

已核对 2026-10-06 物料工程实际文件：`capacitor.config.ts`、`scripts/build-android.sh`、`scripts/build-ios-simulator.sh`、`docs/DEVICE_TEST_REPORT.md`、`docs/APP_STORE_REVIEW_RESPONSE_2026-09-04.md`。

- 沿用“线上 HTTPS 网页 + iPhone/安卓原生容器”，网页版能力更新随页面同步。
- 沿用现有 JDK 21、Android SDK 36、AGP 8.13.0、Gradle 8.14.3；构建目录放 `/private/tmp`，避免外置磁盘 AppleDouble 文件影响资源打包。
- 产物分为调试 APK、模拟器包、签名真机包；编译通过不等于真机或商店验收。
- 使用 16px 输入框、键盘态收起底栏，分别验证安全区、输入法和长内容。
- 物料工程使用 Capacitor 8；本候选使用系统 WKWebView / Android WebView 薄容器，尚未移植物料 App 的相册、文件保存、分享和传输中心插件。资料原生下载是发布前待完成项，不能宣称文件操作完全等价。
- 物料 App 的 9 月 4 日记录明确替代早期商店分发方案。Grace 暂未决定正式分发方式；不会照搬公开注册或开放内部内容，也不复用物料 App 的 Bundle ID、签名密钥、审核账号。

## 构建

从本目录运行：

```sh
bash scripts/build-android.sh
bash scripts/build-ios-simulator.sh
```

Android 构建脚本默认离线使用已安装依赖；其他电脑需先配置 JDK 21、SDK 36 和对应 Gradle 依赖。产物在 `outputs/`，不提交 Git。iOS 工程为 `ios/Grace.xcodeproj`，真机需配置合法开发团队和独立签名。模拟器 ZIP 不能安装到 iPhone。

本地 UI 验收：仓库根目录启动 HTTP 服务后访问 `/apps/grace/preview/`。页面明确使用合成回答，不获取生产账号或业务内容，调用的仍是共享 `mountConversation` 控制器。生产入口未发布之前，APK 打开的是现有线上 CRM，尚不能显示本候选手机 UI。

## 验收记录（2026-10-06）

- Android `assembleDebug` 成功，生成 `Grace-debug.apk`（调试签名）。
- iOS 模拟器 Debug 构建成功，含双眼球体图标，生成 `Grace-ios-simulator.zip`。
- 网页模块语法检查通过；715 项离线测试通过，包括 WAV 16kHz/60秒/大小限制与状态覆盖测试。
- 本地合成场景验证：文字提交、回答完成、取消、记录页切换；球体实际使用 `grace-breath` / `grace-blink` 动画；320/390/430 宽度无横向溢出。
- 未验证：两端真实登录/退出、实体手机录音/转写/播报/声纹、后台停止、资料预览/下载/分享、真实账号问答及权限拒绝。不能据此声称与网页版全部体验一致。
- 手机首版为点击开始/结束录音；Hello 唤醒依赖浏览器语音引擎，不能承诺两端支持。后台停止录音和播报，不提供离线客户数据库。

## 网页能力一致性验收表

| 能力 | 复用实现 | 真机状态 |
|---|---|---|
| 通用推理、多轮对话、公开检索 | agent-conversation + 既有服务端路由 | 待测 |
| 产品/物料知识、页码与来源 | 内部检索分支；内部正文不进入模型历史 | 待测 |
| 长期记忆、纠错和反馈 | 既有后端与 timeline | 待测 |
| CRM 统计和图表 | 现有 crmLiveAnswer / aiChart；本地数据不送模型 | 待测 |
| 语音提问、回答、打断 | 既有转写/TTS，增加 WAV 兼容 | 待测 |
| 资料文件 | 既有一次性签名 POST 与审计 | 原生下载未完成 |
| 非授权用户拒绝 | 既有精确身份门禁、服务端校验 | 待测 |

## 发布与回滚

当前仅本地开发候选，未推送、合并、部署、上传商店或安装到用户手机。发布需要项目负责人批准手机入口及对应前端文件；不涉及数据库、CORS 或后端部署。先发布网页候选到受控环境并通过真实账号验收，再做签名和分发。回滚此分支的前端改动及安装包即可；保留既有知识、审计和业务数据。
