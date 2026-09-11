# WhatsApp Business 接入清单

CRM 只支持 WhatsApp Business Cloud API 或官方 BSP，不支持用个人 WhatsApp 的网页登录密码、二维码会话或 cookie 接入。

## 管理员配置

1. 在 Meta Business Manager 创建或选择 WhatsApp Business 账号，并完成企业验证。
2. 创建应用并启用 WhatsApp 产品，准备 `business_account_id`、`phone_number_id` 和企业号码。
3. 将以下值写入 Supabase Edge Function Secrets，不要写入前端或数据库：
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_APP_SECRET`
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. 将 Webhook URL 设置为：
   `https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/whatsapp-webhook`
5. 订阅 `messages` 事件，并在 CRM 中创建对应的 `whatsapp_connections` 记录，状态先设为 `pending`，验证成功后改为 `connected`。

## 验收标准

- Meta 的 GET 验证返回 challenge，错误 token 返回 403。
- 没有有效 `X-Hub-Signature-256` 的 POST 返回 401。
- 重复 webhook 不产生重复消息。
- 收到的消息进入 `whatsapp_messages`，随后按电话号码和询盘关联。
- 发送、送达、已读和失败状态可追踪；token 永不出现在浏览器、审计日志或消息正文中。

未完成上述配置前，CRM 不应显示“已连接”，也不应提供可点击的发送按钮。
