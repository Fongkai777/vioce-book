import { getBook, getBookPdf, saveBookIfMissing, summary, type StoredBook } from "./book-library.ts";
import { loadHistory, loadSummaries, restoreHistory } from "./reading-history.ts";
import { base64, unbase64, encryptBackup, decryptBackup } from "./backup-crypto.ts";

type SavedTurn = { id: string; question: string; answer: string };
type BookBackup = { kind: "voicebook-local-book"; version: 1; ownerId: string; createdAt: string;
  book: Omit<StoredBook, "pdf" | "ownerId" | "storageKey">; pdf?: string; turns: SavedTurn[]; summaries: Record<string, string> };
export const MAX_LOCAL_BACKUP_BYTES = 75_000_000;
export async function exportLocalBook(ownerId: string, bookId: string, passphrase: string) {
  if (!ownerId) throw new Error("Sign in before backing up a book.");
  const book = await getBook(ownerId, bookId);
  if (!book) throw new Error("This book is no longer available.");
  const pdf = await getBookPdf(ownerId, bookId);
  if (pdf && pdf.size > 35_000_000) throw new Error("This PDF exceeds the 35 MB backup limit. Keep its original file separately.");
  const value: BookBackup = { kind: "voicebook-local-book", version: 1, ownerId, createdAt: new Date().toISOString(),
    book: { ...summary(book), index: book.index, fullText: book.fullText },
    pdf: pdf ? base64(new Uint8Array(await pdf.arrayBuffer())) : undefined,
    turns: await loadHistory(ownerId, bookId), summaries: await loadSummaries(ownerId, bookId) };
  if (new TextEncoder().encode(JSON.stringify(value)).length > 50_000_000) throw new Error("This book and index exceed the 50 MB backup limit.");
  return encryptBackup(value, passphrase);
}
export function validateLocalBook(value: unknown, ownerId: string): BookBackup {
  const data = value as BookBackup, book = data?.book;
  if (!ownerId || data?.kind !== "voicebook-local-book" || data.version !== 1 || data.ownerId !== ownerId) throw new Error("This is not a book backup for the signed-in account.");
  const strings = [book?.id, book?.name, book?.storedAt, book?.lastOpenedAt], dimension = book?.embeddingDimensions || 1536;
  if (!book || strings.some(v => typeof v !== "string" || !v || v.length > 500) ||
    ![book.pages, book.chapters, book.chunks, book.fileSize].every(v => Number.isSafeInteger(v) && v >= 0) ||
    !Number.isInteger(dimension) || dimension < 1 || dimension > 4096 ||
    !Array.isArray(book.index) || book.index.length > 20000 || book.index.length !== book.chunks ||
    book.index.some(c => !c || typeof c.id !== "string" || typeof c.sectionTitle !== "string" || typeof c.text !== "string" ||
      !Number.isInteger(c.pageStart) || c.pageStart < 0 || !Number.isInteger(c.pageEnd) || c.pageEnd < c.pageStart ||
      !Array.isArray(c.embedding) || c.embedding.length !== dimension || c.embedding.some(n => !Number.isFinite(n))) ||
    (book.fullText !== undefined && typeof book.fullText !== "string") ||
    (data.pdf !== undefined && (typeof data.pdf !== "string" || data.pdf.length > 47_000_000)) ||
    !Array.isArray(data.turns) || data.turns.some(t => !t || typeof t.id !== "string" || typeof t.question !== "string" || typeof t.answer !== "string") ||
    !data.summaries || Array.isArray(data.summaries) || typeof data.summaries !== "object" || Object.values(data.summaries).some(v => typeof v !== "string")) {
    throw new Error("The book backup is invalid. No data was changed.");
  }
  return data;
}
export async function restoreLocalBook(ownerId: string, encrypted: unknown, passphrase: string) {
  const data = validateLocalBook(await decryptBackup(encrypted, passphrase, MAX_LOCAL_BACKUP_BYTES), ownerId);
  const existing = await getBook(ownerId, data.book.id);
  if (existing && JSON.stringify(existing.index) !== JSON.stringify(data.book.index)) throw new Error("A different index already exists for this book. Nothing was overwritten.");
  const pdf = data.pdf ? new Blob([unbase64(data.pdf)], { type: "application/pdf" }) : undefined;
  await saveBookIfMissing(ownerId, { ...data.book, pdf });
  // Separate IndexedDB databases: retry safely if history writing fails after
  // book insertion. Never claim cross-database atomicity or replace newer turns.
  await restoreHistory(ownerId, data.book.id, data.turns, data.summaries);
  return data.book.name;
}
