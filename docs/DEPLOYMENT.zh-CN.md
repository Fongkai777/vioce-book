# 已核实部署记录

[English](DEPLOYMENT.md) · [项目首页](../README.zh-CN.md)

> **尚未部署：** [`a0d6f45`](https://github.com/Fongkai777/voice-book/commit/a0d6f45)（2026-10-20）修改了应用代码：检索使用独立问题、明确回答语言、只用章节标题分节。下方线上版本仍运行 `cd4187a`。下次发布后，请在此记录版本号、部署 ID 和源码对应关系。

## 当前已核实版本

发布于 2026-10-19 15:50 UTC／新加坡时间 23:50。线上入口：[Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site)。

| 项目 | 内容 |
| --- | --- |
| Sites 版本 | v32，生产发布成功 |
| 对应 GitHub 源码 | [`cc28e2791303225393fb56fa7c845315e34fe5aa`](https://github.com/Fongkai777/voice-book/commit/cc28e2791303225393fb56fa7c845315e34fe5aa) |
| GitHub 应用代码基线 | [`cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1`](https://github.com/Fongkai777/voice-book/commit/cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1) |
| Sites 源码提交 | `7d2bce22ce5682d3a272fcb23c56ad7fd9993830` |
| 两者相同的 Git 文件树哈希 | `cfc35faa69a2b4a5c824b38698ca889098149dcd` |
| 部署 ID | `appgdep_6ad63c23046c8191a2e0faadb0d9556f` |

GitHub 与 Sites 保留独立 Git 历史，提交号不能互换。上面两个来源提交的文件树哈希相同，覆盖全部跟踪文件。应用代码基线之后只修改 Markdown。本部署记录和 README 在发布成功后回填；这次后续记录提交不代表部署了不同的应用。GitHub push 本身不发布网站。

## 检查与证据边界

- 基线在本地通过 150 项离线测试、零警告 lint、类型检查、发布扫描和生产构建。文档发布重复执行了这些检查与构建，没有应用或测试代码变更；273 个本地 Markdown 链接及 9 个本地章节跳转有效。
- v32 发布后，`/api/health` 再次返回 HTTP 200 且数据库就绪。本次纯文档发布没有调用付费模型、创建账号、启用麦克风或重做完整浏览器验收。
- v31 发布后，`/api/health` 返回 200 且数据库就绪，登录页面正常渲染；一次不存在账号的登录探测返回 401 凭据错误，而非缺少 IP 头的 503。Worker 日志记录 `auth_client_ip_status: cloudflare`；未使用真实密码或创建账号。
- 这些观察只证明被测部署链路，不证明每种代理/设备、真实模型可用性或重新完成语音验收。远程结果以 [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) 为准；本地通过不能当作排队中的 CI 已通过。
- [公开图书验收](acceptance/README.zh-CN.md)、截图与演示记录于 v28（`05473c1`），保留历史版本标注。

之后发布应记录精确的 Sites 版本、来源 SHA、GitHub 修订和最终部署状态，核对源码内容后才能宣称对应。发布与回滚方法见[运维说明](OPERATIONS.zh-CN.md)。
