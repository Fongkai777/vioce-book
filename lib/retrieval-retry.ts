export type RetrievalScope = {
  ownerId: string;
  bookId: string;
  model: string;
  turnId: string;
  query: string;
};

// Keep successful retrievals for retries of the same chat message, not answers.
// Memory-only: no new persistence of questions when history is disabled.
export class RetrievalRetryCache<T> {
  private entries = new Map<string, { index: object; value: T }>();
  private generation = 0;

  clear() {
    this.generation++;
    this.entries.clear();
  }

  async retrieve(scope: RetrievalScope, index: object, signal: AbortSignal, load: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const key = JSON.stringify([scope.ownerId, scope.bookId, scope.model, scope.turnId, scope.query]);
    const cached = this.entries.get(key);
    if (cached?.index === index) return cached.value;

    const generation = this.generation;
    const value = await load();
    signal.throwIfAborted();
    if (generation !== this.generation) throw new DOMException("Retrieval scope changed", "AbortError");
    this.entries.delete(key);
    this.entries.set(key, { index, value });
    // Each entry holds at most the retrieved passages, not another book index.
    if (this.entries.size > 16) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }
}
