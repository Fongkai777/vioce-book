# Security policy

[中文](SECURITY.zh-CN.md) · [English project overview](README.md)

This is an account-controlled demo. See [production release gates](docs/OPERATIONS.md#gates-before-unrestricted-production-access) before widening access. CI passing is not a security certification.

## Reporting

Do not open a public issue containing a credential, private document, account database, conversation or exploit payload with real user data. Use GitHub private vulnerability reporting if enabled; otherwise contact the repository owner privately and request a secure reporting channel. Do not assume private reporting or a response SLA is already enabled.

## Implemented boundaries

- Server-only provider credentials; blank `.env.example`; private runtime files excluded from Git and release archives.
- Random per-password salts, PBKDF2-SHA256 hashes and hashed random session tokens. HTTPS cookies are HttpOnly/Secure/SameSite=Lax with seven-day expiry. Disabled users and expired sessions are rejected.
- Atomic login limits per 15-minute window: 10 attempts per account/IP pair and 50 per IP; regular/unknown accounts also have a 10-attempt cross-IP account limit. Active administrators are exempt from that cross-IP bucket so a public username cannot globally lock them out. Success clears account/pair counters, not the IP counter. Administrator password confirmations use a separate 10-attempt authenticated-session bucket, unaffected by public login attempts.
- Only the platform's valid `CF-Connecting-IP` is used; arbitrary forwarded headers are ignored. Missing/invalid production headers and Cloudflare's shared cross-zone Worker address fail closed with 503, rather than sharing a global `local` bucket. Only localhost may use that fallback. `auth_client_ip_status` logs presence/usability, never the address, on status changes or at most once per five minutes per isolate. `/api/health` also triggers this diagnostic. Verify the actual deployment path; Cloudflare hosting alone does not prove forwarding is correct.
- Missing, disabled and existing accounts all perform one password derivation and return the same invalid-credentials message. This reduces timing enumeration, not a proof of identical network timing. Regular accounts can still be temporarily locked out; shared-NAT attackers can exhaust an administrator's IP/pair budget. Distributed guessing against administrators is limited per IP, not globally: use a long random password, an unpublished bootstrap username, and add MFA/edge protection before broader release. Role-dependent throttling is not an anti-enumeration guarantee.
- Administrator-only disable/reactivate and password reset apply to regular accounts, require password reauthentication, revoke all target sessions and write a password-free audit entry in one transaction. Data and quotas remain. Administrators cannot manage themselves or other administrators here; there is no self-service recovery or forced password-change flow.
- Self-registration is limited to two successful accounts per Singapore calendar day across the whole site, with a transactional D1 counter and regular-user-only inserts. Duplicate/failed writes roll back admission. Per-IP registration attempts are separately throttled (10/15 minutes), bodies are limited to 4 KB, and the bootstrap administrator username is reserved. Admin-created accounts bypass only the signup counter, not AI usage controls. Deletion and same-database backup restore cannot refund signup places.
- The signup counter is control-plane state, retained on restore but not included in account snapshots. A disaster recovery into a fresh database must preserve this counter separately or wait until the next Singapore day before opening registration. No email verification or CAPTCHA is implemented; an attacker can occupy the two daily places, so administrators can still invite reviewers directly.
- Same-origin mutation checks, typed public errors, no raw upstream error-body disclosure, atomic conditional quota updates.
- Read-only sample allowlist, per-account/per-book local library/history keys and transactionally separated file/content stores.
- Deterministic tests run without provider credentials or network requests. CI has read-only repository permissions and no deployment secrets.

## Limits

### Password hashing

Login hashes retain PBKDF2-SHA256 at 100,000 iterations for compatibility with this existing deployment. This is **below** the [OWASP recommendation of 600,000 for PBKDF2-HMAC-SHA256](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Worker limits have varied by runtime/configuration ([upstream discussion](https://github.com/cloudflare/workerd/issues/1346)); do not assume every current Worker has the same cap. Before unrestricted access, benchmark the actual hosted runtime and migrate to a supported stronger KDF or managed identity, with versioned hashes and rehash-on-login. Rate limits and dummy derivation do not replace password hardening.

A client-submitted fingerprint would not establish excerpt provenance. Server-enforced grounding requires a trusted ingestion/manifest design, not merely checking a client hash.

### Dependency review (2026-10-19)

The release upgrades Next.js to 16.3.8, PDF.js to 6.2.108, React/RSC to 19.2.8, Vite to 8.0.16 and patched transitive runtime packages. `pnpm audit --prod` reports no known vulnerabilities at this review; that is time-bound, not a permanent guarantee.

Both esbuild advisories are addressed by the locked 0.28.1 override (including the old Drizzle loader). The remaining [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) is addressed by **removing the dependency chain**, not by accepting or renaming the vulnerable package. `braces`, `micromatch` and `fast-glob` no longer have package entries in the lockfile. Raw full `pnpm audit` reports no known vulnerabilities at this review.

Two version-scoped compatibility patches switch `@next/eslint-plugin-next@16.3.8` and Vinext's `vite-plugin-dynamic-import@1.6.0` from fast-glob to `tinyglobby@0.2.17`. `pnpm-workspace.yaml` removes their old dependency and adds the replacement through package extensions. The patches disable directory expansion, preserve ESLint's absolute/relative directory paths and adapt both CommonJS/ESM dynamic-import entry points. These are application-specific tooling adaptations, not a general fast-glob replacement. Regression tests exercise the actual installed consumers, directory/file matching and generated variable imports, and prevent the removed dependency chain from returning. Review these patches when upgrading either consumer; the exact-version pinning intentionally requires a fresh compatibility review.

The old braces mitigation and expiring advisory acceptance have been deleted. `pnpm audit:reviewed` is retained only as an alias for unfiltered `pnpm audit`; CI runs the raw full audit and fails for any reported vulnerability or unavailable audit service. There are no advisory exceptions. A clean audit is time-bound and does not prove the absence of undiscovered vulnerabilities. Do not expose development servers or accept user-supplied build patterns.

Local key scoping is not encryption or isolation from someone controlling the browser/devtools. Uploaded files, excerpts and conversation data remain untrusted even when user-supplied; model instructions must not be inferred from document text. Citation correctness is not guaranteed and needs human review.

Because books and indexes live in the browser, `/api/answer` receives the retrieved excerpts from the client and cannot verify that they came from an indexed book. A signed-in user can therefore submit arbitrary "excerpts" and use the answer route as a general model endpoint, bounded only by their daily allowance and the global budget. Grounding is a property of the official client, not a server-enforced guarantee.

Quota is charged before a provider call and returned automatically when the server fails the request (budget/pause/concurrency denial, provider error, invalid model output). A reader-initiated cancellation keeps its charge. The global spend reservation is never refunded, so provider cost already incurred stays visible to the budget.

Retrying the same chat message reuses its successful retrieval while the question (including retrieval history), account, book, model and loaded index are unchanged. This prevents a failing answer service from repeatedly consuming the separate search allowance. The cache holds at most 16 retrievals in memory and is cleared on account/book transitions, history clearing, logout and reload; after clearing/eviction a new search is chargeable. Answers still require authenticated, quota-checked requests, and actual provider spend is not refunded. This is client retry reuse, not a server-enforced end-to-end transaction or unlimited retry guarantee.

All six paid AI paths now use an atomic global daily reservation budget (default US$5), a persistent kill switch, global/per-user concurrency leases and bounded request reads. This is an estimated spend circuit breaker, **not a guaranteed provider-invoice cap**: known models use versioned token rates, custom providers and TTS still have estimates, and other applications sharing a key are outside its scope. Transcription duration is verified server-side from canonical PCM WAV data. Set a separate provider-side billing limit.

Manual backups use AES-256-GCM with a random salt/nonce and PBKDF2-SHA256 (100,000 iterations; Worker-compatible). Use a long, randomly generated passphrase, stored separately. Administrator backup contains password hashes and feedback; never publish it. Restore requires admin authorization, same-origin, password reauthentication, explicit confirmation, paused/drained AI and a valid encrypted snapshot. Restore is transactional, revokes sessions and cannot reduce global reserved spend. Book restore checks account ownership and preserves existing indexes/newer conversation turns. No automatic/cloud backup, scheduled monitoring, MFA, self-service password recovery UI, comprehensive retention policy, backup/restore SLA or independent audit is provided.

## Repository hygiene

Run `pnpm check:release` before pushing. It checks private paths and common credential patterns in working files and historical blobs, without printing matched secrets. It is not a substitute for a dedicated secret scanner or review. If a real credential ever enters Git, revoke it first, then coordinate history cleanup with the owner; never silently force-push.

Keep third-party license notices in `build/` and `vendor/`. No project-wide redistribution license is granted by this repository merely being visible on GitHub; the owner must choose one explicitly.
