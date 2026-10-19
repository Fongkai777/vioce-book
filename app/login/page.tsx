"use client";

import { useEffect, useState } from "react";
import { BookOpen, LoaderCircle, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [places, setPlaces] = useState<number | null>(null);
  const [statusError, setStatusError] = useState(false);

  async function refreshPlaces() {
    try {
      const response = await fetch("/api/auth/register", { cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json() as { remaining: number };
      setPlaces(data.remaining); setStatusError(false);
    } catch { setStatusError(true); setPlaces(null); }
  }
  useEffect(() => { void refreshPlaces(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (registering && password !== confirmation) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Login failed");
      if (registering) {
        setRegistering(false); setPassword(""); setConfirmation(""); setLoading(false);
        setNotice("Your account is ready. Sign in with your new password.");
        void refreshPlaces(); return;
      }
      const candidate = new URLSearchParams(window.location.search).get("returnTo") || "/";
      window.location.replace(candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
      setLoading(false);
      if (registering) void refreshPlaces();
    }
  }

  return <main className="login-shell">
    <section className="login-card">
      <div className="login-brand"><span className="brand-mark"><BookOpen size={20} /></span><span>VOICEBOOK</span></div>
      <div className="login-icon"><LockKeyhole size={25} /></div>
      <p className="eyebrow">Private reading workspace</p>
      <h1>{registering ? "Start reading" : "Welcome back"}</h1>
      <p>{registering ? "Create your own reading account. Your books and conversations stay separate from other readers." : "Sign in to your reading workspace, or create an account below."}</p>
      {notice && <div className="login-success" role="status">{notice}</div>}
      {registering && <div className="registration-status" role="status">
        <strong>{statusError ? "Registration availability could not be loaded." : places === null ? "Checking availability…" : `${places} of 2 places left today`}</strong>
        <p>Two self-created accounts per day across the whole site. Resets at midnight Singapore time (UTC+8). Administrator-created accounts are separate.</p>
        <p>Includes up to 20 questions and 10 minutes of voice input daily, subject to the site&apos;s shared AI budget.</p>
        {statusError && <button type="button" className="login-switch" onClick={() => void refreshPlaces()}>Check again</button>}
      </div>}
      <form onSubmit={(event) => void submit(event)}>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={32} minLength={registering ? 3 : undefined} required autoFocus disabled={loading} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 10 : undefined} maxLength={128} required disabled={loading} /></label>
        {registering && <>
          <small className="password-help">Username: 3–32 letters, numbers, dots, dashes, or underscores; not case-sensitive. Password: 10–128 characters.</small>
          <label>Confirm password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required disabled={loading} /></label>
        </>}
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="primary-action" disabled={loading || (registering && (places === null || places === 0))}>{loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />} {registering ? "Create account" : "Sign in"}</button>
      </form>
      <button type="button" className="login-switch" disabled={loading} onClick={() => {
        setRegistering(!registering); setPassword(""); setConfirmation(""); setError(""); setNotice("");
        if (!registering) void refreshPlaces();
      }}>{registering ? "Already have an account? Sign in" : "New to Voicebook? Create an account"}</button>
      <small>Accounts are managed by this site, not by ChatGPT.</small>
    </section>
  </main>;
}
