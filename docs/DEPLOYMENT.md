# Verified deployment

[中文](DEPLOYMENT.zh-CN.md) · [Project overview](../README.md)

## Current verified release

Published 19 October 2026 at 15:50 UTC / 23:50 Singapore time. The live site is [Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site).

| Item | Value |
| --- | --- |
| Sites version | v32 — successful production publication |
| Matching GitHub source | [`cc28e2791303225393fb56fa7c845315e34fe5aa`](https://github.com/Fongkai777/voice-book/commit/cc28e2791303225393fb56fa7c845315e34fe5aa) |
| GitHub application baseline | [`cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1`](https://github.com/Fongkai777/voice-book/commit/cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1) |
| Sites source commit | `7d2bce22ce5682d3a272fcb23c56ad7fd9993830` |
| Shared Git tree hash | `cfc35faa69a2b4a5c824b38698ca889098149dcd` |
| Deployment ID | `appgdep_6ad63c23046c8191a2e0faadb0d9556f` |

GitHub and Sites retain separate Git histories; commit SHAs are not interchangeable. Both source commits have the identical Git tree hash above, covering all tracked files. Only Markdown changed after the application baseline. This deployment record and README were updated after successful publication; their follow-up documentation commit is not a different deployed application. GitHub pushes alone do not deploy the app.

## Checks and evidence boundaries

- The baseline passed 150 offline tests, zero-warning lint, TypeScript, release scanning and a production build locally. The documentation release repeated those checks and the production build, with no application/test changes. All 273 local Markdown links and nine local heading links resolved.
- After v32 publication, `/api/health` again returned HTTP 200 with database ready. No paid provider, account creation, microphone or new full browser acceptance was run for this documentation-only release.
- After v31 publication, `/api/health` returned 200 with database ready. The deployed login page rendered; one nonexistent-account probe returned 401 invalid credentials, not an IP-header 503. Worker logs recorded `auth_client_ip_status: cloudflare`; no real password or account creation was used.
- Those observations establish the sampled deployment path, not every proxy/device, live-model availability or a full new voice acceptance run. Check [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) for remote status; local success is not a claim that queued jobs passed.
- The [public-book acceptance report](acceptance/README.md), screenshots and demo were recorded on v28 (`05473c1`), and remain labelled as historical evidence.

For future releases, record the exact saved version, Sites source SHA, GitHub source revision and terminal deployment result. Verify source content before asserting equivalence. See [operations](OPERATIONS.md) for publishing and rollback.
