"use client";
import { useEffect, useState } from "react";
import { feedbackTagLabels } from "@/lib/personalization";
type Feedback = { user_id: string; exchange_id: string; display_name: string; book_name: string; question: string; answer: string; rating: string; tags: string; comment: string; updated_at: string };
export default function FeedbackList() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/feedback", { cache: "no-store" });
      const data = await response.json() as { feedback: Feedback[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load feedback.");
      setItems(data.feedback);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load feedback."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="admin-feedback"><div className="admin-title-row"><div><p className="eyebrow">Reader feedback</p><h2>Reader feedback</h2><p>The latest 100 submitted reviews. Readers&apos; local conversation histories are not included.</p></div><button className="refresh-button" disabled={loading} onClick={() => void load()}>Refresh feedback</button></div>
    {error && <p role="alert">{error}</p>}
    {!items.length && <p>{loading ? "Loading…" : "No feedback yet."}</p>}
    {items.map(item => <article className="admin-feedback-card" key={`${item.user_id}:${item.exchange_id}`}><div><strong>{item.rating === "helpful" ? "Helpful" : "Needs improvement"} · {item.display_name}</strong><small>{item.book_name} · {new Date(item.updated_at).toLocaleString()}</small></div><p>{item.question}</p><div className="feedback-tags">{(JSON.parse(item.tags) as string[]).map(tag => <span key={tag}>{feedbackTagLabels[tag] || tag}</span>)}</div>{item.comment && <blockquote>{item.comment}</blockquote>}<details><summary>View the submitted answer</summary><p>{item.answer}</p></details></article>)}
  </section>;
}
