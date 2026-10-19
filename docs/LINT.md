# Lint policy

[中文](LINT.zh-CN.md) · [Project overview](../README.md)

`pnpm lint` checks application source with zero warnings allowed. It is part of `pnpm check` and GitHub CI. Generated output, the copied PDF worker, third-party vendor/build files and local evaluation artifacts are excluded, not hand-edited to silence warnings.

The application does not enable React Compiler. Standard Rules of Hooks, dependency checks and the rest of the Next/TypeScript rules remain enabled. Two explicit exceptions in `eslint.config.mjs` document existing imperative integration patterns:

- Only `app/page.tsx` disables `react-hooks/refs` and `react-hooks/immutability`: the conversation coordinator owns mutable audio, cancellation and history handles returned by hooks. UI transitions also update React state. This is not permission to render arbitrary external mutable data; a future Compiler migration needs state/reducer or external-store subscriptions before removing the exception.
- Eight named resource-facing components/hooks disable `react-hooks/set-state-in-effect`. Their effects reset loading, selection or waveform state when resources change. Cancellation and exhaustive dependencies remain checked. Deferring a setter solely to evade the rule would hide the same extra render rather than fix it.

The administrator's **Back to Voicebook** anchor has a single-line Next `<Link>` rule exemption. Full document navigation intentionally avoids the previously reproduced hosted Vinext navigation failure; it is not a blanket exemption for internal links. Redundant render-time ref assignment, waveform ref updates, dependency warnings and JSX escaping were corrected directly.
