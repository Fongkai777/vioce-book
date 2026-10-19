# Voicebook

[中文](README.zh-CN.md) · [Live demo](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site) · [User guide](docs/USER-MANUAL.md)

[![CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml/badge.svg)](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml)

A voice-first PDF reading companion for the Wiz AI Builder Intern take-home assignment. Upload a book, ask through your microphone, and hear an answer with clickable source passages.

Verified hosted release: **Sites v32**, matching GitHub source [`cc28e27`](https://github.com/Fongkai777/voice-book/commit/cc28e2791303225393fb56fa7c845315e34fe5aa), published 19 October 2026. Application behavior remains at [`cd4187a`](https://github.com/Fongkai777/voice-book/commit/cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1); subsequent changes are documentation only. See the [deployment/source mapping](docs/DEPLOYMENT.md). The v28 acceptance screenshots are historical evidence, not the current release identifier.

## Try it

1. Open the demo and create a regular account. Self-registration allows **two accounts per Singapore calendar day**; if full, ask the administrator for a reviewer account.
2. Upload the [12-chapter test PDF](output/pdf/alice-in-wonderland.pdf), or choose **Try a sample** for a quick start. Short samples do not replace the assignment's long-book test.
3. Start a voice conversation. Transcripts appear in chat and send automatically; answers play aloud. Interrupt, retry, and follow citations back to the book.
4. Explore **Reading preferences**, answer feedback, and **Book management**.

See the [acceptance report](docs/acceptance/README.md) and [70-second screenshot demo](docs/acceptance/demo.mp4). Reviewer passwords are shared privately, never committed.

## Run locally

Use Node.js 24 and pnpm 11.25.0. Offline tests and builds need no API keys; live model calls do.

```bash
git clone https://github.com/Fongkai777/voice-book.git
cd voice-book
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env.local
# Configure OPENAI_API_KEY and a unique ADMIN_PASSWORD in .env.local
pnpm db:migrate:local
pnpm dev
```

Open the printed URL. Microphones require localhost or HTTPS. Bootstrap credentials create the administrator only when it does not exist; changing an environment variable does not reset an existing password. Never put secrets in public files or NEXT_PUBLIC_* variables.

Before first deployment, replace the example `ADMIN_USERNAME=admin` with an unpublished name and use a long random password. Changing that variable later is **not** an account rename and can create another bootstrap administrator. See [login protections](SECURITY.md) and [lint policy](docs/LINT.md).

```bash
pnpm check           # release boundaries, lint, types, offline tests, production build
pnpm audit           # full dependency audit, no advisory exceptions
```

GitHub hosts source and CI; pushing does not deploy the website. Hosting uses Sites, Vinext/Vite, Cloudflare Workers and D1. See [operations](docs/OPERATIONS.md).

## Architecture

```text
PDF → browser extraction / scanned-page OCR → chunks + embeddings
                                               ↓
                         account-scoped browser library (IndexedDB)
                                               ↓
Mic → transcription → query embedding → BM25 + vector retrieval
                                               ↓
                      cited answer + conversation context → speech
                                               ↓
                  authenticated server: quotas, budget, providers
```

- Books, PDFs, indexes and chat stay in account-scoped browser storage; reopening a book reuses its index.
- Relevant content is sent to model providers for embedding, OCR, answering and speech. “Local storage” does not mean “no data leaves the browser.”
- Preferences, explicit feedback, accounts and usage live in D1. Admins can adjust limits, disable regular users and reset their passwords with reauthentication.
- Default site budget: US$5/day, with reservations, usage reconciliation, concurrency limits and an emergency pause. Manual encrypted backups and health metrics are available.
- Client responsibilities are split into book processing, local-library, chat-history and reply-audio modules. The page coordinates the conversation.

## Known limits

This is a **controlled demo**, not a certification of unrestricted production readiness.

- The server cannot verify client-supplied book excerpts. Grounding is an official-client behavior, not a server-enforced guarantee.
- Local account scoping is not encryption or protection against someone controlling the browser. No private-library cross-device sync.
- Voice uses transcription → RAG → TTS, not native real-time speech-to-speech. Echo, noise, latency and imperfect interruption remain possible.
- Password hashing remains PBKDF2-SHA256 at 100,000 iterations for deployment compatibility, below the referenced OWASP recommendation. No MFA or self-service recovery.
- App budget estimates are not an invoice cap. Set a provider-side limit. No automatic backups or scheduled monitoring are enabled.

See [security](SECURITY.md), [evaluation](docs/EVALUATION.md) and [production release gates](docs/OPERATIONS.md#gates-before-unrestricted-production-access).

## Documentation

| Topic | English | 中文 |
| --- | --- | --- |
| User guide | [Five-minute guide](docs/USER-MANUAL.md) | [用户手册](docs/USER-MANUAL.zh-CN.md) |
| Features, voice lifecycle, configuration and references | [Details](docs/FEATURES.md) | [详细说明](docs/FEATURES.zh-CN.md) |
| Architecture | [Architecture](docs/ARCHITECTURE.md) | [架构](docs/ARCHITECTURE.zh-CN.md) |
| Testing and acceptance | [Evaluation](docs/EVALUATION.md) | [评估](docs/EVALUATION.zh-CN.md) |
| API and data boundaries | [API](docs/API.md) | [接口](docs/API.zh-CN.md) |
| Operations and recovery | [Operations](docs/OPERATIONS.md) / [Backup](docs/BACKUP-RESTORE.md) | [运维](docs/OPERATIONS.zh-CN.md) / [备份](docs/BACKUP-RESTORE.zh-CN.md) |
| Pricing and security | [Pricing](docs/PRICING.md) / [Security](SECURITY.md) | [费用](docs/PRICING.zh-CN.md) / [安全](SECURITY.zh-CN.md) |
| Development | [Contributing](CONTRIBUTING.md) / [AI workflow](docs/AI_WORKFLOW.md) | [贡献](CONTRIBUTING.zh-CN.md) / [AI 工作流](docs/AI_WORKFLOW.zh-CN.md) |
| Lint policy | [Lint](docs/LINT.md) | [静态检查](docs/LINT.zh-CN.md) |
| Releases and changes | [Deployment](docs/DEPLOYMENT.md) / [Changelog](CHANGELOG.md) | [部署记录](docs/DEPLOYMENT.zh-CN.md) / [更新日志](CHANGELOG.zh-CN.md) |

