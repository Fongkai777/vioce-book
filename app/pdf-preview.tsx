"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

// Canvas-only rendering: the local PDF is never uploaded or executed as page HTML.
export default function PdfPreview({ file, initialPage = 1 }: { file: Blob; initialPage?: number }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(640);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setDocument(null); setLoading(true); setError("");
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const data = await file.arrayBuffer();
      if (cancelled) return;
      task = pdfjs.getDocument({ data });
      const loaded = await task.promise;
      if (!cancelled) { setDocument(loaded); setPage(Math.max(1, Math.min(initialPage, loaded.numPages))); }
    })().catch(() => { if (!cancelled) setError("This PDF could not be previewed. It may be damaged or password-protected. Your saved chunks and index are still available."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; void task?.destroy().catch(() => {}); };
  }, [file, retry]); // Page changes do not reload the PDF file.
  useEffect(() => { if (document) setPage(Math.max(1, Math.min(initialPage, document.numPages))); }, [initialPage, document]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false, render: RenderTask | undefined;
    setRendering(true); setError("");
    void (async () => {
      const pdfPage = await document.getPage(page);
      if (cancelled || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      // Bound bitmap allocation even for unusual PDF dimensions or large screens.
      const scale = Math.min(width / base.width * zoom, 2800 / Math.max(base.width, base.height));
      const viewport = pdfPage.getViewport({ scale });
      const target = canvas.current;
      target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
      render = pdfPage.render({ canvas: target, canvasContext: target.getContext("2d")!, viewport });
      await render.promise;
    })().catch(caught => { if (!cancelled && caught?.name !== "RenderingCancelledException") setError("This page could not be rendered. Try another page or reload the preview."); })
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; render?.cancel(); };
  }, [document, page, zoom, width]);
  return <div className="pdf-preview">
    <div className="pdf-toolbar">
      <button disabled={!document || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
      <label>Page <input aria-label="PDF page" type="number" min={1} max={document?.numPages || 1} value={page} disabled={!document} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && document && value >= 1 && value <= document.numPages) setPage(value); }} /> of {document?.numPages || "—"}</label>
      <button disabled={!document || page >= document.numPages} onClick={() => setPage(value => value + 1)}>Next</button>
      <label>Zoom <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={1}>Fit width</option><option value={1.25}>125%</option><option value={1.5}>150%</option></select></label>
    </div>
    {loading && <p role="status">Loading your local PDF…</p>}
    {error && <p role="alert" className="inspector-error">{error} <button onClick={() => setRetry(value => value + 1)}>Reload preview</button></p>}
    <div className="pdf-canvas-wrap" ref={container} aria-busy={loading || rendering}>
      {rendering && <span className="pdf-render-status" role="status">Rendering page…</span>}
      <canvas ref={canvas} aria-label={`PDF page ${page}. Choose Show passages for extracted text.`} style={{ visibility: document && !error && !rendering ? "visible" : "hidden" }} />
    </div>
    <p className="inspector-note">Rendered locally, one page at a time. Choose Show passages for searchable, selectable text.</p>
  </div>;
}
