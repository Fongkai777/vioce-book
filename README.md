# Voicebook

[中文](README.zh-CN.md) · [Live demo](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site) · [User guide](docs/USER-MANUAL.md)

[![CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml/badge.svg)](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml)

A voice-first PDF reading companion for the Wiz AI Builder Intern take-home assignment. Upload a book, ask through your microphone, and hear an answer with clickable source passages.

**Live site:** Sites v32, built from [`cd4187a`](https://github.com/Fongkai777/voice-book/commit/cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1). The retrieval and answer-language fix in [`a0d6f45`](https://github.com/Fongkai777/voice-book/commit/a0d6f45) is on `main` but **not yet deployed**; until it is, a topic change can still retrieve passages from earlier questions. See the [deployment record](docs/DEPLOYMENT.md).

## Try it (about 10 minutes)

**Before you start**

- **Account:** use the reviewer account in the submission email. Self-registration is capped at two accounts per day for the whole site, so it may already be full.
- **Browser:** desktop Chrome is recommended. Some in-app or embedded browsers block microphone access; the app then shows "Microphone access was denied".
- **Headphones** are recommended. With speakers, the answer audio can mask your voice, so speaking over a playing answer may not interrupt it.
- **Timing:** each spoken turn takes about 15–20 seconds. The status line shows each stage: *Turning speech into text → Finding the best passages → Composing a grounded answer → Preparing the spoken reply → Playing the answer*.
- **Microphone required for free-form questions.** There is no text box. Without a microphone, use the suggested questions shown on the reading page.

**Steps**

1. Sign in, then download the [12-chapter test PDF](https://github.com/Fongkai777/voice-book/raw/main/output/pdf/alice-in-wonderland.pdf) and choose **Upload a PDF**. It is ready in about 10 seconds: 56 pages, about 148 passages. (**Try a sample** is a shorter quick start, not the long-book test.)
2. Press **Start voice conversation** and allow the microphone when Chrome asks. When you see **Listening — go ahead**, ask a question and pause. Your words appear as a **You** message and send automatically; the answer plays aloud.
3. Try these questions; the source page for each is in brackets:
   - *"In chapter one, what did the label on the little bottle say, and why didn't Alice drink it right away?"* (p. 4)
   - *"In the Queen's croquet game, what did they use as the balls and the mallets?"* (p. 33)
   - A follow-up such as *"And what did Alice think about that?"*, which should resolve "that" from the previous turn.
   - *"What is the name of Alice's school teacher?"* The book never says, so the app should decline rather than invent one.
4. Click a numbered citation to read the passage, then **View in book → View PDF page** to check the original page.
5. Optional: change **Reading preferences** (for example, Brief), rate an answer, or open **Book management** to browse pages and passages. Press **End voice** when finished; the microphone turns off.

Your book, index and chat stay in this browser under your account; refreshing keeps them. More detail: [user guide](docs/USER-MANUAL.md) · [acceptance report](docs/acceptance/README.md) · [validation log, including known failures](docs/EVALUATION-LOG.md).

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

