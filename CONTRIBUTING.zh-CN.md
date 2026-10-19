# 贡献指南

[English](CONTRIBUTING.md) · [中文项目首页](README.zh-CN.md)

1. 使用 Node.js 24 和 pnpm 11.25.0，通过 `pnpm install --frozen-lockfile` 安装。
2. 仅实际运行时复制 `.env.example`；离线检查不得依赖密钥、真实音频或付费模型。
3. 保持改动聚焦，保留用户现有文件、账号隔离、引用来源和已存索引格式。
4. 为修复补充回归测试并运行 `pnpm check`。涉及浏览器的改动，还要按[测试矩阵](docs/EVALUATION.zh-CN.md)实际操作，明确说明测过什么。
5. 审查说明应包含行为、测试、迁移影响、限制与回滚方案。不要附私人书籍导出、`.env.local`、数据库或未经脱敏的日志。

GitHub CI 在 push/PR 上按锁文件安装依赖，对生产及完整依赖树执行无告警例外的审计，扫描工作树和完整 Git 历史的私人文件/凭据模式，并运行零警告 lint、类型检查、离线测试及生产构建。`pnpm check` 包含 lint，但依赖审计需单独运行 `pnpm audit`。参见[lint 规则](docs/LINT.zh-CN.md)。CI 不负责网站部署；生产通过 Sites 单独发布，GitHub 来源对应关系写入[部署记录](docs/DEPLOYMENT.zh-CN.md)。必需审核和分支保护由仓库所有者启用。

调整依赖范围时同步审查 `pnpm-lock.yaml`。CI 不调用模型生成 fixture。`app/book-qa`、`app/voice-qa` 等合成测试路由仅临时用于本机，提交前必须移除，发布检查会拒绝它们。

付费集成验证需明确授权、一次性本地数据库、合成输入及已知支出上限。`scripts/check-reader-feedback.mjs` 的可选真实模型模式不属于 CI；禁止把会修改数据的验收脚本指向生产。

修改用户可见能力时，同时检查英文文档和对应 `.zh-CN.md` 文件，尤其是额度、数据保存、隐私、价格、部署步骤和已测结果。不得把未来目标翻译为已经实现的能力。
