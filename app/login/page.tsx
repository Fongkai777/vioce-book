"use client";

import { useState } from "react";
import { BookOpen, LoaderCircle, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Login failed");
      const candidate = new URLSearchParams(window.location.search).get("returnTo") || "/";
      window.location.replace(candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
      setLoading(false);
    }
  }

  return <main className="login-shell">
    <section className="login-card">
      <div className="login-brand"><span className="brand-mark"><BookOpen size={20} /></span><span>VOICEBOOK</span></div>
      <div className="login-icon"><LockKeyhole size={25} /></div>
      <p className="eyebrow">Private reading workspace</p>
      <h1>Welcome back</h1>
      <p>Use the account provided by the Voicebook administrator.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-action" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />} Sign in</button>
      </form>
      <small>Accounts are managed by this site, not by ChatGPT.</small>
    </section>
  </main>;
}
