# Voicebook user guide

[中文](USER-MANUAL.zh-CN.md) · [Project overview](../README.md) · [Live app](https://voicebook-rag-demo.deep-hare-2593.chatgpt.site)

Voicebook lets you ask spoken questions about one selected book, hear answers, and inspect the passages behind them. Use the site's own account: no ChatGPT account or personal API key is required.

## Five-minute walkthrough

1. Choose **New to Voicebook? Create an account**, register, then **Sign in**. Self-registration has two places per Singapore calendar day; ask the administrator for a regular reviewer account if full.
2. Choose **Try a sample → Use this sample**, or **Upload a PDF**. For assignment acceptance, use the [complete 12-chapter PDF](../output/pdf/alice-in-wonderland.pdf); the short samples are only a quick introduction.
3. Check **NOW READING**, then press **Start voice conversation** and allow microphone access. Headphones reduce speaker echo. Wait for **Listening — go ahead**.
4. Ask a question and pause, or press **Done speaking**. The level meter shows incoming sound; after transcription, your words appear in a **You** chat message and send automatically. Transcription is per utterance, not word-by-word live captions.
5. The answer plays automatically. Follow a numbered citation, then **View in book → View PDF page** when a source PDF and reliable page number are available. Citations help verification; they do not guarantee correctness.
6. Ask a follow-up. Speak to interrupt playback, or use **Stop reply** beside the assistant response. **End voice** closes the microphone. Noise and recognition errors can affect interruption.
7. Open **Reading preferences**, change **Tone**, **Answer length** or **Custom preferences**, and **Save preferences**. Compare a new answer. These settings guide responses; they do not train the model.

Suggested questions work without a microphone. There is no general free-form text composer. If an exceptional voice message is marked **Not sent**, edit it in its chat bubble and choose **Send question** or **Leave unsent**. Unsent text is not included as a submitted question.

## Library, evidence and history

- **Local library** holds multiple books. Reopening one reuses its saved text, vectors and BM25 statistics; old BM25 caches upgrade locally without another embedding call. End voice before switching books.
- **Book management → Overview** shows readiness and counts. **Content** previews the PDF or text edition; **Show passages** searches the saved excerpts. Inspection does not re-index the book or change the active conversation.
- Text PDFs are extracted in the browser. Pages without sufficient text use cloud OCR and can take longer. Review extraction when answers look wrong.
- Private PDFs, indexes and chat history stay in account-scoped browser storage, not a synchronized cloud library. Relevant audio, pages, text and context still go to configured AI services when those features are used. Account scoping is not disk encryption.
- History saving is on by default. Short chats use all previous turns; long chats use summaries and relevant older messages within an application context budget. Original history remains stored, but model recall is not perfect.
- Turning history saving off **clears this account's saved conversations in this browser**, not just future saving. Removing a book removes its local copy and related history. Back up first.
- **Book management → Backup & restore → Download selected book** exports one encrypted book backup, including available PDF/index and saved chat. Keep its passphrase separately. Restore while signed in to the same account; other accounts cannot import it. Clearing browser data or switching devices does not automatically restore private books.

## Preferences and feedback

Saved preferences affect future answers; an explicit instruction in the current question takes priority. A rating sends that question, answer and feedback to the administrator, but does not silently rewrite the answer or change preferences. The rewrite action uses one question allowance. Saving written feedback as a preference is a separate, explicit action. Do not submit private information you do not want the administrator to read.

## Allowances and errors

The header shows remaining daily questions and input voice time. Defaults are 20 questions and 10 input minutes, resetting at midnight in Singapore; administrator overrides may differ. Voice time is recorded input, not assistant playback or time spent on the page.

Server-caused failures—budget/pause/concurrency rejection, provider errors or invalid output—automatically return the failed request's personal allowance. User cancellation does not. Successful earlier steps, such as transcription or search, remain charged if the answer later fails; a successful empty transcription may also use voice allowance. Retry/rewrite is another request. Global cost reserves and supplier charges are separate and are not refunded by this policy. Contact the administrator if an allowance refund is missing; database outages can prevent its write.

## Common questions

| Problem | What to do |
| --- | --- |
| Registration is full | Wait until the next Singapore day or request an administrator-created regular account. |
| Forgotten password or disabled account | Contact the administrator, who can reset a regular user's password or enable the account after checking identity. Old sessions are revoked; sign in again. There is no email self-service recovery. |
| Microphone is silent | Check browser/OS permissions, input device and **Mute microphone**; restart voice mode. |
| Meter moves but no words appear | Sound was detected but recognition found no usable words. Reduce noise, move closer and check whether earlier words were retained in chat. |
| Answer text appears without sound | Check output volume and tab mute; use **Play saved audio** if offered. Speech generation can fail independently of the written answer. |
| Reply failed / paused / busy / budget reached | Check the allowance display, retry later, or ask the administrator to inspect the site budget and health. Refreshing does not reset quota. |
| PDF processing is slow | OCR and first-time indexing take time. Keep the tab open and avoid duplicate uploads; try a sample for a quick start. |
| PDF page is unavailable | Samples and older imported books may contain text only. Use **Content** or **Show passages**; unknown page numbers are not invented. |
| Books disappeared on another device | Private libraries are browser-local. Restore a previously exported backup with the same account. |
| A stopped question remains in chat | This is intentional. **Retry reply** updates that message without duplicating it; refresh never restarts paid requests automatically. |

## Administrator essentials

Open **Admin** after signing in as an administrator. Give reviewers regular accounts, never administrator credentials.

- **Create reviewer account** bypasses the two-per-day self-registration limit, not AI allowances or global cost controls.
- **User allowances** shows usage and lets you save daily question/voice limits. Changing a limit does not reset today's consumption.
- **Disable / Enable / Reset password** applies only to regular users. Confirm your own administrator password; password resets require a new 10–128-character user password. Changes revoke target sessions, preserve data and usage, and create an audit event. A password reset does not enable a disabled account. Verify identity and deliver credentials privately. There is no forced next-login password change.
- The panel cannot change yourself or another administrator. Administrator recovery requires the deployment maintainer; changing bootstrap environment variables does not reset an existing password.
- **Health, budget & recovery** controls the daily global estimate (default US$5), concurrency and emergency pause. It is not a supplier billing cap. Review submitted feedback here/in the admin feedback view; this does not expose every private local chat or book.
- **Encrypted server backup & restore** is a manual server-data backup, distinct from browser book backups. Restore replaces server data and is not a normal reviewer step. Follow the [operations](OPERATIONS.md) and [backup](BACKUP-RESTORE.md) guides.

Before sharing the demo, confirm reviewer access, available quota, AI not paused, and sample availability. Current deployment and historical acceptance evidence are linked separately in the [project overview](../README.md).
