# 功能与实现细节

[Project overview / 项目介绍](../README.zh-CN.md)

### 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 必填 | 服务端模型凭据。 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | API 地址。 |
| `OPENAI_QA_MODEL` | `gpt-5-mini` | 基于原文的问答。 |
| `OPENAI_OCR_MODEL` | 与问答模型相同 | 扫描页 OCR。 |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | 语音转写。 |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | 语音合成。 |
| `OPENAI_TTS_VOICE` | `coral` | 合成音色。 |
| `ADMIN_USERNAME` | `admin` | 初始化管理员名。 |
| `ADMIN_PASSWORD` | 必填 | 初始化管理员密码，部署时作为服务端 secret。 |
| `COPILOT_EMBEDDING_API_KEY` | 可选 | 旧索引查询用的服务端凭据。 |
| `COPILOT_EMBEDDING_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 旧索引对应的 embedding 服务。 |

`.env.local` 被 Git 忽略。不要把密钥放入 `NEXT_PUBLIC_*`、`public/`、工作流或截图。密码以带随机盐的 PBKDF2 哈希保存，会话使用 HttpOnly Cookie。

### 常用命令

```bash
pnpm check             # 发布边界、类型、离线测试、生产构建
pnpm test              # 单元、UI 和 SQLite 路由测试，不调用付费模型
pnpm typecheck         # TypeScript 检查
pnpm check:release     # 私人文件和历史凭据模式检查
pnpm audit             # 完整依赖审计，无告警例外
pnpm build             # Worker 与客户端构建
pnpm dev               # 本地开发
pnpm db:migrate:local  # 仅本地 D1 迁移
```

使用 `pnpm db:generate` 生成迁移后，需要在运行本地 Worker 预览前应用迁移。Sites 部署会应用已提交的迁移。

## 语音交互与对话记忆

AudioWorklet 在本机测量输入音量，约 1.1 秒静音结束一段，保留 450 ms 开头缓冲；单段最长 58 秒，编码为 16 kHz 单声道 PCM WAV。服务端验证 WAV 格式和实际时长，再计入额度。

正常转写直接进入原聊天消息并自动发送，不需要预览确认；转写失败、达到上限等异常则保留文字，在原消息中提供编辑、发送或保持未发送。每条消息有稳定 ID，重试、停止、刷新恢复不会复制或悄悄删除问题，刷新也不会自动重新发起付费请求。

输入活动与回答生成独立管理。检测到声音先暂停输出，确认有文字才打断旧回复；空识别尝试从原音频位置继续，不另发 TTS 请求。麦克风只在用户开启语音后使用；静音禁用输入轨道，结束语音、切到后台、退出或 90 秒无新输入会停止采集。建议用耳机减轻回声；合成声音测试不等于真人和所有设备都验证通过。

“在本机完整保存每本书的对话”默认开启。短对话带入全部前文；超出当前 240,000 UTF-8 字节的应用历史预算时，保留近期原文，对早期内容分块摘要，并检索相关原始消息。这不是模型 token 上限，也不保证完美回忆。摘要按书缓存，不替换原始聊天；摘要接口有独立维护额度，不扣提问次数。

关闭历史保存会清除当前账号本浏览器的已存历史，当前内存对话仍可继续。清空历史或删书也会删除相关摘要缓存。切换设备、清除网站数据或使用无痕模式不会自动恢复本机书库，请先手动备份。

## 图书管理与已有索引复用

书库列表只读轻量元数据，选书后才读文字和索引，预览时才读 PDF。Overview 展示页数、章节、段落、OCR 信息和就绪状态；Content 按页预览 PDF，也支持纯文字版本。Show passages 提供关键词、章节筛选和分页；View in book 可定位引用，包括后续列表页上的段落。只检查内容不会重新索引，也不会改变正在对话的书。

已有 Counseling Copilot 书库的维护导出命令：

```bash
python3 scripts/export-copilot-library.py "/path/to/Counseling Copilot" "/path/to/voicebook/local-library/copilot.voicebook.json"
```

导出器只读原 SQLite，复制已处理文字和向量，不读取凭据或调用模型。历史一次性导入 UI 已移除，不能从阅读页上传该包；导出与校验代码保留用于维护。旧索引为 1024 维，新 PDF 为 1536 维，查询必须使用匹配的模型。导入包没有原始 PDF，缺失页码不会猜测。

云端示例仅包含两本允许发布的 AI 创作短读物及其索引。`local-library/`、用户 PDF 和私人索引不进入发布包。选择示例只复制本地副本，不调用模型；`scripts/build-sample-index.mjs` 是需凭据的显式维护步骤，不会在部署或选书时自动执行。

## 验证结果与当前边界

2026 年 10 月 19 日的验证记录包含 125 项自动化测试、类型检查与构建。测试覆盖检索、存储迁移、权限、注册并发、额度、费用结算、备份恢复、稳定语音消息、空转写与暂停续播；测试数量以当前运行结果为准。

另外完成了隔离数据库的注册与偏好浏览器验收、真实模型的小样本问答，以及获准的扬声器到真实麦克风合成语音测试。它们不等于正式质量基准、真人打断验收、分布式压测或生产恢复演练。实际失败和限制见[测试与评估](EVALUATION.zh-CN.md)，私人书籍片段和原始日志不公开。

当前仍需注意：没有常驻的键盘自由提问框；私人数据不自动跨设备同步；没有自动备份、定时监控告警、MFA 或自助密码找回；语音识别和引用语义仍可能出错。全面开放前应完成[生产准入检查](OPERATIONS.zh-CN.md)。

全站默认每天 US$5 费用保护，已知官方模型使用 token 费率预留与结算，TTS 和未知服务保留明确标记的估算。这不是账单硬上限，也不覆盖共用同一 key 的其他应用；仍需供应商侧限额。依赖审计结果有时效性，不能作为永久安全保证。

## 中文文档导航

| 文档 | 阅读目的 |
| --- | --- |
| [用户手册](USER-MANUAL.zh-CN.md) | 五分钟体验、按钮、偏好、反馈和常见问题。 |
| [架构与设计](ARCHITECTURE.zh-CN.md) | 数据流、分段、混合检索和存储取舍。 |
| [测试与评估](EVALUATION.zh-CN.md) | 已验证结果、失败记录、待验证目标。 |
| [AI 辅助开发流程](AI_WORKFLOW.zh-CN.md) | AI 的参与方式与工程判断。 |
| [部署与运维](OPERATIONS.zh-CN.md) | 发布、回滚、监控和生产准入。 |
| [API 与数据边界](API.zh-CN.md) | 接口、鉴权、数据外发与错误。 |
| [备份与恢复](BACKUP-RESTORE.zh-CN.md) | 手动加密备份及破坏性恢复注意事项。 |
| [费用计算](PRICING.zh-CN.md) | token 计价、预留、结算与估算限制。 |
| [安全说明](../SECURITY.zh-CN.md) | 已有保护、依赖修复和剩余风险。 |
| [贡献指南](../CONTRIBUTING.zh-CN.md) | 修改、验证和提交要求。 |

## 参考项目

实现为本项目自行编写，按职责参考了以下设计思路，并非直接套用某个完整项目：

- [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf)：混合检索和引用交互。
- [docchat](https://github.com/AbuBaker91-hub/docchat)：按标题分段和检索评估。
- [LiveKit Agents examples](https://github.com/livekit/agents/tree/main/examples/voice_agents)：语音状态和适合朗读的输出。
- [RAGFlow](https://github.com/infiniflow/ragflow)：文档结构感知处理。
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)：入库状态与文档工作区。

交互也参考语音产品的轮次与打断原则，但当前并未实现原生 Realtime speech-to-speech 连接。第三方声明保留在 `build/` 与 `vendor/`；仓库可见不等于已授予项目级再分发许可。
