# Lint policy / 静态检查规则

`pnpm lint` checks application source with zero warnings allowed. It is part of `pnpm check` and GitHub CI. Generated output, the copied PDF worker, third-party vendor/build files and local evaluation artifacts are excluded, not hand-edited to silence warnings.

The application does not enable React Compiler. Standard Rules of Hooks, dependency checks and the rest of the Next/TypeScript rules remain enabled. Two explicit exceptions in `eslint.config.mjs` document existing imperative integration patterns:

- Only `app/page.tsx` disables `react-hooks/refs` and `react-hooks/immutability`: the conversation coordinator owns mutable audio, cancellation and history handles returned by hooks. UI transitions also update React state. This is not permission to render arbitrary external mutable data; a future Compiler migration needs state/reducer or external-store subscriptions before removing the exception.
- Eight named resource-facing components/hooks disable `react-hooks/set-state-in-effect`. Their effects reset loading, selection or waveform state when resources change. Cancellation and exhaustive dependencies remain checked. Deferring a setter solely to evade the rule would hide the same extra render rather than fix it.

The administrator's **Back to Voicebook** anchor has a single-line Next `<Link>` rule exemption. Full document navigation intentionally avoids the previously reproduced hosted Vinext navigation failure; it is not a blanket exemption for internal links. Redundant render-time ref assignment, waveform ref updates, dependency warnings and JSX escaping were corrected directly.

## 中文

`pnpm lint` 要求零错误、零警告，已加入 `pnpm check` 和 GitHub CI。生成产物、复制的 PDF worker、第三方目录及本地测试输出不属于项目源码检查范围。

当前没有启用 React Compiler。仅对页面中既有的音频/取消/历史可变句柄关闭 refs 和 immutability 检查；仅对配置列明的八个资源组件或 hook 关闭 effect 内同步更新状态规则。Hooks 调用顺序和依赖检查仍开启。若以后启用 Compiler，应先改为状态机或订阅式状态管理，不应扩大豁免范围。

后台返回首页保留普通链接，是为了避免已复现的线上路由故障，并附单行规则豁免。其他依赖、转义和冗余 ref 写入问题直接修复。lint 通过不是所有 React 生命周期风险均已消失的保证。
