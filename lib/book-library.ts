export type StoredChunk = {
  id: string;
  sectionTitle: string;
  pageStart: number;
  pageEnd: number;
  text: string;
  embedding: number[];
};

export type BookSummary = {
  id: string;
  name: string;
  pages: number;
  chapters: number;
  chunks: number;
  fileSize: number;
  storedAt: string;
  lastOpenedAt: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  importedFrom?: string;
};

export type StoredBook = BookSummary & {
  storageKey: string;
  ownerId: string;
  pdf?: Blob;
  fullText?: string;
  index: StoredChunk[];
};

const DATABASE_NAME = "voicebook-library";
const DATABASE_VERSION = 2;
const BOOK_STORE = "books";
const CONTENT_STORE = "book-content";
const PDF_STORE = "book-files";

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local library request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Local library transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("Local library transaction was cancelled"));
  });
}

function openLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction!;
      const content = database.createObjectStore(CONTENT_STORE, { keyPath: "storageKey" });
      const files = database.createObjectStore(PDF_STORE, { keyPath: "storageKey" });
      if (event.oldVersion === 0) {
        const books = database.createObjectStore(BOOK_STORE, { keyPath: "storageKey" });
        books.createIndex("ownerId", "ownerId", { unique: false });
      } else {
        // One atomic upgrade: an error rolls back all stores and leaves v1 intact.
        const cursor = transaction.objectStore(BOOK_STORE).openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          const old = row.value as StoredBook;
          content.put({ storageKey: old.storageKey, index: old.index, fullText: old.fullText });
          if (old.pdf) files.put({ storageKey: old.storageKey, pdf: old.pdf });
          row.update({ ...summary(old), storageKey: old.storageKey, ownerId: old.ownerId });
          row.continue();
        };
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () => reject(new Error("Close other Voicebook tabs, then refresh to upgrade your library."));
    request.onerror = () => reject(request.error || new Error("Could not open the local book library"));
  });
}

export function summary(book: BookSummary): BookSummary {
  const { id, name, pages, chapters, chunks, fileSize, storedAt, lastOpenedAt,
    embeddingModel = "text-embedding-3-small", embeddingDimensions = 1536, importedFrom } = book;
  return { id, name, pages, chapters, chunks, fileSize, storedAt, lastOpenedAt,
    embeddingModel, embeddingDimensions, importedFrom };
}

export async function fingerprintBook(file: File) {
  const sample = await file.slice(0, 256 * 1024).arrayBuffer();
  const metadata = new TextEncoder().encode(`${file.name}\0${file.size}\0`);
  const combined = new Uint8Array(metadata.length + sample.byteLength);
  combined.set(metadata);
  combined.set(new Uint8Array(sample), metadata.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
  return Array.from(digest.slice(0, 16), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function listBooks(ownerId: string) {
  const database = await openLibrary();
  try {
    const transaction = database.transaction(BOOK_STORE, "readonly");
    const books = await requestResult(transaction.objectStore(BOOK_STORE).index("ownerId").getAll(ownerId)) as BookSummary[];
    return books.map(summary).sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
  } finally {
    database.close();
  }
}

export async function getBook(ownerId: string, bookId: string) {
  const database = await openLibrary();
  try {
    const transaction = database.transaction([BOOK_STORE, CONTENT_STORE], "readonly");
    const key = `${ownerId}:${bookId}`;
    const [metadata, content] = await Promise.all([
      requestResult(transaction.objectStore(BOOK_STORE).get(key)),
      requestResult(transaction.objectStore(CONTENT_STORE).get(key)),
    ]);
    if (!metadata) return undefined;
    if (!content) throw new Error("This book's saved index is missing. Import it again.");
    // Opening a conversation does not read the original PDF blob.
    return { ...metadata, index: content.index, fullText: content.fullText } as StoredBook;
  } finally {
    database.close();
  }
}

export async function saveBook(ownerId: string, book: Omit<StoredBook, "ownerId" | "storageKey">) {
  const database = await openLibrary();
  try {
    const transaction = database.transaction([BOOK_STORE, CONTENT_STORE, PDF_STORE], "readwrite");
    const storageKey = `${ownerId}:${book.id}`;
    transaction.objectStore(BOOK_STORE).put({ ...summary(book), ownerId, storageKey });
    transaction.objectStore(CONTENT_STORE).put({ storageKey, index: book.index, fullText: book.fullText });
    if (book.pdf) transaction.objectStore(PDF_STORE).put({ storageKey, pdf: book.pdf });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function markBookOpened(ownerId: string, bookId: string) {
  const database = await openLibrary();
  try {
    const transaction = database.transaction(BOOK_STORE, "readwrite");
    const store = transaction.objectStore(BOOK_STORE);
    const request = store.get(`${ownerId}:${bookId}`);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, lastOpenedAt: new Date().toISOString() });
    };
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

// Atomic insert-only copy: a repeated or concurrent sample import must never overwrite
// an account's existing book or index. Account identity always comes from the caller.
export async function saveBookIfMissing(ownerId: string, book: Omit<StoredBook, "ownerId" | "storageKey">) {
  if (!ownerId) throw new Error("Sign in before saving a book.");
  const database = await openLibrary();
  try {
    const transaction = database.transaction([BOOK_STORE, CONTENT_STORE, PDF_STORE], "readwrite");
    const completion = transactionDone(transaction);
    const storageKey = `${ownerId}:${book.id}`;
    const store = transaction.objectStore(BOOK_STORE);
    const request = store.get(storageKey);
    let added = false;
    request.onsuccess = () => {
      if (request.result) return;
      store.add({ ...summary(book), ownerId, storageKey });
      transaction.objectStore(CONTENT_STORE).add({ storageKey, index: book.index, fullText: book.fullText });
      if (book.pdf) transaction.objectStore(PDF_STORE).add({ storageKey, pdf: book.pdf });
      added = true;
    };
    await completion;
    return added;
  } finally { database.close(); }
}

export async function deleteBook(ownerId: string, bookId: string) {
  const database = await openLibrary();
  try {
    const transaction = database.transaction([BOOK_STORE, CONTENT_STORE, PDF_STORE], "readwrite");
    for (const name of [BOOK_STORE, CONTENT_STORE, PDF_STORE]) {
      transaction.objectStore(name).delete(`${ownerId}:${bookId}`);
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
