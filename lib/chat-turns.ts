import type { StoredChunk } from "./book-library.ts";

export type ChatSource = Pick<StoredChunk, "id" | "sectionTitle" | "pageStart" | "pageEnd" | "text">;
export type Exchange = {
  id: string; question: string; answer: string; sources: ChatSource[];
  audioInterrupted?: boolean;
  replyStatus?: "draft" | "unsent" | "pending" | "complete" | "interrupted" | "failed";
  replyError?: string;
};

// A user message exists from submission onwards, independently of the reply.
export function beginReply(turns: Exchange[], question: string, id: string): Exchange[] {
  const pending: Exchange = { id, question, answer: "", sources: [], replyStatus: "pending" };
  return turns.some(turn => turn.id === id)
    ? turns.map(turn => turn.id === id ? pending : turn)
    : [...turns, pending];
}

export function updateVoiceMessage(turns: Exchange[], question: string, id: string): Exchange[] {
  const existing = turns.find(turn => turn.id === id);
  if (existing && existing.replyStatus !== "draft") return turns;
  const draft: Exchange = { id, question, answer: "", sources: [], replyStatus: "draft" };
  return existing ? turns.map(turn => turn.id === id ? draft : turn) : [...turns, draft];
}

export function leaveUnsent(turns: Exchange[], id: string): Exchange[] {
  return turns.map(turn => turn.id === id && turn.replyStatus === "draft" ? { ...turn, replyStatus: "unsent" } : turn);
}

export function settleReply(turns: Exchange[], id: string, result: Pick<Exchange, "replyStatus"> & Partial<Pick<Exchange, "answer" | "sources" | "replyError">>): Exchange[] {
  return turns.map(turn => turn.id === id && turn.replyStatus === "pending" ? { ...turn, ...result } : turn);
}

// After a refresh there is no live request to resume. Keep the question and
// offer an explicit retry; never automatically replay a paid request.
export function recoverReplies(turns: Exchange[]): Exchange[] {
  return turns.map(turn => turn.replyStatus === "pending" ? { ...turn, replyStatus: "interrupted" } : turn.replyStatus === "draft" ? { ...turn, replyStatus: "unsent" } : turn);
}
