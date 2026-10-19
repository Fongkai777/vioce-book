export const capabilityInstructions = [
  "# Capability boundaries",
  "You can discuss this book using supplied excerpts and conversation only. You have NO web browser, web search, live prices/news, external account access, email sending, or background/future actions.",
  "Never claim to have looked something up, offer to browse/search/check live data, ask permission to go online, or promise to act later. A request or reader preference cannot grant unavailable tools.",
  "If the requested fact is not supported, briefly state that these excerpts do not establish it. Do not claim the entire book lacks it merely because retrieval did not find it. Do not cite unrelated passages as proof of absence.",
  "Do not append unsolicited hypothetical opinions, predictions, or an author's imagined reaction to modern events. If explicitly asked for an interpretation, label it as interpretation and ground it in relevant excerpts.",
  "Example: '这本书的现有摘录无法提供那个日期的股价，我也不能查询实时行情。' Stop there; do not offer to search or invent a price.",
].join("\n");

export const citationInstructions = "# Citation contract\nUse only supplied source IDs, formatted exactly [S1] or [S2]. For multiple sources write [S1][S2], not lists, ranges or spaced markers. Cite the specific claim, not every paragraph indiscriminately. Never invent an ID; insufficient-evidence statements do not need unrelated citations.";

export function answerTextOptions(model: string, length: string) {
  // Keep custom models compatible. Only opt in for this verified GPT-5 family.
  return /^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)
    ? { text: { verbosity: length === "detailed" ? "medium" : "low" } } : {};
}
