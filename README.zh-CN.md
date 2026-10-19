# Voicebook 中文项目说明

[English](README.md) · [在线体验](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site) · [用户手册](docs/USER-MANUAL.zh-CN.md)

[![CI](https://github.com/Fongkai777/vioce-book/actions/workflows/ci.yml/badge.svg)](https://github.com/Fongkai777/vioce-book/actions/workflows/ci.yml)

Voicebook 是面向 Wiz AI Builder Intern 课后作业开发的语音读书助手。用户选择一本书或上传 PDF，用麦克风提问，网站检索相关原文，生成带引用的回答并自动朗读。核心目标是让“读长文档、追问、核对依据”成为连贯的对话体验，而不只是给聊天模型附上一个 PDF。

当前是具备登录、额度、费用保护和发布检查的**受控演示**，不是无限制多租户生产服务的就绪认证。网站运行于 Vinext/Vite 和 Cloudflare Workers + D1，采用 Next 风格路由，不是 GitHub Pages 静态页面，也不是独立 Node 服务。GitHub 存放源码与检查工作流；推送代码不会自动部署网站。

## 面试官快速体验

完整验收可直接使用 [12 章测试 PDF](output/pdf/alice-in-wonderland.pdf)，按[中英验收报告](docs/acceptance/README.zh-CN.md)从上传开始复现；另有 [70 秒截图演示](docs/acceptance/demo.mp4)。备用普通评审账号随提交私下提供，密码不入库。内置短篇示例仅供快速体验，不替代至少 10 章的测试书。

1. [打开网站](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site)，创建普通账号并登录；无需 ChatGPT 账号或自行配置 API key。
2. 点击 **Try a sample** 或 **Browse sample books**，选择预先建立索引的示例书，无需等待 PDF 处理。
3. 点击 **Start voice conversation** 并允许麦克风，说：“请用中文解释这本书的核心观点。”停顿后，转写进入聊天栏并自动发送。
4. 查看回答和数字引用，听取自动播放。继续追问可以使用前文，播放时开口可以打断。
5. **End voice** 后进入 **阅读偏好**，试试“简短”或“先比喻、后结论”；也可对回答评价、按建议重答。
6. 打开 **Book management**，查看原文、检索段落和就绪状态。

全站每天最多自助注册 2 个账号，按新加坡时间 00:00 重置。名额已满时，请联系管理员创建普通账号；不要使用管理员账号验收普通用户流程。普通账号默认每天 20 次提问、10 分钟语音输入，同时受全站预算约束。详见[用户手册与常见问题](docs/USER-MANUAL.zh-CN.md)。

## 主要功能

| 功能 | 当前实现 |
| --- | --- |
| PDF 与扫描件 | 浏览器提取文字和页码；缺少文字的页面渲染后调用 OCR。原 PDF 不存到应用服务器。 |
| 多本书与索引复用 | PDF、分段文字和向量存入 IndexedDB，按账号隔离；已处理书籍再次打开不重新分段或 embedding。 |
| 混合检索 | 按章节结构分段并保留少量重叠，结合语义向量与 BM25 关键词检索，经排名融合及去重选择证据。 |
| 可核对的回答 | 回答附数字引用，可查看完整段落、定位图书内容；未知页码明确显示，不让模型编造页码。 |
| 连续语音 | 音量图形、转写自动发送、自动朗读、打断、停止与重试；停止或失败不删除用户消息。 |
| 偏好与反馈 | 语气、长度、自定义表达要求；评价、按建议重答和显式记为偏好相互独立，不自动把评价变成长期偏好。 |
| 长对话 | 默认保存所有轮次；短对话使用全部前文，长对话使用摘要和相关旧消息，保留原始记录。 |
| 图书管理 | Overview 查看状态，Content 预览 PDF 或文字，Show passages 搜索分段，引用可跳回对应内容。 |
| 云端示例书 | 两本 AI 创作英文短读物，选择后生成账号本地副本；不会公开私人书库。 |
| 账号与额度 | 普通用户与管理员分权；管理员可创建账号、调整每日提问与语音额度、查看提交的反馈。 |
| 费用与运维 | 默认全站每天 US$5；请求前预留、已知模型 token 用量结算、并发保护、紧急暂停、健康与错误指标。 |
| 手动加密备份 | 服务端账号数据备份与本机单本书备份分别提供；没有自动或云端备份任务。 |

## 技术架构与取舍

首次处理书籍：PDF → 按页提取或 OCR → 结构化分段 → embedding → 本机书库。

每轮对话：麦克风 → 转写 → 查询向量 → 语义与关键词混合检索 → 带引用回答 → 语音合成与播放。

- 浏览器负责书籍存储、检索和播放，后端负责认证、模型请求、额度与控制面。私人书库不自动跨设备同步。
- 新 PDF 使用 `text-embedding-3-small`；旧 Counseling Copilot 索引复用 `text-embedding-v4`，提问时才生成查询向量。
- 使用 RRF 融合两类排名，避免直接比较尺度不同的相似度与关键词分数；以冗余惩罚减少重复证据。
- 引用元数据来自真实段落而不是模型生成。引用格式可校验，但证据是否真正支持结论仍需评估。
- 当前链路是转写 → RAG → TTS，不是原生 Realtime/WebRTC 语音到语音。网络延迟、噪声和误识别仍可能影响体验。

实现和数据流见[架构说明](docs/ARCHITECTURE.zh-CN.md)。

## 本地运行

建议使用 Node.js 24 和 pnpm 11.25.0。离线测试和构建不需要 API key；实际模型请求需要另行配置服务端凭据。

```bash
git clone https://github.com/Fongkai777/vioce-book.git
cd vioce-book
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env.local
# 在 .env.local 中配置 OPENAI_API_KEY 和独立的 ADMIN_PASSWORD
pnpm db:migrate:local
pnpm dev
```

打开终端输出的网址，通常为 5173 端口。麦克风要求 localhost 或 HTTPS。用配置的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 首次建立管理员账号，再创建普通测试账号。初始化密码只在账号不存在时生效，修改环境变量不会重置已有密码。

本地迁移只作用于模拟器。旧数据库若曾手动执行 SQL，先核对迁移记录，不要通过清空数据库解决迁移不一致。正式发布需要 Sites 流程，详见[部署与运维](docs/OPERATIONS.zh-CN.md)。

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

另外完成了隔离数据库的注册与偏好浏览器验收、真实模型的小样本问答，以及获准的扬声器到真实麦克风合成语音测试。它们不等于正式质量基准、真人打断验收、分布式压测或生产恢复演练。实际失败和限制见[测试与评估](docs/EVALUATION.zh-CN.md)，私人书籍片段和原始日志不公开。

当前仍需注意：没有常驻的键盘自由提问框；私人数据不自动跨设备同步；没有自动备份、定时监控告警、MFA 或自助密码找回；语音识别和引用语义仍可能出错。全面开放前应完成[生产准入检查](docs/OPERATIONS.zh-CN.md)。

全站默认每天 US$5 费用保护，已知官方模型使用 token 费率预留与结算，TTS 和未知服务保留明确标记的估算。这不是账单硬上限，也不覆盖共用同一 key 的其他应用；仍需供应商侧限额。依赖审计结果有时效性，不能作为永久安全保证。

## 中文文档导航

| 文档 | 阅读目的 |
| --- | --- |
| [用户手册](docs/USER-MANUAL.zh-CN.md) | 五分钟体验、按钮、偏好、反馈和常见问题。 |
| [架构与设计](docs/ARCHITECTURE.zh-CN.md) | 数据流、分段、混合检索和存储取舍。 |
| [测试与评估](docs/EVALUATION.zh-CN.md) | 已验证结果、失败记录、待验证目标。 |
| [AI 辅助开发流程](docs/AI_WORKFLOW.zh-CN.md) | AI 的参与方式与工程判断。 |
| [部署与运维](docs/OPERATIONS.zh-CN.md) | 发布、回滚、监控和生产准入。 |
| [API 与数据边界](docs/API.zh-CN.md) | 接口、鉴权、数据外发与错误。 |
| [备份与恢复](docs/BACKUP-RESTORE.zh-CN.md) | 手动加密备份及破坏性恢复注意事项。 |
| [费用计算](docs/PRICING.zh-CN.md) | token 计价、预留、结算与估算限制。 |
| [安全说明](SECURITY.zh-CN.md) | 已有保护、依赖修复和剩余风险。 |
| [贡献指南](CONTRIBUTING.zh-CN.md) | 修改、验证和提交要求。 |

## 参考项目

实现为本项目自行编写，按职责参考了以下设计思路，并非直接套用某个完整项目：

- [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf)：混合检索和引用交互。
- [docchat](https://github.com/AbuBaker91-hub/docchat)：按标题分段和检索评估。
- [LiveKit Agents examples](https://github.com/livekit/agents/tree/main/examples/voice_agents)：语音状态和适合朗读的输出。
- [RAGFlow](https://github.com/infiniflow/ragflow)：文档结构感知处理。
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)：入库状态与文档工作区。

交互也参考语音产品的轮次与打断原则，但当前并未实现原生 Realtime speech-to-speech 连接。第三方声明保留在 `build/` 与 `vendor/`；仓库可见不等于已授予项目级再分发许可。
