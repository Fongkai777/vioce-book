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
import { normalizeHistory, recallHistory, type HistoryTurn } from "./conversation-context.ts";
export function retrievalQuestion(question: string, history: HistoryTurn[]) {
  const normalized = normalizeHistory(history);
  const previous = normalized.at(-1);
  const recalled = recallHistory(question, normalized.slice(0, -1), 3000).join("\n").slice(0, 650);
  return [previous ? `上一个问题：${previous.question.slice(0, 300)}` : "", recalled ? `相关早期对话：${recalled}` : "", `当前问题：${question}`].filter(Boolean).join("\n").slice(-2000);
}
export const feedbackTags = ["语气生硬", "太长", "不够详细", "没答到点", "引用有问题"];
