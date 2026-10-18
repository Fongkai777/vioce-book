"use client";

import { useState } from "react";
import { ArrowUp, BookOpen, ChevronRight, Library, LoaderCircle, Upload } from "lucide-react";
import type { BookSummary } from "@/lib/book-library";

export default function StartReading({ books, disabled, openingBookId, onSelect, onUpload }: {
  books: BookSummary[];
  disabled: boolean;
  openingBookId: string | null;
  onSelect: (id: string) => Promise<void>;
  onUpload: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  return <div className="welcome-state">
    <span className="welcome-kicker">从一本书开始</span>
    <h1>选一本书，<br /><i>聊聊你想知道的。</i></h1>
    <p>从图书馆选择已有的书，或上传一本 PDF。<br />准备好后，就可以打字或用语音提问。</p>
    <div className="start-options">
      <button className="start-option" onClick={() => setChoosing(value => !value)} disabled={disabled || !books.length} aria-expanded={choosing} aria-controls="start-book-picker">
        <Library size={24} /><strong>从图书馆选一本</strong>
        <span>{books.length ? `${books.length} 本书已就绪，无需重新处理` : "图书馆还是空的，请先上传一本书"}</span>
        <em>{choosing ? "收起书目" : "选择已有书籍"}<ChevronRight size={14} /></em>
      </button>
      <button className="start-option" onClick={onUpload} disabled={disabled}>
        <Upload size={24} /><strong>上传一本 PDF</strong>
        <span>首次处理后自动加入本地图书馆</span>
        <em>选择 PDF 文件<ArrowUp size={14} /></em>
      </button>
    </div>
    {choosing && <section className="start-book-picker" id="start-book-picker" aria-label="选择要对话的书">
      <h2>选择要对话的书</h2>
      <div>{books.map(book => <button key={book.id} onClick={() => void onSelect(book.id)} disabled={disabled}>
        {openingBookId === book.id ? <LoaderCircle size={18} className="spin" /> : <BookOpen size={18} />}
        <span><strong>{book.name}</strong><small>{openingBookId === book.id ? "正在打开…" : "点击开始对话"}</small></span><ChevronRight size={15} />
      </button>)}</div>
    </section>}
    <p className="start-hint">已有书籍直接选；新书只需上传一次。</p>
  </div>;
}
