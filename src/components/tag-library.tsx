'use client';
/* Native links retain the browser's unsaved-edit navigation protection. */
import { useEffect, useRef, useState } from 'react';
import { readTags, saveTags, recordUrl, type TagLibrary as Library, type TaggedRecord } from '@/lib/tag-storage';
import { tagKey } from '@/lib/tag-model.mjs';
import { TagPicker } from './tag-picker';

function AddedDate({ value }: { value: number }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? <>Date unavailable</> : <time dateTime={date.toISOString()}>{date.toLocaleDateString()}</time>;
}
const names = { notes: 'Note', images: 'Image', pdfs: 'PDF' };
export function TagLibrary() {
  const [library, setLibrary] = useState<Library>({ vocabulary: [], records: [] });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [pending, setPending] = useState('');
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [filters, setFilters] = useState<string[]>([]);
  const [view, setView] = useState('all');
  const [draft, setDraft] = useState<{ record: TaggedRecord; tags: string[] } | null>(null);
  const lock = useRef(false), editor = useRef<HTMLHeadingElement>(null), search = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null), shouldRestore = useRef(false);
  const dirty = !!draft && (!!pending.trim() || JSON.stringify(draft.tags) !== JSON.stringify(draft.record.tags.map(t => t.label)));
  useEffect(() => {
    let cancelled = false;
    readTags().then(data => {
      if (cancelled) return;
      setLibrary(data);
      const params = new URLSearchParams(window.location.search), filter = params.get('tag');
      if (filter) setFilters([filter]);
      if (['untagged', 'recent'].includes(params.get('view') || '')) setView(params.get('view')!);
      const item = data.records.find(record => record.kind === params.get('kind') && record.id === params.get('id'));
      if (item) setDraft({ record: item, tags: item.tags.map(t => t.label) });
    }).catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (draft) editor.current?.focus(); }, [draft?.record.id, draft?.record.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty && !busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy]);
  useEffect(() => { if (shouldRestore.current && !busy && !draft) { (returnFocus.current?.isConnected ? returnFocus.current : search.current)?.focus(); shouldRestore.current = false; } });
  async function reload() {
    if (lock.current) return;
    lock.current = true; setLoading(true); setError('');
    try { setLibrary(await readTags()); setStatus('Tags reloaded.'); } catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setLoading(false); }
  }
  async function save() {
    if (!draft || lock.current || pending.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await saveTags(draft.record, draft.tags);
      // Apply the confirmed write locally; a failed follow-up read must not look
      // like a failed save or leave a stale revision available for another write.
      setLibrary(previous => {
        const records = previous.records.map(record => record.kind === saved.kind && record.id === saved.id ? saved : record);
        const vocabulary = new Map(previous.vocabulary.map(tag => [tag.key, tag]));
        saved.tags.forEach(tag => { if (!vocabulary.has(tag.key)) vocabulary.set(tag.key, { ...tag, count: 0 }); });
        return { records, vocabulary: [...vocabulary.values()].map(tag => ({ ...tag, count: records.filter(record => record.tags.some(t => t.key === tag.key)).length })).sort((a, b) => a.key.localeCompare(b.key)) };
      });
      setDraft(null); shouldRestore.current = true; setStatus(`Tags saved for “${saved.title}”.`);
    } catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const results = library.records.filter(record => (view !== 'untagged' || record.tags.length === 0) && (kind === 'all' || record.kind === kind) && filters.every(key => record.tags.some(tag => tag.key === key)) && query.toLowerCase().trim().split(/\s+/).every(term => record.title.toLowerCase().includes(term))).sort((a, b) => view === 'recent' ? b.addedAt - a.addedAt || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) : a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  function clear() { setFilters([]); setView('all'); setKind('all'); setQuery(''); search.current?.focus(); }
  return <section aria-label="Shared tags">
    <div className="notes-toolbar"><p className="storage-note">Group notes, images, and PDFs with the same tags. Explicit image links stay separate. Other tabs see changes after reload.</p><button className="secondary-button" disabled={loading || busy || !!draft} onClick={() => void reload()}>Reload tags</button></div>
    {error && <p className="font-error" role="alert">{error}</p>}
    <p role="status" className="note-status">{status}</p>
    {draft && <section className="note-editor" aria-label={`Tags for ${draft.record.title}`}>
      <h2 ref={editor} tabIndex={-1}>Tags for {draft.record.title}</h2>
      <TagPicker value={draft.tags} vocabulary={library.vocabulary} disabled={busy} onPendingChange={setPending} onChange={tags => setDraft({ ...draft, tags })} />
      <div className="backup-actions"><button type="button" className="primary-button" disabled={busy || !!pending.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save tags'}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => {
        if (dirty && !window.confirm('Discard your unsaved tag edits?')) return;
        setDraft(null); setPending(''); setError(''); shouldRestore.current = true;
      }}>Cancel</button></div>
    </section>}
    <fieldset className="tag-filters" disabled={loading}>
      <legend>Filter your library</legend>
      <div className="tag-filter-fields"><label>Library view<select value={view} onChange={event => setView(event.target.value)}><option value="all">All items</option><option value="untagged">Untagged</option><option value="recent">Recently added</option></select></label><label>Search titles and filenames<input ref={search} type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} /></label><label>Item type<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">All types</option><option value="notes">Notes</option><option value="images">Images</option><option value="pdfs">PDFs</option></select></label></div>
      <p className="storage-note">Select tags to show items with every selected tag. Unused tags remain available for reuse.</p>
      <TagPicker label="Filter by tag" help="Autocomplete uses your shared tags. Press Enter to apply; items must have every selected tag." value={filters.map(key => library.vocabulary.find(t => t.key === key)?.label ?? key)} vocabulary={library.vocabulary} onPendingChange={() => {}} onChange={labels => setFilters(labels.map(tagKey))} />
      <div className="tag-filter-options">{library.vocabulary.map(tag => <label key={tag.key}><input type="checkbox" checked={filters.includes(tag.key)} onChange={event => setFilters(previous => event.target.checked ? [...previous, tag.key] : previous.filter(key => key !== tag.key))} /><span>{tag.label} ({tag.count})</span></label>)}</div>
      {!!(filters.length || query || kind !== 'all' || view !== 'all') && <button type="button" className="secondary-button" onClick={clear}>Clear filters</button>}
    </fieldset>
    <div className="library-heading"><h2>Items</h2><span className="library-count" aria-live="polite">{loading ? 'Loading…' : `${results.length} of ${library.records.length} items`}</span></div>
    {!loading && !results.length && <p className="storage-note">{library.records.length ? 'No items match. Clear filters or choose fewer tags.' : 'Save a note, image, or PDF to start tagging.'}</p>}
    <ul className="note-list">{results.map(record => <li key={`${record.kind}:${record.id}`}><article className="note-card" aria-label={record.title}>
      <div className="note-card-heading"><h3><a href={recordUrl(record)}>{record.title}</a></h3><button className="secondary-button" disabled={busy || !!draft} onClick={event => { returnFocus.current = event.currentTarget; setError(''); setStatus(''); setDraft({ record, tags: record.tags.map(t => t.label) }); }}>Edit tags</button></div>
      <p className="storage-note">{names[record.kind]} · Added <AddedDate value={record.addedAt} /></p>
      {record.tags.length ? <ul className="note-tags" aria-label="Tags">{record.tags.map(tag => <li key={tag.key}>{tag.label}</li>)}</ul> : <p className="storage-note">No tags yet</p>}
    </article></li>)}</ul>
  </section>;
}
