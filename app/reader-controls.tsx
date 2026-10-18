"use client";
import { useState } from "react";
import { SlidersHorizontal, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { feedbackTags, type Preferences } from "@/lib/personalization";

export function ReaderSettings({ preferences, onSave, onClear, disabled }: { preferences: Preferences; onSave: (p: Preferences) => Promise<void>; onClear: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <>
    <button className="reader-settings-button" disabled={disabled} onClick={() => { setDraft(preferences); setError(""); setOpen(true); }}><SlidersHorizontal size={15} /> 阅读偏好</button>
    {open && <div className="source-drawer-backdrop"><section className="reader-settings" role="dialog" aria-modal="true" aria-label="阅读偏好">
      <button className="drawer-close" aria-label="关闭偏好" disabled={saving} onClick={() => setOpen(false)}><X size={18} /></button>
      <p className="eyebrow">Make it yours</p><h2>按你的方式读书</h2><p className="settings-description">偏好随账号保存，影响之后的回答，不改变原文事实。</p>
      <label>语气<select value={draft.tone} onChange={e => setDraft({ ...draft, tone: e.target.value })}><option value="natural">自然直接</option><option value="friendly">亲切易懂</option><option value="academic">严谨深入</option></select></label>
      <label>回答长度<select value={draft.length} onChange={e => setDraft({ ...draft, length: e.target.value })}><option value="brief">简短</option><option value="balanced">适中</option><option value="detailed">详细</option></select></label>
      <label>我的偏好<textarea maxLength={600} value={draft.guidance} onChange={e => setDraft({ ...draft, guidance: e.target.value })} placeholder="例如：先给结论，解释专业词汇，少用列表。" /></label>
      <label className="history-checkbox"><input type="checkbox" checked={draft.rememberHistory} onChange={e => setDraft({ ...draft, rememberHistory: e.target.checked })} /> 在本机保留每本书最近 20 轮对话</label>
      <p className="settings-description">同一账号、同一本书隔离保存。提问时仅发送最近 3 轮辅助理解追问；不自动生成长期人物画像。关闭后会清除本机已保存的历史。</p>
      <div className="settings-actions"><button type="button" disabled={saving} onClick={onClear}>清空本机对话</button><button className="primary-action" disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await onSave(draft); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setSaving(false); } }}>{saving ? "保存中…" : "保存偏好"}</button></div>
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
  const instruction = [...tags, comment.trim()].filter(Boolean).join("；");
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exchangeId: exchange.id, question: exchange.question, answer: exchange.answer, bookName, rating, tags, comment }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "提交失败");
      setMessage("评价已提交，谢谢你。不会自动变成长期偏好。"); setOpen(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : "提交失败，请重试"); } finally { setSaving(false); }
  }
  return <div className="answer-feedback">
    <div className="feedback-actions"><span>这次回答有帮助吗？</span><button aria-label="有帮助" aria-pressed={rating === "helpful"} onClick={() => { setRating("helpful"); setOpen(true); setMessage(""); }}><ThumbsUp size={14} /></button><button aria-label="需要改进" aria-pressed={rating === "unhelpful"} onClick={() => { setRating("unhelpful"); setOpen(true); setMessage(""); }}><ThumbsDown size={14} /></button></div>
    {open && <div className="feedback-editor">
      <div className="feedback-tags">{feedbackTags.map(tag => <button key={tag} aria-pressed={tags.includes(tag)} onClick={() => setTags(tags.includes(tag) ? tags.filter(x => x !== tag) : [...tags, tag])}>{tag}</button>)}</div>
      <textarea aria-label="回答修改建议" value={comment} maxLength={1000} onChange={e => setComment(e.target.value)} placeholder="希望怎样改进？例如：更口语一些，先回答核心问题。" />
      <p>提交评价会将本次问题、回答和建议发送给管理员。不会上传其他聊天或完整书籍。</p>
      <div className="settings-actions"><button disabled={saving || disabled || !instruction} onClick={() => onRewrite(instruction)}>按建议重答（1 次额度）</button><button disabled={saving || disabled || !comment.trim()} onClick={async () => { setSaving(true); try { await onRemember(comment.trim()); setMessage("已添加到个人偏好，可在阅读偏好中修改。"); } catch (e) { setMessage(e instanceof Error ? e.message : "保存失败"); } finally { setSaving(false); } }}>将文字建议记为偏好</button><button disabled={saving} onClick={() => void save()}>{saving ? "提交中…" : "提交评价"}</button></div>
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}
