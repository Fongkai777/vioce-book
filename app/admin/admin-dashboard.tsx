"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";

type ManagedUser = {
  userId: string;
  email: string;
  displayName: string;
  lastSeenAt: string;
  questionCount: number;
  voiceSeconds: number;
  questionLimit: number;
  voiceSecondsLimit: number;
};

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load users");
      setUsers(payload.users); setDate(payload.date);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load users");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/users", { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload })))
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save quota");
      setSaved(user.userId);
      window.setTimeout(() => setSaved((current) => current === user.userId ? null : current), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save quota");
    } finally { setSaving(null); }
  }

  return <main className="admin-shell">
    <header className="admin-header">
      <Link href="/" className="admin-back"><ArrowLeft size={16} /> Back to Voicebook</Link>
      <div className="admin-identity"><ShieldCheck size={17} /><span>Administrator</span><small>{adminEmail}</small></div>
    </header>
    <section className="admin-content">
      <div className="admin-title-row">
        <div><p className="eyebrow">Usage control · {date || "today"}</p><h1>User allowances</h1><p>Each visitor signs in with their own ChatGPT account. Changes apply immediately.</p></div>
        <button className="refresh-button" onClick={() => void loadUsers()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading && !users.length ? <div className="admin-loading"><LoaderCircle className="spin" /> Loading users…</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>User</th><th>Today</th><th>Daily questions</th><th>Daily voice</th><th /></tr></thead>
          <tbody>{users.map((user) => <tr key={user.userId}>
            <td><strong>{user.displayName}</strong><small>{user.email}</small><small>Last seen {new Date(user.lastSeenAt).toLocaleString()}</small></td>
            <td><span>{user.questionCount} questions</span><span>{Math.ceil(user.voiceSeconds / 60)} voice min</span></td>
            <td><input type="number" min="0" max="500" value={user.questionLimit} onChange={(event) => updateUser(user.userId, "questionLimit", Number(event.target.value))} /><span>per day</span></td>
            <td><input type="number" min="0" max="600" step="1" value={user.voiceSecondsLimit / 60} onChange={(event) => updateUser(user.userId, "voiceMinutesLimit", Number(event.target.value))} /><span>minutes</span></td>
            <td><button className="save-quota" onClick={() => void saveUser(user)} disabled={saving === user.userId}>{saving === user.userId ? <LoaderCircle className="spin" size={15} /> : saved === user.userId ? <Check size={15} /> : "Save"}</button></td>
          </tr>)}</tbody>
        </table>{!users.length && <div className="admin-empty">Users will appear after they open Voicebook once.</div>}</div>}
    </section>
  </main>;
}
