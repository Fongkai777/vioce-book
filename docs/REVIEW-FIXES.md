# Review follow-up — 2026-10-19

## Implemented / 已实现

- Earlier commits optimize BM25 with cached document statistics and named ranking constants, refund personal quota on server failures, and reuse successful retrieval for same-message retries. Statistics are cached in memory, **not persisted in IndexedDB**; reloads rebuild the cache.
- Login uses atomic account, IP and pair counters, dummy derivation for missing users, and rejects session creation if the account was disabled or its password changed during verification.
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

Run `pnpm test`, `pnpm typecheck`, `pnpm check:release` and `pnpm build`. Server tests use isolated SQLite and mocked providers, including rotating-IP attempts, login/disable races, password-reset session invalidation, forbidden admin targets and transaction rollback. Presentation tests guard English UI and stable legacy feedback identifiers. The local-only voice fixture exercises the actual reader/audio code with synthetic input and mocked responses; it is never deployed as a route.
