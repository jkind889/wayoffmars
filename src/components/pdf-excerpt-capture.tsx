'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { EXCERPT_LIMITS, excerptText } from '@/lib/excerpt-model';
import { localRequest } from '@/lib/local-client';
import { validateNote, type SavedNote } from '@/lib/note-model';
import type { SavedPdf } from '@/lib/pdf-model';

type Draft = { pdfId: string; page: number; quotation: string; observation: string; target: string; title: string; newId: string };
const key = 'wayoffmars-excerpt-draft-v1';
export function PdfExcerptCapture({ pdf, page }: { pdf: SavedPdf; page: number }) {
  const formId = useId();
  const [draft, setDraft] = useState<Draft | null>(null), [notes, setNotes] = useState<SavedNote[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [warning, setWarning] = useState(''), [saved, setSaved] = useState<SavedNote | null>(null);
  const passage = useRef<HTMLTextAreaElement>(null), quoteInput = useRef<HTMLTextAreaElement>(null), lock = useRef(false);
  const text = excerptText(pdf.pages[page - 1]?.text ?? '');
  useEffect(() => {
    let cancelled = false;
    async function restore() {
    let next: Draft = { pdfId: pdf.id, page, quotation: '', observation: '', target: '', title: `Excerpt from ${pdf.filename}`.slice(0, 200), newId: crypto.randomUUID() };
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (stored?.pdfId === pdf.id && stored.page === page && typeof stored.quotation === 'string' && stored.quotation.length <= EXCERPT_LIMITS.quotation && typeof stored.observation === 'string' && stored.observation.length <= EXCERPT_LIMITS.observation && typeof stored.title === 'string' && stored.title.length <= 200 && typeof stored.target === 'string' && typeof stored.newId === 'string') next = stored;
      else {
        const candidate = new URLSearchParams(window.location.search).get('quote')?.replace(/^…|…$/gu, '').trim();
        if (candidate && candidate.length <= EXCERPT_LIMITS.quotation && text.includes(candidate)) next.quotation = candidate;
      }
    } catch { setWarning('Draft recovery is unavailable. Keep this page open or copy your excerpt before leaving.'); }
    setDraft(next);
    try { const records = await localRequest<unknown[]>('notes'); if (!cancelled) setNotes(records.flatMap(value => { try { return [validateNote(value)]; } catch { return []; } })); } catch (error) { if (!cancelled) setError((error as Error).message); }
    }
    void restore();
    return () => { cancelled = true; };
  }, [pdf.id, pdf.filename, page, text]);
  const dirty = !saved && !!draft && !!(draft.quotation || draft.observation);
  useEffect(() => {
    if (!dirty && !busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy]);
  function keep(next: Draft) {
    setDraft(next); setSaved(null);
    try { sessionStorage.setItem(key, JSON.stringify(next)); setWarning(''); } catch { setWarning('Draft recovery is unavailable. Keep this page open or copy your excerpt before leaving.'); }
  }
  async function save() {
    if (!draft || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const note = notes.find(note => note.id === draft.target);
      if (draft.target && !note) throw new Error('This note is unavailable. Reload note choices or choose a new note.');
      const result = await localRequest<SavedNote>('excerpts', { action: 'add', noteId: draft.target || draft.newId, noteRevision: note?.revision ?? null, newNote: !draft.target, title: draft.title, pdfId: pdf.id, pdfRevision: pdf.revision, page, quotation: draft.quotation, observation: draft.observation });
      setSaved(result); setNotes(previous => [...previous.filter(note => note.id !== result.id), result]);
      setDraft({ ...draft, quotation: '', observation: '', newId: crypto.randomUUID() });
      try { sessionStorage.removeItem(key); } catch { setWarning('Saved successfully, but this tab could not clear its recovered draft.'); }
    } catch (error) { setError((error as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="note-editor excerpt-capture" aria-label="Capture PDF excerpt">
    <h2>Capture PDF excerpt</h2><p>{pdf.filename} · Physical page {page}</p>
    <p className="storage-note">Select text in the extracted page, then capture it. You can also type a continuous passage into Quotation. Whitespace is normalized; OCR is not supported. Quotations and observations are stored separately.</p>
    {error && <p role="alert" className="font-error">{error}</p>}{warning && <p role="alert" className="font-error">{warning}</p>}
    {saved && <p role="status">Excerpt saved. <a href={`/notes#note-${encodeURIComponent(saved.id)}`}>Open {saved.title}</a></p>}
    {!text ? <p>This page has no extracted text to capture.</p> : draft && <form onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy}>
      <div className="note-field"><label htmlFor={`${formId}-page`}>Extracted page text</label><textarea id={`${formId}-page`} ref={passage} readOnly value={text} rows={6} /></div>
      <button type="button" className="secondary-button" onClick={() => {
        const field = passage.current, selected = field ? text.slice(field.selectionStart, field.selectionEnd) : '';
        if (!selected.trim() || selected.length > EXCERPT_LIMITS.quotation) { setError('Select 1–10,000 characters in the extracted page text first.'); return; }
        keep({ ...draft, quotation: selected }); setError(''); quoteInput.current?.focus();
      }}>Capture selected text</button>
      <div className="note-field"><label htmlFor={`${formId}-quote`}>Quotation</label><textarea id={`${formId}-quote`} ref={quoteInput} required rows={4} maxLength={EXCERPT_LIMITS.quotation} value={draft.quotation} onChange={event => keep({ ...draft, quotation: event.target.value })} /></div>
      <div className="note-field"><label htmlFor={`${formId}-observation`}>Observation <span className="field-hint">Optional personal writing</span></label><textarea id={`${formId}-observation`} rows={3} maxLength={EXCERPT_LIMITS.observation} value={draft.observation} onChange={event => keep({ ...draft, observation: event.target.value })} /></div>
      <label>Add excerpt to<select value={draft.target} onChange={event => keep({ ...draft, target: event.target.value })}><option value="">New note</option>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
      {!draft.target && <label>New note title<input required maxLength={200} value={draft.title} onChange={event => keep({ ...draft, title: event.target.value })} /></label>}
      <div className="backup-actions"><button type="submit" className="primary-button" disabled={!draft.quotation.trim()}>Save excerpt to note</button><button type="button" className="secondary-button" onClick={async () => {
        if (lock.current) return; lock.current = true; setBusy(true); try { const records = await localRequest<unknown[]>('notes'); setNotes(records.flatMap(value => { try { return [validateNote(value)]; } catch { return []; } })); setError(''); } catch (error) { setError((error as Error).message); } finally { lock.current = false; setBusy(false); }
      }}>Reload note choices</button><button type="button" className="secondary-button" onClick={() => { if (dirty && !window.confirm('Discard the unfinished excerpt and observation?')) return; keep({ ...draft, quotation: '', observation: '' }); }}>Discard excerpt draft</button></div>
    </fieldset><p className="storage-note">Unfinished excerpt text is recovered in this tab on refresh. Save before closing the tab.</p></form>}
  </section>;
}
