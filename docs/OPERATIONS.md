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
5. Wait for a terminal deployment result. Verify login, regular-user quota, sample selection, citation navigation and administrator access control. `/api/health` verifies API configuration, D1 reachability and required tables without making a paid provider request. It returns no-store 503 if readiness fails; it does not prove provider availability.
6. Record actual smoke-test results. CI uses no production credentials and intentionally cannot deploy.

## Rollback and data recovery

- Roll back application code by redeploying a previously saved, known-good Sites version. Do not force-push repository history.
- A code rollback does not undo a D1 migration. Prefer additive/backward-compatible schema changes; take and verify a database backup before any destructive migration. A migration that dropped data cannot be repaired by deploying an old Worker.
- Use **Admin → Health, budget & recovery → Encrypted server backup & restore** for manual encrypted snapshots; follow [BACKUP-RESTORE.md](BACKUP-RESTORE.md). Synthetic restore/rollback drills run in CI. A real production restore has not been performed, and recovery time/data-loss SLAs are not claimed.
- PDFs, indexes and chat history live in each browser's IndexedDB. **Book management → Backup & restore** exports the selected book and its saved conversations as an encrypted local file. Server backups cannot restore these. There is no automatic or cloud backup; clearing browser data before making a backup can still permanently lose it.
- Preferences and deliberately submitted answer feedback live in D1. Feedback contains question/answer content and can be read by administrators. Do not describe all user data as browser-only.

## Credentials and accounts

- A bootstrap administrator is inserted only if its username does not exist. Changing `ADMIN_PASSWORD` in hosting settings does **not** rotate an existing database password.
- There is no self-service password reset or MFA. Account recovery/rotation requires a reviewed maintenance operation that updates the password hash and revokes existing sessions; never write a plaintext password to D1. Do not send administrator credentials to reviewers.
- Revoke provider credentials immediately after suspected exposure; update hosting secrets, verify a controlled request and review provider billing. Removing a secret from the latest commit does not remove it from history.
- Protect `main` with required CI and reviews through GitHub settings. The workflow does not automatically change repository permissions or branch protection.

## Monitoring and costs

The administrator operations panel shows readiness, today's global reserved budget, accepted provider requests, monitored request/error counts, mean/max latency by route/status and recent control-plane audit events. Coverage is login plus all six AI paths, not every asset/API. At 80% reserved budget or >=10% 5xx (minimum five requests), the panel shows a warning. Refresh is manual; no scheduled checks, notification service or on-call SLA has been enabled, as requested. Metrics contain only route/status/count/latency/time, never prompts, audio or credentials. Aggregates older than 30 days are removed lazily when the panel is refreshed; global budget records and control-plane audit events remain. Unknown failures emit only a safe route/status/request-ID event to hosting logs. Use `X-Request-Id` to correlate an incident.

The **US$5/day** global limit resets on the Singapore calendar day. Admins can lower/raise it (US$0–100), set 1–8 concurrent AI requests (default four), or pause new AI calls; already accepted calls may finish. Each account is limited to two in-flight provider calls. Conditional D1 updates and lease insertion run in one transaction. Leases expire after 180 seconds; upstream fetch/body consumption is bounded to 120 seconds. Missing D1/control tables fail closed before a provider call. Budget reductions never reset the spent counter. Failure/interruption does not refund reserved budget.

This is **reserved estimated cost**, not measured billing. Policy v1 reserves: text generation = serialized UTF-8 bytes × US$10/million plus output cap × US$40/million; embeddings = serialized bytes × US$2/million (minimum US$0.001); speech = serialized bytes × US$100/million (minimum US$0.01); OCR = US$0.50/page; transcription = US$1/request. Answer output reserves 2,200 tokens and summary 1,800. These deliberately conservative assumptions are not advertised provider rates. Reconcile them against your actual proxy/models before changing providers; never describe the UI value as an invoice. Audio upload is capped at 6 MiB, but malicious compressed audio duration is not server-decoded. A provider-side hard spending limit is still necessary, especially for a key shared by other apps.

AI/login body limits are enforced while reading, before parsing, including requests without a trustworthy Content-Length. Endpoint ceilings: answer 450 kB; embeddings 3.2 MB; OCR 8.01 MB; multipart audio 6.5 MB; speech 40 kB; summary 32 kB; login 4 KiB. Provider response bodies are bounded to 16 MB. These are not an edge WAF or a comprehensive distributed denial-of-service defense.

Daily limits use the Singapore calendar day. Defaults: 20 questions, 600 voice seconds; per-user overrides apply to those meters. Indexing: 750,000 character-equivalent units (OCR reserves 10,000 per page). Speech: 50,000 characters. Query embeddings: twice the question limit. History maintenance: 500,000 characters, with a 1,000-unit minimum per request. Accepted work is charged before the provider call; failure/interruption does not automatically refund it.

## Gates before unrestricted production access

These are pending decisions/verification, not completed guarantees:

- Measure real-device microphone accuracy, echo/interrupt behavior, browser compatibility and provider latency; perform load/soak tests and the human grounding evaluation in EVALUATION.md.
- Provide a keyboard-only free-form question path and complete an accessibility audit. The current voice-first UI offers transcript editing and suggestions but no general text composer.
- Automatic/off-device backup and external alert delivery are intentionally disabled. Manual encrypted exports do not replace a backup schedule or a tested operational recovery SLA. Browser key scoping alone is not encryption on shared machines.
- Validate uploaded audio duration server-side for an adversarial billing model. The current transcription duration is client-declared; it is not a tamper-proof spending meter.
- Add deployment-level edge rate limits/WAF for unrestricted traffic. Application-level AI body/concurrency/budget controls now exist, but are not comprehensive distributed brute-force/DDoS protection and do not cover unrelated applications sharing credentials.
- Specify data retention/deletion, feedback consent, provider privacy terms and incident response for the intended audience. Evaluate stronger password KDF/MFA/recovery requirements against the Worker runtime.
- Review dependencies regularly, especially the beta Vinext runtime. A successful build is not a security audit or an availability SLA.

Until those gates are satisfied, restrict credentials to known reviewers and keep provider spending limits low.
