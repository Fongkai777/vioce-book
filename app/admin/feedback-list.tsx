"use client";
import { useEffect, useState } from "react";
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
      if (!response.ok) throw new Error(data.error || "反馈读取失败");
      setItems(data.feedback);
    } catch (e) { setError(e instanceof Error ? e.message : "读取失败"); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="admin-feedback"><div className="admin-title-row"><div><p className="eyebrow">Reader feedback</p><h2>用户反馈</h2><p>最近 100 条主动提交的评价；不包含用户的本机对话历史。</p></div><button className="refresh-button" disabled={loading} onClick={() => void load()}>刷新反馈</button></div>
    {error && <p role="alert">{error}</p>}
    {!items.length && <p>{loading ? "正在加载…" : "还没有收到反馈。"}</p>}
    {items.map(item => <article className="admin-feedback-card" key={`${item.user_id}:${item.exchange_id}`}><div><strong>{item.rating === "helpful" ? "有帮助" : "需要改进"} · {item.display_name}</strong><small>{item.book_name} · {new Date(item.updated_at).toLocaleString()}</small></div><p>{item.question}</p><div className="feedback-tags">{(JSON.parse(item.tags) as string[]).map(tag => <span key={tag}>{tag}</span>)}</div>{item.comment && <blockquote>{item.comment}</blockquote>}<details><summary>查看用户提交的回答</summary><p>{item.answer}</p></details></article>)}
  </section>;
}
