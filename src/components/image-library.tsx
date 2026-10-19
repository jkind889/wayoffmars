'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IMAGE_LIMITS, imageFields, type SavedImage, type ImageFields } from '@/lib/image-model';
import { localRequest, encodeBytes } from '@/lib/local-client';
import { ImageNoteLinks } from './image-note-links';
import { ImagePreview } from './image-preview';
const fieldsOf = (image: SavedImage): ImageFields => ({ title: image.title, source: image.source, description: image.description });
export function ImageLibrary() {
  const [images, setImages] = useState<SavedImage[]>([]), [selected, setSelected] = useState<SavedImage | null>(null);
  const [fields, setFields] = useState<ImageFields>({ title: '', source: '', description: '' });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const restoreFocus = useRef(false), input = useRef<HTMLInputElement>(null), lock = useRef(false), detail = useRef<HTMLElement>(null), importButton = useRef<HTMLButtonElement>(null);
  const dirty = selected !== null && JSON.stringify(fields) !== JSON.stringify(fieldsOf(selected));
  useEffect(() => {
    let canceled = false;
    localRequest<SavedImage[]>('images').then(records => {
      if (canceled) return;
      setImages(records);
      const id = new URLSearchParams(window.location.search).get('image'), image = records.find(record => record.id === id);
      if (image) { setSelected(image); setFields(fieldsOf(image)); }
      else if (id) setError('This image is no longer in the library.');
    }).catch(error => { if (!canceled) setError(`Images could not be loaded. Reload to retry. ${error.message}`); }).finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy]);
  useEffect(() => { if (!busy && restoreFocus.current) { importButton.current?.focus(); restoreFocus.current = false; } }, [busy]);
  useEffect(() => { if (selected?.id) detail.current?.focus(); }, [selected?.id]);
  function choose(image: SavedImage | null) {
    if (lock.current || dirty && !window.confirm('Discard your unsaved image edits?')) return;
    setSelected(image); if (image) setFields(fieldsOf(image));
    setError(''); setStatus('');
    window.history.replaceState(null, '', image ? `/images?image=${image.id}` : '/images');
    if (!image) importButton.current?.focus();
  }
  async function importFile(file: File) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus(`Validating and saving “${file.name}”…`);
    try {
      if (!file.size || file.size > IMAGE_LIMITS.bytes) throw new Error('Choose an image up to 20 MiB.');
      const result = await localRequest<{ added: boolean; image: SavedImage }>('images', { action: 'save', filename: file.name, bytes: encodeBytes(await file.arrayBuffer()) });
      setImages(previous => [...previous.filter(image => image.id !== result.image.id), result.image]);
      setStatus(result.added ? `“${result.image.title}” saved on this Mac.` : 'This image is already saved. Renamed copies are skipped.');
    } catch (error) { setStatus(''); setError(`Image could not be imported. ${(error as Error).message}`); }
    finally { lock.current = false; restoreFocus.current = true; setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const saved = await localRequest<SavedImage>('images', { action: 'update', id: selected.id, expectedRevision: selected.revision, fields: imageFields(fields) });
      setImages(previous => previous.map(image => image.id === saved.id ? saved : image)); setSelected(saved); setFields(fieldsOf(saved)); setStatus('Image details saved on this Mac.');
    } catch (error) { setError(`Details could not be saved. ${(error as Error).message}`); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove() {
    if (!selected || lock.current || !window.confirm(`Delete “${selected.title}” from the library? This also discards unsaved edits. This cannot be undone.`)) return;
    lock.current = true; setBusy(true); setError(''); setStatus('');
    try {
      await localRequest('images', { action: 'delete', id: selected.id, expectedRevision: selected.revision });
      setImages(previous => previous.filter(image => image.id !== selected.id)); setSelected(null); setStatus('Image deleted.');
      window.history.replaceState(null, '', '/images'); restoreFocus.current = true;
    } catch (error) { setError(`Image could not be deleted. ${(error as Error).message}`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="notes-workspace" aria-label="Image library">
    <div className="notes-toolbar"><p className="storage-note">Still PNG, JPEG and WebP. Up to 20 MiB, 12,000 pixels per side and 24 megapixels. Original bytes stay on this Mac.</p>
      <button ref={importButton} className="primary-button" disabled={busy || loading} onClick={() => input.current?.click()}>Import image</button>
      <input ref={input} type="file" className="visually-hidden" tabIndex={-1} aria-label="Choose image" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" disabled={busy || loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} />
    </div>
    {error && <p className="font-error" role="alert">{error}</p>}<p className="note-status" role="status">{status}</p>
    {selected && <section ref={detail} tabIndex={-1} className="image-detail" aria-label="Image details">
      <div className="library-heading"><h2>{selected.title}</h2><button className="secondary-button" disabled={busy} onClick={() => choose(null)}>Close details</button></div>
      <ImagePreview key={selected.id} id={selected.id} title={selected.title} detail />
      <p className="storage-note">{selected.width} × {selected.height} · {selected.format.toUpperCase()} · {(selected.byteSize / 1024).toFixed(1)} KiB · {selected.filename}</p>
      <form className="note-editor" aria-label="Image editor" onSubmit={save}><fieldset disabled={busy}>
        <label>Image title<input required maxLength={IMAGE_LIMITS.title} value={fields.title} onChange={event => setFields({ ...fields, title: event.target.value })} /></label>
        <label>Source URL <span className="field-hint">Optional; stored without fetching</span><input type="url" maxLength={IMAGE_LIMITS.source} value={fields.source} onChange={event => setFields({ ...fields, source: event.target.value })} /></label>
        <label>Why saved <span className="field-hint">Optional short description</span><textarea rows={3} maxLength={IMAGE_LIMITS.description} value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></label>
        <div className="backup-actions"><button className="primary-button" type="submit">{busy ? 'Saving…' : 'Save image details'}</button><button className="secondary-button" type="button" onClick={() => void remove()}>Delete image</button></div>
      </fieldset><p className="storage-note">{dirty ? 'Unsaved edits. Save before closing this tab.' : 'Details are saved on this Mac.'}</p></form>
      <ImageNoteLinks key={`${selected.id}:${selected.revision}`} kind="images" id={selected.id} disabled={busy} />
    </section>}
    <div className="library-heading"><h2>Saved images</h2><span className="library-count">{images.length} images</span></div>
    {loading ? <p role="status">Loading your images…</p> : !images.length ? <p className="empty-state">Import your first image reference.</p> : <ul className="image-gallery">{[...images].sort((a,b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).map(image => <li key={image.id}>
      <ImagePreview id={image.id} title={image.title} /><button className="secondary-button" disabled={busy} onClick={() => choose(image)}>Open {image.title}</button>{image.description && <p>{image.description}</p>}
    </li>)}</ul>}
  </section>;
}
