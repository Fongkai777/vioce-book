# 已核实部署记录

[English](DEPLOYMENT.md) · [项目首页](../README.zh-CN.md)

线上已包含 [`a0d6f45`](https://github.com/Fongkai777/voice-book/commit/a0d6f45)：独立检索问题、明确回答语言和章节感知分节。已有书籍保留原段落，本次发布不会自动重新索引。

> **尚未部署：** v33 之后提交的语音分段并发修复（2026-10-20）。下次发布后请在此记录。

## 当前已核实版本

发布于 2026-10-19 16:36 UTC／**新加坡时间 2026-10-20 00:36**。线上入口：[Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site)。

| 项目 | 内容 |
| --- | --- |
| Sites 版本 | v33，生产发布成功 |
| 对应 GitHub 源码 | [`f2df8dd1b07fdebbc35c75b02330ef1f7a505ed9`](https://github.com/Fongkai777/voice-book/commit/f2df8dd1b07fdebbc35c75b02330ef1f7a505ed9) |
| GitHub 应用代码基线 | [`a0d6f45f9810edbe5128e782c5419a2c1fd1d95e`](https://github.com/Fongkai777/voice-book/commit/a0d6f45f9810edbe5128e782c5419a2c1fd1d95e) |
| Sites 源码提交 | `d8cd37c17ed0a57f7de08f3312896a1f7f70312d` |
| 两者相同的 Git 文件树哈希 | `533cbf8c4fe8b175ffe39982f42444026df23ef0` |
| 部署 ID | `appgdep_6ad646fb4c388191b8ac90cc480c76e7` |

GitHub 与 Sites 保留独立 Git 历史，提交号不能互换。上面两个来源提交的文件树哈希相同，覆盖全部跟踪文件。应用代码基线之后只修改 Markdown。本部署记录和 README 在发布成功后回填；这次后续记录提交不代表部署了不同的应用。GitHub push 本身不发布网站。

## 检查与证据边界

- 应用基线在新加坡时间 10 月 20 日本地通过 153 项离线测试、零警告 lint、类型检查、发布扫描和生产构建；发布时再次对对应源码构建和扫描，没有改动依赖、账号、密钥或迁移。
- v33 发布后，`/api/health` 返回 HTTP 200 且数据库就绪。发布期间未调用付费模型或测试麦克风；修复后的完整混合检索质量、真实设备打断仍需复测，离线测试不能证明这些结果。
- 早期文档发布 v32 在其自身基线上通过 150 项离线测试，并检查了 273 个本地 Markdown 链接和 9 个章节跳转。
- v32 发布后，`/api/health` 再次返回 HTTP 200 且数据库就绪。本次纯文档发布没有调用付费模型、创建账号、启用麦克风或重做完整浏览器验收。
- v31 发布后，`/api/health` 返回 200 且数据库就绪，登录页面正常渲染；一次不存在账号的登录探测返回 401 凭据错误，而非缺少 IP 头的 503。Worker 日志记录 `auth_client_ip_status: cloudflare`；未使用真实密码或创建账号。
- 这些观察只证明被测部署链路，不证明每种代理/设备、真实模型可用性或重新完成语音验收。远程结果以 [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) 为准；本地通过不能当作排队中的 CI 已通过。
- [公开图书验收](acceptance/README.zh-CN.md)、截图与演示记录于 v28（`05473c1`），保留历史版本标注。

之后发布应记录精确的 Sites 版本、来源 SHA、GitHub 修订和最终部署状态，核对源码内容后才能宣称对应。发布与回滚方法见[运维说明](OPERATIONS.zh-CN.md)。
