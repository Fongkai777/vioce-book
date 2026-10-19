# Verified deployment

[中文](DEPLOYMENT.zh-CN.md) · [Project overview](../README.md)

## Current verified release

Checked 19 October 2026. The live site is [Voicebook](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site).

| Item | Value |
| --- | --- |
| Sites version | v31 — successful production publication |
| GitHub application baseline | [`cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1`](https://github.com/Fongkai777/voice-book/commit/cd4187aeb11e6ed6d92ef4ef2dc3356c35e39ab1) |
| Sites source commit | `6c18097b9b4db496272aaa6c135d37fbe720ccd8` |
| Deployment ID | `appgdep_6ad637c4d0f081918c0983bd17ddbb73` |

GitHub and Sites retain separate Git histories; SHA values are not interchangeable. The v31 source tree was matched to the GitHub baseline before publication. Later documentation-only commits do not imply another application-code change. GitHub pushes alone do not deploy the app.

## Checks and evidence boundaries

- The baseline passed 150 offline tests, zero-warning lint, TypeScript, release scanning and a production build locally.
- After v31 publication, `/api/health` returned 200 with database ready. The deployed login page rendered; one nonexistent-account probe returned 401 invalid credentials, not an IP-header 503. Worker logs recorded `auth_client_ip_status: cloudflare`; no real password or account creation was used.
- Those observations establish the sampled deployment path, not every proxy/device, live-model availability or a full new voice acceptance run. Check [GitHub CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) for remote status; local success is not a claim that queued jobs passed.
- The [public-book acceptance report](acceptance/README.md), screenshots and demo were recorded on v28 (`05473c1`), and remain labelled as historical evidence.

For future releases, record the exact saved version, Sites source SHA, GitHub source revision and terminal deployment result. Verify source content before asserting equivalence. See [operations](OPERATIONS.md) for publishing and rollback.
