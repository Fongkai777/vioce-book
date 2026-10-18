const prefix = (userId: string) => `voicebook-history:${encodeURIComponent(userId)}:`;
export function loadHistory<T>(userId: string, bookId: string): T[] {
  try { const value = JSON.parse(localStorage.getItem(prefix(userId) + bookId) || "[]"); return Array.isArray(value) ? value.slice(-20) : []; } catch { return []; }
}
export function saveHistory(userId: string, bookId: string, turns: unknown[]) {
  localStorage.setItem(prefix(userId) + bookId, JSON.stringify(turns.slice(-20)));
}
export function clearHistory(userId: string, bookId?: string) {
  if (bookId) { localStorage.removeItem(prefix(userId) + bookId); return; }
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
  for (const key of keys) if (key?.startsWith(prefix(userId))) localStorage.removeItem(key);
}
