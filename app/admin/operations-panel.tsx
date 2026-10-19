"use client";
import { useCallback, useEffect, useState } from "react";
import { downloadBackup } from "../book-backup-controls";

type Snapshot = { date: string; settings: { enabled: number; daily_budget_micros: number; max_concurrent: number };
  reservedMicros: number; providerRequests: number; requests: number; errors: number; averageMs: number; alerts: string[];
  settledMicros: number; estimatedMicros: number; legacyMicros: number;
  costs: Array<{model: string; policy: string; requests: number; settled_requests: number; settled_micros: number; estimated_micros: number; input_tokens: number; cached_tokens: number; output_tokens: number}>;
  metrics: Array<{route: string; status: number; count: number; total_ms: number; max_ms: number}>;
  audit: Array<{ action: string; created_at: string }> };
async function payload(response: Response) {
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Operation failed");
  return result;
}
export default function OperationsPanel() {
  const [data, setData] = useState<Snapshot | null>(null), [health, setHealth] = useState("Checking…");
  const [budget, setBudget] = useState(5), [concurrency, setConcurrency] = useState(4), [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [passphrase, setPassphrase] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const load = useCallback(async () => {
    const [ops, readiness] = await Promise.all([fetch("/api/admin/operations", {cache: "no-store"}).then(payload),
      fetch("/api/health", {cache: "no-store"}).then(r => r.ok).catch(() => false)]);
    const snapshot = ops as unknown as Snapshot;
    setData(snapshot); setBudget(snapshot.settings.daily_budget_micros / 1_000_000); setConcurrency(snapshot.settings.max_concurrent); setEnabled(Boolean(snapshot.settings.enabled));
    setHealth(readiness ? "Ready · database reachable" : "Not ready · check deployment logs");
  }, []);
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, [load]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : "Operation failed"); }
    finally { setBusy(false); }
  }
  async function save(paused = false) {
    await payload(await fetch("/api/admin/operations", { method: "PATCH", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ dailyBudgetUsd: budget, maxConcurrent: concurrency, enabled: paused ? false : enabled }) }));
    await load(); setMessage(paused ? "AI is paused. Already accepted requests may finish." : "Operations settings saved.");
  }
  async function exportBackup() {
    const backup = await payload(await fetch("/api/admin/backup", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({passphrase,password}) }));
    downloadBackup(backup, `voicebook-server-${new Date().toISOString().slice(0,10)}.backup.json`);
    setPassphrase(""); setPassword(""); setMessage("Encrypted server backup downloaded. Keep its passphrase separately."); await load();
  }
  async function restoreBackup() {
    if (!file || file.size > 6_500_000) throw new Error("Choose a server backup smaller than 6.5 MB.");
    if (!window.confirm("Replace ALL server accounts, quotas, preferences and feedback with this backup? All sessions will be revoked. Download a fresh backup first.")) return;
    await payload(await fetch("/api/admin/backup", {method: "PUT", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ backup: JSON.parse(await file.text()), passphrase, password, confirmation }) }));
    setPassword(""); setPassphrase(""); setConfirmation("");
    setMessage("Restore complete. Sign in again using an administrator from the backup. AI remains paused.");
  }
  return <section className="operations-panel" aria-labelledby="operations-title">
    <div className="admin-title-row"><div><p className="eyebrow">Operations · {data?.date || "today"} · Singapore time</p><h2 id="operations-title">Health, budget & recovery</h2><p>{health}. Provider availability is not probed.</p></div>
      <button className="refresh-button" disabled={busy} onClick={() => void run(load)}>Refresh status</button></div>
    {message && <p className="operations-message" role="status">{message}</p>}
    {data?.alerts.map(alert => <p className="admin-error" key={alert} role="alert">{alert}</p>)}
    <div className="operations-stats">
      <div><strong>${((data?.reservedMicros || 0) / 1_000_000).toFixed(4)} / ${((data?.settings.daily_budget_micros ?? 5_000_000) / 1_000_000).toFixed(2)}</strong><span>Budget used + reserved today</span></div>
      <div><strong>{data?.providerRequests || 0}</strong><span>Accepted provider requests</span></div>
      <div><strong>{data?.errors || 0} / {data?.requests || 0}</strong><span>5xx / monitored requests</span></div>
      <div><strong>{data?.averageMs || 0} ms</strong><span>Mean response latency</span></div>
    </div>
    <form className="operations-form" onSubmit={e => {e.preventDefault(); void run(() => save());}}>
      <label>Daily AI budget (USD)<input type="number" min="0" max="100" step="0.01" value={budget} onChange={e => setBudget(Number(e.target.value))} required disabled={busy || !data} /></label>
      <label>Concurrent AI requests<input type="number" min="1" max="8" value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} required disabled={busy || !data} /></label>
      <label className="operations-checkbox"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={busy || !data} /> AI enabled</label>
      <button className="save-quota" disabled={busy || !data}>Save controls</button>
      <button className="danger-button" type="button" disabled={busy || !data} onClick={() => void run(() => save(true))}>Pause AI now</button>
    </form>
    <p className="inspector-note">Usage-priced: ${((data?.settledMicros || 0) / 1_000_000).toFixed(4)} · Estimates / pending: ${((data?.estimatedMicros || 0) / 1_000_000).toFixed(4)} · Legacy / restored estimates: ${((data?.legacyMicros || 0) / 1_000_000).toFixed(4)}</p>
    <p className="inspector-note">Known models reserve an estimate, then reconcile against validated provider token usage when available. MP3 speech, missing usage and failed requests keep estimates; old records cannot be repriced without usage. This is not a provider invoice. Resets at midnight Singapore time. Keep a separate provider spending limit.</p>
    <details className="backup-panel"><summary>Token usage & cost by model</summary>
      <p>Input includes cached tokens. Output includes reasoning tokens. Prices verified October 19, 2026; unverified providers retain fallback estimates. No conversation content is recorded here.</p>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Model / policy</th><th>Usage-priced / requests</th><th>Input / cached / output tokens</th><th>Usage-priced USD</th><th>Estimated USD</th></tr></thead>
        <tbody>{data?.costs?.map(c => <tr key={`${c.model}:${c.policy}`}><td>{c.model}<br />{c.policy}</td><td>{c.settled_requests} / {c.requests}</td><td>{c.input_tokens} / {c.cached_tokens} / {c.output_tokens}</td><td>${(c.settled_micros / 1_000_000).toFixed(6)}</td><td>${(c.estimated_micros / 1_000_000).toFixed(6)}</td></tr>)}</tbody></table></div>
    </details>
    <details className="backup-panel"><summary>Request metrics & recent changes</summary>
      <p>Login and AI routes only. Counts, status and latency; no prompts or audio. Manual refresh, no scheduled monitoring.</p>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Route</th><th>Status</th><th>Requests</th><th>Mean / max ms</th></tr></thead>
        <tbody>{data?.metrics.map(m => <tr key={`${m.route}:${m.status}`}><td>{m.route}</td><td>{m.status}</td><td>{m.count}</td><td>{Math.round(m.total_ms / m.count)} / {m.max_ms}</td></tr>)}</tbody></table></div>
      <ul>{data?.audit.map((a, i) => <li key={i}>{a.created_at} · {a.action}</li>)}</ul>
    </details>
    <details className="backup-panel"><summary>Encrypted server backup & restore</summary>
      <p>Includes accounts, password hashes, allowances, usage, preferences and submitted feedback. Excludes sessions, API keys, browser books and chats. Manual download only; no cloud copies or scheduled jobs.</p>
      <label>Backup passphrase (12+ characters)<input type="password" autoComplete="new-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} disabled={busy} /></label>
      <label>Current administrator password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
      <button className="refresh-button" disabled={busy || !password || passphrase.length < 12} onClick={() => void run(exportBackup)}>Download server backup</button>
      <details className="restore-danger"><summary>Restore server data — replaces existing records</summary>
        <p>Pause AI, wait for current requests to finish, and download a fresh backup first. Restore replaces server records transactionally, logs everyone out and leaves AI paused. Global reserved spend never decreases. Browser data is untouched.</p>
        <label>Encrypted server backup<input type="file" accept="application/json,.json" onChange={e => setFile(e.target.files?.[0] || null)} disabled={busy} /></label>
        <label>Type RESTORE SERVER DATA<input value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></label>
        <button className="danger-button" disabled={busy || !file || !password || passphrase.length < 12 || confirmation !== "RESTORE SERVER DATA" || Boolean(data?.settings.enabled)} onClick={() => void run(restoreBackup)}>Replace server data</button>
      </details>
    </details>
  </section>;
}
