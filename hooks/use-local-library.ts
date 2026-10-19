"use client";
import { useEffect, useState } from "react";
import { listBooks, type BookSummary } from "../lib/book-library";

/** Lists lightweight metadata only. Full content and PDFs are loaded on demand. */
export function useLocalLibrary(ownerId: string | undefined, onError: (message: string) => void) {
  const [library, setLibrary] = useState<BookSummary[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  useEffect(() => {
    setLibrary([]);
    setLibraryReady(false);
    if (!ownerId) return;
    let cancelled = false;
    void listBooks(ownerId)
      .then(books => { if (!cancelled) setLibrary(books); })
      .catch(() => { if (!cancelled) onError("Your local book library could not be opened."); })
      .finally(() => { if (!cancelled) setLibraryReady(true); });
    return () => { cancelled = true; };
  }, [ownerId, onError]);
  return { library, setLibrary, libraryReady };
}
