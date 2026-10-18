import { PDF_LIMITS, type PdfText, type PdfPage } from "./pdf-model";
import type { PDFDocumentLoadingTask, PDFWorker, TextContent } from "pdfjs-dist/types/src/display/api";

/** No storage or network upload: PDF.js parses local bytes in a dedicated worker. */
export async function extractPdf(file: File, signal: AbortSignal, progress: (page: number, total: number) => void): Promise<PdfText> {
  if (!/\.pdf$/i.test(file.name)) throw new Error("Choose a .pdf file. Other file types are not supported.");
  if (!file.size) throw new Error("This PDF is empty. Choose a text-based PDF.");
  if (file.size > PDF_LIMITS.bytes) throw new Error("This PDF exceeds the 20 MiB limit. Split it into smaller PDFs and retry.");
  if (file.name.length > 255) throw new Error("Shorten the PDF filename to 255 characters or fewer and retry.");
  signal.throwIfAborted();
  let worker: Worker | undefined;
  let task: PDFDocumentLoadingTask | undefined;
  let parser: PDFWorker | undefined;
  let workerFailure: () => void = () => {};
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const interruption = new Promise<never>((_, reject) => {
    workerFailure = () => { stopped = true; reject(new Error("The PDF worker could not start. Reload the app and retry.")); };
    onAbort = () => { stopped = true; worker?.terminate(); reject(new Error("PDF import canceled. Nothing was saved.")); };
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => { stopped = true; worker?.terminate(); reject(new Error("PDF extraction timed out. Try a smaller or simpler text-based PDF.")); }, PDF_LIMITS.timeoutMs);
  });
  const check = () => { if (stopped || signal.aborted) throw new Error("PDF import canceled. Nothing was saved."); };
  async function extract(): Promise<PdfText> {
    const data = new Uint8Array(await file.arrayBuffer());
    check();
    if (!new TextDecoder("latin1").decode(data.subarray(0, 1024)).includes("%PDF-")) throw new Error("This file is not a valid PDF. Check the file and retry.");
    const hash = await crypto.subtle.digest("SHA-256", data);
    const id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    const pdfjs = await import("pdfjs-dist");
    check();
    const base = `/pdfjs/${pdfjs.version}/`;
    // Passing a real worker avoids PDF.js's main-thread fallback if workers fail.
    worker = new Worker(`${base}pdf.worker.min.mjs`, { type: "module" });
    worker.addEventListener("error", workerFailure, { once: true });
    parser = pdfjs.PDFWorker.create({ port: worker });
    task = pdfjs.getDocument({ data, worker: parser, cMapUrl: `${base}cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`, useWasm: false, disableFontFace: true,
      stopAtErrors: true, enableXfa: false });
    const pdf = await task.promise;
    check();
    const { info } = await pdf.getMetadata();
    check();
    if ((info as { IsXFAPresent?: boolean }).IsXFAPresent) throw new Error("XFA form PDFs are not supported. Export a standard text-based PDF and retry.");
    if (pdf.numPages > PDF_LIMITS.pages) throw new Error("This PDF exceeds the 300-page limit. Split it into smaller PDFs and retry.");
    const pages: PdfPage[] = [];
    let totalCharacters = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      check(); progress(number, pdf.numPages);
      const page = await pdf.getPage(number);
      const reader = page.streamTextContent().getReader();
      let text = "";
      try {
        while (true) {
          const chunk = await reader.read(); check();
          if (chunk.done) break;
          for (const item of (chunk.value as TextContent).items) {
            if (!("str" in item)) continue;
            // PDF.js emits explicit spaces and EOL markers. Do not insert spaces
            // between adjacent text runs: that would split styled words.
            text += item.str + (item.hasEOL ? "\n" : "");
          }
          if (text.length > PDF_LIMITS.pageCharacters || totalCharacters + text.length > PDF_LIMITS.characters) {
            throw new Error("This PDF contains too much text (100,000 characters per page or 2 million per PDF). Split it and retry.");
          }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } finally { reader.releaseLock(); page.cleanup(); }
      text = text.replace(/\s+/gu, " ").trim();
      totalCharacters += text.length;
      pages.push({ number, text });
    }
    if (!pages.some(page => page.text)) throw new Error("No searchable text was found. Scanned or image-only PDFs need OCR, which is not supported here.");
    return { id, filename: file.name, byteSize: file.size, pages };
  }
  try { return await Promise.race([extract(), interruption]); }
  catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new Error("Password-protected PDFs are not supported. Import an unlocked copy.");
    if (error instanceof Error && ["InvalidPDFException", "UnknownErrorException", "FormatError"].includes(error.name)) throw new Error("This PDF is malformed or uses unsupported content. Export a new text-based PDF and retry.");
    throw error;
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", onAbort);
    // Give normal teardown time to receive its worker acknowledgement. Forced
    // cancellation stays immediate, and a broken worker cannot trap cleanup.
    const cleanup = task?.destroy().catch(() => {});
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    if (!stopped && cleanup) {
      await Promise.race([cleanup, new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 250); })]);
    }
    clearTimeout(cleanupTimer);
    parser?.destroy();
    worker?.removeEventListener("error", workerFailure);
    worker?.terminate();
  }
}
