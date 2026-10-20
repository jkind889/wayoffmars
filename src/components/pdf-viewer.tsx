'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFWorker, RenderTask } from 'pdfjs-dist/types/src/display/api';
import { localRequest } from '@/lib/local-client';
import { PDF_LIMITS, validatePdf, type SavedPdf } from '@/lib/pdf-model';
import { PdfExcerptCapture } from './pdf-excerpt-capture';
import { ReattachPdf } from './reattach-pdf';

/** Canvas-only PDF.js: no scripting manager, forms, annotations, links or embedded HTML. */
export function PdfViewer({ id, initialPage: page }: { id: string; initialPage: number }) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<SavedPdf | null>(null), [error, setError] = useState('');
  const [rendered, setRendered] = useState(false), [text, setText] = useState(''), [retry, setRetry] = useState(0);
  const valid = /^[a-f0-9]{64}$/.test(id) && Number.isSafeInteger(page) && page > 0 && page <= PDF_LIMITS.pages;
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    let worker: Worker | undefined, task: PDFDocumentLoadingTask | undefined, parser: PDFWorker | undefined, render: RenderTask | undefined;
    let stopped = false;
    const host = canvasHost.current;
    const cleanup = () => { controller.abort(); render?.cancel(); void task?.destroy().catch(() => {}); parser?.destroy(); worker?.terminate(); };
    const fail = (message: string) => { if (stopped) return; stopped = true; setError(message); cleanup(); };
    const timer = setTimeout(() => fail('Opening this PDF timed out. Retry or reselect the original.'), PDF_LIMITS.timeoutMs);
    async function load() {
      try {
        const record = validatePdf(await localRequest(`pdf&id=${id}`));
        if (stopped) return;
        setPdf(record);
        if (page > record.pages.length) throw new Error(`Page ${page} does not exist. This PDF has ${record.pages.length} physical pages.`);
        const response = await fetch(`/api/pdfs/${id}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error((await response.json()).error || 'Original PDF could not be read.');
        const data = new Uint8Array(await response.arrayBuffer());
        if (stopped) return;
        if (data.length !== record.byteSize || data.length > PDF_LIMITS.bytes) throw new Error('Original PDF size does not match the saved record.');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== id) throw new Error('Original PDF checksum mismatch. Reselect the original.');
        const pdfjs = await import('pdfjs-dist');
        if (stopped) return;
        const base = `/pdfjs/${pdfjs.version}/`;
        worker = new Worker(`${base}pdf.worker.min.mjs`, { type: 'module' });
        worker.addEventListener('error', () => fail('The PDF worker failed. Reload and retry.'), { once: true });
        parser = pdfjs.PDFWorker.create({ port: worker });
        task = pdfjs.getDocument({ data, worker: parser, cMapUrl: `${base}cmaps/`, cMapPacked: true,
          standardFontDataUrl: `${base}standard_fonts/`, useWasm: false, disableFontFace: true,
          enableXfa: false, stopAtErrors: true, maxImageSize: 16_000_000, canvasMaxAreaInBytes: 16_000_000 });
        const document = await task.promise;
        if (stopped) return;
        if (document.numPages !== record.pages.length) throw new Error('Original PDF page count does not match the saved record.');
        const { info } = await document.getMetadata();
        if ((info as { IsXFAPresent?: boolean }).IsXFAPresent) throw new Error('XFA PDFs cannot be opened here.');
        const physicalPage = await document.getPage(page);
        if (stopped) return;
        const natural = physicalPage.getViewport({ scale: 1 });
        if (!Number.isFinite(natural.width) || !Number.isFinite(natural.height) || natural.width <= 0 || natural.height <= 0) throw new Error('This PDF page has invalid dimensions.');
        const scale = Math.min(1.5, 2048 / Math.max(natural.width, natural.height));
        const viewport = physicalPage.getViewport({ scale });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.className = 'pdf-canvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Original PDF, physical page ${page}`);
        render = physicalPage.render({ canvas, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE });
        await render.promise;
        const content = await physicalPage.getTextContent();
        const originalText = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join('');
        if (stopped) return;
        canvas.dataset.renderedPage = String(page);
        host?.replaceChildren(canvas); setText(originalText); setRendered(true);
        clearTimeout(timer);
      } catch (error) { if (!stopped) fail(error instanceof Error ? error.message : 'Original PDF could not be opened.'); }
    }
    void load();
    return () => { stopped = true; clearTimeout(timer); cleanup(); host?.replaceChildren(); };
  }, [id, page, retry, valid]);
  function reload() { setError(''); setRendered(false); setText(''); setRetry(value => value + 1); }
  return <section className="pdf-viewer" aria-label="PDF page viewer">
    <h1>{pdf?.filename || 'Original PDF'}</h1>
    <p>Physical page numbers include blank pages and can differ from printed labels.</p>
    {!valid ? <p role="alert">Invalid PDF identity or page number.</p> : <>
      {pdf && <nav className="pdf-navigation" aria-label="PDF pages">
        {page > 1 && <a className="secondary-button" href={`/pdf/${id}?page=${page - 1}`}>Previous page</a>}
        {page < pdf.pages.length && <a className="secondary-button" href={`/pdf/${id}?page=${page + 1}`}>Next page</a>}
        <form action={`/pdf/${id}`} method="get"><label>Physical page <input aria-label="Physical page" name="page" type="number" min={1} max={pdf.pages.length} defaultValue={page} required /></label><button className="secondary-button">Go</button></form>
      </nav>}
      <p role="status">{rendered ? `Showing physical page ${page} of ${pdf?.pages.length}.` : error ? 'Page could not be opened. Searchable text is still in Notes.' : `Opening physical page ${page}…`}</p>
      {error && <><p role="alert" className="font-error">{error}</p><button className="secondary-button" onClick={reload}>Retry opening page</button>{pdf && <ReattachPdf pdf={pdf} onAttached={reload} />}</>}
      {pdf && page <= pdf.pages.length && <PdfExcerptCapture key={`${pdf.id}:${page}`} pdf={pdf} page={page} />}
      <div ref={canvasHost} className="pdf-canvas-host" />
      {rendered && <details className="pdf-page-text"><summary>Text from this original page</summary><p className="pdf-original-text">{text || 'This page has no selectable text.'}</p></details>}
    </>}
    {/* Full navigation keeps the excerpt editor’s beforeunload draft protection. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <p><a href="/notes">Back to Notes</a></p>
  </section>;
}
