# Voicebook 中文项目说明

[English](README.md) · [在线体验](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site) · [用户手册](docs/USER-MANUAL.zh-CN.md)

[![CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml/badge.svg)](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml)

面向 Wiz AI Builder Intern 作业的语音读书助手：上传 PDF，用麦克风提问，获得带原文引用的回答并自动播放。重点是长文档检索、可核对的依据和连续对话，而不是简单给聊天模型附上 PDF。

已核实线上版本：**Sites v32**，与 GitHub 源码 [`cc28e27`](https://github.com/Fongkai777/voice-book/commit/cc28e2791303225393fb56fa7c845315e34fe5aa) 对应，发布于 2026-10-19。应用行为基线仍为 [`cd4187a`](https://github.com/Fongkai777/voice-book/commit/cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1)，之后仅更新文档。完整关系见[部署/提交记录](docs/DEPLOYMENT.zh-CN.md)。v28 验收截图是历史证据，不代表当前部署版本。

## 快速体验

1. 打开网站并注册普通账号；全站每天最多自助注册两个账号，按新加坡时间重置。名额用完可联系管理员开评审账号。
2. 上传 [12 章测试 PDF](output/pdf/alice-in-wonderland.pdf)，或者点击 **Try a sample** 快速体验。短篇示例不能代替作业要求的长书测试。
3. 点击 **Start voice conversation**。转写直接进入聊天栏并自动发送，回答自动朗读；支持追问、打断、停止、重试和查看引用。
4. 在 **Reading preferences** 调整语气、长度和自定义偏好；在 **Book management** 查看原文及段落。

验收证据见[中文报告](docs/acceptance/README.zh-CN.md)和 [70 秒截图演示](docs/acceptance/demo.mp4)。评审账号密码私下提供，不放进仓库。界面统一使用英文，模型仍可用中文回答。

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
