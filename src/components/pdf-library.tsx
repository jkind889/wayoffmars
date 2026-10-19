"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ReattachPdf } from "./reattach-pdf";
import { extractPdf } from "@/lib/pdf-extraction";
import { validatePdf, type SavedPdf } from "@/lib/pdf-model";
import { deletePdf, pdfStorageError, readPdfs, savePdf } from "@/lib/pdf-storage";
import { PDF_RESULT_LIMIT, searchPdfs, type PdfMatch } from "@/lib/pdf-search";
import { highlightText, searchTerms } from "@/lib/note-search";

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return highlightText(text, terms).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : part.text);
}
const sortPdfs = (pdfs: SavedPdf[]) => [...pdfs].sort((a, b) => b.importedAt - a.importedAt || a.id.localeCompare(b.id));

export function PdfLibrary({ query }: { query: string }) {
  const [pdfs, setPdfs] = useState<SavedPdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"idle" | "extracting" | "saving" | "deleting">("idle");
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState<{ query: string; pdfs: SavedPdf[]; matches: PdfMatch[]; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const operation = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const restoreFocus = useRef(false);
  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;
  const searchPending = searching && (search?.query !== query || search?.pdfs !== pdfs);
  const busy = phase !== "idle";

  useEffect(() => {
    let cancelled = false;
    readPdfs().then(records => {
      const valid: SavedPdf[] = [];
      let unreadable = 0;
      for (const record of records) { try { valid.push(validatePdf(record)); } catch { unreadable++; } }
      if (!cancelled) {
        setPdfs(sortPdfs(valid));
        setReadError(unreadable ? `${unreadable} unreadable PDF(s) could not be displayed. Their stored data has been kept.` : "");
      }
    }).catch(error => { if (!cancelled) setReadError(`Saved PDFs could not be read. ${pdfStorageError(error)} Reload to retry reading.`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; operation.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Debounce and yield between page batches; never show an older query's hits.
    const timer = setTimeout(() => {
      void searchPdfs(pdfs, query, controller.signal).then(result => {
        if (!controller.signal.aborted) setSearch({ query, pdfs, ...result });
      }).catch(() => { /* Only canceled searches reject. */ });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [pdfs, query]);

  useEffect(() => {
    if (!busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [busy]);

  useEffect(() => {
    if (!busy && !loading && restoreFocus.current) {
      importButton.current?.focus(); restoreFocus.current = false;
    }
  });

  async function importPdf(file: File) {
    if (lock.current) return;
    lock.current = true;
    const controller = new AbortController();
    operation.current = controller;
    setPhase("extracting"); setError(""); setStatus(`Reading “${file.name}”…`);
    try {
      const text = await extractPdf(file, controller.signal, (page, total) => setStatus(`Extracting “${file.name}”: page ${page} of ${total}…`));
      controller.signal.throwIfAborted();
      setPhase("saving"); setStatus(`Saving “${file.name}”…`);
      const pdf: SavedPdf = { ...text, importedAt: Date.now(), revision: crypto.randomUUID() };
      const added = await savePdf(pdf, await file.arrayBuffer());
      pdf.hasOriginal = true;
      if (added) {
        setPdfs(previous => sortPdfs([...previous.filter(entry => entry.id !== pdf.id), pdf]));
        const empty = pdf.pages.filter(page => !page.text).length;
        setStatus(`“${pdf.filename}” saved on this Mac. ${pdf.pages.length} pages.${empty ? ` ${empty} page(s) have no searchable text; OCR is not supported.` : ""}`);
      } else setStatus(`This PDF is already saved. Renamed copies are skipped. Refresh to see imports from other tabs.`);
    } catch (error) {
      setStatus(controller.signal.aborted ? "PDF import canceled. Nothing was saved." : "");
      if (!controller.signal.aborted) setError(`PDF could not be imported. ${pdfStorageError(error)}`);
    } finally {
      operation.current = null; lock.current = false; restoreFocus.current = true; setPhase("idle");
    }
  }

  async function remove(pdf: SavedPdf) {
    if (lock.current || !window.confirm(`Delete “${pdf.filename}” and its searchable text? This cannot be undone.`)) return;
    lock.current = true; setPhase("deleting"); setError(""); setStatus("");
    try {
      await deletePdf(pdf);
      setPdfs(previous => previous.filter(entry => entry.id !== pdf.id));
      setStatus(`“${pdf.filename}” deleted.`);
    } catch (error) { setError(`PDF could not be deleted. ${pdfStorageError(error)}`); }
    finally { lock.current = false; restoreFocus.current = true; setPhase("idle"); }
  }

  const matches = searchPending ? [] : search?.matches ?? [];
  const visiblePdfs = searching ? [...new Map(matches.map(match => [match.pdf.id, match.pdf])).values()] : pdfs;
  return <section className="pdf-library" aria-label="PDF library">
    <div className="library-heading"><h2>{searching ? "PDF results" : "Saved PDFs"}</h2>
      <button ref={importButton} type="button" className="secondary-button" disabled={loading || busy} onClick={() => input.current?.click()}>Import PDF</button>
      <input ref={input} className="visually-hidden" type="file" accept=".pdf,application/pdf" aria-label="Choose PDF" tabIndex={-1} disabled={loading || busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void importPdf(file);
      }} /></div>
    <p className="storage-note pdf-help">Text-based PDFs, up to 20 MiB and 300 pages each. Original files and searchable text are saved on this Mac. Nothing leaves this Mac.</p>
    {readError && <p className="font-error" role="alert">{readError}</p>}
    {error && <p className="font-error" role="alert">{error}</p>}
    {status && <p className="note-status" role="status">{status}</p>}
    {phase === "extracting" && <button type="button" className="secondary-button" onClick={() => operation.current?.abort()}>Cancel import</button>}
    <p className="storage-note pdf-count" aria-live="polite">{loading ? "Loading your PDFs…" : searchPending ? "Searching PDFs…" : searching ? `${search?.total ?? 0} matching pages${(search?.total ?? 0) > PDF_RESULT_LIMIT ? `; showing the first ${PDF_RESULT_LIMIT}. Narrow your search for more.` : ""}` : `${pdfs.length} ${pdfs.length === 1 ? "PDF" : "PDFs"}`}</p>
    {!loading && !searchPending && (visiblePdfs.length ? <ul className="note-list">{visiblePdfs.map(pdf => <li key={pdf.id}>
      <article className="note-card" aria-label={pdf.filename}>
        <div className="note-card-heading"><h3><Highlight text={pdf.filename} terms={terms} /></h3>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void remove(pdf)} aria-label={`Delete PDF ${pdf.filename}`}>Delete</button></div>
        <p className="storage-note">{pdf.pages.length} pages · Saved on this Mac{pdf.pages.some(page => !page.text) ? ` · ${pdf.pages.filter(page => !page.text).length} page(s) without searchable text` : ""}</p>
        <p className="storage-note">{pdf.hasOriginal ? "Original PDF retained." : "Text only — reattach the original to open cited pages."}</p>
        <ReattachPdf pdf={pdf} onAttached={() => { setStatus('Original attached and checksum verified.'); setPdfs(previous => previous.map(entry => entry.id === pdf.id ? { ...entry, hasOriginal: true } : entry)); }} />
        {searching && matches.filter(match => match.pdf.id === pdf.id).map(match => <div className="pdf-page-result" key={match.page}>
          <h4>Page {match.page}</h4>
          {pdf.hasOriginal && <a className="secondary-button" href={`/pdf/${pdf.id}?page=${match.page}`} target="_blank" rel="noopener noreferrer">Open page {match.page}</a>}
          <div className="note-snippets">{match.snippets.map((snippet, index) => <p key={index}><Highlight text={snippet} terms={terms} /></p>)}</div>
        </div>)}
      </article>
    </li>)}</ul> : <p className="storage-note pdf-help">{pdfs.length ? "No PDF pages found. Try fewer keywords or a different word." : "Import a PDF to search its text alongside your notes."}</p>)}
  </section>;
}
