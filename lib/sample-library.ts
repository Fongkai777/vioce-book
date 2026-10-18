import { getBook, saveBookIfMissing, type StoredChunk } from "./book-library.ts";
import { parseBookBundle } from "./book-import.mjs";

export async function addSampleToLibrary(ownerId: string, sampleId: string, request: typeof fetch = fetch) {
  if (!ownerId || !/^sample-[a-z0-9-]+-v\d+$/.test(sampleId)) throw new Error("Invalid sample selection.");
  const existing = await getBook(ownerId, sampleId);
  if (existing) return existing;
  const response = await request(`/api/samples?id=${encodeURIComponent(sampleId)}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(response.status === 401 ? "Please sign in again to use a sample." : "The sample could not be downloaded. Please try again.");
  const books = parseBookBundle(await response.json());
  if (books.length !== 1 || books[0].id !== sampleId) throw new Error("The downloaded sample does not match your selection.");
  const book = { ...books[0], importedFrom: "Voicebook sample", chapters: new Set(books[0].index.map((chunk: StoredChunk) => chunk.sectionTitle)).size };
  await saveBookIfMissing(ownerId, book);
  const saved = await getBook(ownerId, sampleId);
  if (!saved) throw new Error("The sample could not be saved in this browser.");
  return saved;
}
