"use client";
import { useState } from "react";
import { exportLocalBook, restoreLocalBook, MAX_LOCAL_BACKUP_BYTES } from "../lib/local-backup.ts";

export function downloadBackup(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function BookBackupControls({ ownerId, bookId, disabled }: { ownerId: string; bookId?: string; disabled: boolean }) {
  const [passphrase, setPassphrase] = useState(""), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function run(restore: boolean) {
    setBusy(true); setMessage("");
    try {
      if (restore) {
        if (!file || file.size > MAX_LOCAL_BACKUP_BYTES) throw new Error("Choose a backup smaller than 75 MB.");
        const name = await restoreLocalBook(ownerId, JSON.parse(await file.text()), passphrase);
        setMessage(`Restored “${name}”. Refresh the page to open it. Existing conversations were preserved.`);
      } else {
        if (!bookId) throw new Error("Select a book first.");
        downloadBackup(await exportLocalBook(ownerId, bookId, passphrase), `voicebook-book-${new Date().toISOString().slice(0,10)}.backup.json`);
        setMessage("Backup downloaded. Keep its passphrase separately; it cannot be recovered.");
      }
      setPassphrase("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Backup operation failed. You can safely retry."); }
    finally { setBusy(false); }
  }
  return <details className="backup-panel"><summary>Backup & restore</summary>
    <p>Download the selected book, original PDF, saved index and conversation history as one encrypted file. No upload or re-indexing. Restore is restricted to this account.</p>
    <label>Backup passphrase (12+ characters)<input type="password" autoComplete="new-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} disabled={busy || disabled} /></label>
    <div className="manager-actions"><button disabled={disabled || busy || !bookId || passphrase.length < 12} onClick={() => void run(false)}>Download selected book</button></div>
    <label>Encrypted book backup<input type="file" accept="application/json,.json" disabled={busy || disabled} onChange={e => setFile(e.target.files?.[0] || null)} /></label>
    <button className="refresh-button" disabled={disabled || busy || !file || passphrase.length < 12} onClick={() => void run(true)}>Restore book</button>
    {message && <p role="status">{message}</p>}{busy && <p role="status">Processing backup… Keep this page open.</p>}
  </details>;
}
