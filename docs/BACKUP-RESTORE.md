# Manual backup and recovery runbook

No scheduled jobs or cloud backup storage are configured. Make and verify downloads before important changes. Save backup files outside the repository, ideally on a separate encrypted device, and store a long random passphrase in a password manager. Losing both the live data and the passphrase is unrecoverable. The app does not retain that passphrase.

## Server snapshot

1. Sign in as administrator. Open **Health, budget & recovery → Encrypted server backup & restore**.
2. Enter a 12–256 character backup passphrase and your current administrator password, then select **Download server backup**. This does not pause the site or call an AI provider. The server reauthenticates you, holds a consistent D1 batch read and encrypts the application snapshot before returning it over HTTPS.
3. The versioned AES-GCM envelope contains accounts/password hashes, daily usage, quota overrides, reader preferences, submitted feedback and global spend totals. It excludes login sessions/attempts, API keys, deployment settings, operations metrics/audit, and browser books/chat. It is an application snapshot, not a physical D1 export or point-in-time recovery service.
4. Keep the encrypted file and passphrase separately. Check that the download exists. A download event in the audit is not evidence that a human safely stored it.

### Restore (destructive, only when intentionally recovering)

1. First download a fresh safety copy of the current server data. Do not restore onto production merely to test a backup.
2. Pause AI using **Pause AI now**. Wait for in-flight requests to finish; the server refuses to restore while a live lease remains.
3. Choose the backup, enter its passphrase, enter your **current** administrator password, and type `RESTORE SERVER DATA`. Confirm the replacement warning.
4. The server authenticates/authorizes the operator, checks snapshot version, table/column allowlists, account relationships and size limits, then replaces application tables in **one D1 transaction**. A SQL/constraint failure rolls back all replacements and session revocations. Maintenance preconditions are rechecked inside the transaction.
5. All sessions are revoked on success. Log in using an administrator present in the restored snapshot and its password **at backup time**. AI stays paused. Global reserved spend merges with `MAX`, never decreasing existing totals. Current budget/concurrency settings and operations audit are preserved.
6. Check account counts, a representative preference/feedback record and `/api/health`. Resume AI explicitly only after inspection. Roll back an unsuccessful data recovery using your safety copy, not a Git force push.

For a completely new D1 instance: apply all migrations, provision the runtime secrets/bootstrap administrator, log in, pause AI and restore. Runtime API keys and hosting configuration must be recovered separately. Account IDs from the snapshot are preserved so same-origin browser libraries can remain associated. If no administrator can log in to the current instance, this UI is not a break-glass recovery path; use the hosting operator's access to provision a new instance. Do not bypass session authorization by adding a public restore endpoint.

Bounds: each table <=10,000 rows and <=1.5 MB UTF-8 JSON; total plaintext snapshot <=4 MB; encrypted upload <=6 MB ciphertext data (7 MB HTTP envelope). These deliberately small limits leave room within Worker memory. Larger datasets need a reviewed hosting-level D1 export/import procedure. Export fails explicitly rather than silently truncating. Snapshot format version 1 requires the matching application schema; forward/backward migration conversion is not automatic.

## Browser book and conversation backup

1. Open **Book management**, select a book, then expand **Backup & restore**.
2. Enter a backup passphrase and select **Download selected book**. This includes that account's original PDF (if available), metadata, full saved text, chunks, vectors, saved conversation turns and summary cache. Repeat for other books. Unsaved/in-memory turns and conversations belonging to already-deleted books are not exported. No network request or re-embedding is used.
3. To restore on another browser, sign in with the **same account**, select the encrypted file and enter its passphrase. Refresh after success. Other-account backups are refused; a server account recreated with a new ID is not the original account.
4. Existing books with a different saved index are not overwritten. Existing turns and summaries win over backup versions. Book insertion and history insertion use separate IndexedDB transactions; a history failure may leave the book restored but history pending. Retrying the same backup is safe and does not duplicate turns. Close other tabs during backup/recovery to avoid changing content mid-snapshot.

Browser limits: PDF <=35 MB, plaintext book snapshot <=50 MB, encrypted upload <=75 MB. This is an in-memory format; large libraries should be backed up one book at a time, not all at once. Keep originals separately when a book exceeds the limit. Backups do not confer access to another account and are not automatic cross-device synchronization.

## Verification performed

Offline tests use synthetic accounts/books and isolated SQLite/IndexedDB. They cover encrypted roundtrip, random salt/nonce, wrong password, tampered data, unknown format, account isolation, vector/PDF/history preservation, repeat restore, role/CSRF/reauthentication gates, in-flight refusal, transaction rollback, session revocation and preserved global spending. Production customer data is never overwritten by this test suite. Actual operational restore time, maximum-scale performance and an off-device backup process remain operator responsibilities.
