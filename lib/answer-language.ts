// Conversation history, saved preferences and parts of these instructions may be in
// another language, so the reply language is stated explicitly for every turn.
export function questionLanguage(question: string): "Chinese" | "English" | null {
  if (/[\u3400-\u9fff]/u.test(question)) return "Chinese";
  if (/[A-Za-z]/.test(question) && /^[\x00-\x7F\u2018\u2019\u201C\u201D\u2013\u2014\u2026]+$/.test(question)) return "English";
  return null;
}

export function languageInstruction(question: string) {
  const language = questionLanguage(question);
  return language
    ? `# Language\nThe current reader_question is in ${language}. Write the entire answer in ${language}, even if the conversation history, excerpts, saved preferences or these instructions use another language.`
    : "# Language\nWrite the entire answer in the language of the current reader_question, not the language of the conversation history, excerpts, saved preferences or these instructions.";
}
