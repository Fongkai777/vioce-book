# 已核实部署记录

[English](DEPLOYMENT.md) · [项目首页](../README.zh-CN.md)

## 当前已核实版本

核实日期：2026-10-19。线上入口：[Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site)。

| 项目 | 内容 |
| --- | --- |
| Sites 版本 | v31，生产发布成功 |
| GitHub 应用代码基线 | [`cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1`](https://github.com/Fongkai777/voice-book/commit/cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1) |
| Sites 源码提交 | `6c18097b9b4db496272aaa6c135d37fbe720ccd8` |
| 部署 ID | `appgdep_6ad637c4d0f081918c0983bd17ddbb73` |

GitHub 与 Sites 保留独立 Git 历史，提交号不能互换。v31 发布前已比对源码树与 GitHub 基线一致；之后只修改文档的提交不代表再次修改应用代码。GitHub push 本身不发布网站。

## 检查与证据边界

- 基线在本地通过 150 项离线测试、零警告 lint、类型检查、发布扫描和生产构建。
- v31 发布后，`/api/health` 返回 200 且数据库就绪，登录页面正常渲染；一次不存在账号的登录探测返回 401 凭据错误，而非缺少 IP 头的 503。Worker 日志记录 `auth_client_ip_status: cloudflare`；未使用真实密码或创建账号。
- 这些观察只证明被测部署链路，不证明每种代理/设备、真实模型可用性或重新完成语音验收。远程结果以 [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) 为准；本地通过不能当作排队中的 CI 已通过。
- [公开图书验收](acceptance/README.zh-CN.md)、截图与演示记录于 v28（`05473c1`），保留历史版本标注。

之后发布应记录精确的 Sites 版本、来源 SHA、GitHub 修订和最终部署状态，核对源码内容后才能宣称对应。发布与回滚方法见[运维说明](OPERATIONS.zh-CN.md)。
