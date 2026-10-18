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

The full development-tool audit still reports three advisories (one low, one moderate, one high). The high finding is [braces stack-exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), for which the advisory lists no patched release. It is brought in by build/lint file-globbing tools, not application document processing. Do not run the development server publicly, and do not pass untrusted user patterns into build tooling. This is a tracked limitation, not a suppressed warning or a claim that the entire dependency tree is clean. Recheck the full audit before each wider release.

Local key scoping is not encryption or isolation from someone controlling the browser/devtools. Uploaded files, excerpts and conversation data remain untrusted even when user-supplied; model instructions must not be inferred from document text. Citation correctness is not guaranteed and needs human review.

No MFA, password recovery UI, global billing circuit breaker, automated data-retention policy, backup/restore SLA or independently verified security audit is provided. Audio duration is client-declared. Review the runbook for stronger abuse controls before admitting untrusted users.

## Repository hygiene

Run `pnpm check:release` before pushing. It checks private paths and common credential patterns in working files and historical blobs, without printing matched secrets. It is not a substitute for a dedicated secret scanner or review. If a real credential ever enters Git, revoke it first, then coordinate history cleanup with the owner; never silently force-push.

Keep third-party license notices in `build/` and `vendor/`. No project-wide redistribution license is granted by this repository merely being visible on GitHub; the owner must choose one explicitly.
