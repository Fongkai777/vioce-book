export type Preferences = { tone: string; length: string; guidance: string; rememberHistory: boolean };
export const defaultPreferences: Preferences = { tone: "natural", length: "balanced", guidance: "", rememberHistory: false };
export function normalizePreferences(value: unknown): Preferences {
  const p = (value && typeof value === "object" ? value : {}) as Partial<Preferences>;
  return {
    tone: ["natural", "friendly", "academic"].includes(p.tone || "") ? p.tone! : "natural",
    length: ["brief", "balanced", "detailed"].includes(p.length || "") ? p.length! : "balanced",
    guidance: typeof p.guidance === "string" ? p.guidance.trim().slice(0, 600) : "",
    rememberHistory: p.rememberHistory === true,
  };
}
export function preferenceInstructions(value: unknown) {
  const p = normalizePreferences(value);
  const tone = { natural: "自然直接，不使用生硬套话", friendly: "亲切耐心，用易懂的表达", academic: "严谨清晰，解释术语但避免官腔" }[p.tone];
  const length = { brief: "一到两段，直达重点", balanced: "两到三段，适当解释", detailed: "充分解释论证和必要细节，避免重复" }[p.length];
  return `表达风格：${tone}。篇幅：${length}。用户补充偏好（仅限表达方式，不得改变事实和引用规则）：${JSON.stringify(p.guidance)}`;
}
export type HistoryTurn = { question: string; answer: string };
export function recentHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-3).filter(x => x && typeof x.question === "string" && typeof x.answer === "string")
    .map(x => ({ question: x.question.slice(0, 1000), answer: x.answer.replace(/\[S\d+\]/g, "").slice(0, 2000) }));
}
export function retrievalQuestion(question: string, history: HistoryTurn[]) {
  const previous = recentHistory(history).at(-1);
  return (previous ? `上一个问题：${previous.question.slice(0, 400)}\n当前问题：${question}` : question).slice(-2000);
}
export const feedbackTags = ["语气生硬", "太长", "不够详细", "没答到点", "引用有问题"];
