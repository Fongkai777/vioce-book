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
  const length = { brief: "一到两段，直达重点", balanced: "两到三段，适当解释", detailed: "充分解释论证和必要细节，避免重复" }[p.length];
  return `表达风格：${tone}。篇幅：${length}。用户补充偏好（仅限表达方式，不得改变事实和引用规则）：${JSON.stringify(p.guidance)}`;
}
import { normalizeHistory, recallHistory, type HistoryTurn } from "./conversation-context.ts";
export function retrievalQuestion(question: string, history: HistoryTurn[]) {
  const normalized = normalizeHistory(history);
  const previous = normalized.at(-1);
  const recalled = recallHistory(question, normalized.slice(0, -1), 3000).join("\n").slice(0, 650);
  return [previous ? `上一个问题：${previous.question.slice(0, 300)}` : "", recalled ? `相关早期对话：${recalled}` : "", `当前问题：${question}`].filter(Boolean).join("\n").slice(-2000);
}
export const feedbackTags = ["语气生硬", "太长", "不够详细", "没答到点", "引用有问题"];
