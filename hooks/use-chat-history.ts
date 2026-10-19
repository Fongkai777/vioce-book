"use client";
import { useRef, useState } from "react";
import { saveHistory, type SummaryCache } from "../lib/reading-history";
import type { Exchange } from "../lib/chat-turns";

export function useChatHistory(ownerId: string | undefined, activeBookId: string | undefined, rememberHistory: boolean, setVoiceNotice: (message: string) => void) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const summaries = useRef<SummaryCache>({});
  const historyWrites = useRef<Promise<void>>(Promise.resolve());
  const exchangesRef = useRef<Exchange[]>([]);
  exchangesRef.current = exchanges;
  function updateExchanges(next: Exchange[]) {
    exchangesRef.current = next;
    setExchanges(next);
  }

  function persistExchanges(turns: Exchange[], owner = ownerId, bookId = activeBookId, remember = rememberHistory) {
    if (!remember || !owner || !bookId) return Promise.resolve();
    const memory = { ...summaries.current };
    // Serialize pending/completed/interrupted writes so an older snapshot
    // cannot replace a newer reply after an asynchronous IndexedDB open.
    historyWrites.current = historyWrites.current.then(() => saveHistory(owner, bookId, turns, memory)).catch(() => {
      setVoiceNotice("Your messages are still visible, but could not be saved on this device. Keep this page open.");
    });
    return historyWrites.current;
  }

  return { exchanges, exchangesRef, summaries, historyWrites, updateExchanges, persistExchanges };
}
