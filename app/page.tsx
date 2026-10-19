"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, BookOpen, FileText, Headphones,
  Library, LoaderCircle, LogOut, Mic, Play, Plus, ShieldCheck, Sparkles,
  Trash2, Upload, UserRound, Volume2, X,
} from "lucide-react";
import {
  deleteBook, fingerprintBook, getBook, listBooks, markBookOpened, saveBook, summary,
  type BookSummary, type StoredBook, type StoredChunk,
} from "@/lib/book-library";
import { buildStructuralChunks, hybridRetrieve } from "@/lib/retrieval.mjs";
import { formatQuotaDuration } from "@/lib/quota-display";
import { defaultPreferences, retrievalQuestion, type Preferences } from "@/lib/personalization";
import { clearHistory, loadHistory, loadSummaries } from "@/lib/reading-history";
import { buildConversationContext } from "@/lib/conversation-context";
import { AnswerFeedback, ReaderSettings } from "./reader-controls";
import StartReading from "./start-reading";
import SampleLibrary from "./sample-library";
import { addSampleToLibrary } from "@/lib/sample-library";
import BookManager from "./book-manager";
import type { PassageTarget } from "@/lib/book-inspector";
import VoiceSession from "./voice-session";
import { VoiceCapture } from "@/lib/voice-capture";
import { TurnGate } from "@/lib/voice-turn";
import { normalizeCitations, stripCitations } from "@/lib/citations";
import { VoiceDraft } from "@/lib/voice-draft";
import { VoiceInputGate } from "@/lib/voice-input-gate";
import { beginReply, settleReply, recoverReplies, updateVoiceMessage, leaveUnsent, type Exchange } from "@/lib/chat-turns";
import ReplyProgress from "./reply-progress";
import QuestionMessage from "./question-message";
import { extractPages, embedBookTexts } from "@/lib/book-processing";
import { useReplyAudio } from "@/hooks/use-reply-audio";
import { useChatHistory } from "@/hooks/use-chat-history";
import { useLocalLibrary } from "@/hooks/use-local-library";
import { releaseAudioContext } from "@/lib/audio-context";
import { RetrievalRetryCache } from "@/lib/retrieval-retry";

import type { Stage } from "@/lib/reader-stage";
type Chunk = StoredChunk & { denseScore?: number; sparseScore?: number; fusionScore?: number };
type Source = Pick<Chunk, "id" | "sectionTitle" | "pageStart" | "pageEnd" | "text">;
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
  remembering: "Summarizing earlier conversation; keeping the originals…",
  speaking: "Playing the answer", error: "Something needs attention",
};

function pageLabel(source: Source) {
  if (!source.pageStart) return "Saved passage · page unavailable";
  return source.pageStart === source.pageEnd ? `p. ${source.pageStart}` : `pp. ${source.pageStart}–${source.pageEnd}`;
}

function AnswerText({ text, sourceCount, onCitation }: { text: string; sourceCount: number; onCitation: (index: number) => void }) {
  return <p className="answer-copy">{normalizeCitations(text, sourceCount).text.split(/(\[S\d+\])/g).map((part, index) => {
    const match = part.match(/^\[S(\d+)\]$/);
    return match ? <button className="citation-chip" key={`${part}-${index}`} onClick={() => onCitation(Number(match[1]) - 1)}>{match[1]}</button> : <span key={index}>{part}</span>;
  })}</p>;
}

export default function Home() {
  const [workspaceTab, setWorkspaceTab] = useState<"chat" | "books">("chat");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [book, setBook] = useState<BookSummary | null>(null);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [sampleLibraryOpen, setSampleLibraryOpen] = useState(false);
  const [sampleError, setSampleError] = useState("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [error, setError] = useState("");
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [passageTarget, setPassageTarget] = useState<PassageTarget>();
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceInputState, setVoiceInputState] = useState<"listening" | "transcribing" | null>(null);
  const [transcript, setTranscript] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const { library, setLibrary, libraryReady } = useLocalLibrary(quota?.user.userId, setError);
  const retrievalRetries = useRef(new RetrievalRetryCache<Chunk[]>());
  const [contextNote, setContextNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const capture = useRef<VoiceCapture | null>(null);
  const turnGate = useRef(new TurnGate());
  const transcriptionGate = useRef(new TurnGate());
  const voiceInputGate = useRef(new VoiceInputGate());
  const transcriptionQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedTranscriptions = useRef(0);
  const voiceGeneration = useRef(0);
  const draft = useRef(new VoiceDraft());
  const draftExchange = useRef<string | null>(null);
  const pendingReply = useRef<string | null>(null);
  const actions = useRef({ speechStart: () => {}, utterance: (_file: File, _seconds: number) => {}, stopped: (_reason: string) => {}, sendTranscript: () => {} });
  const { exchanges, exchangesRef, summaries, historyWrites, updateExchanges, persistExchanges } = useChatHistory(quota?.user.userId, book?.id, preferences.rememberHistory, setVoiceNotice);
  const { replayAvailable, setReplayAvailable, audioContext, audioPlayer, audioPlayback, replay, playingExchange, prepareAudio, speak, stopAudio, replayAudio } = useReplyAudio({ voiceInputGate, turnGate, setStage, setVoiceNotice, onInterrupt: interruptReply });
  const conversationEnd = useRef<HTMLDivElement>(null);

  const busy = !["idle", "ready", "error", "listening", "reviewing", "speaking"].includes(stage);
  const bookTransitionBlocked = voiceOn || voiceConnecting || !preferencesReady || !!openingBookId || !["idle", "ready", "error", "speaking"].includes(stage);
  const latest = exchanges.at(-1);
  const currentSources = latest?.sources || [];

  useEffect(() => { conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [exchanges, stage]);
  useEffect(() => () => {
    retrievalRetries.current.clear();
    voiceGeneration.current++; turnGate.current.cancel(); transcriptionGate.current.cancel(); capture.current?.stop();
    releaseAudioContext(audioContext);
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
    retrievalRetries.current.clear();
  }, [quota?.user.userId]);

  useEffect(() => {
    if (!quota?.user.userId) return;
    void fetch("/api/preferences", { cache: "no-store" }).then(async response => {
      const data = await response.json() as { preferences: Preferences; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load preferences.");
      setPreferences(data.preferences);
      if (!data.preferences.rememberHistory) await clearHistory(quota.user.userId);
      setPreferencesReady(true);
    }).catch(() => setError("Reading preferences are unavailable. Please refresh and try again."));
  }, [quota?.user.userId]);

  async function clearReadingHistory() {
    if (!quota || !window.confirm("Clear all conversations saved for this account on this device? Books and indexes will be kept.")) return;
    interruptReply();
    retrievalRetries.current.clear();
    await historyWrites.current;
    await clearHistory(quota.user.userId); summaries.current = {}; setContextNote(""); updateExchanges([]); stopAudio();
  }

  async function savePreferences(next: Preferences) {
    const response = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const data = await response.json() as { preferences: Preferences; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not save preferences.");
    setPreferences(data.preferences);
    if (!data.preferences.rememberHistory && quota) { await historyWrites.current; await clearHistory(quota.user.userId); }
    if (data.preferences.rememberHistory && quota && book) await persistExchanges(exchangesRef.current, quota.user.userId, book.id, true);
  }

  const sampleQuestions = useMemo(() => book ? [
    "What is the central argument of this book?",
    "Summarize the most important turning point.",
    "What evidence does the author rely on?",
  ] : [], [book]);


  const embedTexts = (texts: string[], model?: string, purpose?: string, signal?: AbortSignal) =>
    embedBookTexts(texts, model, purpose, signal, setProgress);

  function bookSummary(stored: StoredBook): BookSummary {
    return summary(stored);
  }

  async function openStoredBook(bookId: string, fromSample = false) {
    const ownerId = quota?.user.userId;
    if (!ownerId || bookTransitionBlocked) return;
    try {
      setOpeningBookId(bookId);
      retrievalRetries.current.clear();
      setSampleError("");
      interruptReply(); clearTranscript(); setVoiceNotice(""); replay.current = null; setReplayAvailable(false);
      stopAudio();
      setError("");
      const stored = fromSample ? await addSampleToLibrary(ownerId, bookId) : await getBook(ownerId, bookId);
      if (!stored) throw new Error("This book is no longer available in the local library.");
      await historyWrites.current;
      const history = recoverReplies(preferences.rememberHistory ? await loadHistory<Exchange>(ownerId, bookId) : []);
      const memory = preferences.rememberHistory ? await loadSummaries(ownerId, bookId) : {};
      setBook(bookSummary(stored));
      setChunks(stored.index);
      updateExchanges(history);
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
      retrievalRetries.current.clear();
      stopAudio(); setError(""); setBook(null); setChunks([]); updateExchanges([]); setProgress(3);
      summaries.current = {}; setContextNote("");
      const id = await fingerprintBook(file);
      const cached = await getBook(ownerId, id);
      if (cached) {
        await openStoredBook(id);
        return;
      }
      setStage("reading");
      const { pages, totalPages, author, ocrPages } = await extractPages(file, setProgress);
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


  async function ask(rawQuestion: string, revision = "", original?: Exchange, retryId?: string) {
    const cleanQuestion = rawQuestion.trim();
    if (!cleanQuestion || !chunks.length || openingBookId || !preferencesReady || !quota?.user.userId || !book) return;
    interruptReply(); cancelIncoming();
    const signal = turnGate.current.next();
    const history = exchangesRef.current.filter(turn => turn.id !== retryId);
    const owner = quota.user.userId, bookId = book.id;
    const exchangeId = retryId || crypto.randomUUID();
    pendingReply.current = exchangeId;
    const pending = beginReply(exchangesRef.current, cleanQuestion, exchangeId);
    updateExchanges(pending);
    clearTranscript(); stopAudio(); setVoiceNotice("");
    void persistExchanges(pending, owner, bookId);
    void prepareAudio().catch(() => {});
    try {
      stopAudio(); setError(""); setStage("retrieving");
      const conversation = await buildConversationContext(cleanQuestion, history, summaries.current, async text => {
        signal.throwIfAborted();
        setStage("remembering");
        const response = await fetch("/api/history/summary", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        const data = await response.json() as { summary: string; error?: string };
        signal.throwIfAborted();
        if (!response.ok) throw new Error(data.error || "Could not summarize the conversation. Please retry; original messages are still saved.");
        return data.summary;
      }, async () => {
        signal.throwIfAborted();
        await persistExchanges(exchangesRef.current, owner, bookId);
      });
      signal.throwIfAborted();
      setContextNote(conversation.mode === "full" ? `Using all ${conversation.totalTurns} previous turns` : `Using earlier summaries, ${conversation.turns.length} recent turns and ${conversation.recalled.length} recalled passages`);
      setStage("retrieving");
      const query = retrievalQuestion(cleanQuestion, history);
      const retrieved = await retrievalRetries.current.retrieve({
        ownerId: owner, bookId, model: book.embeddingModel || "text-embedding-3-small", turnId: exchangeId, query,
      }, chunks, signal, async () => {
        const [queryEmbedding] = await embedTexts([query], book.embeddingModel, "query", signal);
        signal.throwIfAborted();
        if (chunks.some((chunk) => chunk.embedding.length !== queryEmbedding.length)) {
          throw new Error("The question vector does not match this book's saved index.");
        }
        return hybridRetrieve(query, queryEmbedding, chunks, 6) as Chunk[];
      });
      signal.throwIfAborted(); setProgress(100);
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
      const next = settleReply(exchangesRef.current, exchangeId, { replyStatus: "complete", answer: payload.answer, sources });
      pendingReply.current = null; updateExchanges(next);
      await persistExchanges(next, owner, bookId);
      signal.throwIfAborted();
      const spokenAnswer = stripCitations(String(payload.answer)).replace(/[ \t]{2,}/g, " ").trim();
      await speak(spokenAnswer, signal, exchangeId);
    } catch (caught) {
      if (signal.aborted) return;
      const message = caught instanceof Error ? caught.message : "The question could not be answered.";
      pendingReply.current = null;
      const next = settleReply(exchangesRef.current, exchangeId, { replyStatus: "failed", replyError: message });
      updateExchanges(next); void persistExchanges(next, owner, bookId);
      setStage("error");
    }
  }


  function clearTranscript() {
    const id = draftExchange.current; draftExchange.current = null;
    if (id && exchangesRef.current.some(turn => turn.id === id && turn.replyStatus === "draft")) {
      const next = leaveUnsent(exchangesRef.current, id);
      updateExchanges(next); void persistExchanges(next);
    }
    draft.current.clear(); setTranscript(""); setEditingTranscript(false);
  }

  function showDraft() {
    setTranscript(draft.current.text); setEditingTranscript(draft.current.needsReview);
    if (draft.current.text || draftExchange.current) {
      const id = draftExchange.current || crypto.randomUUID(); draftExchange.current = id;
      const next = updateVoiceMessage(exchangesRef.current, draft.current.text, id);
      updateExchanges(next); void persistExchanges(next);
    }
  }

  function cancelIncoming(clear = false) {
    transcriptionGate.current.next(); transcriptionQueue.current = Promise.resolve(); queuedTranscriptions.current = 0;
    voiceInputGate.current.finish(); setVoiceInputState(null);
    if (clear) clearTranscript();
  }

  function markAudioInterrupted() {
    const id = playingExchange.current; playingExchange.current = null;
    if (!id) return;
    const updated = exchangesRef.current.map(turn => turn.id === id ? { ...turn, audioInterrupted: true } : turn);
    updateExchanges(updated); void persistExchanges(updated);
  }

  function interruptReply() {
    // Cancel assistant output only. Incoming speech and its draft are separate.
    turnGate.current.cancel(); markAudioInterrupted(); stopAudio();
    const id = pendingReply.current; pendingReply.current = null;
    if (id) {
      const next = settleReply(exchangesRef.current, id, { replyStatus: "interrupted" });
      updateExchanges(next); void persistExchanges(next);
    }
    setStage(book ? "ready" : "idle");
  }

  function endVoice(reason = "") {
    voiceGeneration.current++; capture.current?.stop(); capture.current = null;
    cancelIncoming(); interruptReply(); setVoiceOn(false); setVoiceConnecting(false); setVoiceMuted(false); setVoiceLevel(0);
    if (draft.current.text) { draft.current.hold(); showDraft(); setStage("reviewing"); }
    setVoiceNotice(reason);
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
    if (!voiceMuted) { draft.current.hold(); showDraft(); }
    capture.current?.mute(!voiceMuted); setVoiceMuted(!voiceMuted);
    if (!voiceMuted && !queuedTranscriptions.current) { voiceInputGate.current.finish(); setVoiceInputState(null); }
    if (stage === "listening") setStage(draft.current.text ? "reviewing" : "ready");
  }

  function sendTranscript() {
    const text = draft.current.text.trim(); if (!text || queuedTranscriptions.current || capture.current?.speaking) return;
    const id = draftExchange.current || undefined;
    capture.current?.mute(false); setVoiceMuted(false); void ask(text, "", undefined, id);
  }

  function discardTranscript() {
    cancelIncoming(true); setError(""); setVoiceNotice("");
    capture.current?.mute(false); setVoiceMuted(false); setStage("ready");
  }

  actions.current = {
    speechStart: () => {
      voiceInputGate.current.begin(); setVoiceInputState("listening");
      // Pause sound promptly, but don't cancel for noise. Empty ASR resumes
      // from the same position; confirmed words cancel the old turn below.
      const playback = audioPlayback.current;
      if (playback?.pause()) {
        void voiceInputGate.current.wait(turnGate.current.signal).then(() => {
          if (audioPlayback.current === playback) playback.resume();
        }).catch(() => {});
      }
      if (!pendingReply.current && !playingExchange.current) setStage("listening");
      setError(""); setVoiceNotice("");
    },
    utterance: (file, seconds) => {
      const signal = transcriptionGate.current.signal;
      queuedTranscriptions.current++; voiceInputGate.current.begin(); setVoiceInputState("transcribing");
      if (!pendingReply.current && !playingExchange.current) setStage("transcribing");
      transcriptionQueue.current = transcriptionQueue.current.then(() => transcribe(file, seconds, signal)).finally(() => {
        if (signal.aborted) return;
        queuedTranscriptions.current--;
        showDraft();
        if (queuedTranscriptions.current || capture.current?.speaking) return;
        voiceInputGate.current.finish(); setVoiceInputState(null);
        if (!pendingReply.current && !playingExchange.current) setStage(draft.current.text ? "reviewing" : draft.current.needsReview ? "error" : "ready");
        if (draft.current.canAutoSend(queuedTranscriptions.current, !!capture.current?.speaking)) actions.current.sendTranscript();
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
      if (appended) interruptReply();
      if (!appended) setVoiceNotice(draft.current.text ? "That sound contained no words. Your recognized question is kept." : pendingReply.current || playingExchange.current ? "No new words detected. Continuing the reply." : "No words detected. Please try speaking again.");
      if (draft.current.needsReview && draft.current.text.length >= 2000) setVoiceNotice("Your question reached the 2,000-character limit. Please review it before sending.");
      if (payload.quota && payload.quota.voice.remainingSeconds < 1) { capture.current?.stop(); capture.current = null; setVoiceOn(false); setVoiceNotice("Voice allowance reached. You can still send the recognized question."); }
    } catch (caught) {
      if (signal.aborted) return;
      draft.current.hold(); showDraft();
      capture.current?.mute(true); setVoiceMuted(true);
      setError((caught instanceof Error ? caught.message : "Speech could not be transcribed.") + (draft.current.text ? " Your earlier words are kept in the chat; review them before sending." : " Resume the microphone to try again.")); setStage("error");
    }
  }


  function resetBook() {
    if (bookTransitionBlocked) return;
    retrievalRetries.current.clear();
    interruptReply(); clearTranscript(); setVoiceNotice(""); replay.current = null; setReplayAvailable(false);
    summaries.current = {}; setContextNote("");
    stopAudio(); setBook(null); setChunks([]); updateExchanges([]);
    setActiveSource(null); setError(""); setProgress(0); setStage("idle");
  }

  async function logout() {
    endVoice();
    retrievalRetries.current.clear();
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
          <div className="account-quota" role="status" aria-label="Today's remaining allowance" title="Remaining / daily limit. Voice time is minutes:seconds. Resets at midnight Singapore time.">
            <small>Remaining / daily limit</small>
            {quota ? <div><span>Questions <b>{quota.questions.remaining}</b> / {quota.questions.limit} </span><span>Voice <b>{formatQuotaDuration(quota.voice.remainingSeconds)}</b> / {formatQuotaDuration(quota.voice.limitSeconds)}</span></div> : <span>Allowance unavailable</span>}
          </div>
          <div className="account-controls">
            <span className="account-name" title={quota?.user.username}><UserRound size={15} /><span>{quota?.user.username || "Account"}</span></span>
            <button className="icon-action" onClick={() => void logout()} aria-label={`Sign out ${quota?.user.username || "user"}`} title="Sign out"><LogOut size={15} /></button>
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
            {!book ? <StartReading books={library} disabled={bookTransitionBlocked} openingBookId={openingBookId} onSelect={openStoredBook} onUpload={() => fileInput.current?.click()} onSamples={() => { setSampleError(""); setSampleLibraryOpen(true); }} /> : exchanges.length === 0 ? <div className="ready-state">
              <div className="orb-small"><Headphones size={28} /></div><p className="eyebrow">The book is listening</p><h2>What would you like to understand?</h2>
              <p>Ask about an argument, event, character, definition, or connection across chapters.</p>
              <div className="sample-grid">{sampleQuestions.map((sample) => <button key={sample} onClick={() => void ask(sample)}>{sample}<ArrowUp size={13} /></button>)}</div>
            </div> : <div className="conversation-list">{exchanges.map((exchange) => <article className="exchange" key={exchange.id}>
              <QuestionMessage text={exchange.question} unsent={exchange.replyStatus === "draft" || exchange.replyStatus === "unsent"}
                editing={exchange.id === draftExchange.current && editingTranscript}
                processing={exchange.replyStatus === "draft" ? stage === "listening" || stage === "transcribing" : exchange.replyStatus === "unsent" ? busy || stage === "listening" : false}
                onChange={exchange.id === draftExchange.current ? text => { draft.current.edit(text); showDraft(); } : undefined}
                onSend={exchange.id === draftExchange.current && editingTranscript ? sendTranscript : exchange.replyStatus === "unsent" ? () => void ask(exchange.question, "", undefined, exchange.id) : undefined}
                onLeave={exchange.id === draftExchange.current && editingTranscript ? discardTranscript : undefined} />
              {!["draft", "unsent"].includes(exchange.replyStatus || "") && <div className="answer-row"><div className="answer-label"><span className="mini-mark"><Volume2 size={13} /></span> Voicebook</div>
                {exchange.answer ? <>
                <AnswerText text={exchange.answer} sourceCount={exchange.sources.length} onCitation={(index) => setActiveSource(exchange.sources[index] || null)} />
                {exchange.audioInterrupted && <small className="playback-note">Voice reply interrupted · Full text kept above</small>}
                <div className="source-strip">{exchange.sources.slice(0, 4).map((source, index) => <button key={source.id} onClick={() => setActiveSource(source)}><b>{index + 1}</b>{pageLabel(source)} · {source.sectionTitle}</button>)}</div>
                <AnswerFeedback exchange={exchange} bookName={book?.name || ""} disabled={bookTransitionBlocked || !preferencesReady} onRewrite={instruction => void ask(exchange.question, instruction, exchange)} onRemember={async instruction => {
                  const guidance = [preferences.guidance, instruction].filter(Boolean).join("\n");
                  if (guidance.length > 600) throw new Error("Preferences exceed 600 characters. Please shorten them in Reading preferences.");
                  await savePreferences({ ...preferences, guidance });
                }} />
                </> : exchange.replyStatus === "pending" ? <ReplyProgress label={stageCopy[stage]} detail="Your question is sent and stays in this conversation." onStop={interruptReply} /> : <div className="reply-incomplete" role="status">
                  <span>{exchange.replyStatus === "failed" ? `Reply failed. ${exchange.replyError || "Please try again."}` : "Reply stopped. Your question is kept."}</span>
                  <button disabled={busy || stage === "listening" || !!openingBookId || !preferencesReady} onClick={() => void ask(exchange.question, "", undefined, exchange.id)}>Retry reply</button>
                </div>}
                {playingExchange.current === exchange.id && ["voicing", "speaking"].includes(stage) && <ReplyProgress label={stageCopy[stage]} detail="Speak again or stop the reply at any time." speaking={stage === "speaking"} onStop={interruptReply} />}
              </div>}
            </article>)}</div>}
            {busy && !["retrieving", "remembering", "answering", "voicing"].includes(stage) && <div className="thinking-card"><LoaderCircle className="spin" size={18} /><div><strong>{stageCopy[stage]}</strong><span>This usually takes a few seconds</span></div></div>}
            {error && <div className="error-card"><X size={17} /><span>{error}</span><button onClick={() => { setError(""); setStage(book ? "ready" : "idle"); }}>Dismiss</button></div>}
            <div ref={conversationEnd} />
          </div>

          <div className="composer-wrap">
            <VoiceSession active={voiceOn} connecting={voiceConnecting} level={voiceLevel} state={voiceInputState || stage} muted={voiceMuted}
              onMute={muteVoice} onFinish={() => capture.current?.finish()} onEnd={() => endVoice()} />
            {voiceNotice && <p className="voice-notice" role="status">{voiceNotice}</p>}
            <div className="voice-toolbar">
              {book && !voiceOn && !voiceConnecting && !transcript && <button className="start-voice-button" onClick={() => void startRecording()} disabled={busy || !preferencesReady || !!openingBookId}><Mic size={18} /> Start voice conversation</button>}
              {replayAvailable && ["ready", "error"].includes(stage) && !transcript && <button onClick={() => void replayAudio()}><Play size={13} /> Play saved audio</button>}
            </div>
            {(stage === "reading" || stage === "indexing") && <div className="progress-block"><span style={{ width: `${progress}%` }} /><p>{stageCopy[stage]} <b>{progress}%</b></p></div>}
            <p className="ai-disclosure">{contextNote || "Short conversations use all prior turns; longer ones use summaries and recalled messages."}<br />{preferences.rememberHistory ? `All ${exchanges.length} turns saved on this device` : "History saving is off"} · Answers and audio are AI-generated. Check the cited passages.</p>
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
