"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, BookOpen, ChevronRight, FileText, Headphones,
  Library, LoaderCircle, LogOut, Mic, Pause, Play, Plus, ShieldCheck, Sparkles,
  Square, Trash2, Upload, Volume2, X,
} from "lucide-react";
import {
  deleteBook, fingerprintBook, getBook, listBooks, markBookOpened, saveBook, summary,
  type BookSummary, type StoredBook, type StoredChunk,
} from "@/lib/book-library";
import { buildStructuralChunks, hybridRetrieve } from "@/lib/retrieval.mjs";
import { parseBookBundle } from "@/lib/book-import.mjs";
import { defaultPreferences, retrievalQuestion, type Preferences } from "@/lib/personalization";
import { clearHistory, loadHistory, loadSummaries, saveHistory, type SummaryCache } from "@/lib/reading-history";
import { buildConversationContext } from "@/lib/conversation-context";
import { AnswerFeedback, ReaderSettings } from "./reader-controls";

type Stage = "idle" | "reading" | "indexing" | "ready" | "listening" | "transcribing" | "remembering" | "retrieving" | "answering" | "speaking" | "error";
type Chunk = StoredChunk & { denseScore?: number; sparseScore?: number; fusionScore?: number };
type Source = Pick<Chunk, "id" | "sectionTitle" | "pageStart" | "pageEnd" | "text">;
type Exchange = { id: string; question: string; answer: string; sources: Source[] };
type QuotaSnapshot = {
  questions: { used: number; limit: number; remaining: number };
  voice: { usedSeconds: number; limitSeconds: number; remainingSeconds: number };
  isAdmin: boolean;
  user: { userId: string; username: string; displayName: string };
};

const stageCopy: Record<Stage, string> = {
  idle: "Upload a book to begin", reading: "Reading pages and using OCR when needed…",
  indexing: "Building the book index…", ready: "Ready for your question",
  listening: "Listening… tap to finish", transcribing: "Turning speech into text…",
  retrieving: "Finding the best passages…", answering: "Composing a grounded answer…",
  remembering: "整理较早对话，保留完整原始记录…",
  speaking: "Playing the answer", error: "Something needs attention",
};

function pageLabel(source: Source) {
  if (!source.pageStart) return "Saved passage · page unavailable";
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
  const [book, setBook] = useState<BookSummary | null>(null);
  const [library, setLibrary] = useState<BookSummary[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState("");
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const summaries = useRef<SummaryCache>({});
  const [contextNote, setContextNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bundleInput = useRef<HTMLInputElement>(null);
  const importLock = useRef(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioParts = useRef<Blob[]>([]);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const recordingDurationSeconds = useRef(0);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = !["idle", "ready", "error", "listening", "speaking"].includes(stage);
  const bookTransitionBlocked = !preferencesReady || importing || !!openingBookId || !["idle", "ready", "error", "speaking"].includes(stage);
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
      .then((response) => response.json().then((payload) => ({ response, payload: payload as { quota: QuotaSnapshot } })))
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

  useEffect(() => {
    const ownerId = quota?.user.userId;
    if (!ownerId) return;
    let cancelled = false;
    void listBooks(ownerId)
      .then((books) => { if (!cancelled) setLibrary(books); })
      .catch(() => { if (!cancelled) setError("Your local book library could not be opened."); })
      .finally(() => { if (!cancelled) setLibraryReady(true); });
    return () => { cancelled = true; };
  }, [quota?.user.userId]);

  useEffect(() => {
    if (!quota?.user.userId) return;
    void fetch("/api/preferences", { cache: "no-store" }).then(async response => {
      const data = await response.json() as { preferences: Preferences; error?: string };
      if (!response.ok) throw new Error(data.error || "偏好读取失败");
      setPreferences(data.preferences);
      if (!data.preferences.rememberHistory) await clearHistory(quota.user.userId);
      setPreferencesReady(true);
    }).catch(() => setError("阅读偏好暂时无法加载，请刷新后重试。"));
  }, [quota?.user.userId]);

  async function clearReadingHistory() {
    if (!quota || !window.confirm("清空这个账号在本机保存的全部对话？书籍和索引不受影响。")) return;
    await clearHistory(quota.user.userId); summaries.current = {}; setContextNote(""); setExchanges([]); stopAudio();
  }

  async function savePreferences(next: Preferences) {
    const response = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const data = await response.json() as { preferences: Preferences; error?: string };
    if (!response.ok) throw new Error(data.error || "偏好保存失败");
    setPreferences(data.preferences);
    if (!data.preferences.rememberHistory && quota) await clearHistory(quota.user.userId);
    if (data.preferences.rememberHistory && quota && book) await saveHistory(quota.user.userId, book.id, exchanges, summaries.current);
  }

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

  async function embedTexts(texts: string[], model = "text-embedding-3-small", purpose = "index") {
    const vectors: number[][] = [];
    const batchSize = 48;
    for (let index = 0; index < texts.length; index += batchSize) {
      const response = await fetch("/api/embed", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: texts.slice(index, index + batchSize), model, purpose }),
      });
      const payload = await response.json() as { error?: string; embeddings: number[][] };
      if (!response.ok) throw new Error(payload.error || "Embedding failed");
      vectors.push(...payload.embeddings);
      setProgress(45 + Math.round((Math.min(index + batchSize, texts.length) / texts.length) * 55));
    }
    return vectors;
  }

  function bookSummary(stored: StoredBook): BookSummary {
    return summary(stored);
  }

  async function openStoredBook(bookId: string) {
    const ownerId = quota?.user.userId;
    if (!ownerId || bookTransitionBlocked) return;
    try {
      setOpeningBookId(bookId);
      stopAudio();
      setError("");
      const stored = await getBook(ownerId, bookId);
      if (!stored) throw new Error("This book is no longer available in the local library.");
      const history = preferences.rememberHistory ? await loadHistory<Exchange>(ownerId, bookId) : [];
      const memory = preferences.rememberHistory ? await loadSummaries(ownerId, bookId) : {};
      setBook(bookSummary(stored));
      setChunks(stored.index);
      setExchanges(history);
      summaries.current = memory;
      setContextNote("");
      setQuestion("");
      setActiveSource(null);
      setProgress(100);
      setStage("ready");
      setLibraryOpen(false);
      await markBookOpened(ownerId, stored.id);
      setLibrary(await listBooks(ownerId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The saved book could not be opened.");
      setStage("error");
    } finally {
      setOpeningBookId(null);
    }
  }

  async function removeLibraryBook(bookId: string, name: string) {
    const ownerId = quota?.user.userId;
    if (!ownerId || bookTransitionBlocked || !window.confirm(`Remove “${name}” from this browser's library?`)) return;
    try {
      await deleteBook(ownerId, bookId);
      await clearHistory(ownerId, bookId);
      const books = await listBooks(ownerId);
      setLibrary(books);
      if (book?.id === bookId) resetBook();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The book could not be removed.");
      setStage("error");
    }
  }

  async function handleFile(file?: File) {
    if (!file || bookTransitionBlocked || importLock.current) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file."); setStage("error"); return;
    }
    try {
      const ownerId = quota?.user.userId;
      if (!ownerId) throw new Error("Your login session is not ready. Please refresh and try again.");
      stopAudio(); setError(""); setBook(null); setChunks([]); setExchanges([]); setProgress(3);
      summaries.current = {}; setContextNote("");
      const id = await fingerprintBook(file);
      const cached = await getBook(ownerId, id);
      if (cached) {
        await openStoredBook(id);
        return;
      }
      setStage("reading");
      const { pages, totalPages } = await extractPages(file);
      const nonEmptyPages = pages.filter((page) => page.text.length > 20);
      if (!nonEmptyPages.length) throw new Error("No readable text was found, including after OCR.");
      setStage("indexing");
      const structuralChunks = buildStructuralChunks(nonEmptyPages);
      if (!structuralChunks.length) throw new Error("The PDF could not be divided into readable passages.");
      const embeddings = await embedTexts(structuralChunks.map((chunk: Omit<Chunk, "embedding">) => `${chunk.sectionTitle}\n${chunk.text}`));
      const indexed = structuralChunks.map((chunk: Omit<Chunk, "embedding">, index: number) => ({ ...chunk, embedding: embeddings[index] }));
      const chapters = new Set(indexed.map((chunk: Chunk) => chunk.sectionTitle).filter((title: string) => title !== "Front matter")).size;
      const now = new Date().toISOString();
      const saved: Omit<StoredBook, "ownerId" | "storageKey"> = {
        id,
        name: file.name.replace(/\.pdf$/i, ""),
        pages: totalPages,
        chapters,
        chunks: indexed.length,
        fileSize: file.size,
        storedAt: now,
        lastOpenedAt: now,
        pdf: file,
        index: indexed,
      };
      await saveBook(ownerId, saved);
      void navigator.storage?.persist?.();
      setLibrary(await listBooks(ownerId));
      setChunks(indexed);
      setBook(saved);
      setLibraryOpen(false);
      setProgress(100); setStage("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The book could not be indexed."); setStage("error");
    }
  }

  async function importLibrary(file?: File) {
    if (!file || bookTransitionBlocked || importLock.current) return;
    const ownerId = quota?.user.userId;
    if (!ownerId) return;
    importLock.current = true;
    setImporting(true);
    setError("");
    setImportMessage("Checking saved books…");
    try {
      if (file.size > 256 * 1024 * 1024) throw new Error("Library bundles must be smaller than 256 MB.");
      // Validate the entire bundle before writing; imports never call OCR or embedding APIs.
      const books = parseBookBundle(JSON.parse(await file.text()));
      const existing = new Set((await listBooks(ownerId)).map((item) => item.id));
      let added = 0;
      for (const saved of books) {
        if (existing.has(saved.id)) continue;
        setImportMessage(`Saving ${saved.name}…`);
        await saveBook(ownerId, saved);
        added += 1;
      }
      setLibrary(await listBooks(ownerId));
      void navigator.storage?.persist?.();
      setImportMessage(`${added} books added · ${books.length - added} already saved. No re-indexing.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Library import failed.");
      setImportMessage("Import stopped. Saved books are safe; choose the same bundle to resume.");
      setLibrary(await listBooks(ownerId));
    } finally {
      importLock.current = false;
      setImporting(false);
    }
  }

  async function ask(rawQuestion: string, revision = "", original?: Exchange) {
    const cleanQuestion = rawQuestion.trim();
    if (!cleanQuestion || !chunks.length || busy || importing || openingBookId || !preferencesReady) return;
    try {
      stopAudio(); setQuestion(""); setError(""); setStage("retrieving");
      const conversation = await buildConversationContext(cleanQuestion, exchanges, summaries.current, async text => {
        setStage("remembering");
        const response = await fetch("/api/history/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        const data = await response.json() as { summary: string; error?: string };
        if (!response.ok) throw new Error(data.error || "对话摘要失败，请重试；原始记录仍然保留。");
        return data.summary;
      }, async () => {
        if (preferences.rememberHistory && quota && book) await saveHistory(quota.user.userId, book.id, exchanges, summaries.current);
      });
      setContextNote(conversation.mode === "full" ? `本次参考全部 ${conversation.totalTurns} 轮前文` : `本次参考早期摘要、${conversation.turns.length} 轮近期原文及 ${conversation.recalled.length} 段相关历史`);
      setStage("retrieving");
      const query = retrievalQuestion(cleanQuestion, exchanges);
      const [queryEmbedding] = await embedTexts([query], book?.embeddingModel, "query"); setProgress(100);
      if (chunks.some((chunk) => chunk.embedding.length !== queryEmbedding.length)) {
        throw new Error("The question vector does not match this book's saved index.");
      }
      const retrieved = hybridRetrieve(query, queryEmbedding, chunks, 6) as Chunk[];
      setStage("answering");
      const response = await fetch("/api/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, conversation, revision, revisionAnswer: original?.answer, contexts: retrieved.map(({ id, sectionTitle, pageStart, pageEnd, text }) => ({ id, sectionTitle, pageStart, pageEnd, text })) }),
      });
      const payload = await response.json() as { error?: string; answer: string; quota?: QuotaSnapshot };
      if (!response.ok) throw new Error(payload.error || "Answer generation failed");
      if (payload.quota) setQuota(payload.quota);
      const sources = retrieved.map(({ id, sectionTitle, pageStart, pageEnd, text }) => ({ id, sectionTitle, pageStart, pageEnd, text }));
      const next = [...exchanges, { id: crypto.randomUUID(), question: cleanQuestion, answer: payload.answer, sources }];
      setExchanges(next);
      if (preferences.rememberHistory && quota && book) {
        try { await saveHistory(quota.user.userId, book.id, next, summaries.current); } catch { setError("回答已生成，但本机存储失败，历史未能保存；请勿关闭页面。"); }
      }
      const spokenAnswer = String(payload.answer).replace(/\[S\d+\]/g, "").replace(/[ \t]{2,}/g, " ").trim();
      await speak(spokenAnswer);
    } catch (caught) {
      setQuestion(cleanQuestion); setError(caught instanceof Error ? caught.message : "The question could not be answered."); setStage("error");
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
      const payload = await response.json() as { error?: string; text: string; quota?: QuotaSnapshot };
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
    if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error || "Speech generation failed"); }
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
    if (bookTransitionBlocked) return;
    summaries.current = {}; setContextNote("");
    stopAudio(); setBook(null); setChunks([]); setExchanges([]); setQuestion("");
    setActiveSource(null); setError(""); setProgress(0); setStage("idle");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  if (!authChecked || (quota && !libraryReady)) return <main className="session-loading"><LoaderCircle className="spin" size={24} /><span>Opening your local library…</span></main>;

  return (
    <main className="app-shell">
      <input ref={fileInput} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void handleFile(file); }} />
      <input ref={bundleInput} className="sr-only" type="file" accept="application/json,.json" aria-label="Import saved library file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importLibrary(file); }} />
      <header className="topbar">
        <button className="brand" onClick={resetBook} aria-label="Return to start"><span className="brand-mark"><BookOpen size={18} strokeWidth={2.4} /></span><span>VOICEBOOK</span></button>
        <div className="quota-note">{quota ? <><b>{library.length}</b> local books · <b>{quota.questions.remaining}</b> questions · <b>{Math.floor(quota.voice.remainingSeconds / 60)}</b> voice min</> : <><span className="privacy-dot" /> Books and indexes stay in this browser</>}</div>
        <div className="topbar-actions">
          {quota?.isAdmin && <a className="admin-link" href="/admin"><ShieldCheck size={15} /> Admin</a>}
          <button className="library-toggle" onClick={() => setLibraryOpen((value) => !value)}><Library size={15} /> Library</button>
          <button className="new-book" onClick={() => fileInput.current?.click()} disabled={bookTransitionBlocked}><Plus size={15} /> Add book</button>
          <button className="icon-action" onClick={() => void logout()} aria-label={`Sign out ${quota?.user.username || "user"}`}><LogOut size={15} /></button>
        </div>
      </header>

      {libraryOpen && <button className="library-backdrop" onClick={() => setLibraryOpen(false)} aria-label="Close library" />}

      <section className="workspace">
        <aside className={`book-panel ${libraryOpen ? "mobile-open" : ""}`}>
          <div className="library-heading"><div><p className="eyebrow">Local library</p><span>{library.length} {library.length === 1 ? "book" : "books"}</span></div><button onClick={() => fileInput.current?.click()} disabled={bookTransitionBlocked} aria-label="Add a PDF"><Plus size={16} /></button></div>
          {library.length ? <div className="library-list">{library.map((item) => <div className={`library-item ${book?.id === item.id ? "active" : ""}`} key={item.id}>
            <button className="library-select" onClick={() => void openStoredBook(item.id)} disabled={bookTransitionBlocked || openingBookId === item.id}>
              <span className="library-book-icon">{openingBookId === item.id ? <LoaderCircle className="spin" size={15} /> : <BookOpen size={15} />}</span>
              <span><strong>{item.name}</strong><small>{item.pages ? `${item.pages} pages · ` : "Imported · "}{item.chunks} passages</small></span>
            </button>
            <button className="library-delete" onClick={() => void removeLibraryBook(item.id, item.name)} disabled={bookTransitionBlocked} aria-label={`Remove ${item.name}`}><Trash2 size={13} /></button>
          </div>)}</div> : <button className="upload-card library-empty" disabled={bookTransitionBlocked} onClick={() => fileInput.current?.click()}><span className="upload-icon"><Upload size={22} /></span><strong>Add your first book</strong><span>Its PDF and search index will stay in this browser.</span><em>Browse files</em></button>}
          <button className="new-book library-import" disabled={bookTransitionBlocked} onClick={() => bundleInput.current?.click()}>{importing ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} Import saved library</button>
          {importMessage && <p className="library-import-status" role="status">{importMessage}</p>}

          <div className="method-note"><Sparkles size={15} /><p><strong>Stored locally</strong><br />PDF, chunks, and embeddings remain in this browser. Selecting a saved book does not re-index it.</p></div>
        </aside>

        <section className="conversation-panel">
          <div className="reading-header">
            <div className="reading-title"><BookOpen size={20} /><div><p className="eyebrow">Now reading</p><strong>{book?.name || "选择一本书，开始对话"}</strong>{book && <small>{book.chunks} passages · Local index ready</small>}</div></div>
            <ReaderSettings preferences={preferences} onSave={savePreferences} onClear={clearReadingHistory} disabled={!preferencesReady || bookTransitionBlocked} />
          </div>
          <div className="conversation-scroll">
            {!book && stage === "idle" ? <div className="welcome-state">
              <span className="welcome-kicker">Your local reading library</span><h1>{library.length ? <>Choose a book.<br /><i>Pick up</i> where you left off.</> : <>Don’t search the book.<br /><i>Talk</i> to it.</>}</h1>
              <p>{library.length ? "Select a saved book from your library. Its passages and embeddings are already ready for conversation." : "Upload a PDF once. Voicebook keeps its content and search index locally for your next conversation."}</p>
              <button className="primary-action" onClick={() => library.length ? setLibraryOpen(true) : fileInput.current?.click()}>{library.length ? <Library size={17} /> : <FileText size={17} />} {library.length ? "Choose from library" : "Add a PDF book"}</button>
              <div className="flow-line"><span>01 Add</span><ChevronRight size={13} /><span>02 Choose</span><ChevronRight size={13} /><span>03 Ask</span></div>
            </div> : exchanges.length === 0 ? <div className="ready-state">
              <div className="orb-small"><Headphones size={28} /></div><p className="eyebrow">The book is listening</p><h2>What would you like to understand?</h2>
              <p>Ask about an argument, event, character, definition, or connection across chapters.</p>
              <div className="sample-grid">{sampleQuestions.map((sample) => <button key={sample} onClick={() => void ask(sample)}>{sample}<ArrowUp size={13} /></button>)}</div>
            </div> : <div className="conversation-list">{exchanges.map((exchange) => <article className="exchange" key={exchange.id}>
              <div className="question-row"><span>You asked</span><p>{exchange.question}</p></div>
              <div className="answer-row"><div className="answer-label"><span className="mini-mark"><Volume2 size={13} /></span> Voicebook</div>
                <AnswerText text={exchange.answer} onCitation={(index) => setActiveSource(exchange.sources[index] || null)} />
                <div className="source-strip">{exchange.sources.slice(0, 4).map((source, index) => <button key={source.id} onClick={() => setActiveSource(source)}><b>{index + 1}</b>{pageLabel(source)} · {source.sectionTitle}</button>)}</div>
                <AnswerFeedback exchange={exchange} bookName={book?.name || ""} disabled={bookTransitionBlocked || !preferencesReady} onRewrite={instruction => void ask(exchange.question, instruction, exchange)} onRemember={async instruction => {
                  const guidance = [preferences.guidance, instruction].filter(Boolean).join("\n");
                  if (guidance.length > 600) throw new Error("偏好超过 600 字，请先到阅读偏好中整理。");
                  await savePreferences({ ...preferences, guidance });
                }} />
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
            <p className="ai-disclosure">{contextNote || "短对话参考全部前文；长对话使用摘要并找回相关原始消息。"}<br />{preferences.rememberHistory ? `本机完整保留 ${exchanges.length} 轮对话` : "当前未开启跨会话保存"} · 请核对原文引用。</p>
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
