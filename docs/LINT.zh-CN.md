# 静态检查规则

[English](LINT.md) · [项目首页](../README.zh-CN.md)

`pnpm lint` 要求零错误、零警告，是 `pnpm check` 和 GitHub CI 的一部分。生成产物、复制的 PDF worker、第三方 vendor/build 文件及本地测试输出不属于项目源码检查范围，不能靠手改生成文件消除告警。

当前未启用 React Compiler。Hooks 调用顺序、依赖检查和其他 Next/TypeScript 规则保持开启。`eslint.config.mjs` 仅有两组明确例外：

- 仅 `app/page.tsx` 关闭 `react-hooks/refs` 与 `react-hooks/immutability`：对话协调器持有 hook 返回的音频、取消和历史可变句柄，界面转移同时更新 React 状态。这不允许随意把外部可变数据用于渲染；将来启用 Compiler 前，应改为状态/reducer 或外部存储订阅，再移除例外。
- 配置列明的八个资源组件/hook 关闭 `react-hooks/set-state-in-effect`：资源变化时，effect 重置加载、选中或波形状态。取消保护与完整依赖检查仍保留。仅把 setter 延后以绕过规则，不会解决额外渲染问题。

后台 **Back to Voicebook** 保留普通链接，用单行 Next `<Link>` 规则豁免避免已复现的线上 Vinext 路由问题，不是对内部链接的全面豁免。冗余渲染期 ref 赋值、波形 ref 更新、依赖告警和 JSX 转义已直接修正。lint 通过不代表所有生命周期风险均已消失。
