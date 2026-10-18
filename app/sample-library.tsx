"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, CloudDownload, LoaderCircle, X } from "lucide-react";
import type { SampleSummary } from "@/lib/sample-types";

export default function SampleLibrary({ savedIds, disabled, loadingId, onSelect, onClose, selectionError }: {
  savedIds: string[]; disabled: boolean; loadingId: string | null; onSelect: (id: string) => Promise<void>; onClose: () => void; selectionError: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [samples, setSamples] = useState<SampleSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch("/api/samples", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load sample books.");
      const data = await response.json() as { samples: SampleSummary[] };
      if (!controller.signal.aborted) setSamples(data.samples);
    }).catch(() => { if (!controller.signal.aborted) setError("Sample books are temporarily unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <dialog ref={dialog} className="sample-library" aria-labelledby="sample-library-title" onCancel={onClose} onClose={onClose}>
    <button className="sample-close icon-action" aria-label="Close sample library" onClick={onClose}><X size={16} /></button>
    <div className="sample-library-heading"><CloudDownload size={20} /><div><h2 id="sample-library-title">Try a sample book</h2><p>No PDF needed. Ready-made indexes, private conversations.</p></div></div>
    <p className="sample-library-note">Original AI-authored short guides for this demo. Selecting one saves a copy to your account’s library in this browser. Your uploads and chats are never added to this shared catalogue.</p>
    {loading && <p role="status">Loading samples…</p>}
    {error && <p role="alert">{error} <button onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {selectionError && <p role="alert" className="sample-error">{selectionError}</p>}
    <div className="sample-book-grid">{samples.map(sample => <article key={sample.id}>
      <BookOpen size={22} /><h3>{sample.name}</h3><p>{sample.description}</p><small>{sample.chapters} chapters · Pre-indexed · English</small>
      <p className="sample-prompt">Try asking: “{sample.suggestedQuestion}”</p>
      <button onClick={() => void onSelect(sample.id)} disabled={disabled}>
        {loadingId === sample.id && <LoaderCircle className="spin" size={14} />}
        {loadingId === sample.id ? "Opening sample…" : savedIds.includes(sample.id) ? "Open my copy" : "Use this sample"}
      </button>
    </article>)}</div>
  </dialog>;
}
