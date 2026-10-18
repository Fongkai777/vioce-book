import { tokenize } from "./retrieval.mjs";

export type HistoryTurn = { question: string; answer: string };
export type ConversationContext = { mode: "full" | "compressed"; turns: HistoryTurn[]; summary: string; recalled: string[]; totalTurns: number };
export type SummaryCache = Record<string, string>;
// Application budgets, not model context limits. UTF-8 bytes conservatively
// bound text size, leaving room for book excerpts, instructions and output.
// Current gpt-5-mini has a 400k-token context. 240k UTF-8 bytes is a
// deliberately conservative history envelope; the remaining space covers
// up to eight book excerpts, instructions, the current question and output.
export const HISTORY_BUDGET = 240_000;
export const RECENT_BUDGET = 120_000;
export const SUMMARY_BUDGET = 7_000;
export const RECALL_BUDGET = 7_000;
export const SUMMARY_BATCH = 16_000;
export const SUMMARY_OUTPUT = 3_500;
export const bytes = (text: string) => new TextEncoder().encode(text).length;
export function normalizeHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter(x => x && typeof x.question === "string" && typeof x.answer === "string")
    .map(x => ({ question: x.question, answer: x.answer.replace(/\[S\d+\]/g, "") }));
}
export function splitText(text: string, limit: number): string[] {
  const parts: string[] = []; let part = "", size = 0;
  for (const char of text) {
    const width = bytes(char);
    if (size + width > limit && part) { parts.push(part); part = ""; size = 0; }
    part += char; size += width;
  }
  if (part) parts.push(part);
  return parts;
}
function render(turn: HistoryTurn, index: number) { return `第 ${index + 1} 轮\n用户：${turn.question}\n助手：${turn.answer}`; }
export function recallHistory(question: string, history: HistoryTurn[], budget = RECALL_BUDGET) {
  const terms = new Set<string>(tokenize(question).filter((x: string) => x.length > 1));
  const passages = history.flatMap((turn, index) => splitText(render(turn, index), 3000).map(text => {
    const tokens = new Set(tokenize(text));
    let score = 0;
    for (const term of terms) if (tokens.has(term)) score += term.length;
    const ordinal = question.match(/第\s*(\d+)\s*(?:轮|个问题|次)/);
    if (ordinal && Number(ordinal[1]) === index + 1) score += 1000;
    if (/(最早|一开始|最初|第一个|第一轮)/.test(question) && index === 0) score += 1000;
    return { text, score, index };
  })).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: string[] = []; let used = 0;
  for (const item of passages) if (used + bytes(item.text) + 8 <= budget) { selected.push(item.text); used += bytes(item.text) + 8; }
  return selected;
}
async function digest(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), b => b.toString(16).padStart(2, "0")).join("");
}
export async function buildConversationContext(question: string, value: unknown, cache: SummaryCache,
  summarize: (text: string) => Promise<string>, onCache?: () => Promise<void>): Promise<ConversationContext> {
  const history = normalizeHistory(value);
  const full: ConversationContext = { mode: "full", turns: history, summary: "", recalled: [], totalTurns: history.length };
  if (bytes(JSON.stringify(full)) <= HISTORY_BUDGET) return full;
  let cut = history.length, size = 2;
  while (cut > 0) {
    const next = bytes(JSON.stringify(history[cut - 1])) + 1;
    if (size + next > RECENT_BUDGET) break;
    size += next; cut -= 1;
  }
  const early = history.slice(0, cut);
  // Content-addressed blocks are reused as messages arrive. Oversized turns
  // are processed across blocks in full, never truncated from stored history.
  let memory = early.map(render).join("\n\n");
  let level = 0;
  do {
    const outputs: string[] = [];
    for (const block of splitText(memory, SUMMARY_BATCH)) {
      const key = await digest(`memory-v1:${level}:${block}`);
      let summary = cache[key];
      if (!summary || bytes(summary) > SUMMARY_OUTPUT) {
        summary = await summarize(block);
        if (!summary.trim() || bytes(summary) > SUMMARY_OUTPUT) throw new Error("对话摘要过长或为空，请重试；完整历史仍然保留。");
        cache[key] = summary;
        await onCache?.();
      }
      outputs.push(summary);
    }
    const next = outputs.join("\n\n");
    if (bytes(next) >= bytes(memory) && bytes(next) > SUMMARY_BUDGET) throw new Error("对话摘要未有效压缩，原始历史未被删除。");
    memory = next; level += 1;
  } while (bytes(memory) > SUMMARY_BUDGET);
  const context: ConversationContext = { mode: "compressed", turns: history.slice(cut), summary: memory,
    recalled: recallHistory(question, early), totalTurns: history.length };
  if (bytes(JSON.stringify(context)) > HISTORY_BUDGET) throw new Error("对话上下文超出预算，请缩小本次问题范围。");
  return context;
}
export function validateContext(value: unknown): ConversationContext {
  if (!value || typeof value !== "object") throw new Error("Invalid conversation context");
  const v = value as ConversationContext;
  if (!["full", "compressed"].includes(v.mode) || !Array.isArray(v.turns) || typeof v.summary !== "string" || !Array.isArray(v.recalled)
    || !v.recalled.every(x => typeof x === "string") || !Number.isSafeInteger(v.totalTurns) || v.totalTurns < v.turns.length
    || !v.turns.every(x => x && typeof x.question === "string" && typeof x.answer === "string")
    || bytes(JSON.stringify(v)) > HISTORY_BUDGET) throw new Error("Invalid or oversized conversation context");
  if (v.mode === "full" && (v.totalTurns !== v.turns.length || v.summary || v.recalled.length)) throw new Error("Incomplete full conversation context");
  return { mode: v.mode, turns: normalizeHistory(v.turns), summary: v.summary.replace(/\[S\d+\]/g, ""),
    recalled: v.recalled.map(x => x.replace(/\[S\d+\]/g, "")), totalTurns: v.totalTurns };
}
