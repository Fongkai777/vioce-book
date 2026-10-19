# API 与数据边界

[English](API.md) · [中文项目首页](../README.zh-CN.md)

所有路径为同源接口，不提供通用 CORS API。私有接口从 HttpOnly `voicebook_session` Cookie 获取身份，不信任请求提交的 `userId`。修改请求在解析前拒绝外部 `Origin` 和 `Sec-Fetch-Site: cross-site`；无 Origin 的客户端仍须有效会话。localhost 以外应使用 TLS。

## 接口列表

| 路径 | 方法与权限 | 输入与行为 |
| --- | --- | --- |
| `/api/auth/login` | POST，公开且限流 | `username`、`password`，建立七天会话。 |
| `/api/auth/register` | GET，公开、no-store | 返回新加坡日期、`limit: 2`、`remaining`、`timeZone`；余量不是名额预占。 |
| `/api/auth/register` | POST，公开、IP 限流 | 用户名、密码及可选显示名；每天原子准入至多两个普通账号。201 后需登录，409 用户名不可用，429 已满或限流；忽略客户端角色、额度和身份。 |
| `/api/auth/logout` | POST | 撤销当前会话并清除 Cookie。 |
| `/api/quota` | GET，已登录 | 当前账号的每日用量、上限和角色。 |
| `/api/admin/users` | GET / POST / PATCH，管理员 | 列用户、创建普通账号、按 `userId` 设置 `questionLimit`（0–500）、`voiceMinutesLimit`（0–600）。 |
| `/api/preferences` | GET / PUT，已登录 | 规范化 `tone`、`length`、`guidance`、`rememberHistory`，归属当前账号。 |
| `/api/feedback` | POST，已登录 | `exchangeId`、`bookName`、`question`、`answer`、`rating`、`tags`、`comment`，该轮内容保存到 D1。 |
| `/api/admin/feedback` | GET，管理员 | 查看显式提交的反馈，不获取浏览器全部聊天。 |
| `/api/admin/operations` | GET / PATCH，管理员 | 查看指标和预算；设置 `dailyBudgetUsd`（0–100）、`maxConcurrent`（1–8）、`enabled`，变更有审计记录。 |
| `/api/admin/backup` | POST，管理员且重新验密 | `passphrase`（12–256 字符）、当前 `password`；返回版本化加密应用快照，不含 API key 或会话令牌。 |
| `/api/admin/backup` | PUT，管理员且重新验密 | `backup`、口令、当前密码、`confirmation: "RESTORE SERVER DATA"`；需暂停并排空 AI，事务替换数据并撤销会话。 |
| `/api/samples` | GET，已登录 | 返回允许的轻量目录，`?id=...` 获取单本预建索引示例；没有修改接口。 |
| `/api/embed` | POST，已登录 | `texts`（1–64）、`purpose`（`index` / `query`）、受支持模型；旧模型仅允许查询。 |
| `/api/ocr` | POST，已登录 | JPEG/PNG base64 data URL `image`（最多 8,000,000 字符）、`pageNumber`，返回文字。 |
| `/api/transcribe` | POST，已登录 | multipart 音频最大 6 MiB，总请求体不超过 6.5 MB；声明时长字段不被当作真实时长，服务端检查规范 PCM WAV 和实际 0–60 秒范围（不含 0）。 |
| `/api/answer` | POST，已登录 | `question` 最多 2,000 字符、检索 `contexts`、可选历史或修改要求，返回回答、引用和额度。 |
| `/api/history/summary` | POST，已登录 | 有大小限制的历史 `text`，消耗维护额度而非提问次数。 |
| `/api/speech` | POST，已登录 | 最多处理 `text` 前 5,000 字符，返回 `audio/mpeg`。 |
| `/api/health` | GET，公开 | 检查模型配置与 D1/表就绪状态，不调用付费模型；返回 no-store 200 或通用 503。 |

`POST /api/admin/operations` 另接受 `{action:"clear-legacy-estimate", date:"YYYY-MM-DD", expectedMicros:integer}`。已登录的同源管理员每天只能清理一次当天准确匹配的未明细化旧估算；保留 v2 费用并记录审计。重复或过期请求为 409，日期和金额无效为 400。它不改变供应商账单或个人提问、语音额度。

## 错误

错误为 JSON `{ "error": "public message" }`。未登录 401；无管理员权限或跨站 403；字段或 JSON 无效 400；部分超大请求 413；额度耗尽 429。上游失败映射为 502/503，不回显供应商响应体；未知异常返回通用 500。客户端不要依赖错误文案的精确措辞。

## 哪些内容会离开浏览器

- 私人原始 PDF 和已保存向量不上传至服务器存储；公开示例是随应用发布的特定允许内容，不是用户上传。
- 生成索引时，文字批次发送给配置的 embedding 服务；OCR 时，相关页面图片发送给 OCR 模型。
- 检测到的语音经认证后端发给转写服务；回答文字发送给语音合成服务。
- 问题、检索段落、偏好和完整或压缩的相关上下文发送给问答模型；摘要也会发送历史文字。
- 偏好和主动提交的反馈保存在 D1，没有自动同步完整私人书库或全部聊天的接口。

上传机密文件前，应审核模型服务配置和保留义务。“本机存储”不等于“模型服务不会处理内容”。共享电脑上掌握浏览器存储的人可能绕过应用账号筛选；敏感用户应使用独立系统或浏览器配置。
