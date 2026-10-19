const TOKEN_RE = /[\p{L}\p{N}]+/gu;
export const BM25_VERSION = 1; // Increment whenever tokenization/statistics change.

export function tokenize(text) {
  return (text.toLowerCase().match(TOKEN_RE) || []).flatMap((token) => {
    if (/^[\u3400-\u9fff]+$/u.test(token) && token.length > 1) {
      return [token, ...Array.from({ length: token.length - 1 }, (_, index) => token.slice(index, index + 2))];
    }
    return [token];
  });
}

export function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error("Cannot compare vectors from different dimensions");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

const corpora = new WeakMap();
function statistics(chunks) {
  const df = new Map();
  const documents = chunks.map(chunk => {
    const tokens = tokenize(`${chunk.sectionTitle} ${chunk.text}`), frequencies = new Map();
    for (const term of tokens) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    for (const term of frequencies.keys()) df.set(term, (df.get(term) || 0) + 1);
    return { length: tokens.length, frequencies };
  });
  return { documents, df, averageLength: documents.reduce((n, doc) => n + doc.length, 0) / Math.max(1, documents.length) };
}
function install(chunks, stats) {
  corpora.set(chunks, { ...stats, snapshot: chunks.map(chunk => [chunk.id, chunk.sectionTitle, chunk.text]) });
  return stats;
}
function corpus(chunks) {
  const cached = corpora.get(chunks);
  if (cached && cached.snapshot.length === chunks.length && chunks.every((c, i) =>
    c.id === cached.snapshot[i][0] && c.sectionTitle === cached.snapshot[i][1] && c.text === cached.snapshot[i][2])) return cached;
  return install(chunks, statistics(chunks));
}
async function sourceFingerprint(chunks) {
  const bytes = new TextEncoder().encode(JSON.stringify(chunks.map(c => [c.id, c.sectionTitle, c.text])));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
export async function buildBM25Index(chunks) {
  const fingerprint = await sourceFingerprint(chunks);
  const stats = corpus(chunks);
  return { version: BM25_VERSION, fingerprint, documents: stats.documents.map(d => ({ length: d.length, terms: [...d.frequencies] })), df: [...stats.df] };
}
// Validate cache shape and source identity before hydration. This is cache integrity,
// not a security/provenance assertion about the user's book.
export async function restoreBM25Index(chunks, saved) {
  if (!saved || saved.version !== BM25_VERSION || saved.fingerprint !== await sourceFingerprint(chunks) ||
      !Array.isArray(saved.documents) || saved.documents.length !== chunks.length || !Array.isArray(saved.df)) return false;
  const validPairs = pairs => Array.isArray(pairs) && pairs.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === "string" && Number.isSafeInteger(p[1]) && p[1] > 0) && new Map(pairs).size === pairs.length;
  const computed = new Map();
  for (const doc of saved.documents) {
    if (!doc || !Number.isSafeInteger(doc.length) || doc.length < 0 || !validPairs(doc.terms) || doc.terms.reduce((n, p) => n + p[1], 0) !== doc.length) return false;
    for (const [term] of doc.terms) computed.set(term, (computed.get(term) || 0) + 1);
  }
  if (!validPairs(saved.df) || computed.size !== saved.df.length || saved.df.some(([term, count]) => computed.get(term) !== count)) return false;
  const documents = saved.documents.map(d => ({ length: d.length, frequencies: new Map(d.terms) }));
  install(chunks, { documents, df: new Map(saved.df), averageLength: documents.reduce((n, d) => n + d.length, 0) / Math.max(1, documents.length) });
  return true;
}

export function bm25Scores(query, chunks, k1 = 1.5, b = 0.75) {
  const queryTerms = [...new Set(tokenize(query))];
  const { documents, averageLength, df } = corpus(chunks);
  // DF is precomputed for the whole book, not scanned again for each query.
  const idf = new Map(queryTerms.map((term) => {
    const documentFrequency = df.get(term) || 0;
    return [term, Math.log(1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5))];
  }));

  return documents.map((doc) => queryTerms.reduce((score, term) => {
    const frequency = doc.frequencies.get(term) || 0;
    if (!frequency) return score;
    const denominator = frequency + k1 * (1 - b + b * (doc.length / Math.max(averageLength, 1)));
    return score + idf.get(term) * ((frequency * (k1 + 1)) / denominator);
  }, 0));
}

function ranks(scores) {
  const result = new Map();
  scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .forEach((item, rank) => result.set(item.index, rank + 1));
  return result;
}

function jaccard(a, b) {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.max(1, left.size + right.size - intersection);
}

// Reciprocal-rank fusion constant (Cormack et al., 2009).
const RRF_K = 60;
// Diversity penalty, on the same scale as fused scores. Adjacent RRF ranks differ by
// roughly 0.0003, so a near-duplicate (Jaccard ≈ 1) loses about ten ranks.
const RELEVANCE_WEIGHT = 0.82;
const REDUNDANCY_PENALTY = 0.0036;

export function hybridRetrieve(query, queryEmbedding, chunks, limit = 6) {
  if (!chunks.length) return [];
  const dense = chunks.map((chunk) => cosineSimilarity(queryEmbedding, chunk.embedding || []));
  const sparse = bm25Scores(query, chunks);
  const denseRanks = ranks(dense);
  const sparseRanks = ranks(sparse);
  const candidates = chunks
    .map((chunk, index) => ({
      ...chunk,
      denseScore: dense[index],
      sparseScore: sparse[index],
      fusionScore: 1 / (RRF_K + denseRanks.get(index)) + 1 / (RRF_K + sparseRanks.get(index)),
    }))
    .sort((a, b) => b.fusionScore - a.fusionScore)
    .slice(0, Math.max(limit * 4, 12));

  const selected = [];
  while (selected.length < Math.min(limit, candidates.length)) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    candidates.forEach((candidate, index) => {
      if (selected.some((item) => item.id === candidate.id)) return;
      const redundancy = selected.length
        ? Math.max(...selected.map((item) => jaccard(candidate.text, item.text)))
        : 0;
      const score = RELEVANCE_WEIGHT * candidate.fusionScore - REDUNDANCY_PENALTY * redundancy;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    const next = candidates[bestIndex];
    if (selected.some((item) => item.id === next.id)) break;
    selected.push(next);
  }
  return selected;
}

export function isLikelyHeading(line) {
  const value = line.trim();
  if (!value || value.length > 100) return false;
  if (/^(chapter|part|section|book|appendix)\s+[\divxlcdm]+\b/i.test(value)) return true;
  if (/^第[\d一二三四五六七八九十百零〇两]+[章节部篇卷]/u.test(value)) return true;
  if (/^[\divxlcdm]+[.)、]\s*\S+/i.test(value)) return true;
  const letters = value.replace(/[^A-Za-z]/g, "");
  return letters.length > 5 && letters === letters.toUpperCase() && value.split(/\s+/).length <= 12;
}

export function buildStructuralChunks(pages, targetSize = 1400, overlap = 180) {
  const sections = [];
  let current = { title: "Front matter", pageStart: 1, pageEnd: 1, paragraphs: [] };

  for (const page of pages) {
    const lines = page.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (isLikelyHeading(line)) {
        if (current.paragraphs.length) sections.push(current);
        current = { title: line, pageStart: page.pageNumber, pageEnd: page.pageNumber, paragraphs: [] };
      } else {
        current.paragraphs.push({ text: line, page: page.pageNumber });
        current.pageEnd = page.pageNumber;
      }
    }
  }
  if (current.paragraphs.length) sections.push(current);

  const chunks = [];
  for (const section of sections) {
    let buffer = [];
    let length = 0;
    const flush = () => {
      if (!buffer.length) return;
      const text = buffer.map((part) => part.text).join("\n");
      chunks.push({
        id: `c${chunks.length + 1}`,
        sectionTitle: section.title,
        pageStart: buffer[0].page,
        pageEnd: buffer.at(-1).page,
        text,
      });
      const tail = [];
      let tailLength = 0;
      for (let index = buffer.length - 1; index >= 0 && tailLength < overlap; index -= 1) {
        tail.unshift(buffer[index]);
        tailLength += buffer[index].text.length;
      }
      buffer = tail;
      length = tailLength;
    };

    for (const paragraph of section.paragraphs) {
      if (length + paragraph.text.length > targetSize && buffer.length) flush();
      buffer.push(paragraph);
      length += paragraph.text.length;
    }
    flush();
  }
  return chunks;
}
