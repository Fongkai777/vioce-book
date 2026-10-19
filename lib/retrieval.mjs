const TOKEN_RE = /[\p{L}\p{N}]+/gu;

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

// Per-chunk term statistics are cached on the chunk object, so repeated questions
// against the same loaded book do not re-tokenize every passage.
const termStats = new WeakMap();

function chunkTerms(chunk) {
  let stats = termStats.get(chunk);
  if (!stats || stats.title !== chunk.sectionTitle || stats.text !== chunk.text) {
    const tokens = tokenize(`${chunk.sectionTitle} ${chunk.text}`);
    const frequencies = new Map();
    for (const term of tokens) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    stats = { title: chunk.sectionTitle, text: chunk.text, length: tokens.length, frequencies };
    termStats.set(chunk, stats);
  }
  return stats;
}

export function bm25Scores(query, chunks, k1 = 1.5, b = 0.75) {
  const queryTerms = [...new Set(tokenize(query))];
  const documents = chunks.map(chunkTerms);
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / Math.max(documents.length, 1);
  // Document frequency once per query term: O(terms × chunks), not O(chunks² × length).
  const idf = new Map(queryTerms.map((term) => {
    const documentFrequency = documents.reduce((count, doc) => count + (doc.frequencies.has(term) ? 1 : 0), 0);
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
