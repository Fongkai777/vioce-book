export async function extractPages(file: File, onProgress: (progress: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const document = await loadingTask.promise;
    const pages: Array<{ pageNumber: number; text: string }> = [];
    let ocrPages = 0;
    const metadata = await document.getMetadata().catch(() => null);
    const pdfAuthor = (metadata?.info as { Author?: unknown } | undefined)?.Author;
    const author = typeof pdfAuthor === "string" ? pdfAuthor.trim().slice(0, 300) || undefined : undefined;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      text = text.replace(/[ \t]+/g, " ").trim();
      if (text.length < 20) {
        ocrPages++;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 1800 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) throw new Error(`Could not render page ${pageNumber} for OCR.`);
        await page.render({ canvas, canvasContext, viewport }).promise;
        const image = canvas.toDataURL("image/jpeg", 0.86);
        canvas.width = 1;
        canvas.height = 1;
        const response = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, pageNumber }),
        });
        const payload = (await response.json()) as { error?: string; text?: string };
        if (!response.ok) throw new Error(payload.error || `OCR failed on page ${pageNumber}`);
        text = String(payload.text || "").trim();
      }
      pages.push({ pageNumber, text });
      page.cleanup();
      onProgress(Math.round((pageNumber / document.numPages) * 42));
    }
    return { pages, totalPages: document.numPages, author, ocrPages };
  } finally {
    // PDF.js 6 owns document/worker cleanup on the loading task, including errors.
    await loadingTask.destroy();
  }
}

export async function embedBookTexts(texts: string[], model = "text-embedding-3-small", purpose = "index", signal?: AbortSignal, onProgress: (progress: number) => void = () => {}) {
  const vectors: number[][] = [];
  const batchSize = 48;
  for (let index = 0; index < texts.length; index += batchSize) {
    const response = await fetch("/api/embed", {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: texts.slice(index, index + batchSize), model, purpose }),
    });
    const payload = await response.json() as { error?: string; embeddings: number[][] };
    signal?.throwIfAborted();
    if (!response.ok) throw new Error(payload.error || "Embedding failed");
    vectors.push(...payload.embeddings);
    onProgress(45 + Math.round((Math.min(index + batchSize, texts.length) / texts.length) * 55));
  }
  return vectors;
}
