# API and data boundaries

[中文](API.zh-CN.md) · [English project overview](../README.md)

All paths are same-origin. Private endpoints derive identity from the HttpOnly `voicebook_session` cookie, never a submitted `userId`. No general CORS API is offered. Mutations reject foreign `Origin` and `Sec-Fetch-Site: cross-site` before parsing. Clients without Origin are permitted but still require a valid session. Prefer TLS outside localhost.

| Route | Method / access | Input / behavior |
| --- | --- | --- |
| `/api/auth/login` | POST, public and throttled | JSON `username`, `password`; sets seven-day session cookie |
| `/api/auth/register` | GET, public, no-store | Singapore `date`, `limit: 2`, `remaining`, `timeZone`; advisory availability only |
| `/api/auth/register` | POST, public, per-IP throttled | JSON `username`, `password`, optional `displayName`; atomically admits at most 2 new regular accounts per Singapore day. 201 requires subsequent login; 409 unavailable username; 429 full or throttled. Client-supplied role/limit/identity ignored |
| `/api/auth/logout` | POST | Revokes current server session and expires cookie |
| `/api/quota` | GET, signed in | Current account's daily usage, limits and role |
| `/api/admin/users` | GET / POST / PATCH, admin | List users; create regular account; set `userId`, `questionLimit` (0–500), `voiceMinutesLimit` (0–600) |
| `/api/preferences` | GET / PUT, signed in | Normalized `tone`, `length`, `guidance`, `rememberHistory`; stored in D1 under current account |
| `/api/feedback` | POST, signed in | `exchangeId`, `bookName`, `question`, `answer`, `rating`, `tags`, `comment`; sends that answer's content to D1 |
| `/api/admin/feedback` | GET, admin | Review explicit feedback; not automatic access to browser chat history |
| `/api/admin/operations` | GET / PATCH, admin | Read metrics/budget/warnings; set `dailyBudgetUsd` (0–100), `maxConcurrent` (1–8), `enabled` (boolean). Changes are audited |
| `/api/admin/backup` | POST, admin + reauthentication | `passphrase` (12–256 characters), current `password`; returns encrypted versioned application snapshot, never session tokens or API keys |
| `/api/admin/backup` | PUT, admin + reauthentication | `backup`, `passphrase`, current `password`, `confirmation: "RESTORE SERVER DATA"`; requires paused/drained AI, transactionally replaces server data, revokes sessions |
| `/api/samples` | GET, signed in | Lightweight allowlisted catalog; `?id=...` returns one prebuilt sample. No mutation API |
| `/api/embed` | POST, signed in | `texts` (1–64), `purpose` (`index` / `query`), supported `model`; legacy model allows queries only |
| `/api/ocr` | POST, signed in | JPEG/PNG base64 data URL `image` (up to 8,000,000 characters), `pageNumber`; returns extracted `text` |
| `/api/transcribe` | POST, signed in | Multipart `audio` (up to 6 MiB; entire body <=6.5 MB); server validates canonical PCM WAV and actual duration (>0, <=60 seconds), not client-declared `durationSeconds`; returns `text` and quota |
| `/api/answer` | POST, signed in | `question` (up to 2,000 characters), retrieved `contexts`, optional conversation/revision; returns answer/citations and quota |
| `/api/history/summary` | POST, signed in | Bounded historical `text`; separate maintenance allowance, no question consumed |
| `/api/speech` | POST, signed in | `text` (at most first 5,000 characters processed); returns `audio/mpeg` |
| `/api/health` | GET, public | Checks provider configuration and D1/table readiness; no paid provider request; no-store 200 or generic 503 |

Errors are JSON `{ "error": "public message" }`. Authentication is 401, missing admin permission/cross-origin is 403, invalid fields are 400, some oversized requests are 413, exhausted application quota is 429. Upstream failures map to 502/503 without echoing provider bodies. Unknown exceptions return generic 500; malformed JSON returns generic 400. Do not depend on the precise wording of errors.

`POST /api/admin/operations` accepts `{action:"clear-legacy-estimate", date:"YYYY-MM-DD", expectedMicros:integer}` for an authenticated same-origin administrator. It clears only today's exact untracked legacy estimate once per day, retaining v2 costs and recording an audit entry. Stale/duplicate adjustments return 409; invalid dates/amounts return 400. This does not change provider billing or personal account quotas.

## What leaves the browser

- Original PDF files and saved vectors stay local, except the original demonstration samples bundled with the application.
- Text batches go to the configured embedding provider; scanned page images go to the configured OCR model.
- Detected speech turns go through the authenticated server to transcription; answer text goes to speech synthesis.
- Questions, retrieved passages, preferences and relevant full/compressed conversation context go to answer generation. Summarization also sends historical text to the model. Local storage is not a promise that no model service processes content.
- Preferences and explicitly submitted feedback are stored in D1. No automatic full-chat or personal-book synchronization is implemented.

Do not upload confidential documents until the operator has reviewed provider settings and retention obligations. Access to a shared computer's browser storage can bypass the application's local account filtering; use separate OS/browser profiles for sensitive users.
