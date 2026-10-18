import type { StoredChunk } from "./book-library.ts";

export function filterChunks(chunks: StoredChunk[], search: string, section: string) {
  const query = search.trim().toLocaleLowerCase();
  return chunks.filter(chunk => (!section || chunk.sectionTitle === section) && (!query ||
    `${chunk.id}\n${chunk.sectionTitle}\n${chunk.text}`.toLocaleLowerCase().includes(query)));
}

export function indexStatistics(chunks: StoredChunk[], expectedDimensions: number) {
  let validVectors = 0, characters = 0, values = 0, withPages = 0;
  const dimensions = new Set<number>();
  for (const chunk of chunks) {
    characters += chunk.text.length;
    values += chunk.embedding.length;
    dimensions.add(chunk.embedding.length);
    if (chunk.embedding.length === expectedDimensions && chunk.embedding.every(Number.isFinite)) validVectors++;
    if (chunk.pageStart > 0) withPages++;
  }
  return { validVectors, characters, values, withPages, dimensions: [...dimensions], sections: new Set(chunks.map(chunk => chunk.sectionTitle)).size };
}

export function chunkPageLabel(chunk: Pick<StoredChunk, "pageStart" | "pageEnd">) {
  if (!chunk.pageStart) return "Page unavailable";
  return chunk.pageStart === chunk.pageEnd ? `Page ${chunk.pageStart}` : `Pages ${chunk.pageStart}–${chunk.pageEnd}`;
}
