'use client';
/* Native links preserve the existing editors' navigation warnings. */
import { useEffect, useRef, useState } from 'react';
import { localRequest } from '@/lib/local-client';
import type { SavedImage } from '@/lib/image-model';
import type { SavedNote } from '@/lib/note-model';
import { ImagePreview } from './image-preview';
type Link = { noteId: string; imageId: string };
async function requestLinks(body?: unknown): Promise<Link[]> {
  const response = await fetch('/api/image-links', { cache: 'no-store', method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Wayoffmars': '1' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Links could not be saved.');
  return result;
}
export function ImageNoteLinks({ kind, id, disabled = false }: { kind: 'notes' | 'images'; id: string; disabled?: boolean }) {
  const [open, setOpen] = useState(kind === 'images');
  return <section className="image-note-links" aria-label={kind === 'notes' ? 'Linked images' : 'Linked notes'}>
    {kind === 'notes' ? <button className="secondary-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide image links' : 'Manage linked images'}</button> : <h3>Linked notes</h3>}
    {open && <LinkEditor kind={kind} id={id} disabled={disabled} />}
  </section>;
}
function LinkEditor({ kind, id, disabled }: { kind: 'notes' | 'images'; id: string; disabled: boolean }) {
  const [notes, setNotes] = useState<SavedNote[]>([]), [images, setImages] = useState<SavedImage[]>([]), [links, setLinks] = useState<Link[]>([]);
  const [selection, setSelection] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const generation = useRef(0), lock = useRef(false), mounted = useRef(true);
  async function load() {
    const current = ++generation.current;
    try {
      const [notes, images, links] = await Promise.all([localRequest<SavedNote[]>('notes'), localRequest<SavedImage[]>('images'), requestLinks()]);
      if (mounted.current && current === generation.current) { setNotes(notes); setImages(images); setLinks(links); setSelection(''); }
    } catch (error) { if (mounted.current && current === generation.current) setError((error as Error).message); }
    finally { if (mounted.current && current === generation.current) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    let canceled = false;
    void Promise.resolve().then(() => { if (!canceled) return load(); });
    return () => { canceled = true; mounted.current = false; };
  }, []);
  const related = links.filter(link => kind === 'notes' ? link.noteId === id : link.imageId === id);
  const linkedIds = new Set(related.map(link => kind === 'notes' ? link.imageId : link.noteId));
  const records = kind === 'notes' ? images : notes;
  const linked = records.filter(record => linkedIds.has(record.id)), available = records.filter(record => !linkedIds.has(record.id));
  const ownerExists = (kind === 'notes' ? notes : images).some(record => record.id === id);
  async function change(action: 'link' | 'unlink', otherId: string) {
    if (lock.current || disabled) return;
    const noteId = kind === 'notes' ? id : otherId, imageId = kind === 'images' ? id : otherId;
    const note = notes.find(record => record.id === noteId), image = images.find(record => record.id === imageId);
    if (!note || !image) { setError('The note or image is unavailable. Refresh links.'); return; }
    lock.current = true; setBusy(true); setError(''); setStatus('Saving link…');
    try {
      await requestLinks({ action, noteId, imageId, noteRevision: note.revision, imageRevision: image.revision });
      if (mounted.current) {
        setLinks(previous => action === 'link' ? [...previous.filter(link => link.noteId !== noteId || link.imageId !== imageId), { noteId, imageId }] : previous.filter(link => link.noteId !== noteId || link.imageId !== imageId));
        setSelection(''); setStatus(action === 'link' ? 'Link saved.' : 'Unlinked. The image and note are kept.');
      }
    } catch (error) { if (mounted.current) { setStatus(''); setError((error as Error).message); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <div>
    <p className="storage-note">Explicit references between saved notes and imported images. Unlinking keeps both items.</p>
    {loading && <p role="status">Loading links…</p>}{error && <p className="font-error" role="alert">{error}</p>}
    <p role="status" className="note-status">{status}</p>
    {!loading && !ownerExists && <p role="alert">This item was deleted. Reload the library.</p>}
    <button className="secondary-button" type="button" disabled={busy || loading || disabled} onClick={() => { setLoading(true); setError(''); setStatus(''); void load(); }}>Refresh links</button>
    {!loading && ownerExists && <>
      <ul className="linked-records">{linked.map(record => <li key={record.id}>
        {kind === 'notes' && <ImagePreview id={record.id} title={record.title} />}
        <a href={kind === 'notes' ? `/images?image=${record.id}` : `/notes#note-${encodeURIComponent(record.id)}`}>Open {record.title}</a>
        <button className="secondary-button" type="button" disabled={busy || disabled} onClick={() => void change('unlink', record.id)} aria-label={`Unlink ${record.title}`}>Unlink</button>
      </li>)}</ul>
      {!linked.length && <p className="storage-note">No {kind === 'notes' ? 'images' : 'notes'} linked yet.</p>}
      <form className="link-form" onSubmit={event => { event.preventDefault(); if (selection) void change('link', selection); }}>
        <label>Choose {kind === 'notes' ? 'image' : 'note'}<select value={selection} disabled={busy || disabled || !available.length} onChange={event => setSelection(event.target.value)}><option value="">Select a saved {kind === 'notes' ? 'image' : 'note'}</option>{available.map(record => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>
        <button className="secondary-button" type="submit" disabled={busy || disabled || !selection}>{kind === 'notes' ? 'Link image' : 'Link note'}</button>
      </form>
      {!available.length && <p className="storage-note">All available items are linked, or none have been saved yet.</p>}
    </>}
  </div>;
}
