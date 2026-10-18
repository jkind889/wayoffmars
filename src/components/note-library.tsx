"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EMPTY_NOTE, NOTE_LIMITS, NoteConflictError, makeNote, noteFields, noteStorageError, readNotes, validFields, validateNote, validateSource, writeNote, type NoteFields, type SavedNote } from "@/lib/note-storage";

import { PdfLibrary } from "./pdf-library";

import { highlightText, searchNotes, searchTerms } from "@/lib/note-search";

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  return highlightText(text, terms).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : part.text);
}

type Draft = { version: 1; id: string; fields: NoteFields; original: SavedNote | null };
const DRAFT_KEY = "wayoffmars-note-draft-v1";
const dirtyDraft = (draft: Draft | null) => draft !== null && JSON.stringify(draft.fields) !== JSON.stringify(draft.original ? noteFields(draft.original) : EMPTY_NOTE);
const sortNotes = (notes: SavedNote[]) => [...notes].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

export function NoteLibrary() {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [draftWarning, setDraftWarning] = useState("");
  const [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const newRef = useRef<HTMLButtonElement>(null);
  const dirty = dirtyDraft(draft);
  const terms = useMemo(() => searchTerms(query), [query]);
  const results = useMemo(() => searchNotes(notes, query), [notes, query]);
  const searching = terms.length > 0;
  function clearSearch() { setQuery(""); searchRef.current?.focus(); }

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
          const recovered = JSON.parse(raw) as Draft;
          if (recovered.version !== 1 || typeof recovered.id !== "string" || !recovered.id || !validFields(recovered.fields)) throw new Error("Invalid draft");
          if (recovered.original !== null) validateNote(recovered.original);
          if (!cancelled) { setDraft(recovered); setStatus("Recovered your unfinished note. Review it and save when ready."); }
        }
      } catch { if (!cancelled) setDraftWarning("Draft recovery is unavailable. Keep this page open or copy your edits before leaving."); }
      try {
        const records = await readNotes();
        const valid: SavedNote[] = [];
        let unreadable = 0;
        for (const record of records) { try { valid.push(validateNote(record)); } catch { unreadable++; } }
        if (!cancelled) {
          setNotes(sortNotes(valid));
          setReadError(unreadable ? `${unreadable} unreadable note(s) could not be displayed. Their stored data has been kept.` : "");
        }
      } catch (error) { if (!cancelled) setReadError(`Saved notes could not be read. ${noteStorageError(error)} Reload to retry reading.`); }
      finally { if (!cancelled) setLoading(false); }
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!dirty && !busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, busy]);
  useEffect(() => { if (draft?.id) titleRef.current?.focus(); }, [draft?.id]);

  useEffect(() => {
    if (restoreFocus.current && !busy) { newRef.current?.focus(); restoreFocus.current = false; }
  });

  function keepDraft(next: Draft | null) {
    setDraft(next);
    try {
      if (next) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(DRAFT_KEY);
      setDraftWarning("");
    } catch { setDraftWarning("Draft recovery is unavailable. Keep this page open or copy your edits before leaving."); }
  }
  function canLeaveDraft() { return !dirty || window.confirm("Discard your unsaved edits?"); }
  function edit(note?: SavedNote) {
    if (lock.current || !canLeaveDraft()) return;
    keepDraft({ version: 1, id: note?.id ?? crypto.randomUUID(), original: note ?? null, fields: note ? noteFields(note) : { ...EMPTY_NOTE } });
    setError(""); setStatus(""); setConflict(false);
  }
  function cancel() {
    if (lock.current || !canLeaveDraft()) return;
    keepDraft(null); setError(""); setConflict(false); restoreFocus.current = true;
  }
  async function save(event: FormEvent, asCopy = false) {
    event.preventDefault();
    if (!draft || lock.current) return;
    if (!draft.fields.title.trim() || !draft.fields.body.trim()) { setError("Add a title and body before saving."); return; }
    if (!validateSource(draft.fields.source.trim())) { setError("Use a complete http:// or https:// source URL, or leave it empty."); return; }
    lock.current = true; setBusy(true); setError(""); setStatus("");
    try {
      const note = makeNote(draft.fields, asCopy ? crypto.randomUUID() : draft.id, asCopy ? null : draft.original);
      await writeNote(note, note.id, asCopy ? null : draft.original?.revision ?? null);
      setNotes(previous => sortNotes([...previous.filter(entry => entry.id !== note.id), note]));
      keepDraft(null); setConflict(false); setStatus(`“${note.title}” saved on this Mac.`); restoreFocus.current = true;
    } catch (error) { setError(`Note could not be saved. ${noteStorageError(error)}`); setConflict(error instanceof NoteConflictError); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove(note: SavedNote) {
    if (lock.current) return;
    const discards = draft?.id === note.id && dirty;
    if (!window.confirm(`Delete “${note.title}”?${discards ? " This also discards your unsaved edits to it." : ""} This cannot be undone.`)) return;
    lock.current = true; setBusy(true); setError(""); setStatus("");
    try {
      await writeNote(null, note.id, note.revision);
      setNotes(previous => previous.filter(entry => entry.id !== note.id));
      if (draft?.id === note.id) keepDraft(null);
      setStatus(`“${note.title}” deleted.`); restoreFocus.current = true;
    } catch (error) { setError(`Note could not be deleted. ${noteStorageError(error)}`); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="notes-workspace"><section aria-label="Design notes">
    <div className="notes-toolbar"><p className="storage-note">Your writing, saved only on this Mac. Source links are stored without fetching their contents.</p>
      <button ref={newRef} type="button" className="primary-button" disabled={loading || busy} onClick={() => edit()}>New note</button></div>
    {readError && <p className="font-error" role="alert">{readError}</p>}
    {error && <p className="font-error" role="alert">{error}</p>}
    {draftWarning && <p className="font-error" role="alert">{draftWarning}</p>}
    <p className="note-status" role="status">{status}</p>
    {draft && <form className="note-editor" aria-label="Note editor" onSubmit={save}>
      <div className="library-heading"><h2>{draft.original ? "Edit note" : "New note"}</h2><span className="storage-note">{dirty ? "Unsaved edits" : "Ready to write"}</span></div>
      <fieldset disabled={busy}>
        <label>Title<input ref={titleRef} required maxLength={NOTE_LIMITS.title} value={draft.fields.title} onChange={event => keepDraft({ ...draft, fields: { ...draft.fields, title: event.target.value } })} /></label>
        <div className="note-field"><label htmlFor="note-body">Body</label><textarea id="note-body" required rows={8} maxLength={NOTE_LIMITS.body} value={draft.fields.body} onChange={event => keepDraft({ ...draft, fields: { ...draft.fields, body: event.target.value } })} /></div>
        <label>Tags <span className="field-hint">Optional, separated by commas</span><input maxLength={NOTE_LIMITS.tags} value={draft.fields.tags} onChange={event => keepDraft({ ...draft, fields: { ...draft.fields, tags: event.target.value } })} /></label>
        <label>Source URL <span className="field-hint">Optional</span><input type="url" maxLength={NOTE_LIMITS.source} placeholder="https://" value={draft.fields.source} onChange={event => keepDraft({ ...draft, fields: { ...draft.fields, source: event.target.value } })} /></label>
        <div className="backup-actions"><button className="primary-button" type="submit">{busy ? "Saving…" : "Save note"}</button>
          {conflict && <button className="secondary-button" type="button" onClick={event => void save(event, true)}>Save as new note</button>}
          <button className="secondary-button" type="button" onClick={cancel}>Cancel</button></div>
      </fieldset>
      <p className="storage-note">Unfinished edits are recovered on refresh in this tab when browser storage is available. Save to keep a note after closing the tab.</p>
    </form>}
    <div className="note-search" role="search" aria-label="Search your notes and PDFs">
      <label htmlFor="note-search">Search notes and PDFs</label>
      <div className="search-controls"><input ref={searchRef} id="note-search" type="search" maxLength={200} value={query} placeholder="Try typography, color, or a phrase" aria-describedby="note-search-help" onChange={event => setQuery(event.target.value)} />
        {query && <button className="secondary-button" type="button" onClick={clearSearch}>Clear search</button>}</div>
      <p className="storage-note" id="note-search-help">Search note titles, bodies, and tags, plus PDF filenames and page text. Every keyword must match within one note or PDF page; capitalization does not matter.</p>
    </div>
    <div className="library-heading"><h2>{searching ? "Note results" : "Saved notes"}</h2><span className="library-count" aria-live="polite">{searching ? `${results.length} of ${notes.length} notes` : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}</span></div>
    {loading ? <p className="storage-note">Loading your notes…</p> : notes.length === 0 ? <div className="empty-state"><h3>{readError ? "Your notes could not all be loaded" : "Room for your next idea"}</h3><p>{readError ? "Your stored data has been kept. You can still write a new note." : "Write your first note about type, color, layout, or anything that inspires you."}</p></div> :
      results.length === 0 ? <div className="empty-state"><h3>No notes found</h3><p>Try fewer keywords or a different word from your notes.</p><button className="secondary-button" type="button" onClick={clearSearch}>Show all notes</button></div> :
      <ul className="note-list">{results.map(({ note, snippets }) => <li key={note.id}><article className="note-card" aria-label={note.title}>
        <div className="note-card-heading"><h3><HighlightedText text={note.title} terms={terms} /></h3><div className="backup-actions">
          <button className="secondary-button" disabled={busy} onClick={() => edit(note)} aria-label={`Edit ${note.title}`}>Edit</button>
          <button className="secondary-button" disabled={busy} onClick={() => void remove(note)} aria-label={`Delete ${note.title}`}>Delete</button></div></div>
        {searching ? <>
          <div className="note-snippets">{snippets.map((snippet, index) => <p key={index}><HighlightedText text={snippet} terms={terms} /></p>)}</div>
          <details className="note-full-text"><summary>Read full note</summary><p className="note-body"><HighlightedText text={note.body} terms={terms} /></p></details>
        </> : <p className="note-body">{note.body}</p>}
        {note.tags.length > 0 && <ul className="note-tags" aria-label="Tags">{note.tags.map(tag => <li key={tag}><HighlightedText text={tag} terms={terms} /></li>)}</ul>}
        {note.source && <p className="note-source"><span>Source: </span>{note.source}</p>}
      </article></li>)}</ul>}
    </section>
    <PdfLibrary query={query} />
    <p className="storage-note notes-footnote">Notes and PDFs are saved on this Mac. Use Local library for browser imports and full-library backups. Other tabs see changes after refresh.</p>
  </div>;
}
