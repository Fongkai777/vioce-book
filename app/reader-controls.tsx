"use client";
import { useState } from "react";
import { SlidersHorizontal, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { feedbackTags, feedbackTagLabels, type Preferences } from "@/lib/personalization";

export function ReaderSettings({ preferences, onSave, onClear, disabled }: { preferences: Preferences; onSave: (p: Preferences) => Promise<void>; onClear: () => Promise<void>; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <>
    <button className="reader-settings-button" disabled={disabled} onClick={() => { setDraft(preferences); setError(""); setOpen(true); }}><SlidersHorizontal size={15} /> Reading preferences</button>
    {open && <div className="source-drawer-backdrop"><section className="reader-settings" role="dialog" aria-modal="true" aria-label="Reading preferences">
      <button className="drawer-close" aria-label="Close preferences" disabled={saving} onClick={() => setOpen(false)}><X size={18} /></button>
      <p className="eyebrow">Make it yours</p><h2>Read your way</h2><p className="settings-description">Preferences are saved to your account and shape future replies, without changing the book's facts.</p>
      <label>Tone<select value={draft.tone} onChange={e => setDraft({ ...draft, tone: e.target.value })}><option value="natural">Natural and direct</option><option value="friendly">Friendly and accessible</option><option value="academic">Precise and in-depth</option></select></label>
      <label>Answer length<select value={draft.length} onChange={e => setDraft({ ...draft, length: e.target.value })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label>
      <label>Custom preferences<textarea maxLength={600} value={draft.guidance} onChange={e => setDraft({ ...draft, guidance: e.target.value })} placeholder="For example: start with the conclusion, explain technical terms, and use fewer lists." /></label>
      <label className="history-checkbox"><input type="checkbox" checked={draft.rememberHistory} onChange={e => setDraft({ ...draft, rememberHistory: e.target.checked })} /> Save each book's conversations on this device</label>
      <p className="settings-description">History is separated by account and book, with no turn-count limit. Short conversations use all prior messages; longer ones use summaries and relevant original messages. Summaries never replace originals or automatically change preferences.</p>
      <p className="settings-description">History and summaries stay in this browser, not across devices. Clearing browser data removes them. Summarizing uses the model but no extra question allowance. Turning saving off clears local history; this page can continue the current conversation.</p>
      <div className="settings-actions"><button type="button" disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await onClear(); } catch { setError("Could not clear history. Please try again."); } finally { setSaving(false); } }}>Clear local conversations</button><button className="primary-action" disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await onSave(draft); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : "Could not save changes."); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save preferences"}</button></div>
      {error && <p role="alert">{error}</p>}
    </section></div>}
  </>;
}

export function AnswerFeedback({ exchange, bookName, disabled, onRewrite, onRemember }: {
  exchange: { id: string; question: string; answer: string }; bookName: string; disabled: boolean;
  onRewrite: (instruction: string) => void; onRemember: (instruction: string) => Promise<void>;
}) {
  const [rating, setRating] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const instruction = [...tags.map(tag => feedbackTagLabels[tag] || tag), comment.trim()].filter(Boolean).join("; ");
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exchangeId: exchange.id, question: exchange.question, answer: exchange.answer, bookName, rating, tags, comment }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not submit feedback.");
      setMessage("Feedback submitted. It will not automatically become a saved preference."); setOpen(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not submit feedback. Please try again."); } finally { setSaving(false); }
  }
  return <div className="answer-feedback">
    <div className="feedback-actions"><span>Was this answer helpful?</span><button aria-label="Helpful" aria-pressed={rating === "helpful"} onClick={() => { setRating("helpful"); setOpen(true); setMessage(""); }}><ThumbsUp size={14} /></button><button aria-label="Needs improvement" aria-pressed={rating === "unhelpful"} onClick={() => { setRating("unhelpful"); setOpen(true); setMessage(""); }}><ThumbsDown size={14} /></button></div>
    {open && <div className="feedback-editor">
      <div className="feedback-tags">{feedbackTags.map(tag => <button key={tag} aria-pressed={tags.includes(tag)} onClick={() => setTags(tags.includes(tag) ? tags.filter(x => x !== tag) : [...tags, tag])}>{feedbackTagLabels[tag] || tag}</button>)}</div>
      <textarea aria-label="Suggested improvements" value={comment} maxLength={1000} onChange={e => setComment(e.target.value)} placeholder="How could this improve? For example: use everyday language and answer the main question first." />
      <p>Submitting feedback shares this question, answer and suggestion with the administrator. Other messages and the full book are not uploaded.</p>
      <div className="settings-actions"><button disabled={saving || disabled || !instruction} onClick={() => onRewrite(instruction)}>Rewrite (1 question)</button><button disabled={saving || disabled || !comment.trim()} onClick={async () => { setSaving(true); try { await onRemember(comment.trim()); setMessage("Added to your preferences. You can edit it in Reading preferences."); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save changes."); } finally { setSaving(false); } }}>Save suggestion as preference</button><button disabled={saving} onClick={() => void save()}>{saving ? "Submitting…" : "Submit feedback"}</button></div>
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}
