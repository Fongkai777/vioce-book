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
};

export type StoredBook = BookSummary & {
  storageKey: string;
  ownerId: string;
  pdf: Blob;
  index: StoredChunk[];
};

const DATABASE_NAME = "voicebook-library";
const DATABASE_VERSION = 1;
const BOOK_STORE = "books";

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
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(BOOK_STORE, { keyPath: "storageKey" });
      store.createIndex("ownerId", "ownerId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the local book library"));
  });
}

function summary(book: StoredBook): BookSummary {
  const { id, name, pages, chapters, chunks, fileSize, storedAt, lastOpenedAt } = book;
  return { id, name, pages, chapters, chunks, fileSize, storedAt, lastOpenedAt };
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
    const books = await requestResult(transaction.objectStore(BOOK_STORE).index("ownerId").getAll(ownerId)) as StoredBook[];
    return books.map(summary).sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
  } finally {
    database.close();
  }
}

export async function getBook(ownerId: string, bookId: string) {
  const database = await openLibrary();
  try {
    return await requestResult(database.transaction(BOOK_STORE, "readonly").objectStore(BOOK_STORE).get(`${ownerId}:${bookId}`)) as StoredBook | undefined;
  } finally {
    database.close();
  }
}

export async function saveBook(ownerId: string, book: Omit<StoredBook, "ownerId" | "storageKey">) {
  const database = await openLibrary();
  try {
    const transaction = database.transaction(BOOK_STORE, "readwrite");
    transaction.objectStore(BOOK_STORE).put({ ...book, ownerId, storageKey: `${ownerId}:${book.id}` });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function markBookOpened(ownerId: string, book: StoredBook) {
  await saveBook(ownerId, { ...book, lastOpenedAt: new Date().toISOString() });
}

export async function deleteBook(ownerId: string, bookId: string) {
  const database = await openLibrary();
  try {
    const transaction = database.transaction(BOOK_STORE, "readwrite");
    transaction.objectStore(BOOK_STORE).delete(`${ownerId}:${bookId}`);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
