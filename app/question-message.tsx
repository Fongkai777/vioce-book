"use client";

// Recognized speech and submitted questions share this single chat bubble.
export default function QuestionMessage({ text, unsent = false, editing = false, processing = false, onChange, onSend, onLeave }: {
  text: string; unsent?: boolean; editing?: boolean; processing?: boolean;
  onChange?: (text: string) => void; onSend?: () => void; onLeave?: () => void;
}) {
  return <div className="question-row">
    <span>You</span>
    {editing && onChange ? <textarea aria-label="Your question" maxLength={2000} value={text} disabled={processing} onChange={event => onChange(event.target.value)} /> : <p>{text}</p>}
    {unsent && <small className="question-status">{processing ? "Transcribing the rest of your message…" : onSend ? "Not sent — your words are kept here." : "Sending automatically…"}</small>}
    {unsent && onSend && <div className="voice-session-actions"><button disabled={processing || !text.trim()} onClick={onSend}>Send question</button>{onLeave && <button onClick={onLeave}>Leave unsent</button>}</div>}
  </div>;
}
