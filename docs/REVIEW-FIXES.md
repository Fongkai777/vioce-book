# Review follow-up — 2026-10-19

## Implemented / 已实现

- Earlier commits optimized BM25, refunded personal quota on server failures, and reused retrieval for same-message retries. BM25 statistics now also persist in account-scoped IndexedDB content records, with version/fingerprint validation and lazy upgrades of old books; no embeddings are regenerated.
- Login uses atomic IP/pair counters plus a cross-IP bucket for non-administrators, dummy derivation for missing users, and rejects session creation if the account changed during verification. Active administrators are exempt from cross-IP account locking; authenticated password confirmations have separate session counters. Production IP-header failures warn without logging the address and fail closed rather than sharing a global bucket. See SECURITY.md for shared-NAT/distributed-guessing tradeoffs.
- Lint now passes with zero warnings and runs in CI. Narrow React integration exceptions and the intentional full-page administrator return link are documented in [LINT.md](LINT.md).
- Administrators can disable/reactivate regular users and reset their passwords after reauthentication. Updates revoke sessions, preserve data/usage and audit transactionally; failures roll back.
- Reader controls, allowance display, errors and feedback labels use English. Persisted legacy feedback tags and Chinese answer support remain compatible.
- PDF/OCR/embedding processing moved to `lib/book-processing.ts`; audio playback, serialized chat writes and metadata loading now have dedicated hooks. Conversation orchestration remains in the page.
- Removed 61 unused UI template components, the unused connector presentation and its mobile helper. Dependency declarations are intentionally not bulk-pruned in this patch.
- Concise bilingual README entry points link to detailed feature/configuration documentation. Repository links use `voice-book`; public history is preserved and new commits use descriptive subjects and a GitHub noreply identity.

## Explicit limits / 明确保留的边界

- PBKDF2 remains at 100,000 iterations, below the cited recommendation; stronger hashing needs actual-runtime validation and a migration design. See [security](../SECURITY.md).
- Browser-held excerpts cannot be authenticated by a client fingerprint alone. A trusted server ingestion design is out of scope; the exposure and quota/budget mitigation are documented.
- No claim of perfect constant-time login, full production certification, or new hardware-microphone validation. Synthetic browser tests do not reproduce real acoustics.

## Verification / 验证方式

Run `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm check:release` and `pnpm build`. Server tests use isolated SQLite and mocked providers, including rotating-IP attacks, independent administrator reauthentication, missing/invalid/shared IP headers, login/disable races, password-reset invalidation and transaction rollback. IndexedDB tests check restored BM25 scores, zero passage retokenization on reopen, invalid-cache upgrades, account isolation and concurrent deletion. Presentation tests guard English UI and stable feedback identifiers. The local-only voice fixture exercises the actual reader/audio code with synthetic input and mocked responses; it is never deployed as a route.
