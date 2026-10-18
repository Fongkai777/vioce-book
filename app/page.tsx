"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, BookOpen, FileText, Headphones,
  Library, LoaderCircle, LogOut, Mic, Play, Plus, ShieldCheck, Sparkles,
  Square, Trash2, Upload, UserRound, Volume2, X,
} from "lucide-react";
import {
  deleteBook, fingerprintBook, getBook, listBooks, markBookOpened, saveBook, summary,
  type BookSummary, type StoredBook, type StoredChunk,
} from "@/lib/book-library";
import { buildStructuralChunks, hybridRetrieve } from "@/lib/retrieval.mjs";
import { formatQuotaDuration } from "@/lib/quota-display";
import { defaultPreferences, retrievalQuestion, type Preferences } from "@/lib/personalization";
import { clearHistory, loadHistory, loadSummaries, saveHistory, type SummaryCache } from "@/lib/reading-history";
import { buildConversationContext } from "@/lib/conversation-context";
import { AnswerFeedback, ReaderSettings } from "./reader-controls";
import StartReading from "./start-reading";
import SampleLibrary from "./sample-library";
import { addSampleToLibrary } from "@/lib/sample-library";
import BookManager from "./book-manager";
import type { PassageTarget } from "@/lib/book-inspector";
import VoiceSession from "./voice-session";
import { VoiceCapture } from "@/lib/voice-capture";
import { speechSegments, TurnGate } from "@/lib/voice-turn";
import { VoiceDraft } from "@/lib/voice-draft";

type Stage = "idle" | "reading" | "indexing" | "ready" | "listening" | "transcribing" | "reviewing" | "voicing" | "remembering" | "retrieving" | "answering" | "speaking" | "error";
type Chunk = StoredChunk & { denseScore?: number; sparseScore?: number; fusionScore?: number };
type Source = Pick<Chunk, "id" | "sectionTitle" | "pageStart" | "pageEnd" | "text">;
type Exchange = { id: string; question: string; answer: string; sources: Source[]; audioInterrupted?: boolean };
type QuotaSnapshot = {
  questions: { used: number; limit: number; remaining: number };
  voice: { usedSeconds: number; limitSeconds: number; remainingSeconds: number };
  isAdmin: boolean;
  user: { userId: string; username: string; displayName: string };
};

const stageCopy: Record<Stage, string> = {
  idle: "Choose or upload a book to begin", reading: "Reading pages and using OCR when needed…",
  indexing: "Building the book index…", ready: "Ready for your question",
  listening: "Listening… pause to finish", transcribing: "Turning speech into text…",
  reviewing: "Review your transcript", voicing: "Preparing the spoken reply…",
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
  const [workspaceTab, setWorkspaceTab] = useState<"chat" | "books">("chat");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [book, setBook] = useState<BookSummary | null>(null);
  const [library, setLibrary] = useState<BookSummary[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [sampleLibraryOpen, setSampleLibraryOpen] = useState(false);
  const [sampleError, setSampleError] = useState("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState("");
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [passageTarget, setPassageTarget] = useState<PassageTarget>();
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [replayAvailable, setReplayAvailable] = useState(false);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const summaries = useRef<SummaryCache>({});
  const [contextNote, setContextNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioPlayer = useRef<AudioBufferSourceNode | null>(null);
  const capture = useRef<VoiceCapture | null>(null);
  const turnGate = useRef(new TurnGate());
  const transcriptionGate = useRef(new TurnGate());
  const transcriptionQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedTranscriptions = useRef(0);
  const voiceGeneration = useRef(0);
  const draft = useRef(new VoiceDraft());
  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replay = useRef<{ buffers: AudioBuffer[]; exchangeId: string } | null>(null);
  const playingExchange = useRef<string | null>(null);
  const exchangesRef = useRef<Exchange[]>([]);
  exchangesRef.current = exchanges;
  const actions = useRef({ speechStart: () => {}, utterance: (_file: File, _seconds: number) => {}, stopped: (_reason: string) => {}, sendTranscript: () => {} });
  const conversationEnd = useRef<HTMLDivElement>(null);

  const busy = !["idle", "ready", "error", "listening", "reviewing", "speaking"].includes(stage);
  const bookTransitionBlocked = voiceOn || voiceConnecting || !preferencesReady || !!openingBookId || !["idle", "ready", "error", "speaking"].includes(stage);
  const latest = exchanges.at(-1);
  const currentSources = latest?.sources || [];

  useEffect(() => { conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [exchanges, stage]);
  useEffect(() => () => {
    voiceGeneration.current++; turnGate.current.cancel(); transcriptionGate.current.cancel(); capture.current?.stop();
    if (reviewTimer.current) clearTimeout(reviewTimer.current);
    void audioContext.current?.close();
  }, []);
  useEffect(() => {
    const leave = () => { if (document.hidden) actions.current.stopped("Voice mode ended because this tab is no longer visible."); };
    document.addEventListener("visibilitychange", leave);
    return () => document.removeEventListener("visibilitychange", leave);
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
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const document = await loadingTask.promise;
      const pages: Array<{ pageNumber: number; text: string }> = [];
      let ocrPages = 0;
      const metadata = await document.getMetadata().catch(() => null);
      const pdfAuthor = (metadata?.info as { Author?: unknown } | undefined)?.Author;
      const author = typeof pdfAuthor === "string" ? pdfAuthor.trim().slice(0, 300) || undefined : undefined;
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
          ocrPages++;
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
      return { pages, totalPages: document.numPages, author, ocrPages };
    } finally {
      // PDF.js 6 owns document/worker cleanup on the loading task, including errors.
      await loadingTask.destroy();
    }
  }

  async function embedTexts(texts: string[], model = "text-embedding-3-small", purpose = "index", signal?: AbortSignal) {
    const vectors: number[][] = [];
    const batchSize = 48;
    for (let index = 0; index < texts.length; index += batchSize) {
      const response = await fetch("/api/embed", {
        method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: texts.slice(index, index + batchSize), model, purpose }),
      });
      const payload = await response.json() as { error?: string; embeddings: number[][] };
      signal?.throwIfAborted();
      if (!response.ok) throw new Error(payload.error || "Embedding failed");
      vectors.push(...payload.embeddings);
      setProgress(45 + Math.round((Math.min(index + batchSize, texts.length) / texts.length) * 55));
    }
    return vectors;
  }

  function bookSummary(stored: StoredBook): BookSummary {
    return summary(stored);
  }

  async function openStoredBook(bookId: string, fromSample = false) {
    const ownerId = quota?.user.userId;
    if (!ownerId || bookTransitionBlocked) return;
    try {
      setOpeningBookId(bookId);
      setSampleError("");
      turnGate.current.cancel(); clearTranscript(); setPendingQuestion(""); setVoiceNotice(""); replay.current = null; setReplayAvailable(false);
      stopAudio();
      setError("");
      const stored = fromSample ? await addSampleToLibrary(ownerId, bookId) : await getBook(ownerId, bookId);
      if (!stored) throw new Error("This book is no longer available in the local library.");
      const history = preferences.rememberHistory ? await loadHistory<Exchange>(ownerId, bookId) : [];
      const memory = preferences.rememberHistory ? await loadSummaries(ownerId, bookId) : {};
      setBook(bookSummary(stored));
      setChunks(stored.index);
      setExchanges(history);
      summaries.current = memory;
      setContextNote("");
      setActiveSource(null);
      setProgress(100);
      setStage("ready");
      setLibraryOpen(false);
      setSampleLibraryOpen(false);
      setWorkspaceTab("chat");
      await markBookOpened(ownerId, stored.id);
      setLibrary(await listBooks(ownerId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The saved book could not be opened.");
      if (fromSample) setSampleError(caught instanceof Error ? caught.message : "The sample could not be opened.");
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
    if (!file || bookTransitionBlocked) return;
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
      const { pages, totalPages, author, ocrPages } = await extractPages(file);
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
        author,
        extraction: { ocrPages, readablePages: nonEmptyPages.length },
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

  async function ask(rawQuestion: string, revision = "", original?: Exchange) {
    const cleanQuestion = rawQuestion.trim();
    if (!cleanQuestion || !chunks.length || openingBookId || !preferencesReady) return;
    interruptReply(); cancelIncoming(true);
    const signal = turnGate.current.next();
    const history = exchangesRef.current;
    const owner = quota?.user.userId, bookId = book?.id;
    clearTranscript(); stopAudio(); setPendingQuestion(cleanQuestion); setVoiceNotice("");
    void prepareAudio().catch(() => {});
    try {
      stopAudio(); setError(""); setStage("retrieving");
      const conversation = await buildConversationContext(cleanQuestion, history, summaries.current, async text => {
        signal.throwIfAborted();
        setStage("remembering");
        const response = await fetch("/api/history/summary", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        const data = await response.json() as { summary: string; error?: string };
        signal.throwIfAborted();
        if (!response.ok) throw new Error(data.error || "对话摘要失败，请重试；原始记录仍然保留。");
        return data.summary;
      }, async () => {
        signal.throwIfAborted();
        if (preferences.rememberHistory && owner && bookId) await saveHistory(owner, bookId, history, summaries.current);
      });
      signal.throwIfAborted();
      setContextNote(conversation.mode === "full" ? `本次参考全部 ${conversation.totalTurns} 轮前文` : `本次参考早期摘要、${conversation.turns.length} 轮近期原文及 ${conversation.recalled.length} 段相关历史`);
      setStage("retrieving");
      const query = retrievalQuestion(cleanQuestion, history);
      const [queryEmbedding] = await embedTexts([query], book?.embeddingModel, "query", signal); signal.throwIfAborted(); setProgress(100);
      if (chunks.some((chunk) => chunk.embedding.length !== queryEmbedding.length)) {
        throw new Error("The question vector does not match this book's saved index.");
      }
      const retrieved = hybridRetrieve(query, queryEmbedding, chunks, 6) as Chunk[];
      setStage("answering");
      const response = await fetch("/api/answer", {
        method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, conversation, revision, revisionAnswer: original?.answer, contexts: retrieved.map(({ id, sectionTitle, pageStart, pageEnd, text }) => ({ id, sectionTitle, pageStart, pageEnd, text })) }),
      });
      const payload = await response.json() as { error?: string; answer: string; quota?: QuotaSnapshot };
      signal.throwIfAborted();
      if (!response.ok) throw new Error(payload.error || "Answer generation failed");
      if (payload.quota) setQuota(payload.quota);
      const sources = retrieved.map(({ id, sectionTitle, pageStart, pageEnd, text }) => ({ id, sectionTitle, pageStart, pageEnd, text }));
      const exchangeId = crypto.randomUUID();
      const next = [...history, { id: exchangeId, question: cleanQuestion, answer: payload.answer, sources }];
      exchangesRef.current = next; setExchanges(next); setPendingQuestion("");
      if (preferences.rememberHistory && owner && bookId) {
        try { await saveHistory(owner, bookId, next, summaries.current); } catch { if (!signal.aborted) setError("回答已生成，但本机存储失败，历史未能保存；请勿关闭页面。"); }
      }
      signal.throwIfAborted();
      const spokenAnswer = String(payload.answer).replace(/\[S\d+\]/g, "").replace(/[ \t]{2,}/g, " ").trim();
      await speak(spokenAnswer, signal, exchangeId);
    } catch (caught) {
      if (signal.aborted) return;
      setPendingQuestion("");
      draft.current.edit(cleanQuestion); showDraft(); capture.current?.mute(true); setVoiceMuted(true);
      setError(caught instanceof Error ? caught.message : "The question could not be answered."); setStage("error");
    }
  }

  async function prepareAudio() {
    if (!audioContext.current || audioContext.current.state === "closed") audioContext.current = new AudioContext();
    if (audioContext.current.state === "suspended") await audioContext.current.resume();
    return audioContext.current;
  }

  function clearTranscript() {
    if (reviewTimer.current) clearTimeout(reviewTimer.current);
    reviewTimer.current = null; draft.current.clear(); setTranscript(""); setEditingTranscript(false);
  }

  function showDraft() {
    setTranscript(draft.current.text); setEditingTranscript(draft.current.needsReview);
  }

  function cancelIncoming(clear = false) {
    transcriptionGate.current.next(); transcriptionQueue.current = Promise.resolve(); queuedTranscriptions.current = 0;
    if (reviewTimer.current) clearTimeout(reviewTimer.current);
    reviewTimer.current = null;
    if (clear) clearTranscript();
  }

  function markAudioInterrupted() {
    const id = playingExchange.current; playingExchange.current = null;
    if (!id) return;
    const updated = exchangesRef.current.map(turn => turn.id === id ? { ...turn, audioInterrupted: true } : turn);
    exchangesRef.current = updated; setExchanges(updated);
    if (preferences.rememberHistory && quota && book) void saveHistory(quota.user.userId, book.id, updated, summaries.current).catch(() => setVoiceNotice("Playback stopped, but its status could not be saved."));
  }

  function interruptReply() {
    // Cancel assistant output only. Incoming speech and its draft are separate.
    turnGate.current.cancel(); markAudioInterrupted(); stopAudio(); setPendingQuestion("");
    setStage(book ? "ready" : "idle");
  }

  function endVoice(reason = "") {
    voiceGeneration.current++; capture.current?.stop(); capture.current = null;
    cancelIncoming(); interruptReply(); setVoiceOn(false); setVoiceConnecting(false); setVoiceMuted(false); setVoiceLevel(0);
    if (draft.current.text) { draft.current.hold(); showDraft(); setStage("reviewing"); }
    if (reason) setVoiceNotice(reason);
  }

  async function startRecording() {
    if (capture.current || voiceConnecting) return endVoice();
    if (!book || !preferencesReady || openingBookId || ["reading", "indexing"].includes(stage)) return;
    if (quota && (quota.voice.remainingSeconds < 1 || quota.questions.remaining < 1)) { setError("Your daily voice or question allowance has been reached."); return; }
    interruptReply(); cancelIncoming(true); setError(""); setVoiceNotice(""); setVoiceConnecting(true);
    const generation = ++voiceGeneration.current;
    try {
      const context = await prepareAudio();
      const session = await VoiceCapture.open(context, {
        level: level => { if (generation === voiceGeneration.current) setVoiceLevel(level); },
        playback: () => !!audioPlayer.current,
        start: () => { if (generation === voiceGeneration.current) actions.current.speechStart(); },
        utterance: (file, seconds) => { if (generation === voiceGeneration.current) actions.current.utterance(file, seconds); },
        stopped: reason => { if (generation === voiceGeneration.current) actions.current.stopped(reason); },
      });
      if (generation !== voiceGeneration.current) { session.stop(); return; }
      capture.current = session; setVoiceOn(true); setVoiceConnecting(false); setVoiceMuted(false); setStage("ready");
    } catch (caught) {
      if (generation !== voiceGeneration.current) return;
      setVoiceConnecting(false); setError(caught instanceof Error && caught.name !== "NotAllowedError" ? caught.message : "Microphone access was denied. Allow it in your browser settings, then start voice again."); setStage("error");
    }
  }

  function muteVoice() {
    if (!voiceMuted) { draft.current.hold(); if (reviewTimer.current) clearTimeout(reviewTimer.current); reviewTimer.current = null; showDraft(); }
    capture.current?.mute(!voiceMuted); setVoiceMuted(!voiceMuted);
    if (stage === "listening") setStage(draft.current.text ? "reviewing" : "ready");
  }

  function editTranscript() {
    if (reviewTimer.current) clearTimeout(reviewTimer.current);
    reviewTimer.current = null; draft.current.hold(); showDraft(); capture.current?.mute(true); setVoiceMuted(true);
  }

  function sendTranscript() {
    const text = draft.current.text.trim(); if (!text || queuedTranscriptions.current || capture.current?.speaking) return;
    capture.current?.mute(false); setVoiceMuted(false); void ask(text);
  }

  function discardTranscript() {
    cancelIncoming(true); setError(""); setVoiceNotice("");
    capture.current?.mute(false); setVoiceMuted(false); setStage("ready");
  }

  actions.current = {
    speechStart: () => {
      if (reviewTimer.current) clearTimeout(reviewTimer.current);
      reviewTimer.current = null;
      interruptReply(); setError(""); setVoiceNotice(""); setStage("listening");
    },
    utterance: (file, seconds) => {
      const signal = transcriptionGate.current.signal;
      queuedTranscriptions.current++; setStage("transcribing");
      transcriptionQueue.current = transcriptionQueue.current.then(() => transcribe(file, seconds, signal)).finally(() => {
        if (signal.aborted) return;
        queuedTranscriptions.current--;
        showDraft();
        if (queuedTranscriptions.current || capture.current?.speaking) return;
        setStage(draft.current.text ? "reviewing" : draft.current.needsReview ? "error" : "ready");
        if (draft.current.canAutoSend(queuedTranscriptions.current, !!capture.current?.speaking))
          reviewTimer.current = setTimeout(() => {
            if (!signal.aborted && draft.current.canAutoSend(queuedTranscriptions.current, !!capture.current?.speaking)) actions.current.sendTranscript();
          }, 1800);
      });
    },
    stopped: reason => { if (capture.current || voiceConnecting) endVoice(reason); },
    sendTranscript,
  };

  async function transcribe(audio: File, durationSeconds: number, signal: AbortSignal) {
    try {
      signal.throwIfAborted();
      const form = new FormData(); form.append("audio", audio); form.append("durationSeconds", String(durationSeconds));
      const response = await fetch("/api/transcribe", { method: "POST", signal, body: form });
      const payload = await response.json() as { error?: string; text: string; quota?: QuotaSnapshot };
      signal.throwIfAborted();
      if (!response.ok) throw new Error(payload.error || "Transcription failed");
      if (payload.quota) setQuota(payload.quota);
      const appended = draft.current.append(payload.text);
      if (!appended) setVoiceNotice(draft.current.text ? "That sound contained no words. Your recognized question is kept." : "I didn’t catch any words in that sound. I’m still listening — please try again.");
      if (draft.current.needsReview && draft.current.text.length >= 2000) setVoiceNotice("Your question reached the 2,000-character limit. Please review it before sending.");
      if (payload.quota && payload.quota.voice.remainingSeconds < 1) { capture.current?.stop(); capture.current = null; setVoiceOn(false); setVoiceNotice("Voice allowance reached. You can still send the recognized question."); }
    } catch (caught) {
      if (signal.aborted) return;
      draft.current.hold(); showDraft();
      capture.current?.mute(true); setVoiceMuted(true);
      setError((caught instanceof Error ? caught.message : "Speech could not be transcribed.") + (draft.current.text ? " Your earlier words are kept below; review them before sending." : " Resume the microphone to try again.")); setStage("error");
    }
  }

  async function playBuffer(buffer: AudioBuffer, context: AudioContext, signal: AbortSignal) {
    signal.throwIfAborted();
    if (context.state !== "running") throw new Error("Audio playback is paused by your browser. Tap Play saved audio to listen.");
    await new Promise<void>((resolve, reject) => {
      const player = context.createBufferSource(); player.buffer = buffer; player.connect(context.destination);
      const cleanup = () => { signal.removeEventListener("abort", abort); player.disconnect(); if (audioPlayer.current === player) audioPlayer.current = null; };
      const abort = () => { player.onended = null; try { player.stop(); } catch {} cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
      player.onended = () => { cleanup(); resolve(); };
      signal.addEventListener("abort", abort, { once: true }); audioPlayer.current = player;
      try { player.start(); } catch (error) { cleanup(); reject(error); }
    });
  }

  async function speak(text: string, signal: AbortSignal, exchangeId: string) {
    setStage("voicing"); playingExchange.current = exchangeId; replay.current = { buffers: [], exchangeId }; setReplayAvailable(false);
    const saved = replay.current;
    try {
      const context = audioContext.current || await prepareAudio();
      const jobs = speechSegments(text).map(async (segment, index) => {
        try {
          const response = await fetch("/api/speech", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: segment }) });
          if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error || "Speech generation failed"); }
          const buffer = await context.decodeAudioData(await response.arrayBuffer()); signal.throwIfAborted();
          saved.buffers[index] = buffer; setReplayAvailable(true);
          return { buffer };
        } catch (error) { return { error }; }
      });
      for (const job of jobs) {
        const result = await job; signal.throwIfAborted();
        if (!result.buffer) throw result.error;
        setStage("speaking"); await playBuffer(result.buffer, context, signal);
      }
      signal.throwIfAborted(); playingExchange.current = null; setStage("ready");
    } catch (caught) {
      if (signal.aborted) return;
      playingExchange.current = null; setStage("ready");
      setVoiceNotice(caught instanceof Error ? `The answer is ready. ${caught.message}` : "The answer is ready, but audio is unavailable. You can read it above.");
    }
  }

  function stopAudio() {
    if (audioPlayer.current) { try { audioPlayer.current.stop(); } catch {} audioPlayer.current = null; }
  }

  async function replayAudio() {
    const saved = replay.current; if (!saved?.buffers.length) return;
    interruptReply(); const signal = turnGate.current.next(); playingExchange.current = saved.exchangeId;
    try { const context = await prepareAudio(); signal.throwIfAborted(); setStage("speaking"); for (const buffer of saved.buffers.filter(Boolean)) await playBuffer(buffer, context, signal); signal.throwIfAborted(); playingExchange.current = null; setStage("ready"); }
    catch { if (!signal.aborted) { playingExchange.current = null; setStage("ready"); setVoiceNotice("Your browser could not play the audio. The text answer is still available."); } }
  }

  function resetBook() {
    if (bookTransitionBlocked) return;
    turnGate.current.cancel(); clearTranscript(); setPendingQuestion(""); setVoiceNotice(""); replay.current = null; setReplayAvailable(false);
    summaries.current = {}; setContextNote("");
    stopAudio(); setBook(null); setChunks([]); setExchanges([]);
    setActiveSource(null); setError(""); setProgress(0); setStage("idle");
  }

  async function logout() {
    endVoice();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  if (!authChecked || (quota && !libraryReady)) return <main className="session-loading"><LoaderCircle className="spin" size={24} /><span>Opening your local library…</span></main>;

  return (
    <main className="app-shell">
      <input ref={fileInput} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void handleFile(file); }} />
      <header className="topbar">
        <button className="brand" onClick={() => { if (!bookTransitionBlocked) { resetBook(); setWorkspaceTab("chat"); } }} aria-label="Return to start"><span className="brand-mark"><BookOpen size={18} strokeWidth={2.4} /></span><span>VOICEBOOK</span></button>
        <div className="topbar-actions">
          {quota?.isAdmin && <a className="admin-link" href="/admin"><ShieldCheck size={15} /> Admin</a>}
          {workspaceTab === "chat" && <button className="library-toggle" onClick={() => setLibraryOpen((value) => !value)} aria-label="Library"><Library size={15} /><span>Library</span></button>}
          <div className="account-quota" role="status" aria-label="今日剩余额度" title="剩余额度 / 每日总额；语音格式为分:秒。每天新加坡时间 00:00 重置。">
            <small>今日剩余 / 每日总额</small>
            {quota ? <div><span>提问 <b>{quota.questions.remaining}</b> / {quota.questions.limit} 次</span><span>语音 <b>{formatQuotaDuration(quota.voice.remainingSeconds)}</b> / {formatQuotaDuration(quota.voice.limitSeconds)}</span></div> : <span>额度暂时无法加载</span>}
          </div>
          <div className="account-controls">
            <span className="account-name" title={quota?.user.username}><UserRound size={15} /><span>{quota?.user.username || "账号"}</span></span>
            <button className="icon-action" onClick={() => void logout()} aria-label={`Sign out ${quota?.user.username || "user"}`} title="退出登录"><LogOut size={15} /></button>
          </div>
        </div>
      </header>

      <nav className="workspace-tabs" role="tablist" aria-label="Workspace">
        {([ ["chat", "Chat"], ["books", "Book management"] ] as const).map(([id, label]) => <button key={id} role="tab" id={`workspace-tab-${id}`} aria-controls={`workspace-panel-${id}`} aria-selected={workspaceTab === id} tabIndex={workspaceTab === id ? 0 : -1} disabled={bookTransitionBlocked} onClick={() => { setPassageTarget(undefined); setWorkspaceTab(id); setLibraryOpen(false); }} onKeyDown={event => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "chat" : event.key === "End" ? "books" : id === "chat" ? "books" : "chat"; setPassageTarget(undefined); setWorkspaceTab(next); setLibraryOpen(false); document.getElementById(`workspace-tab-${next}`)?.focus(); }
        }}>{id === "chat" ? <Headphones size={16} /> : <Library size={16} />}{label}</button>)}
      </nav>
      {workspaceTab === "books" && quota && <section role="tabpanel" id="workspace-panel-books" aria-labelledby="workspace-tab-books">
        <BookManager key={quota.user.userId} ownerId={quota.user.userId} books={library} preferredBookId={book?.id} passageTarget={passageTarget} disabled={bookTransitionBlocked} onChat={openStoredBook} onRemove={removeLibraryBook} onUpload={() => fileInput.current?.click()} onSamples={() => { setSampleError(""); setSampleLibraryOpen(true); }} status={busy ? `${stageCopy[stage]} ${progress}%` : undefined} error={error} />
      </section>}

      {libraryOpen && <button className="library-backdrop" onClick={() => setLibraryOpen(false)} aria-label="Close library" />}

      <section className="workspace" role="tabpanel" id="workspace-panel-chat" aria-labelledby="workspace-tab-chat" hidden={workspaceTab !== "chat"}>
        <aside className={`book-panel ${libraryOpen ? "mobile-open" : ""}`}>
          <div className="library-heading"><div><p className="eyebrow">Local library</p><span>{library.length} {library.length === 1 ? "book" : "books"}</span></div><button onClick={() => fileInput.current?.click()} disabled={bookTransitionBlocked} aria-label="Add a PDF"><Plus size={16} /></button></div>
          {library.length ? <div className="library-list">{library.map((item) => <div className={`library-item ${book?.id === item.id ? "active" : ""}`} key={item.id}>
            <button className="library-select" onClick={() => void openStoredBook(item.id)} disabled={bookTransitionBlocked || openingBookId === item.id}>
              <span className="library-book-icon">{openingBookId === item.id ? <LoaderCircle className="spin" size={15} /> : <BookOpen size={15} />}</span>
              <span><strong>{item.name}</strong><small>{item.importedFrom === "Voicebook sample" ? "Sample · " : item.pages ? `${item.pages} pages · ` : "Imported · "}{item.chunks} passages</small></span>
            </button>
            <button className="library-delete" onClick={() => void removeLibraryBook(item.id, item.name)} disabled={bookTransitionBlocked} aria-label={`Remove ${item.name}`}><Trash2 size={13} /></button>
          </div>)}</div> : <button className="upload-card library-empty" disabled={bookTransitionBlocked} onClick={() => fileInput.current?.click()}><span className="upload-icon"><Upload size={22} /></span><strong>Add your first book</strong><span>Its PDF and search index will stay in this browser.</span><em>Browse files</em></button>}

          <button className="sample-entry sidebar-samples" disabled={bookTransitionBlocked} onClick={() => { setSampleError(""); setSampleLibraryOpen(true); }}><BookOpen size={16} /> Browse sample books</button>
          <div className="method-note"><Sparkles size={15} /><p><strong>Stored locally · Account-specific</strong><br />Your books, indexes, and chats stay in this browser under your account. Sample books are read-only templates, not a shared personal library.</p></div>
        </aside>

        <section className="conversation-panel">
          <div className="reading-header">
            <div className="reading-title"><BookOpen size={20} /><div><p className="eyebrow">Now reading</p><strong>{book?.name || "Choose or upload a book to begin"}</strong>{book && <small>{book.chunks} passages · Local index ready</small>}</div></div>
            <ReaderSettings preferences={preferences} onSave={savePreferences} onClear={clearReadingHistory} disabled={!preferencesReady || bookTransitionBlocked} />
          </div>
          <div className="conversation-scroll">
            {!book ? <StartReading books={library} disabled={bookTransitionBlocked} openingBookId={openingBookId} onSelect={openStoredBook} onUpload={() => fileInput.current?.click()} onSamples={() => { setSampleError(""); setSampleLibraryOpen(true); }} /> : exchanges.length === 0 && !pendingQuestion ? <div className="ready-state">
              <div className="orb-small"><Headphones size={28} /></div><p className="eyebrow">The book is listening</p><h2>What would you like to understand?</h2>
              <p>Ask about an argument, event, character, definition, or connection across chapters.</p>
              <div className="sample-grid">{sampleQuestions.map((sample) => <button key={sample} onClick={() => void ask(sample)}>{sample}<ArrowUp size={13} /></button>)}</div>
            </div> : <div className="conversation-list">{exchanges.map((exchange) => <article className="exchange" key={exchange.id}>
              <div className="question-row"><span>You asked</span><p>{exchange.question}</p></div>
              <div className="answer-row"><div className="answer-label"><span className="mini-mark"><Volume2 size={13} /></span> Voicebook</div>
                <AnswerText text={exchange.answer} onCitation={(index) => setActiveSource(exchange.sources[index] || null)} />
                {exchange.audioInterrupted && <small className="playback-note">Voice reply interrupted · Full text kept above</small>}
                <div className="source-strip">{exchange.sources.slice(0, 4).map((source, index) => <button key={source.id} onClick={() => setActiveSource(source)}><b>{index + 1}</b>{pageLabel(source)} · {source.sectionTitle}</button>)}</div>
                <AnswerFeedback exchange={exchange} bookName={book?.name || ""} disabled={bookTransitionBlocked || !preferencesReady} onRewrite={instruction => void ask(exchange.question, instruction, exchange)} onRemember={async instruction => {
                  const guidance = [preferences.guidance, instruction].filter(Boolean).join("\n");
                  if (guidance.length > 600) throw new Error("偏好超过 600 字，请先到阅读偏好中整理。");
                  await savePreferences({ ...preferences, guidance });
                }} />
              </div>
            </article>)}</div>}
            {pendingQuestion && <div className="question-row pending-question"><span>You asked</span><p>{pendingQuestion}</p></div>}
            {busy && <div className="thinking-card"><LoaderCircle className="spin" size={18} /><div><strong>{stageCopy[stage]}</strong><span>{stage === "retrieving" ? "Combining semantic and exact-match signals" : "This usually takes a few seconds"}</span></div></div>}
            {error && <div className="error-card"><X size={17} /><span>{error}</span><button onClick={() => { setError(""); setStage(book ? "ready" : "idle"); }}>Dismiss</button></div>}
            <div ref={conversationEnd} />
          </div>

          <div className="composer-wrap">
            <VoiceSession active={voiceOn} connecting={voiceConnecting} level={voiceLevel} state={stage} muted={voiceMuted} transcript={transcript} editing={editingTranscript}
              onEdit={editTranscript} onChange={text => { draft.current.edit(text); showDraft(); }} onSend={sendTranscript} onDismiss={discardTranscript}
              onMute={muteVoice} onFinish={() => capture.current?.finish()} onEnd={() => endVoice()} />
            {voiceNotice && <p className="voice-notice" role="status">{voiceNotice}</p>}
            <div className="voice-toolbar">
              {book && !voiceOn && !voiceConnecting && !transcript && <button className="start-voice-button" onClick={() => void startRecording()} disabled={busy || !preferencesReady || !!openingBookId}><Mic size={18} /> Start voice conversation</button>}
              {["speaking", "voicing", "answering", "retrieving", "remembering"].includes(stage) && <button onClick={interruptReply}><Square size={14} /> Stop reply</button>}
              {replayAvailable && ["ready", "error"].includes(stage) && !transcript && <button onClick={() => void replayAudio()}><Play size={13} /> Play saved audio</button>}
            </div>
            {(stage === "reading" || stage === "indexing") && <div className="progress-block"><span style={{ width: `${progress}%` }} /><p>{stageCopy[stage]} <b>{progress}%</b></p></div>}
            <p className="ai-disclosure">{contextNote || "短对话参考全部前文；长对话使用摘要并找回相关原始消息。"}<br />{preferences.rememberHistory ? `本机完整保留 ${exchanges.length} 轮对话` : "当前未开启跨会话保存"} · 回答和语音由 AI 生成，请核对原文引用。</p>
          </div>
        </section>

        <aside className="source-panel">
          <div className="source-heading"><div><p className="eyebrow">Evidence desk</p><h2>Retrieved passages</h2></div><span>{currentSources.length}</span></div>
          {currentSources.length ? <div className="source-list">{currentSources.map((source, index) => <button key={source.id} className={activeSource?.id === source.id ? "active" : ""} onClick={() => setActiveSource(source)}><span className="source-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{source.sectionTitle}</strong><small>{pageLabel(source)}</small><p>{source.text.slice(0, 145)}…</p></div></button>)}</div> : <div className="empty-sources"><FileText size={24} /><p>Sources will appear here after your first question.</p></div>}
        </aside>
      </section>

      {activeSource && <div className="source-drawer-backdrop" onClick={() => setActiveSource(null)}><article className="source-drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setActiveSource(null)} aria-label="Close passage"><X size={18} /></button><p className="eyebrow">Source passage · {pageLabel(activeSource)}</p><h2>{activeSource.sectionTitle}</h2><blockquote>{activeSource.text}</blockquote><div className="manager-actions"><button disabled={!book || bookTransitionBlocked} onClick={() => {
        if (!book || bookTransitionBlocked) return;
        setPassageTarget(previous => ({bookId: book.id, chunkId: activeSource.id, requestId: (previous?.requestId || 0) + 1}));
        setActiveSource(null); setLibraryOpen(false); setWorkspaceTab("books");
      }}><BookOpen size={15} /> View in book</button></div>{voiceOn && <p className="inspector-note">End voice mode to open book management.</p>}</article></div>}
      {sampleLibraryOpen && <SampleLibrary savedIds={library.map(book => book.id)} disabled={bookTransitionBlocked} loadingId={openingBookId} selectionError={sampleError} onSelect={id => openStoredBook(id, true)} onClose={() => setSampleLibraryOpen(false)} />}
    </main>
  );
}
