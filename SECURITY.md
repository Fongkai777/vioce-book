# Security policy

This is an account-controlled demo. See [production release gates](docs/OPERATIONS.md#gates-before-unrestricted-production-access) before widening access. CI passing is not a security certification.

## Reporting

Do not open a public issue containing a credential, private document, account database, conversation or exploit payload with real user data. Use GitHub private vulnerability reporting if enabled; otherwise contact the repository owner privately and request a secure reporting channel. Do not assume private reporting or a response SLA is already enabled.

## Implemented boundaries

- Server-only provider credentials; blank `.env.example`; private runtime files excluded from Git and release archives.
- Random per-password salts, PBKDF2-SHA256 hashes and hashed random session tokens. HTTPS cookies are HttpOnly/Secure/SameSite=Lax with seven-day expiry. Disabled users and expired sessions are rejected.
- Per-IP/account login throttling; current-account identity and administrator authorization enforced in server routes.
- Same-origin mutation checks, typed public errors, no raw upstream error-body disclosure, atomic conditional quota updates.
- Read-only sample allowlist, per-account/per-book local library/history keys and transactionally separated file/content stores.
- Deterministic tests run without provider credentials or network requests. CI has read-only repository permissions and no deployment secrets.

## Limits

### Dependency review (2026-10-19)

The release upgrades Next.js to 16.3.8, PDF.js to 6.2.108, React/RSC to 19.2.8, Vite to 8.0.16 and patched transitive runtime packages. `pnpm audit --prod` reports no known vulnerabilities at this review; that is time-bound, not a permanent guarantee.

Both esbuild advisories are addressed by the locked 0.28.1 override (including the old Drizzle loader). The raw full audit still reports **one** development advisory: [braces stack-exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), with no upstream patched release at this review. `patches/braces@3.0.3.patch` adds a 64-level parser bound and iterative AST depth/cycle/size guards before recursive walkers. This is a local mitigation, not an upstream clean version. Regression tests verify the actual copies used by ESLint and Vinext against deeply nested strings, unbalanced patterns, direct ASTs and cycles. Ordinary globs, migration generation and the build are also checked.

`pnpm audit:reviewed` displays the remaining finding, requires its exact development-only package/version/advisory and passing installed-patch tests, and fails for other advisories or an unavailable audit. The mitigation review expires on **2026-11-19**; reevaluate upstream then. Raw `pnpm audit` is deliberately not suppressed and still exits nonzero. Do not expose development servers or accept user-supplied build patterns.

Local key scoping is not encryption or isolation from someone controlling the browser/devtools. Uploaded files, excerpts and conversation data remain untrusted even when user-supplied; model instructions must not be inferred from document text. Citation correctness is not guaranteed and needs human review.

All six paid AI paths now use an atomic global daily reservation budget (default US$5), a persistent kill switch, global/per-user concurrency leases and bounded request reads. This is an estimated spend circuit breaker, **not a guaranteed provider-invoice cap**: rates are conservative policy assumptions, custom providers may charge differently, audio duration remains client-declared, and other applications sharing a key are outside its scope. Set a separate provider-side billing limit.

Manual backups use AES-256-GCM with a random salt/nonce and PBKDF2-SHA256 (100,000 iterations; Worker-compatible). Use a long, randomly generated passphrase, stored separately. Administrator backup contains password hashes and feedback; never publish it. Restore requires admin authorization, same-origin, password reauthentication, explicit confirmation, paused/drained AI and a valid encrypted snapshot. Restore is transactional, revokes sessions and cannot reduce global reserved spend. Book restore checks account ownership and preserves existing indexes/newer conversation turns. No automatic/cloud backup, scheduled monitoring, MFA, password recovery UI, comprehensive retention policy, backup/restore SLA or independent audit is provided.

## Repository hygiene

Run `pnpm check:release` before pushing. It checks private paths and common credential patterns in working files and historical blobs, without printing matched secrets. It is not a substitute for a dedicated secret scanner or review. If a real credential ever enters Git, revoke it first, then coordinate history cleanup with the owner; never silently force-push.

Keep third-party license notices in `build/` and `vendor/`. No project-wide redistribution license is granted by this repository merely being visible on GitHub; the owner must choose one explicitly.
