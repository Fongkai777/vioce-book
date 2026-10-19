# 已核实部署记录

[English](DEPLOYMENT.md) · [项目首页](../README.zh-CN.md)

线上已包含 [`5ee91b6`](https://github.com/Fongkai777/voice-book/commit/5ee91b676f28e54495bb07e2e4e2bbd26176aacf) 的语音逐段请求及有界繁忙重试，并保留 [`a0d6f45`](https://github.com/Fongkai777/voice-book/commit/a0d6f45)：独立检索问题、明确回答语言和章节感知分节。已有书籍保留原段落，本次发布不会自动重新索引。

## 当前已核实版本

发布于 2026-10-19 17:00 UTC／**新加坡时间 2026-10-20 01:00**。线上入口：[Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site)。

| 项目 | 内容 |
| --- | --- |
| Sites 版本 | v34，生产发布成功 |
| 对应 GitHub 源码 | [`b13356cf4ab4490b75fb092d868c91b2162e6782`](https://github.com/Fongkai777/voice-book/commit/b13356cf4ab4490b75fb092d868c91b2162e6782) |
| GitHub 应用代码基线 | [`5ee91b676f28e54495bb07e2e4e2bbd26176aacf`](https://github.com/Fongkai777/voice-book/commit/5ee91b676f28e54495bb07e2e4e2bbd26176aacf) |
| Sites 源码提交 | `65a67c8a6f109bb9b913ea3e0588db6fc4ec3e5a` |
| 两者相同的 Git 文件树哈希 | `1c14a0bf253b7ae1668b4f313ca4723df08a11bd` |
| 部署 ID | `appgdep_6ad64c8359a48191a8a6f473d7d17468` |

GitHub 与 Sites 保留独立 Git 历史，提交号不能互换。上面两个来源提交的文件树哈希相同，覆盖全部跟踪文件。应用代码基线之后只修改 Markdown。本部署记录和 README 在发布成功后回填；这次后续记录提交不代表部署了不同的应用。GitHub push 本身不发布网站。

## 检查与证据边界

- 应用基线 `5ee91b6` 于新加坡时间 10 月 20 日本地通过 156 项离线测试、零警告 lint、类型检查、发布扫描及生产构建。依赖审计无已知漏洞，281 个本地 Markdown 文件链接检查通过；这些结果有时效性。发布时对相同源码再次构建和扫描，没有改动依赖、账号、密钥、访问范围或迁移。
- 对应源码 `b13356c` 的 [GitHub CI 已通过](https://github.com/Fongkai777/voice-book/actions/runs/39290175803)，包含依赖审计、发布扫描、lint、类型、测试及构建。
- v34 发布后，`/api/health` 返回 HTTP 200 且数据库就绪；供应商配置存在但未实际探测。本次发布未调用付费模型或测试麦克风，语音顺序请求修复尚未线上声学复测。
- v33 的七问重测已记录于[历史日志](EVALUATION-LOG.zh-CN.md#2026-10-20-v33-重测)：换话题、语言与章节标签改善；结局回答仍有错误，外放打断不稳定。不能据此宣称完整回答质量或真人设备验证通过。
- 早期文档发布 v32 在其自身基线上通过 150 项离线测试，并检查了 273 个本地 Markdown 链接和 9 个章节跳转。
- v32 发布后，`/api/health` 再次返回 HTTP 200 且数据库就绪。当时的纯文档发布没有调用付费模型、创建账号、启用麦克风或重做完整浏览器验收。
- v31 发布后，`/api/health` 返回 200 且数据库就绪，登录页面正常渲染；一次不存在账号的登录探测返回 401 凭据错误，而非缺少 IP 头的 503。Worker 日志记录 `auth_client_ip_status: cloudflare`；未使用真实密码或创建账号。
- 这些观察只证明被测部署链路，不证明每种代理/设备、真实模型可用性或重新完成语音验收。远程结果以 [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) 为准；本地通过不能当作排队中的 CI 已通过。
- [公开图书验收](acceptance/README.zh-CN.md)、截图与演示记录于 v28（`05473c1`），保留历史版本标注。

之后发布应记录精确的 Sites 版本、来源 SHA、GitHub 修订和最终部署状态，核对源码内容后才能宣称对应。发布与回滚方法见[运维说明](OPERATIONS.zh-CN.md)。
