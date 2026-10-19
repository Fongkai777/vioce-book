import { normalizeHistory, type HistoryTurn } from "./conversation-context.ts";
export type Preferences = { tone: string; length: string; guidance: string; rememberHistory: boolean };
export const defaultPreferences: Preferences = { tone: "natural", length: "balanced", guidance: "", rememberHistory: true };
export function normalizePreferences(value: unknown): Preferences {
  const p = (value && typeof value === "object" ? value : {}) as Partial<Preferences>;
  return {
    tone: ["natural", "friendly", "academic"].includes(p.tone || "") ? p.tone! : "natural",
    length: ["brief", "balanced", "detailed"].includes(p.length || "") ? p.length! : "balanced",
    guidance: typeof p.guidance === "string" ? p.guidance.trim().slice(0, 600) : "",
    rememberHistory: typeof p.rememberHistory === "boolean" ? p.rememberHistory : defaultPreferences.rememberHistory,
  };
}
export function preferenceInstructions(value: unknown) {
  const p = normalizePreferences(value);
  const tone = { natural: "自然直接，不使用生硬套话", friendly: "亲切耐心，用易懂的表达", academic: "严谨清晰，解释术语但避免官腔" }[p.tone];
  const length = {
    brief: "一到两段，通常1–2句；中文约60–100字，英文约30–50词，直达重点",
    balanced: "通常一个短段落、2–4句；中文约100–180字，英文约50–90词。先回答，再补1个关键理由，适合一轮短语音对话",
    detailed: "充分解释必要论证，通常2–4个短段落；中文约300–500字，英文约150–250词，避免重复",
  }[p.length];
  return `Delivery priority: the current question and revision request override saved custom style; saved custom style overrides the preset tone/length defaults. Follow requested ordering and devices (for example, an everyday analogy BEFORE the conclusion), not just the topic. Label your own illustrative analogies as examples, not as statements from the book. These are delivery instructions only; evidence and capability boundaries still apply.\n表达风格：${tone}。默认篇幅：${length}。当前问题明确要求的句数、条数、格式或更短篇幅优先于默认篇幅；例如‘只用一句话’就严格一句，不另加理由、标题、总结或追问。不要把短问题扩写成报告，不机械地以‘简单说’开头，也不要使用‘简短回答：’‘关键理由：’这样的固定标签。理由自然融入叙述，不必每次额外列出。必要限定与证据优先于凑字数；用户明确要求展开时可适当延长。\nActive custom delivery instructions (apply them, do not merely acknowledge them): ${JSON.stringify(p.guidance || "No custom style; use the defaults above.")}`;
}
// The answer model always receives the conversation. The search query does not:
// mixing earlier questions and answers into BM25/vector retrieval drags results
// back to old topics. Only a question that depends on the previous turn (pronouns,
// "and/why/what about…", very short follow-ups) borrows the previous question.
const EN_FOLLOW_UP_START = /^(and|but|so|then|also|what about|how about|why|why not|really|ok(ay)?)\b/i;
const EN_REFERENCE = /\b(it|its|that|this|these|those|they|them|their|he|him|his|she|her)\b(?!\s+(book|story|novel|chapter|passage|text|author)\b)/i;
const ZH_REFERENCE = /(他们|她们|它们|他|她|它|这个|那个|这些|那些|这里|那里|这样|那样|刚才|上面|前面|继续|然后呢|还有呢|那呢|^为什么|^那|^还有|^所以)/u;
const ORDINAL = /第\s*(\d+)\s*(?:轮|个问题|次)|\b(first|earliest) question\b|最早|一开始|第一个问题|第一轮/iu;

export function isFollowUpQuestion(question: string) {
  const text = question.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const cjk = (text.match(/[\u3400-\u9fff]/gu) || []).length;
  if (cjk ? cjk <= 6 : words.length <= 4) return true;
  return EN_FOLLOW_UP_START.test(text) || EN_REFERENCE.test(text) || ZH_REFERENCE.test(text);
}

export function retrievalQuestion(question: string, history: HistoryTurn[]) {
  const normalized = normalizeHistory(history);
  const parts: string[] = [];
  // An explicit "first question / 第 N 轮" reference retrieves for that turn's question.
  const ordinal = question.match(ORDINAL);
  if (ordinal && normalized.length) {
    const index = ordinal[1] ? Number(ordinal[1]) - 1 : 0;
    if (normalized[index]) parts.push(normalized[index].question.slice(0, 300));
  } else if (normalized.length && isFollowUpQuestion(question)) {
    parts.push(normalized.at(-1)!.question.slice(0, 300));
  }
  parts.push(question);
  return parts.join("\n").slice(-2000);
}
export const feedbackTags = ["语气生硬", "太长", "不够详细", "没答到点", "引用有问题"];
// Keep persisted tag identifiers stable; translate only the presentation layer.
export const feedbackTagLabels: Record<string, string> = {
  "语气生硬": "Unnatural tone", "太长": "Too long", "不够详细": "Needs more detail",
  "没答到点": "Missed the point", "引用有问题": "Citation issue",
};
