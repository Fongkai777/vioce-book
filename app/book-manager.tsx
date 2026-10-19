"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileText, MessageSquare, Search, Trash2, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { getBook, getBookPdf, type BookSummary, type StoredBook } from "../lib/book-library.ts";
import { bookReadiness, chunkPageLabel, filterChunks, indexStatistics, locatePassage, PASSAGES_PER_PAGE, type PassageTarget } from "../lib/book-inspector.ts";
import PdfPreview from "./pdf-preview.tsx";
import BookBackupControls from "./book-backup-controls.tsx";

type DetailTab = "overview" | "content";
const detailTabs: { id: DetailTab; label: string; icon: typeof FileText }[] = [
  { id: "overview", label: "Overview", icon: BookOpen }, { id: "content", label: "Content", icon: FileText },
];
const CHUNKS_PER_PAGE = PASSAGES_PER_PAGE;
function formatBytes(size: number) { return size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`; }

export function BookInspector({ book, onChat, onRemove, disabled, passageTarget }: { book: StoredBook; onChat: () => void; onRemove: () => void; disabled: boolean; passageTarget?: PassageTarget }) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [showPassages, setShowPassages] = useState(false);
  const [highlightedId, setHighlightedId] = useState("");
  const [targetMissing, setTargetMissing] = useState(false);
  const [pdfJump, setPdfJump] = useState(0);
  const [pdf, setPdf] = useState<Blob | null | undefined>(undefined);
  const [pdfError, setPdfError] = useState("");
  const [retry, setRetry] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [chunkPage, setChunkPage] = useState(0);
  const [textLimit, setTextLimit] = useState(12000);
  const detailScroll = useRef<HTMLDivElement>(null);
  const highlightedPassage = useRef<HTMLElement>(null);
  const stats = useMemo(() => indexStatistics(book.index, book.embeddingDimensions || 1536), [book]);
  const ready = useMemo(() => bookReadiness(book.index, book.embeddingDimensions || 1536), [book]);
  const sections = useMemo(() => [...new Set(book.index.map(chunk => chunk.sectionTitle))], [book]);
  const filtered = useMemo(() => filterChunks(book.index, search, section), [book, search, section]);
  const pages = Math.max(1, Math.ceil(filtered.length / CHUNKS_PER_PAGE));
  const savedText = useMemo(() => book.fullText || book.index.map(chunk => `${chunk.sectionTitle}\n\n${chunk.text}`).join("\n\n"), [book]);
  useEffect(() => {
    if (tab !== "content" || pdf !== undefined) return;
    let cancelled = false;
    setPdfError("");
    void getBookPdf(book.ownerId, book.id).then(file => { if (!cancelled) setPdf(file || null); })
      .catch(() => { if (!cancelled) setPdfError("The original PDF could not be read from this browser."); });
    return () => { cancelled = true; };
  }, [tab, book.ownerId, book.id, pdf, retry]);
  useEffect(() => { detailScroll.current?.scrollTo({ top: 0 }); }, [tab, chunkPage]);
  useEffect(() => {
    if (!passageTarget || passageTarget.bookId !== book.id) return;
    const found = locatePassage(book.index, passageTarget.chunkId);
    setTab("content"); setShowPassages(true); setSearch(""); setSection("");
    setHighlightedId(found?.chunk.id || ""); setChunkPage(found?.listPage || 0); setTargetMissing(!found);
  }, [passageTarget, book]);
  useEffect(() => {
    if (tab === "content" && showPassages && highlightedId) {
      highlightedPassage.current?.scrollIntoView({ block: "nearest" });
      highlightedPassage.current?.focus({ preventScroll: true });
    }
  }, [tab, showPassages, highlightedId, chunkPage, passageTarget]);
  const changeTab = (next: DetailTab) => setTab(next);
  return <section className="book-inspector" aria-label={`Manage ${book.name}`}>
    <header className="inspector-heading"><div><p className="eyebrow">Your local copy</p><h2>{book.name}</h2><p>{book.importedFrom === "Voicebook sample" ? "Sample book" : "Private book"} · {book.pages ? `${book.pages} pages` : "Page count not recorded"}</p></div>
      <div className="manager-actions"><button className="manager-primary" onClick={onChat} disabled={disabled || !ready}><MessageSquare size={15} /> Chat with this book</button><button className="manager-danger" onClick={onRemove} disabled={disabled}><Trash2 size={15} /> Remove</button></div>
    </header>
    <div className="inspector-tabs" role="tablist" aria-label="Book details">{detailTabs.map(({id, label, icon: Icon}, i) => <button key={id} role="tab" id={`detail-tab-${id}`} aria-controls={`detail-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => changeTab(id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (i + 1) % detailTabs.length : event.key === "ArrowLeft" ? (i + detailTabs.length - 1) % detailTabs.length : event.key === "Home" ? 0 : event.key === "End" ? detailTabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); changeTab(detailTabs[next].id); document.getElementById(`detail-tab-${detailTabs[next].id}`)?.focus(); }
    }}><Icon size={15} />{label}</button>)}</div>
    <div className="inspector-content" ref={detailScroll} role="tabpanel" id={`detail-panel-${tab}`} aria-labelledby={`detail-tab-${tab}`} tabIndex={0}>
      {tab === "content" && <div className="content-controls"><span>Read the book or explore the passages used in answers.</span><label><input type="checkbox" checked={showPassages} onChange={event => setShowPassages(event.target.checked)} /> Show passages</label></div>}
      {tab === "content" && targetMissing && <p className="inspector-error" role="alert">This citation is no longer in this saved copy. You can search the available passages below.</p>}
      {tab === "content" && !showPassages && <>
        {pdfError ? <p role="alert" className="inspector-error">{pdfError} <button onClick={() => setRetry(value => value + 1)}>Retry</button> You can still choose Show passages.</p> : pdf === undefined ? <p role="status">Checking for the original PDF…</p> : pdf ? <PdfPreview key={pdfJump} file={pdf} initialPage={pdfPage} /> : <>
          <div className="inspector-callout"><FileText size={20} /><div><strong>Text edition</strong><p>{book.importedFrom === "Voicebook sample" ? "This sample was created as text, not as a PDF." : "No original PDF is stored with this copy."} Read the saved text below, or choose Show passages to search it.</p></div></div>
          <h3>Saved text</h3><p className="inspector-note">{book.fullText ? "Original saved text." : "Reconstructed from chunks; overlapping passages may repeat."} Showing {Math.min(textLimit, savedText.length).toLocaleString()} of {savedText.length.toLocaleString()} characters.</p><pre className="saved-book-text">{savedText.slice(0, textLimit)}</pre>
          {savedText.length > textLimit && <button className="sample-entry" onClick={() => setTextLimit(value => value + 12000)}>Show more text</button>}
        </>}
      </>}
      {tab === "content" && showPassages && <>
        <div className="chunk-filters"><label><Search size={15} /><input aria-label="Search passages" placeholder="Search text or section…" value={search} onChange={event => { setSearch(event.target.value); setChunkPage(0); }} /></label><select aria-label="Filter by section" value={section} onChange={event => { setSection(event.target.value); setChunkPage(0); }}><option value="">All sections</option>{sections.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
        <p className="inspector-note" role="status">{filtered.length} of {book.index.length} passages · Saved text used to ground answers, not newly generated</p>
        <div className="chunk-cards">{filtered.slice(chunkPage * CHUNKS_PER_PAGE, (chunkPage + 1) * CHUNKS_PER_PAGE).map(chunk => <article key={chunk.id} ref={chunk.id === highlightedId ? highlightedPassage : undefined} tabIndex={-1} className={chunk.id === highlightedId ? "cited-passage" : undefined} aria-label={chunk.id === highlightedId ? `Cited passage: ${chunk.sectionTitle}` : undefined}>
          {chunk.id === highlightedId && <p className="eyebrow">Cited in your conversation</p>}
          <div className="chunk-card-heading"><h3>{chunk.sectionTitle}</h3><small>{chunkPageLabel(chunk)}</small></div><p>{chunk.text}</p>
          <footer><span>{chunk.text.length.toLocaleString()} characters</span>{pdf && chunk.pageStart > 0 && <button onClick={() => { setPdfPage(chunk.pageStart); setPdfJump(value => value + 1); setShowPassages(false); detailScroll.current?.scrollTo({top:0}); }}>View PDF page</button>}</footer>
        </article>)}</div>
        {!filtered.length && <p className="inspector-empty">No passages match your search.</p>}
        {pages > 1 && <div className="chunk-pagination"><button disabled={chunkPage === 0} onClick={() => setChunkPage(value => value - 1)}>Previous passages</button><span>{chunkPage + 1} / {pages}</span><button disabled={chunkPage >= pages - 1} onClick={() => setChunkPage(value => value + 1)}>Next passages</button></div>}
      </>}
      {tab === "overview" && <>
        <div className={`inspector-callout ${ready ? "" : "readiness-warning"}`}>{ready ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}<div><strong>{ready ? "Ready to chat" : "Needs attention"}</strong><p>{ready ? "Your saved passages and search index are ready. Opening this book does not process it again." : "The saved passages or search index are incomplete. Remove this copy and upload the PDF again, or re-add the sample."}</p></div></div>
        <div className="overview-stats"><div><strong>{book.pages || "—"}</strong><span>Pages</span></div><div><strong>{stats.sections}</strong><span>Sections in saved text</span></div><div><strong>{book.index.length}</strong><span>Searchable passages</span></div></div>
        <dl className="index-metadata">
          {book.author && <><dt>Author (PDF metadata)</dt><dd>{book.author}</dd></>}
          <dt>Source</dt><dd>{book.importedFrom === "Voicebook sample" ? "Cloud sample library · Your own local copy" : book.importedFrom || "Uploaded PDF"}</dd>
          <dt>Privacy & storage</dt><dd>This browser · Only available under this account. {book.importedFrom === "Voicebook sample" ? "The original sample is shared; your copy and conversations are separate." : "Not part of the shared sample library."} Not synced across devices.</dd>
          <dt>Text extraction</dt><dd>{book.extraction ? `${book.extraction.ocrPages ? `OCR used on ${book.extraction.ocrPages} of ${book.pages} pages` : "Embedded PDF text · OCR not needed"}. ${book.extraction.readablePages} of ${book.pages} pages included in the saved text.` : book.importedFrom === "Voicebook sample" ? "Provided as sample text · No OCR needed" : "Not recorded for this copy"}</dd>
          <dt>Saved</dt><dd>{new Date(book.storedAt).toLocaleString("en-US")}</dd>
          <dt>Original file size</dt><dd>{book.fileSize ? formatBytes(book.fileSize) : "Not recorded"}</dd>
        </dl>
        <div className="manager-actions"><button onClick={() => {setShowPassages(false); setTab("content");}}><FileText size={15} /> Read content</button></div>
        <details className="technical-details"><summary>Technical details</summary><p className="inspector-note">For troubleshooting only. These saved values are reused, not rebuilt.</p><dl className="index-metadata"><dt>Embedding model</dt><dd>{book.embeddingModel || "text-embedding-3-small"}</dd><dt>Dimensions</dt><dd>{book.embeddingDimensions || 1536} expected · {stats.dimensions.join(", ") || "None"} saved</dd><dt>Vector validation</dt><dd>{stats.validVectors} / {book.index.length} have finite values and the expected dimensions</dd><dt>Retrieval</dt><dd>Semantic vectors + BM25 keywords, combined by reciprocal-rank fusion</dd><dt>Page references</dt><dd>{stats.withPages} / {book.index.length} passages have source page numbers</dd><dt>Book ID</dt><dd><code>{book.id}</code></dd></dl></details>
      </>}
    </div>
  </section>;
}

export default function BookManager({ ownerId, books, preferredBookId, passageTarget, disabled, onChat, onRemove, onUpload, onSamples, status, error }: {
  ownerId: string; books: BookSummary[]; preferredBookId?: string; passageTarget?: PassageTarget; disabled: boolean; onChat: (id: string) => Promise<void>; onRemove: (id: string, name: string) => Promise<void>; onUpload: () => void; onSamples: () => void; status?: string; error?: string;
}) {
  const [selection, setSelection] = useState(preferredBookId || books[0]?.id || "");
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState<StoredBook | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const selectedId = books.some(book => book.id === selection) ? selection : books[0]?.id || "";
  const book = loaded?.id === selectedId && loaded.ownerId === ownerId ? loaded : null;
  useEffect(() => { if (preferredBookId) setSelection(preferredBookId); }, [preferredBookId]);
  useEffect(() => { if (passageTarget) { setSelection(passageTarget.bookId); setSearch(""); } }, [passageTarget]);
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
    <BookBackupControls ownerId={ownerId} bookId={selectedId} disabled={disabled} />
    <header className="manager-heading"><div><p className="eyebrow">Book management</p><h1>Your books, ready for conversation.</h1><p>Choose a book, check its status, or read its content. Your library stays in this browser, under your account.</p></div><div className="manager-actions"><button onClick={onSamples} disabled={disabled}><BookOpen size={15} /> Try a sample</button><button className="manager-primary" onClick={onUpload} disabled={disabled}><Upload size={15} /> Upload a PDF</button></div></header>
    {status && <p className="manager-status" role="status">{status}</p>}{error && <p className="inspector-error" role="alert">{error}</p>}
    <div className="manager-body"><aside className="manager-books" aria-label="Managed books"><label className="manager-search"><Search size={15} /><input aria-label="Search books" placeholder="Find a book…" value={search} onChange={event => setSearch(event.target.value)} /></label><p className="inspector-note">{books.length} {books.length === 1 ? "book" : "books"} · Local library</p>
      <div className="manager-book-list">{visible.map(item => <button key={item.id} aria-pressed={selectedId === item.id} onClick={() => setSelection(item.id)}><BookOpen size={18} /><span><strong>{item.name}</strong><small>{item.importedFrom === "Voicebook sample" ? "Sample" : "Private"} · {item.pages ? `${item.pages} pages` : "Text edition"}</small></span></button>)}</div>
      {!visible.length && <p className="inspector-note">{books.length ? "No matching books." : "Upload a PDF or try a sample to begin."}</p>}
    </aside>
    {book ? <BookInspector key={`${ownerId}:${book.id}`} book={book} disabled={disabled} passageTarget={passageTarget?.bookId === book.id ? passageTarget : undefined} onChat={() => void onChat(book.id)} onRemove={() => void onRemove(book.id, book.name)} /> : <div className="inspector-empty">{loadError ? <p role="alert">{loadError} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p> : selectedId ? <p role="status">Loading saved text and index…</p> : <><BookOpen size={32} /><h2>Your library is ready for its first book.</h2><p>Nothing is shared with other accounts.</p></>}</div>}
    </div>
  </div>;
}
