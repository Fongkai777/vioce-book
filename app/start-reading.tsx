"use client";

import { useState } from "react";
import { ArrowUp, BookOpen, ChevronRight, Library, LoaderCircle, Upload } from "lucide-react";
import type { BookSummary } from "@/lib/book-library";

export default function StartReading({ books, disabled, openingBookId, onSelect, onUpload, onSamples }: {
  books: BookSummary[];
  disabled: boolean;
  openingBookId: string | null;
  onSelect: (id: string) => Promise<void>;
  onUpload: () => void;
  onSamples: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  return <div className="welcome-state">
    <span className="welcome-kicker">Start with a book</span>
    <h1>Choose a book.<br /><i>Start a conversation.</i></h1>
    <p>Choose a saved book from your library or upload a PDF.<br />Once it’s ready, ask a question by typing or speaking.</p>
    <div className="start-options">
      <button className="start-option" onClick={() => setChoosing(value => !value)} disabled={disabled || !books.length} aria-expanded={choosing} aria-controls="start-book-picker">
        <Library size={24} /><strong>Choose from library</strong>
        <span>{books.length ? `${books.length} ${books.length === 1 ? "book" : "books"} ready. No re-indexing needed.` : "Your library is empty. Upload a PDF or try a sample below."}</span>
        <em>{choosing ? "Hide books" : "Browse saved books"}<ChevronRight size={14} /></em>
      </button>
      <button className="start-option" onClick={onUpload} disabled={disabled}>
        <Upload size={24} /><strong>Upload a PDF</strong>
        <span>Processed once, then saved to your local library.</span>
        <em>Choose a PDF file<ArrowUp size={14} /></em>
      </button>
    </div>
    {choosing && <section className="start-book-picker" id="start-book-picker" aria-label="Choose a book to chat with">
      <h2>Choose a book to chat with</h2>
      <div>{books.map(book => <button key={book.id} onClick={() => void onSelect(book.id)} disabled={disabled}>
        {openingBookId === book.id ? <LoaderCircle size={18} className="spin" /> : <BookOpen size={18} />}
        <span><strong>{book.name}</strong><small>{openingBookId === book.id ? "Opening…" : "Select to start a conversation"}</small></span><ChevronRight size={15} />
      </button>)}</div>
    </section>}
    <p className="start-hint">Pick a saved book, or upload a new one just once.</p>
    <button className="sample-entry" onClick={onSamples} disabled={disabled}><BookOpen size={16} /> No book handy? Try a sample</button>
  </div>;
}
