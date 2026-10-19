'use client';
import { useRef, useState } from 'react';
import { localRequest } from '@/lib/local-client';
import type { SavedNote } from '@/lib/note-model';
export function NoteExcerpts({ note, onChanged, disabled }: { note: SavedNote; onChanged: (note: SavedNote) => void; disabled: boolean }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false);
  if (!note.excerpts?.length) return null;
  return <section aria-label={`PDF excerpts for ${note.title}`} className="note-excerpts"><h4>PDF excerpts</h4>
    {error && <p role="alert" className="font-error">{error}</p>}
    {note.excerpts.map(excerpt => <article key={excerpt.id} className="excerpt-card">
      <blockquote className="note-body">{excerpt.quotation}</blockquote>
      <p className="storage-note">{excerpt.filename} · Physical page {excerpt.page}</p>
      {excerpt.observation && <div><h5>Observation</h5><p className="note-body">{excerpt.observation}</p></div>}
      {excerpt.sourceId ? <p><a href={`/pdf/${encodeURIComponent(excerpt.sourceId)}?page=${excerpt.page}`}>Open cited page {excerpt.page}</a>{!excerpt.hasOriginal && ' · Text only; the original can be reattached on the page.'}</p> : <p className="storage-note">Source PDF deleted. The quotation, observation, filename and physical page are retained.</p>}
      <button className="secondary-button" disabled={disabled || busy} onClick={async () => {
        if (lock.current || !window.confirm('Remove this excerpt and its observation from the note? The PDF is kept.')) return;
        lock.current = true; setBusy(true); setError('');
        try { onChanged(await localRequest<SavedNote>('excerpts', { action: 'delete', id: excerpt.id, noteId: note.id, noteRevision: note.revision })); }
        catch (error) { setError((error as Error).message); } finally { lock.current = false; setBusy(false); }
      }}>Remove excerpt</button>
    </article>)}
  </section>;
}
