# Verified deployment

[中文](DEPLOYMENT.zh-CN.md) · [Project overview](../README.md)

The deployed application includes sequential speech requests and bounded busy retries from [`5ee91b6`](https://github.com/Fongkai777/voice-book/commit/5ee91b676f28e54495bb07e2e4e2bbd26176aacf), alongside [`a0d6f45`](https://github.com/Fongkai777/voice-book/commit/a0d6f45): standalone retrieval queries, an explicit answer language and chapter-aware section labels. Existing saved books keep their stored passages; this release does not automatically re-index them.

## Current verified release

Published 19 October 2026 at 17:00 UTC / **20 October 2026 at 01:00 Singapore time**. The live site is [Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site).

| Item | Value |
| --- | --- |
| Sites version | v34 — successful production publication |
| Matching GitHub source | [`b13356cf4ab4490b75fb092d868c91b2162e6782`](https://github.com/Fongkai777/voice-book/commit/b13356cf4ab4490b75fb092d868c91b2162e6782) |
| GitHub application baseline | [`5ee91b676f28e54495bb07e2e4e2bbd26176aacf`](https://github.com/Fongkai777/voice-book/commit/5ee91b676f28e54495bb07e2e4e2bbd26176aacf) |
| Sites source commit | `65a67c8a6f109bb9b913ea3e0588db6fc4ec3e5a` |
| Shared Git tree hash | `1c14a0bf253b7ae1668b4f313ca4723df08a11bd` |
| Deployment ID | `appgdep_6ad64c8359a48191a8a6f473d7d17468` |

GitHub and Sites retain separate Git histories; commit SHAs are not interchangeable. Both source commits have the identical Git tree hash above, covering all tracked files. Only Markdown changed after the application baseline. This deployment record and README were updated after successful publication; their follow-up documentation commit is not a different deployed application. GitHub pushes alone do not deploy the app.

## Checks and evidence boundaries

- Application baseline `5ee91b6` passed 156 offline tests, zero-warning lint, TypeScript, release scanning and a production build locally on 20 October (Singapore time). Dependency audit found no known vulnerabilities; 281 local Markdown file links resolved. These are dated results. Publication rebuilt/scanned the matching source; no dependency, account, secret, audience or migration changes were made.
- [GitHub CI passed](https://github.com/Fongkai777/voice-book/actions/runs/39290175803) for matching source `b13356c`, including dependency audits, release scanning, lint, types, tests and build.
- After v34 publication, `/api/health` returned HTTP 200 with database ready; provider configuration was present but not probed. No paid model calls or microphone tests were run during this publication. The sequential speech fix has not yet been re-measured acoustically online.
- The seven-question v33 re-run is in the [historical log](EVALUATION-LOG.md#2026-10-20-re-run-on-v33): topic changes, language and labels improved; the ending answer was still partly wrong and speaker interruption intermittent. This does not establish complete answer quality or human/device validation.
- Earlier documentation release v32 passed 150 offline tests and validated 273 local Markdown links and nine heading links at its own baseline.
- After v32 publication, `/api/health` again returned HTTP 200 with database ready. No paid provider, account creation, microphone or new full browser acceptance was run for this documentation-only release.
- After v31 publication, `/api/health` returned 200 with database ready. The deployed login page rendered; one nonexistent-account probe returned 401 invalid credentials, not an IP-header 503. Worker logs recorded `auth_client_ip_status: cloudflare`; no real password or account creation was used.
- Those observations establish the sampled deployment path, not every proxy/device, live-model availability or a full new voice acceptance run. Check [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) for remote status; local success is not a claim that queued jobs passed.
- The [public-book acceptance report](acceptance/README.md), screenshots and demo were recorded on v28 (`05473c1`), and remain labelled as historical evidence.

For future releases, record the exact saved version, Sites source SHA, GitHub source revision and terminal deployment result. Verify source content before asserting equivalence. See [operations](OPERATIONS.md) for publishing and rollback.
