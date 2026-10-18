// Only known vector spaces are accepted. A matching dimension alone is not enough.
const dimensions = { "text-embedding-3-small": 1536, "text-embedding-v4": 1024 };

export function parseBookBundle(value) {
  if (value?.format !== "voicebook-library" || value.version !== 1 ||
      !Array.isArray(value.books) || !value.books.length || value.books.length > 100) {
    throw new Error("Choose a valid Voicebook library bundle (version 1).");
  }
  const seen = new Set();
  return value.books.map((book) => {
    const size = dimensions[book.embeddingModel];
    if (!size || book.embeddingDimensions !== size) throw new Error("Unsupported embedding model or dimension.");
    if (typeof book.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(book.id) || seen.has(book.id)) {
      throw new Error("Invalid or duplicate book identifier.");
    }
    seen.add(book.id);
    if (typeof book.name !== "string" || !book.name.trim() || book.name.length > 500 ||
        !Array.isArray(book.index) || !book.index.length || book.index.length > 30000) {
      throw new Error("The bundle contains an invalid book.");
    }
    const ids = new Set();
    const index = book.index.map((chunk) => {
      if (typeof chunk.id !== "string" || ids.has(chunk.id) || typeof chunk.text !== "string" || !chunk.text.trim() ||
          typeof chunk.sectionTitle !== "string" || chunk.text.length > 100000 ||
          !Array.isArray(chunk.embedding) || chunk.embedding.length !== size ||
          !chunk.embedding.every((n) => typeof n === "number" && Number.isFinite(n))) {
        throw new Error(`Invalid saved passage in ${book.name}. Nothing has been re-indexed.`);
      }
      ids.add(chunk.id);
      for (const page of [chunk.pageStart, chunk.pageEnd]) {
        if (!Number.isSafeInteger(page) || page < 0) throw new Error("Invalid passage page number.");
      }
      if (chunk.pageEnd < chunk.pageStart) throw new Error("Invalid passage page range.");
      return { id: chunk.id, sectionTitle: chunk.sectionTitle, text: chunk.text,
        pageStart: chunk.pageStart, pageEnd: chunk.pageEnd, embedding: chunk.embedding };
    });
    const now = new Date().toISOString();
    return {
      id: book.id, name: book.name.trim(), pages: Math.max(...index.map((c) => c.pageEnd)),
      chapters: 0, chunks: index.length, fileSize: 0,
      storedAt: now, lastOpenedAt: now, embeddingModel: book.embeddingModel,
      embeddingDimensions: size, importedFrom: "Counseling Copilot",
      fullText: typeof book.fullText === "string" ? book.fullText : undefined, index,
    };
  });
}
