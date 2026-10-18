# Operations and release checklist

## Supported deployment

The current target is Sites hosting on Cloudflare Workers with a `DB` D1 binding. The checked-in `.openai/hosting.json` identifies the existing site; do not reuse its identity for an unrelated fork. GitHub stores source and runs checks, **not** the website, secrets or personal library. Pushing to GitHub does not deploy the website.

Use Node.js 24 and pnpm 11.25.0 for reproducible local checks. `pnpm install --frozen-lockfile` must succeed without changing the lockfile. `pnpm check` runs the release scan, type checker, all offline tests and the Worker/client build. No provider credentials are needed for this command. Runtime testing needs credentials configured separately.

## First local launch

1. Follow README setup and fill the blank values in `.env.local`. Never commit that file.
2. Run `pnpm db:migrate:local`. It applies the committed SQL migrations in order to `.wrangler/state` using `wrangler.local.jsonc`. Repeat runs skip recorded migrations. It never passes `--remote`.
3. Run `pnpm dev`; log in with the bootstrap administrator and create a regular test account.
4. Open a sample, read its content and select a suggested question. Real questions incur provider charges. Test microphone features only with the operator's consent.

The local configuration contains a placeholder D1 ID shared with the Vite emulator. It is **not** a production deployment configuration. If upgrading an old local database initialized manually, reconcile migration records before applying migrations. Preserve the old database and library; do not wipe them as a migration fix.

## Hosted release

1. Keep a known-good saved site version and record the current commit SHA, deployment ID and migration set.
2. Run checks on the intended source, review the diff and review dependency advisories. The pattern scanner is only a guardrail, not an exhaustive secret or vulnerability audit.
3. Configure server-side secrets: `OPENAI_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`; configure the optional legacy embedding credential only if needed. Use `.env.example` as the names-only template. Never put secrets in `NEXT_PUBLIC_*`, workflow YAML, `public/` or the archive.
4. Use the supported Sites source/build/package/save/deploy flow. Keep the current site audience and D1 binding; review migrations before publishing. Sites applies committed migrations. Do not deploy a source state different from the state that produced the archive.
5. Wait for a terminal deployment result. Verify login, regular-user quota, sample selection, citation navigation and administrator access control. `/api/health` is a configuration liveness check, **not** proof that the provider, D1 or all migrations are healthy.
6. Record actual smoke-test results. CI uses no production credentials and intentionally cannot deploy.

## Rollback and data recovery

- Roll back application code by redeploying a previously saved, known-good Sites version. Do not force-push repository history.
- A code rollback does not undo a D1 migration. Prefer additive/backward-compatible schema changes; take and verify a database backup before any destructive migration. A migration that dropped data cannot be repaired by deploying an old Worker.
- Define and test a D1 backup/restore procedure with the hosting operator before accepting important data. No automated backup schedule or restore drill is implemented in this repository.
- PDFs, indexes and chat history live in each browser's IndexedDB. Server backups cannot restore them. Clearing site data, private browsing expiration or removing a book can delete them permanently. There is no general backup/export UI yet; communicate this limitation to users.
- Preferences and deliberately submitted answer feedback live in D1. Feedback contains question/answer content and can be read by administrators. Do not describe all user data as browser-only.

## Credentials and accounts

- A bootstrap administrator is inserted only if its username does not exist. Changing `ADMIN_PASSWORD` in hosting settings does **not** rotate an existing database password.
- There is no self-service password reset or MFA. Account recovery/rotation requires a reviewed maintenance operation that updates the password hash and revokes existing sessions; never write a plaintext password to D1. Do not send administrator credentials to reviewers.
- Revoke provider credentials immediately after suspected exposure; update hosting secrets, verify a controlled request and review provider billing. Removing a secret from the latest commit does not remove it from history.
- Protect `main` with required CI and reviews through GitHub settings. The workflow does not automatically change repository permissions or branch protection.

## Monitoring and costs

Monitor request error rates/latency, 401/403/429 volume, login-attempt volume, D1 failures and provider spend. Alerting, dashboards, retention and an on-call owner must be configured operationally; this repository does not claim they already exist. Never log prompts, audio, credentials or full feedback by default.

Daily limits use the Singapore calendar day. Defaults: 20 questions, 600 voice seconds; per-user overrides apply to those meters. Indexing: 750,000 character-equivalent units (OCR reserves 10,000 per page). Speech: 50,000 characters. Query embeddings: twice the question limit. History maintenance: 500,000 characters, with a 1,000-unit minimum per request. Accepted work is charged before the provider call; failure/interruption does not automatically refund it.

## Gates before unrestricted production access

These are pending decisions/verification, not completed guarantees:

- Measure real-device microphone accuracy, echo/interrupt behavior, browser compatibility and provider latency; perform load/soak tests and the human grounding evaluation in EVALUATION.md.
- Provide a keyboard-only free-form question path and complete an accessibility audit. The current voice-first UI offers transcript editing and suggestions but no general text composer.
- Add tenant-safe cloud backup/export only if cross-device durability is required; browser key scoping alone is not encryption on shared machines.
- Validate uploaded audio duration server-side for an adversarial billing model. The current transcription duration is client-declared; it is not a tamper-proof spending meter.
- Add deployment-level request-size/rate/concurrency controls and a global spending circuit breaker. Application field limits do not bound every request before parsing, and a per-account login/IP window is not comprehensive distributed brute-force protection.
- Specify data retention/deletion, feedback consent, provider privacy terms and incident response for the intended audience. Evaluate stronger password KDF/MFA/recovery requirements against the Worker runtime.
- Review dependencies regularly, especially the beta Vinext runtime. A successful build is not a security audit or an availability SLA.

Until those gates are satisfied, restrict credentials to known reviewers and keep provider spending limits low.
