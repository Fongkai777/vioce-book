// Server-only catalogue. Never derive this list from personal libraries or user uploads.
import { sampleBooks } from "../content/sample-books.mjs";
import type { SampleSummary } from "./sample-types";

export const sampleCatalog: SampleSummary[] = sampleBooks.map(book => ({
  id: book.id, name: book.name, description: book.description,
  chapters: book.chapters.length, suggestedQuestion: book.suggestedQuestion,
}));

export async function sampleBundle(id: string) {
  if (!sampleCatalog.some(book => book.id === id)) return undefined;
  const { default: index } = await import("../content/sample-index.json");
  const book = index.books.find(book => book.id === id);
  if (!book) throw new Error("Sample index is unavailable.");
  return { format: "voicebook-library", version: 1, books: [book] };
}
