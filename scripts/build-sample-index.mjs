// Explicit maintenance command only. Never runs during deployment or user selection.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { sampleBooks } from "../content/sample-books.mjs";
const output = new URL("../content/sample-index.json", import.meta.url);
const sourceHash = createHash("sha256").update(JSON.stringify(sampleBooks)).digest("hex");
if (existsSync(output) && JSON.parse(readFileSync(output, "utf8")).sourceHash === sourceHash) {
  console.log("Sample index is up to date; no API call.");
  process.exit(0);
}
const config = { ...process.env };
for (const path of [".env.local", ".env", ".dev.vars"]) {
  if (existsSync(path)) for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) config[key] ??= value;
}
if (!config.OPENAI_API_KEY) throw new Error("An approved OPENAI_API_KEY is required.");
const input = sampleBooks.flatMap(book => book.chapters.map(chapter => `${chapter.title}\n${chapter.text}`));
let response;
try {
  response = await fetch(`${(config.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/embeddings`, {
    method: "POST", headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input, encoding_format: "float" }), signal: AbortSignal.timeout(60000),
  });
} catch { throw new Error("Sample embedding request failed; no output was written."); }
if (!response.ok) throw new Error(`Sample embedding request failed (HTTP ${response.status}); no output was written.`);
const data = await response.json();
const rows = data.data?.sort((a, b) => a.index - b.index);
if (!Array.isArray(rows) || rows.length !== input.length || rows.some((row, i) => row.index !== i || !Array.isArray(row.embedding) || row.embedding.length !== 1536 || !row.embedding.every(Number.isFinite))) {
  throw new Error("Invalid sample embeddings; no output was written.");
}
let position = 0;
const books = sampleBooks.map(book => ({ id: book.id, name: book.name, embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536,
  fullText: book.chapters.map(chapter => `${chapter.title}\n\n${chapter.text}`).join("\n\n"),
  index: book.chapters.map((chapter, i) => ({ id: `${book.id}-chapter-${i + 1}`, sectionTitle: chapter.title, text: chapter.text,
    pageStart: 0, pageEnd: 0, embedding: rows[position++].embedding })),
}));
writeFileSync(output, JSON.stringify({ format: "voicebook-library", version: 1, sourceHash, books }) + "\n");
console.log(JSON.stringify({ books: books.length, passages: position, model: "text-embedding-3-small", tokens: data.usage?.total_tokens, output: "content/sample-index.json" }));
