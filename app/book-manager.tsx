"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Database, FileText, Layers, MessageSquare, Search, Trash2, Upload } from "lucide-react";
import { getBook, getBookPdf, type BookSummary, type StoredBook } from "../lib/book-library.ts";
import { chunkPageLabel, filterChunks, indexStatistics } from "../lib/book-inspector.ts";
import PdfPreview from "./pdf-preview";

type DetailTab = "pdf" | "chunks" | "index";
const detailTabs: { id: DetailTab; label: string; icon: typeof FileText }[] = [
  { id: "pdf", label: "PDF & text", icon: FileText }, { id: "chunks", label: "Chunks", icon: Layers }, { id: "index", label: "Index", icon: Database },
];
const CHUNKS_PER_PAGE = 12;
function formatBytes(size: number) { return size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`; }

export function BookInspector({ book, onChat, onRemove, disabled }: { book: StoredBook; onChat: () => void; onRemove: () => void; disabled: boolean }) {
  const [tab, setTab] = useState<DetailTab>("pdf");
  const [pdf, setPdf] = useState<Blob | null | undefined>(undefined);
  const [pdfError, setPdfError] = useState("");
  const [retry, setRetry] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [chunkPage, setChunkPage] = useState(0);
  const [vectorId, setVectorId] = useState(book.index[0]?.id || "");
  const [textLimit, setTextLimit] = useState(12000);
  const detailScroll = useRef<HTMLDivElement>(null);
  const stats = useMemo(() => indexStatistics(book.index, book.embeddingDimensions || 1536), [book]);
  const sections = useMemo(() => [...new Set(book.index.map(chunk => chunk.sectionTitle))], [book]);
  const filtered = useMemo(() => filterChunks(book.index, search, section), [book, search, section]);
  const pages = Math.max(1, Math.ceil(filtered.length / CHUNKS_PER_PAGE));
  const selectedVector = book.index.find(chunk => chunk.id === vectorId);
  const savedText = useMemo(() => book.fullText || book.index.map(chunk => `${chunk.sectionTitle}\n\n${chunk.text}`).join("\n\n"), [book]);
  useEffect(() => {
    if (tab !== "pdf" || pdf !== undefined) return;
    let cancelled = false;
    setPdfError("");
    void getBookPdf(book.ownerId, book.id).then(file => { if (!cancelled) setPdf(file || null); })
      .catch(() => { if (!cancelled) setPdfError("The original PDF could not be read from this browser."); });
    return () => { cancelled = true; };
  }, [tab, book.ownerId, book.id, pdf, retry]);
  useEffect(() => { detailScroll.current?.scrollTo({ top: 0 }); }, [tab, chunkPage]);
  const changeTab = (next: DetailTab) => setTab(next);
  return <section className="book-inspector" aria-label={`Manage ${book.name}`}>
    <header className="inspector-heading"><div><p className="eyebrow">Your local copy</p><h2>{book.name}</h2><p>{book.index.length} chunks · {stats.sections} sections · {book.importedFrom || "Uploaded PDF"}</p></div>
      <div className="manager-actions"><button className="manager-primary" onClick={onChat} disabled={disabled}><MessageSquare size={15} /> Chat with this book</button><button className="manager-danger" onClick={onRemove} disabled={disabled}><Trash2 size={15} /> Remove</button></div>
    </header>
    <div className="inspector-tabs" role="tablist" aria-label="Book details">{detailTabs.map(({id, label, icon: Icon}, i) => <button key={id} role="tab" id={`detail-tab-${id}`} aria-controls={`detail-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => changeTab(id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (i + 1) % 3 : event.key === "ArrowLeft" ? (i + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
      if (next >= 0) { event.preventDefault(); changeTab(detailTabs[next].id); document.getElementById(`detail-tab-${detailTabs[next].id}`)?.focus(); }
    }}><Icon size={15} />{label}</button>)}</div>
    <div className="inspector-content" ref={detailScroll} role="tabpanel" id={`detail-panel-${tab}`} aria-labelledby={`detail-tab-${tab}`} tabIndex={0}>
      {tab === "pdf" && <>
        {pdfError ? <p role="alert" className="inspector-error">{pdfError} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p> : pdf === undefined ? <p role="status">Checking for the original PDF…</p> : pdf ? <PdfPreview file={pdf} initialPage={pdfPage} /> : <>
          <div className="inspector-callout"><FileText size={20} /><div><strong>No original PDF stored</strong><p>{book.importedFrom === "Voicebook sample" ? "This sample was created as text, not as a PDF." : "This saved book contains processed text and vectors, but no original PDF file."} You can still read its saved text and inspect every chunk below.</p></div></div>
          <h3>Saved text</h3><p className="inspector-note">{book.fullText ? "Original saved text." : "Reconstructed from chunks; overlapping passages may repeat."} Showing {Math.min(textLimit, savedText.length).toLocaleString()} of {savedText.length.toLocaleString()} characters.</p><pre className="saved-book-text">{savedText.slice(0, textLimit)}</pre>
          {savedText.length > textLimit && <button className="sample-entry" onClick={() => setTextLimit(value => value + 12000)}>Show more text</button>}
        </>}
      </>}
      {tab === "chunks" && <>
        <div className="chunk-filters"><label><Search size={15} /><input aria-label="Search chunks" placeholder="Search text, section, or chunk ID…" value={search} onChange={event => { setSearch(event.target.value); setChunkPage(0); }} /></label><select aria-label="Filter by section" value={section} onChange={event => { setSection(event.target.value); setChunkPage(0); }}><option value="">All sections</option>{sections.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
        <p className="inspector-note" role="status">{filtered.length} of {book.index.length} chunks · Stored text, not newly generated</p>
        <div className="chunk-cards">{filtered.slice(chunkPage * CHUNKS_PER_PAGE, (chunkPage + 1) * CHUNKS_PER_PAGE).map(chunk => <article key={chunk.id}>
          <div className="chunk-card-heading"><h3>{chunk.sectionTitle}</h3><small>{chunkPageLabel(chunk)}</small></div><code>{chunk.id}</code><p>{chunk.text}</p>
          <footer><span>{chunk.text.length.toLocaleString()} characters · {chunk.embedding.length} dimensions</span><div>{pdf && chunk.pageStart > 0 && <button onClick={() => { setPdfPage(chunk.pageStart); setTab("pdf"); }}>View PDF page</button>}<button onClick={() => { setVectorId(chunk.id); setTab("index"); }}>Inspect vector</button></div></footer>
        </article>)}</div>
        {!filtered.length && <p className="inspector-empty">No chunks match your search.</p>}
        {pages > 1 && <div className="chunk-pagination"><button disabled={chunkPage === 0} onClick={() => setChunkPage(value => value - 1)}>Previous chunks</button><span>{chunkPage + 1} / {pages}</span><button disabled={chunkPage >= pages - 1} onClick={() => setChunkPage(value => value + 1)}>Next chunks</button></div>}
      </>}
      {tab === "index" && <>
        <div className="index-stats"><div><strong>{book.index.length}</strong><span>Saved vectors</span></div><div><strong>{book.embeddingDimensions || 1536}</strong><span>Expected dimensions</span></div><div><strong>{stats.characters.toLocaleString()}</strong><span>Chunk characters</span></div><div><strong>{stats.validVectors === book.index.length ? "Ready" : "Check needed"}</strong><span>{stats.validVectors} / {book.index.length} vectors valid</span></div></div>
        <dl className="index-metadata"><dt>Embedding model</dt><dd>{book.embeddingModel || "text-embedding-3-small"}</dd><dt>Observed dimensions</dt><dd>{stats.dimensions.join(", ") || "None"}</dd><dt>Retrieval</dt><dd>Semantic vectors + BM25 keywords, combined by reciprocal-rank fusion</dd><dt>Page provenance</dt><dd>{stats.withPages} / {book.index.length} chunks have source page numbers</dd><dt>Original file size</dt><dd>{book.fileSize ? formatBytes(book.fileSize) : "No original PDF recorded"}</dd><dt>Saved</dt><dd>{new Date(book.storedAt).toLocaleString("en-US")}</dd><dt>Storage</dt><dd>This browser · Current account only · No re-indexing on open</dd><dt>Book ID</dt><dd><code>{book.id}</code></dd></dl>
        <h3>Inspect a vector</h3><p className="inspector-note">An embedding is a list of numbers used for similarity search, not readable prose. These are the actual saved values.</p>
        <select className="vector-select" aria-label="Select chunk vector" value={vectorId} onChange={event => setVectorId(event.target.value)}>{book.index.map((chunk, i) => <option key={chunk.id} value={chunk.id}>{i + 1}. {chunk.sectionTitle} · {chunk.id}</option>)}</select>
        {selectedVector && <div className="vector-inspection"><p>{selectedVector.embedding.length} values · L2 norm {Math.hypot(...selectedVector.embedding).toFixed(6)}</p><pre aria-label="First 16 embedding values">{JSON.stringify(selectedVector.embedding.slice(0, 16), null, 2)}</pre><details key={selectedVector.id}><summary>Show all {selectedVector.embedding.length} values</summary><pre>{JSON.stringify(selectedVector.embedding)}</pre></details></div>}
      </>}
    </div>
  </section>;
}

export default function BookManager({ ownerId, books, preferredBookId, disabled, onChat, onRemove, onUpload, onSamples, status, error }: {
  ownerId: string; books: BookSummary[]; preferredBookId?: string; disabled: boolean; onChat: (id: string) => Promise<void>; onRemove: (id: string, name: string) => Promise<void>; onUpload: () => void; onSamples: () => void; status?: string; error?: string;
}) {
  const [selection, setSelection] = useState(preferredBookId || books[0]?.id || "");
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState<StoredBook | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const selectedId = books.some(book => book.id === selection) ? selection : books[0]?.id || "";
  const book = loaded?.id === selectedId && loaded.ownerId === ownerId ? loaded : null;
  useEffect(() => { if (preferredBookId) setSelection(preferredBookId); }, [preferredBookId]);
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setLoadError("");
    if (!selectedId) return;
    void getBook(ownerId, selectedId).then(value => {
      if (cancelled) return;
      if (!value) throw new Error("This book is no longer in your local library.");
      setLoaded(value);
    }).catch(caught => { if (!cancelled) setLoadError(caught instanceof Error ? caught.message : "Could not load the saved book."); });
    return () => { cancelled = true; };
  }, [ownerId, selectedId, retry]);
  const visible = books.filter(book => book.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="book-manager">
    <header className="manager-heading"><div><p className="eyebrow">Book management</p><h1>Your books, under the cover.</h1><p>Preview originals, explore chunks, and inspect saved indexes. All private to this account on this browser.</p></div><div className="manager-actions"><button onClick={onSamples} disabled={disabled}><BookOpen size={15} /> Try a sample</button><button className="manager-primary" onClick={onUpload} disabled={disabled}><Upload size={15} /> Upload a PDF</button></div></header>
    {status && <p className="manager-status" role="status">{status}</p>}{error && <p className="inspector-error" role="alert">{error}</p>}
    <div className="manager-body"><aside className="manager-books" aria-label="Managed books"><label className="manager-search"><Search size={15} /><input aria-label="Search books" placeholder="Find a book…" value={search} onChange={event => setSearch(event.target.value)} /></label><p className="inspector-note">{books.length} {books.length === 1 ? "book" : "books"} · Local library</p>
      <div className="manager-book-list">{visible.map(item => <button key={item.id} aria-pressed={selectedId === item.id} onClick={() => setSelection(item.id)}><BookOpen size={18} /><span><strong>{item.name}</strong><small>{item.chunks} chunks · {item.importedFrom === "Voicebook sample" ? "Sample" : item.pages ? `${item.pages} pages` : "Imported"}</small></span></button>)}</div>
      {!visible.length && <p className="inspector-note">{books.length ? "No matching books." : "Upload a PDF or try a sample to begin."}</p>}
    </aside>
    {book ? <BookInspector key={`${ownerId}:${book.id}`} book={book} disabled={disabled} onChat={() => void onChat(book.id)} onRemove={() => void onRemove(book.id, book.name)} /> : <div className="inspector-empty">{loadError ? <p role="alert">{loadError} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p> : selectedId ? <p role="status">Loading saved text and index…</p> : <><BookOpen size={32} /><h2>Your library is ready for its first book.</h2><p>Nothing is shared with other accounts.</p></>}</div>}
    </div>
  </div>;
}
