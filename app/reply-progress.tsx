"use client";
import { LoaderCircle, Square, Volume2 } from "lucide-react";

export default function ReplyProgress({ label, detail, speaking = false, onStop }: {
  label: string; detail: string; speaking?: boolean; onStop: () => void;
}) {
  return <div className="thinking-card reply-progress" aria-label="Assistant reply">
    {speaking ? <Volume2 size={18} /> : <LoaderCircle className="spin" size={18} />}
    <div role="status"><strong>{label}</strong><span>{detail}</span></div>
    <button className="stop-reply" onClick={onStop}><Square size={13} /> Stop reply</button>
  </div>;
}
