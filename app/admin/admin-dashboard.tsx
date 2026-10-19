"use client";

import FeedbackList from "./feedback-list";
import OperationsPanel from "./operations-panel";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";

type ManagedUser = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  lastSeenAt: string;
  questionCount: number;
  voiceSeconds: number;
  questionLimit: number;
  voiceSecondsLimit: number;
};

export default function AdminDashboard({ adminUsername }: { adminUsername: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json() as { error?: string; users: ManagedUser[]; date: string };
      if (!response.ok) throw new Error(payload.error || "Could not load users");
      setUsers(payload.users); setDate(payload.date);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load users");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/users", { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload: payload as { error?: string; users: ManagedUser[]; date: string } })))
      .then(({ response, payload }) => {
        if (!response.ok) throw new Error(payload.error || "Could not load users");
        if (active) { setUsers(payload.users); setDate(payload.date); }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load users"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateUser(userId: string, field: "questionLimit" | "voiceMinutesLimit", value: number) {
    setUsers((items) => items.map((item) => item.userId === userId ? {
      ...item,
      ...(field === "questionLimit" ? { questionLimit: value } : { voiceSecondsLimit: Math.round(value * 60) }),
    } : item));
  }

  async function saveUser(user: ManagedUser) {
    setSaving(user.userId); setSaved(null); setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          questionLimit: user.questionLimit,
          voiceMinutesLimit: user.voiceSecondsLimit / 60,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save quota");
      setSaved(user.userId);
      window.setTimeout(() => setSaved((current) => current === user.userId ? null : current), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save quota");
    } finally { setSaving(null); }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault(); setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, displayName: newDisplayName, password: newPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not create user");
      setNewUsername(""); setNewDisplayName(""); setNewPassword("");
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create user");
    } finally { setCreating(false); }
  }

  return <main className="admin-shell">
    <header className="admin-header">
      {/* Use a full-page navigation: the deployed router's client transition fails here. */}
      <a href="/" className="admin-back"><ArrowLeft size={16} /> Back to Voicebook</a>
      <div className="admin-identity"><ShieldCheck size={17} /><span>Administrator</span><small>{adminUsername}</small></div>
    </header>
    <section className="admin-content">
      <OperationsPanel />
      <div className="admin-title-row">
        <div><p className="eyebrow">Usage control · {date || "today"}</p><h1>User allowances</h1><p>Create login accounts for reviewers, then adjust their daily limits at any time.</p></div>
        <button className="refresh-button" onClick={() => void loadUsers()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <form className="create-user-card" onSubmit={(event) => void createUser(event)}>
        <div><UserPlus size={19} /><span><strong>Create reviewer account</strong><small>Passwords are stored as one-way hashes.</small></span></div>
        <input aria-label="Display name" placeholder="Display name" value={newDisplayName} onChange={(event) => setNewDisplayName(event.target.value)} />
        <input aria-label="Username" placeholder="Username" autoComplete="off" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} required />
        <input aria-label="Temporary password" placeholder="Temporary password (10+ characters)" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required />
        <button className="save-quota" disabled={creating}>{creating ? <LoaderCircle className="spin" size={15} /> : "Create"}</button>
      </form>
      {loading && !users.length ? <div className="admin-loading"><LoaderCircle className="spin" /> Loading users…</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>User</th><th>Today</th><th>Daily questions</th><th>Daily voice</th><th /></tr></thead>
          <tbody>{users.map((user) => <tr key={user.userId}>
            <td><strong>{user.displayName}</strong><small>@{user.username}</small><small>Last seen {new Date(user.lastSeenAt).toLocaleString()}</small></td>
            <td><span>{user.questionCount} questions</span><span>{Math.ceil(user.voiceSeconds / 60)} voice min</span></td>
            <td><input type="number" min="0" max="500" value={user.questionLimit} onChange={(event) => updateUser(user.userId, "questionLimit", Number(event.target.value))} /><span>per day</span></td>
            <td><input type="number" min="0" max="600" step="1" value={user.voiceSecondsLimit / 60} onChange={(event) => updateUser(user.userId, "voiceMinutesLimit", Number(event.target.value))} /><span>minutes</span></td>
            <td><button className="save-quota" onClick={() => void saveUser(user)} disabled={saving === user.userId}>{saving === user.userId ? <LoaderCircle className="spin" size={15} /> : saved === user.userId ? <Check size={15} /> : "Save"}</button></td>
          </tr>)}</tbody>
        </table>{!users.length && <div className="admin-empty">Users will appear after they open Voicebook once.</div>}</div>}
      <FeedbackList />
    </section>
  </main>;
}
