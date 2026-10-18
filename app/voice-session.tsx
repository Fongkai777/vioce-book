"use client";
import { Mic, MicOff, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function VoiceSession({ active, connecting, level, state, muted, transcript, editing, onEdit, onChange, onSend, onDismiss, onMute, onFinish, onEnd }: {
  active: boolean; connecting: boolean; level: number; state: string; muted: boolean; transcript: string; editing: boolean;
  onEdit: () => void; onChange: (text: string) => void; onSend: () => void; onDismiss: () => void; onMute: () => void; onFinish: () => void; onEnd: () => void;
}) {
  const [levels, setLevels] = useState<number[]>(Array(28).fill(0));
  const currentLevel = useRef(level); currentLevel.current = level;
  useEffect(() => {
    if (!active) { setLevels(Array(28).fill(0)); return; }
    const timer = setInterval(() => setLevels(old => [...old.slice(1), currentLevel.current]), 70);
    return () => clearInterval(timer);
  }, [active]);
  if (!active && !connecting && !transcript) return null;
  const processing = state === "listening" || state === "transcribing";
  const label = connecting ? "Connecting microphone…" : !active ? "Review your question" : muted ? "Microphone paused" : state === "listening" ? "I can hear you" : state === "transcribing" ? "Transcribing your words…" : state === "reviewing" ? "Here’s what I heard" : state === "speaking" ? "Voicebook is speaking" : state === "voicing" ? "Preparing voice…" : ["answering", "retrieving", "remembering"].includes(state) ? "Thinking about your question…" : "Listening — go ahead";
  return <section className="voice-session-card" aria-label="Voice conversation">
    <div className="voice-session-top"><span className={`voice-status-dot ${muted ? "muted" : ""}`} /><strong role="status">{label}</strong><div className="voice-waveform" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>{levels.map((value, i) => <i key={i} style={{height: `${3 + value * 29}px`}} />)}</div>
      <button onClick={active || connecting ? onEnd : onDismiss} aria-label={active || connecting ? "End voice conversation" : "Discard question"}><X size={17} /></button>
    </div>
    {(active || connecting) && <><p>{connecting ? "Allow microphone access to begin." : muted ? "The microphone is paused. Resume it when you’re ready to speak." : "Pause to finish a turn. Speak again to interrupt. Headphones help prevent echo."}</p><div className="voice-session-actions"><button disabled={connecting} onClick={onMute}>{muted ? <Mic size={14} /> : <MicOff size={14} />}{muted ? "Resume microphone" : "Mute microphone"}</button>{state === "listening" && <button onClick={onFinish}><Square size={13} /> Done speaking</button>}<button onClick={onEnd}>End voice</button></div></>}
    {transcript && <div className="voice-transcript"><label htmlFor="voice-transcript">You said</label>{editing && !processing ? <textarea id="voice-transcript" maxLength={2000} value={transcript} onChange={event => onChange(event.target.value)} autoFocus /> : <p id="voice-transcript">{transcript}</p>}
      <small>{processing ? "Keeping these words while I listen to the rest. Nothing has been sent yet." : editing ? "Automatic sending is paused. Review the words, then send when ready." : "Replying shortly — edit or cancel if the words are wrong."}</small><div className="voice-session-actions"><button onClick={onSend} disabled={!transcript.trim() || processing}>Send now</button>{!editing && <button onClick={onEdit} disabled={processing}>Edit transcript</button>}<button onClick={onDismiss}>Discard question</button></div>
    </div>}
  </section>;
}
