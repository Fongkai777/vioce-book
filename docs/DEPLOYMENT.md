# Verified deployment

[中文](DEPLOYMENT.zh-CN.md) · [Project overview](../README.md)

The deployed application includes [`a0d6f45`](https://github.com/Fongkai777/voice-book/commit/a0d6f45): standalone retrieval queries, an explicit answer language and chapter-aware section labels. Existing saved books keep their stored passages; this release does not automatically re-index them.

## Current verified release

Published 19 October 2026 at 16:36 UTC / **20 October 2026 at 00:36 Singapore time**. The live site is [Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site).

| Item | Value |
| --- | --- |
| Sites version | v33 — successful production publication |
| Matching GitHub source | [`f2df8dd1b07fdebbc35c75b02330ef1f7a505ed9`](https://github.com/Fongkai777/voice-book/commit/f2df8dd1b07fdebbc35c75b02330ef1f7a505ed9) |
| GitHub application baseline | [`a0d6f45f9810edbe5128e782c5419a2c1fd1d95e`](https://github.com/Fongkai777/voice-book/commit/a0d6f45f9810edbe5128e782c5419a2c1fd1d95e) |
| Sites source commit | `d8cd37c17ed0a57f7de08f3312896a1f7f70312d` |
| Shared Git tree hash | `533cbf8c4fe8b175ffe39982f42444026df23ef0` |
| Deployment ID | `appgdep_6ad646fb4c388191b8ac90cc480c76e7` |

GitHub and Sites retain separate Git histories; commit SHAs are not interchangeable. Both source commits have the identical Git tree hash above, covering all tracked files. Only Markdown changed after the application baseline. This deployment record and README were updated after successful publication; their follow-up documentation commit is not a different deployed application. GitHub pushes alone do not deploy the app.

## Checks and evidence boundaries

- The application baseline passed 153 offline tests, zero-warning lint, TypeScript, release scanning and a production build locally on 20 October (Singapore time). Publication rebuilt the matching source with release scanning; no dependency, account, secret or migration changes were made.
- After v33 publication, `/api/health` returned HTTP 200 with database ready. No paid model calls or microphone tests were run during publication. Full hybrid-retrieval quality and real-device interruption still need post-fix measurement; offline passing tests do not establish those outcomes.
- Earlier documentation release v32 passed 150 offline tests and validated 273 local Markdown links and nine heading links at its own baseline.
- After v32 publication, `/api/health` again returned HTTP 200 with database ready. No paid provider, account creation, microphone or new full browser acceptance was run for this documentation-only release.
- After v31 publication, `/api/health` returned 200 with database ready. The deployed login page rendered; one nonexistent-account probe returned 401 invalid credentials, not an IP-header 503. Worker logs recorded `auth_client_ip_status: cloudflare`; no real password or account creation was used.
- Those observations establish the sampled deployment path, not every proxy/device, live-model availability or a full new voice acceptance run. Check [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) for remote status; local success is not a claim that queued jobs passed.
- The [public-book acceptance report](acceptance/README.md), screenshots and demo were recorded on v28 (`05473c1`), and remain labelled as historical evidence.

For future releases, record the exact saved version, Sites source SHA, GitHub source revision and terminal deployment result. Verify source content before asserting equivalence. See [operations](OPERATIONS.md) for publishing and rollback.
