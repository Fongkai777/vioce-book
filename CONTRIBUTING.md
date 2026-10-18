# Contributing

1. Use Node.js 24 and pnpm 11.25.0. Install with `pnpm install --frozen-lockfile`.
2. Copy `.env.example` only for runtime work. Offline checks must not require credentials, real audio or paid provider calls.
3. Make a focused branch/change. Keep existing user files, account boundaries, citation provenance and saved index formats intact.
4. Add regression tests for fixes and run `pnpm check`. For browser-facing changes, also run the manual matrix in `docs/EVALUATION.md` and state what you actually verified.
5. Include behavior, tests, data migration impact, known limitations and rollback plan in the review description. Never attach personal book exports, `.env.local`, databases or unredacted logs.

The GitHub CI workflow checks full Git history, TypeScript, offline tests and a production build on pushes/PRs. It is deliberately not a deployment workflow. Runtime production releases go through Sites separately. Required reviews/branch protection must be enabled by the repository owner.

Do not update dependency ranges without updating/reviewing `pnpm-lock.yaml`. Do not use a model call to generate test fixtures during CI. Synthetic harness routes under `app/book-qa` or `app/voice-qa` are temporary local tools and must be removed before commit; `check:release` rejects them.

Run paid integration checks only with explicit approval, a disposable local database, synthetic inputs and a known spending limit. The existing `scripts/check-reader-feedback.mjs` supports optional live-model flags and is not part of CI.
