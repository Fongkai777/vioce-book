# Voicebook 中文项目说明

[English](README.md) · [在线体验](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site) · [用户手册](docs/USER-MANUAL.zh-CN.md)

[![CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml/badge.svg)](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml)

面向 Wiz AI Builder Intern 作业的语音读书助手：上传 PDF，用麦克风提问，获得带原文引用的回答并自动播放。重点是长文档检索、可核对的依据和连续对话，而不是简单给聊天模型附上 PDF。

**线上版本：** Sites **v34**，新加坡时间 2026-10-20 发布，对应源码 [`b13356c`](https://github.com/Fongkai777/voice-book/commit/b13356cf4ab4490b75fb092d868c91b2162e6782)，已包含 [`5ee91b6`](https://github.com/Fongkai777/voice-book/commit/5ee91b676f28e54495bb07e2e4e2bbd26176aacf) 的语音逐段请求修复。健康检查及 [GitHub CI](https://github.com/Fongkai777/voice-book/actions/runs/39290175803) 通过。v33 线上重测已有记录；新的语音修复已通过离线回归，尚未重新做线上声学测试。详见[部署记录](docs/DEPLOYMENT.zh-CN.md)。

## 快速体验（约 10 分钟）

**开始前**

- **账号：** 打开网站，点击 **New to Voicebook? Create an account**，设置用户名和密码，注册后点击 **Sign in** 登录。不需要预先分配的评审账号、ChatGPT 登录或自己的 API key。全站每天限两个自助注册名额，以新加坡日期计算，注册页显示余量；满额后可在新加坡时间次日 00:00 再试，或联系项目作者创建普通账号。
- **浏览器：** 推荐桌面版 Chrome。部分应用内置或嵌入式浏览器会禁止麦克风，网站会提示 "Microphone access was denied"。
- **建议戴耳机。** 用外放时回答声音会盖过你的声音，在回答播放中开口可能无法打断。
- **等待时间：** 每轮语音约 15–20 秒，状态栏依次显示 *Turning speech into text → Finding the best passages → Composing a grounded answer → Preparing the spoken reply → Playing the answer*。
- **自由提问需要麦克风。** 页面没有文字输入框；没有麦克风时，可点击阅读页上显示的建议问题。

**步骤**

1. 登录后下载 [12 章测试 PDF](https://github.com/Fongkai777/voice-book/raw/main/output/pdf/alice-in-wonderland.pdf)，选择 **Upload a PDF**。约 10 秒处理完成：56 页、约 148 个片段。（**Try a sample** 是更短的快速体验，不能代替长书测试。）
2. 点击 **Start voice conversation**，Chrome 询问时允许使用麦克风。看到 **Listening — go ahead** 后提问并稍作停顿。识别文字会作为 **You** 消息自动发送，回答自动朗读。
3. 可以试这些问题，括号内是原文页码：
   - *"In chapter one, what did the label on the little bottle say, and why didn't Alice drink it right away?"*（p.4）
   - *"In the Queen's croquet game, what did they use as the balls and the mallets?"*（p.33）
   - 追问，例如 *"And what did Alice think about that?"*，应能根据上一轮理解 "that" 的指代。
   - *"What is the name of Alice's school teacher?"* 书中没有答案，应拒答而不是编造。
   - 也可以用中文提问，回答会使用中文。
4. 点击回答中的数字引用查看原文段落，再点 **View in book → View PDF page** 核对原书页面。
5. 可选：在 **Reading preferences** 调整回答方式（如 Brief）、评价回答，或在 **Book management** 浏览页面和段落。结束时点 **End voice** 关闭麦克风。

书籍、索引和对话保存在当前浏览器、当前账号下，刷新后仍在。更多说明：[用户手册](docs/USER-MANUAL.zh-CN.md) · [验收报告](docs/acceptance/README.zh-CN.md) · [验证日志（含已知失败）](docs/EVALUATION-LOG.zh-CN.md)。

## 本地运行

建议 Node.js 24、pnpm 11.25.0。离线测试和构建无需 API key；实际模型调用需要服务端凭据。

```bash
git clone https://github.com/Fongkai777/voice-book.git
cd voice-book
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env.local
# 在 .env.local 配置 OPENAI_API_KEY 和独立的 ADMIN_PASSWORD
pnpm db:migrate:local
pnpm dev
```

打开终端输出的网址。麦克风要求 localhost 或 HTTPS。初始化密码只在管理员账号不存在时生效；改环境变量不会重置已有密码。密钥不得进入公开文件或 NEXT_PUBLIC_* 变量。

首次部署前，把示例 `ADMIN_USERNAME=admin` 改为不公开的名字，并使用长随机密码。部署后修改该变量**不是重命名账号**，可能另外创建初始化管理员。详见[登录防护](SECURITY.zh-CN.md)与 [lint 规则说明](docs/LINT.zh-CN.md)。

```bash
pnpm check           # 发布边界、类型、lint、离线测试、生产构建
pnpm audit           # 完整依赖审计，无告警例外
```

GitHub 保存源码和 CI，推送不等于发布网站。运行时为 Sites、Vinext/Vite、Cloudflare Workers + D1，详见[运维说明](docs/OPERATIONS.zh-CN.md)。

## 架构与功能

```text
PDF → 浏览器文字提取 / 扫描页 OCR → 分段与向量 → 账号本地书库
                                                    ↓
麦克风 → 转写 → 查询向量 → BM25 + 语义检索 → 带引用回答 → 语音
                                                    ↓
                       后端认证、用户额度、全站预算、模型服务
```

- PDF、书籍索引和对话按账号保存在 IndexedDB；再次选书无需重新索引。
- 本地保存不代表完全离线：提取文字、扫描页、语音及相关上下文仍会按功能发送给模型服务。
- 偏好、主动反馈、账号和额度保存在 D1；管理员可调整额度、停用普通账号、重置普通用户密码，敏感操作需再次验证管理员密码。
- 默认全站每天 US$5，提供请求预留、用量结算、并发保护、紧急暂停、健康指标和手动加密备份。
- 图书处理、书库加载、聊天保存和语音播放已拆为独立模块，页面保留对话流程编排。

## 已知边界

当前是**受控演示**，不是全面生产安全认证。

- 服务端无法核实客户端提交的原文是否来自已索引书籍；引用依据不是服务端强制保证。
- 本机账号隔离不是加密，不能防止控制浏览器的人访问存储；私人书库不自动跨设备同步。
- 语音是转写 → RAG → TTS，不是原生实时语音到语音；噪声、回声和延迟仍可能影响打断。
- 密码保留兼容现有部署的 PBKDF2-SHA256 10 万次，低于所引用 OWASP 建议；没有 MFA 或自助找回密码。
- 费用估算不是供应商账单硬上限，应另设供应商限额；未启用自动备份或定时监控。

完整限制见[安全说明](SECURITY.zh-CN.md)、[评估记录](docs/EVALUATION.zh-CN.md)和[生产准入](docs/OPERATIONS.zh-CN.md)。

## 文档导航

- [功能、环境变量、语音流程与参考项目](docs/FEATURES.zh-CN.md)
- [架构设计](docs/ARCHITECTURE.zh-CN.md) · [API 与数据边界](docs/API.zh-CN.md)
- [用户手册](docs/USER-MANUAL.zh-CN.md) · [测试评估](docs/EVALUATION.zh-CN.md)
- [部署运维](docs/OPERATIONS.zh-CN.md) · [备份恢复](docs/BACKUP-RESTORE.zh-CN.md)
- [费用计算](docs/PRICING.zh-CN.md) · [安全](SECURITY.zh-CN.md)
- [贡献指南](CONTRIBUTING.zh-CN.md) · [AI 辅助开发](docs/AI_WORKFLOW.zh-CN.md)
- [静态检查规则](docs/LINT.zh-CN.md) · [更新日志](CHANGELOG.zh-CN.md) · [部署记录](docs/DEPLOYMENT.zh-CN.md)
