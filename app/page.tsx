"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, BookOpen, Check, ChevronRight, FileText, Headphones,
  LoaderCircle, LogOut, Mic, Pause, Play, RotateCcw, ShieldCheck, Sparkles,
  Square, Upload, Volume2, X,
} from "lucide-react";
import { buildStructuralChunks, hybridRetrieve } from "@/lib/retrieval.mjs";

type Stage = "idle" | "reading" | "indexing" | "ready" | "listening" | "transcribing" | "retrieving" | "answering" | "speaking" | "error";
type Chunk = {
  id: string; sectionTitle: string; pageStart: number; pageEnd: number;
  text: string; embedding: number[]; denseScore?: number; sparseScore?: number; fusionScore?: number;
};
type Source = Pick<Chunk, "id" | "sectionTitle" | "pageStart" | "pageEnd" | "text">;
type Exchange = { id: string; question: string; answer: string; sources: Source[] };
type Book = { name: string; pages: number; chapters: number; chunks: number };
type QuotaSnapshot = {
  questions: { used: number; limit: number; remaining: number };
  voice: { usedSeconds: number; limitSeconds: number; remainingSeconds: number };
  isAdmin: boolean;
  user: { username: string; displayName: string };
};

const stageCopy: Record<Stage, string> = {
  idle: "Upload a book to begin", reading: "Reading pages and using OCR when needed…",
  indexing: "Building the book index…", ready: "Ready for your question",
  listening: "Listening… tap to finish", transcribing: "Turning speech into text…",
  retrieving: "Finding the best passages…", answering: "Composing a grounded answer…",
  speaking: "Playing the answer", error: "Something needs attention",
};

function pageLabel(source: Source) {
  return source.pageStart === source.pageEnd ? `p. ${source.pageStart}` : `pp. ${source.pageStart}–${source.pageEnd}`;
}

function AnswerText({ text, onCitation }: { text: string; onCitation: (index: number) => void }) {
  return <p className="answer-copy">{text.split(/(\[S\d+\])/g).map((part, index) => {
    const match = part.match(/^\[S(\d+)\]$/);
    return match ? <button className="citation-chip" key={`${part}-${index}`} onClick={() => onCitation(Number(match[1]) - 1)}>{match[1]}</button> : <span key={index}>{part}</span>;
  })}</p>;
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [book, setBook] = useState<Book | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState("");
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioParts = useRef<Blob[]>([]);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const recordingDurationSeconds = useRef(0);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = !["idle", "ready", "error", "listening", "speaking"].includes(stage);
  const latest = exchanges.at(-1);
  const currentSources = latest?.sources || [];

  useEffect(() => { conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [exchanges, stage]);
  useEffect(() => () => {
    audioPlayer.current?.pause();
    mediaRecorder.current?.stream.getTracks().forEach((track) => track.stop());
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
  }, []);

  useEffect(() => {
    void fetch("/api/quota", { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (response.status === 401) {
          window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (response.ok) setQuota(payload.quota);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const sampleQuestions = useMemo(() => book ? [
    "What is the central argument of this book?",
    "Summarize the most important turning point.",
    "What evidence does the author rely on?",
  ] : [], [book]);

  async function extractPages(file: File) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: Array<{ pageNumber: number; text: string }> = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      text = text.replace(/[ \t]+/g, " ").trim();
      if (text.length < 20) {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 1800 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) throw new Error(`Could not render page ${pageNumber} for OCR.`);
        await page.render({ canvas, canvasContext, viewport }).promise;
        const image = canvas.toDataURL("image/jpeg", 0.86);
        canvas.width = 1;
        canvas.height = 1;
        const response = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, pageNumber }),
        });
        const payload = (await response.json()) as { error?: string; text?: string };
        if (!response.ok) throw new Error(payload.error || `OCR failed on page ${pageNumber}`);
        text = String(payload.text || "").trim();
      }
      pages.push({ pageNumber, text });
      page.cleanup();
      setProgress(Math.round((pageNumber / document.numPages) * 42));
    }
    await document.destroy();
    return { pages, totalPages: document.numPages };
  }

  async function embedTexts(texts: string[]) {
    const vectors: number[][] = [];
    const batchSize = 48;
    for (let index = 0; index < texts.length; index += batchSize) {
      const response = await fetch("/api/embed", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: texts.slice(index, index + batchSize) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Embedding failed");
      vectors.push(...payload.embeddings);
      setProgress(45 + Math.round((Math.min(index + batchSize, texts.length) / texts.length) * 55));
    }
    return vectors;
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file."); setStage("error"); return;
    }
    try {
      stopAudio(); setError(""); setBook(null); setChunks([]); setExchanges([]); setProgress(3); setStage("reading");
      const { pages, totalPages } = await extractPages(file);
      const nonEmptyPages = pages.filter((page) => page.text.length > 20);
      if (!nonEmptyPages.length) throw new Error("No readable text was found, including after OCR.");
      setStage("indexing");
      const structuralChunks = buildStructuralChunks(nonEmptyPages);
      if (!structuralChunks.length) throw new Error("The PDF could not be divided into readable passages.");
      const embeddings = await embedTexts(structuralChunks.map((chunk: Omit<Chunk, "embedding">) => `${chunk.sectionTitle}\n${chunk.text}`));
      const indexed = structuralChunks.map((chunk: Omit<Chunk, "embedding">, index: number) => ({ ...chunk, embedding: embeddings[index] }));
      const chapters = new Set(indexed.map((chunk: Chunk) => chunk.sectionTitle).filter((title: string) => title !== "Front matter")).size;
      setChunks(indexed);
      setBook({ name: file.name.replace(/\.pdf$/i, ""), pages: totalPages, chapters, chunks: indexed.length });
      setProgress(100); setStage("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The book could not be indexed."); setStage("error");
    }
  }

  async function ask(rawQuestion: string) {
    const cleanQuestion = rawQuestion.trim();
    if (!cleanQuestion || !chunks.length || busy) return;
    try {
      stopAudio(); setQuestion(""); setError(""); setStage("retrieving");
      const [queryEmbedding] = await embedTexts([cleanQuestion]); setProgress(100);
      const retrieved = hybridRetrieve(cleanQuestion, queryEmbedding, chunks, 6) as Chunk[];
      setStage("answering");
      const response = await fetch("/api/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, contexts: retrieved.map(({ id, sectionTitle, pageStart, pageEnd, text }) => ({ id, sectionTitle, pageStart, pageEnd, text })) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Answer generation failed");
      if (payload.quota) setQuota(payload.quota);
      const sources = retrieved.map(({ id, sectionTitle, pageStart, pageEnd, text }) => ({ id, sectionTitle, pageStart, pageEnd, text }));
      setExchanges((items) => [...items, { id: crypto.randomUUID(), question: cleanQuestion, answer: payload.answer, sources }]);
      await speak(payload.answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The question could not be answered."); setStage("error");
    }
  }

  async function startRecording() {
    if (!book) return fileInput.current?.click();
    if (stage === "listening") return stopRecording();
    if (busy) return;
    try {
      stopAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      audioParts.current = [];
      recorder.ondataavailable = (event) => event.data.size && audioParts.current.push(event.data);
      recorder.onstop = async () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";
        const durationSeconds = Math.max(1, Math.min(60, recordingDurationSeconds.current));
        await transcribe(new File(audioParts.current, `question.${extension}`, { type: mimeType }), durationSeconds);
      };
      mediaRecorder.current = recorder;
      recordingDurationSeconds.current = 0;
      recorder.start();
      recordingTimer.current = setInterval(() => {
        recordingDurationSeconds.current += 1;
        if (recordingDurationSeconds.current >= 60) stopRecording();
      }, 1_000);
      setStage("listening");
    } catch {
      setError("Microphone access was denied. You can still type a question below."); setStage("error");
    }
  }

  function stopRecording() {
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
  }

  async function transcribe(audio: File, durationSeconds: number) {
    try {
      setStage("transcribing");
      const form = new FormData(); form.append("audio", audio); form.append("durationSeconds", String(durationSeconds));
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Transcription failed");
      if (payload.quota) setQuota(payload.quota);
      if (!payload.text) throw new Error("No speech was detected. Please try again closer to the microphone.");
      setQuestion(payload.text); await ask(payload.text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Speech could not be transcribed."); setStage("error");
    }
  }

  async function speak(text: string) {
    setStage("speaking");
    const response = await fetch("/api/speech", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    });
    if (!response.ok) { const payload = await response.json(); throw new Error(payload.error || "Speech generation failed"); }
    const url = URL.createObjectURL(await response.blob());
    const player = new Audio(url);
    player.onended = () => { URL.revokeObjectURL(url); setIsAudioPaused(false); setStage("ready"); };
    player.onerror = () => { URL.revokeObjectURL(url); setStage("ready"); };
    audioPlayer.current = player; await player.play();
  }

  function stopAudio() {
    if (audioPlayer.current) { audioPlayer.current.pause(); audioPlayer.current = null; }
    setIsAudioPaused(false);
  }

  function toggleAudio() {
    const player = audioPlayer.current; if (!player) return;
    if (player.paused) { void player.play(); setIsAudioPaused(false); }
    else { player.pause(); setIsAudioPaused(true); }
  }

  function resetBook() {
    stopAudio(); setBook(null); setChunks([]); setExchanges([]); setQuestion("");
    setError(""); setProgress(0); setStage("idle");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  if (!authChecked) return <main className="session-loading"><LoaderCircle className="spin" size={24} /><span>Opening your reading desk…</span></main>;

  return (
    <main className="app-shell">
      <input ref={fileInput} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => void handleFile(event.target.files?.[0])} />
      <header className="topbar">
        <button className="brand" onClick={resetBook} aria-label="Return to start"><span className="brand-mark"><BookOpen size={18} strokeWidth={2.4} /></span><span>VOICEBOOK</span></button>
        <div className="quota-note">{quota ? <><b>{quota.questions.remaining}</b> questions · <b>{Math.floor(quota.voice.remainingSeconds / 60)}</b> voice min left today</> : <><span className="privacy-dot" /> Your book stays in this browser session</>}</div>
        <div className="topbar-actions">{quota?.isAdmin && <a className="admin-link" href="/admin"><ShieldCheck size={15} /> Admin</a>}<button className="new-book" onClick={() => fileInput.current?.click()}><Upload size={15} /> {book ? "Change book" : "Upload book"}</button><button className="icon-action" onClick={() => void logout()} aria-label={`Sign out ${quota?.user.username || "user"}`}><LogOut size={15} /></button></div>
      </header>

      <section className="workspace">
        <aside className="book-panel">
          <p className="eyebrow">Your reading desk</p>
          {book ? <>
            <div className="book-cover" aria-label={`${book.name} cover`}><span className="cover-rule" /><BookOpen size={30} /><strong>{book.name}</strong><small>VOICE EDITION</small></div>
            <h1 className="book-title">{book.name}</h1>
            <div className="book-facts"><span><b>{book.pages}</b> pages</span><span><b>{book.chapters || "—"}</b> sections</span><span><b>{book.chunks}</b> passages</span></div>
            <div className="index-ready"><Check size={14} /> Hybrid index ready</div>
            <button className="outline-action" onClick={() => fileInput.current?.click()}><RotateCcw size={14} /> Replace PDF</button>
          </> : <button className="upload-card" onClick={() => fileInput.current?.click()}><span className="upload-icon"><Upload size={22} /></span><strong>Choose a PDF book</strong><span>Long books welcome.<br />Text-based PDFs work best.</span><em>Browse files</em></button>}
          <div className="method-note"><Sparkles size={15} /><p><strong>Beyond basic RAG</strong><br />Heading-aware chunks, dense + BM25 retrieval, rank fusion, and diversified evidence.</p></div>
        </aside>

        <section className="conversation-panel">
          <div className="conversation-scroll">
            {!book && stage === "idle" ? <div className="welcome-state">
              <span className="welcome-kicker">A voice-first reading companion</span><h1>Don’t search the book.<br /><i>Talk</i> to it.</h1>
              <p>Upload a long PDF, ask a question aloud, and hear a grounded answer with passages you can verify.</p>
              <button className="primary-action" onClick={() => fileInput.current?.click()}><FileText size={17} /> Open a PDF book</button>
              <div className="flow-line"><span>01 Upload</span><ChevronRight size={13} /><span>02 Ask</span><ChevronRight size={13} /><span>03 Listen</span></div>
            </div> : exchanges.length === 0 ? <div className="ready-state">
              <div className="orb-small"><Headphones size={28} /></div><p className="eyebrow">The book is listening</p><h2>What would you like to understand?</h2>
              <p>Ask about an argument, event, character, definition, or connection across chapters.</p>
              <div className="sample-grid">{sampleQuestions.map((sample) => <button key={sample} onClick={() => void ask(sample)}>{sample}<ArrowUp size={13} /></button>)}</div>
            </div> : <div className="conversation-list">{exchanges.map((exchange) => <article className="exchange" key={exchange.id}>
              <div className="question-row"><span>You asked</span><p>{exchange.question}</p></div>
              <div className="answer-row"><div className="answer-label"><span className="mini-mark"><Volume2 size={13} /></span> Voicebook</div>
                <AnswerText text={exchange.answer} onCitation={(index) => setActiveSource(exchange.sources[index] || null)} />
                <div className="source-strip">{exchange.sources.slice(0, 4).map((source, index) => <button key={source.id} onClick={() => setActiveSource(source)}><b>{index + 1}</b>{pageLabel(source)} · {source.sectionTitle}</button>)}</div>
              </div>
            </article>)}</div>}
            {busy && <div className="thinking-card"><LoaderCircle className="spin" size={18} /><div><strong>{stageCopy[stage]}</strong><span>{stage === "retrieving" ? "Combining semantic and exact-match signals" : "This usually takes a few seconds"}</span></div></div>}
            {error && <div className="error-card"><X size={17} /><span>{error}</span><button onClick={() => { setError(""); setStage(book ? "ready" : "idle"); }}>Dismiss</button></div>}
            <div ref={conversationEnd} />
          </div>

          <div className="composer-wrap">
            {(stage === "reading" || stage === "indexing") && <div className="progress-block"><span style={{ width: `${progress}%` }} /><p>{stageCopy[stage]} <b>{progress}%</b></p></div>}
            <div className={`voice-composer ${stage === "listening" ? "is-listening" : ""}`}>
              <button className="mic-button" onClick={() => void startRecording()} disabled={busy} aria-label={stage === "listening" ? "Stop recording" : "Ask with microphone"}>{stage === "listening" ? <Square size={19} fill="currentColor" /> : <Mic size={22} />}{stage === "listening" && <span className="pulse-ring" />}</button>
              <form onSubmit={(event) => { event.preventDefault(); void ask(question); }}><label htmlFor="question">{stage === "listening" ? "Listening to your question…" : stageCopy[stage]}</label><input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={book ? "Or type a question…" : "Upload a book first"} disabled={!book || busy || stage === "listening"} /></form>
              {stage === "speaking" ? <button className="send-button audio-control" onClick={toggleAudio} aria-label={isAudioPaused ? "Resume audio" : "Pause audio"}>{isAudioPaused ? <Play size={17} fill="currentColor" /> : <Pause size={17} fill="currentColor" />}</button> : <button className="send-button" onClick={() => void ask(question)} disabled={!question.trim() || !book || busy} aria-label="Send question"><ArrowUp size={18} /></button>}
            </div>
            <p className="ai-disclosure">Voice answers are AI-generated. Verify important details against the cited passages.</p>
          </div>
        </section>

        <aside className="source-panel">
          <div className="source-heading"><div><p className="eyebrow">Evidence desk</p><h2>Retrieved passages</h2></div><span>{currentSources.length}</span></div>
          {currentSources.length ? <div className="source-list">{currentSources.map((source, index) => <button key={source.id} className={activeSource?.id === source.id ? "active" : ""} onClick={() => setActiveSource(source)}><span className="source-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{source.sectionTitle}</strong><small>{pageLabel(source)}</small><p>{source.text.slice(0, 145)}…</p></div></button>)}</div> : <div className="empty-sources"><FileText size={24} /><p>Sources will appear here after your first question.</p></div>}
        </aside>
      </section>

      {activeSource && <div className="source-drawer-backdrop" onClick={() => setActiveSource(null)}><article className="source-drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setActiveSource(null)} aria-label="Close passage"><X size={18} /></button><p className="eyebrow">Source passage · {pageLabel(activeSource)}</p><h2>{activeSource.sectionTitle}</h2><blockquote>{activeSource.text}</blockquote></article></div>}
    </main>
  );
}
