// History is independent of the book index; no retention cap or silent eviction.
type Turn = { id: string };
export type SummaryCache = Record<string, string>;
type RecordValue = { key: string; userId: string; turns: Turn[]; summaries: SummaryCache };
const legacyPrefix = (userId: string) => `voicebook-history:${encodeURIComponent(userId)}:`;
const keyFor = (userId: string, bookId: string) => JSON.stringify([userId, bookId]);
function openHistory() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("voicebook-conversations", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("conversations", { keyPath: "key" }).createIndex("userId", "userId");
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Voicebook tabs and try again."));
  });
}
function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || new Error("Could not save the conversation.")); });
}
async function update(userId: string, bookId: string, turns: Turn[], summaries: SummaryCache = {}, insertOnly = false) {
  const db = await openHistory();
  try {
    const tx = db.transaction("conversations", "readwrite"), completion = done(tx), store = tx.objectStore("conversations");
    const key = keyFor(userId, bookId);
    const request = store.get(key);
    request.onsuccess = () => {
      const old = request.result as RecordValue | undefined;
      // Merge atomically so a stale tab cannot erase another tab's messages.
      const merged = new Map((old?.turns || []).map(turn => [turn.id, turn]));
      for (const turn of turns) if (!insertOnly || !merged.has(turn.id)) merged.set(turn.id, turn);
      store.put({ key, userId, turns: [...merged.values()], summaries: insertOnly ? { ...summaries, ...old?.summaries } : { ...old?.summaries, ...summaries } });
    };
    await completion;
  } finally { db.close(); }
}
async function migrate(userId: string, bookId: string) {
  const legacyKey = legacyPrefix(userId) + bookId;
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return;
  const turns = JSON.parse(raw);
  if (!Array.isArray(turns) || !turns.every(turn => turn && typeof turn.question === "string" && typeof turn.answer === "string")) throw new Error("Legacy chat data is invalid. The original data has been kept.");
  await update(userId, bookId, turns.map((turn, index) => ({ ...turn, id: turn.id || `legacy-${index}` })));
  localStorage.removeItem(legacyKey);
}
async function read(userId: string, bookId: string) {
  await migrate(userId, bookId);
  const db = await openHistory();
  try { return await result(db.transaction("conversations").objectStore("conversations").get(keyFor(userId, bookId))) as RecordValue | undefined; }
  finally { db.close(); }
}
export async function loadHistory<T>(userId: string, bookId: string): Promise<T[]> {
  return (await read(userId, bookId))?.turns as T[] || [];
}
export async function loadSummaries(userId: string, bookId: string) { return (await read(userId, bookId))?.summaries || {}; }
export async function saveHistory(userId: string, bookId: string, turns: Turn[], summaries: SummaryCache = {}) {
  await migrate(userId, bookId);
  await update(userId, bookId, turns, summaries);
}
export async function restoreHistory(userId: string, bookId: string, turns: Turn[], summaries: SummaryCache = {}) {
  await migrate(userId, bookId);
  await update(userId, bookId, turns, summaries, true);
}
export async function clearHistory(userId: string, bookId?: string) {
  const db = await openHistory();
  try {
    const tx = db.transaction("conversations", "readwrite"), completion = done(tx), store = tx.objectStore("conversations");
    if (bookId) store.delete(keyFor(userId, bookId));
    else {
      const request = store.index("userId").openCursor(IDBKeyRange.only(userId));
      request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    }
    await completion;
    if (bookId) localStorage.removeItem(legacyPrefix(userId) + bookId);
    else for (const key of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))) {
      if (key?.startsWith(legacyPrefix(userId))) localStorage.removeItem(key);
    }
  } finally { db.close(); }
}
