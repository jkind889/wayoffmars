'use client';
import { useEffect, useRef, useState } from 'react';
import { localRequest, decodeBytes } from '@/lib/local-client';
import { loadFontBytes } from '@/lib/font-loader';
import { type Collection, type CollectionsLibrary, type CollectionItem, type Member, memberKey, memberUrl } from '@/lib/collection-model';
import { ImagePreview } from './image-preview';

function FontSample({ id }: { id: string }) {
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false, face: FontFace | undefined;
    localRequest<string>(`asset&id=${encodeURIComponent(id)}`).then(bytes => loadFontBytes(decodeBytes(bytes), `collection-${id}`)).then(loaded => { if (!cancelled) { face = loaded; document.fonts.add(loaded); setReady(true); } }).catch(() => { if (!cancelled) setError('Font preview unavailable. Open Fonts to repair the saved file.'); });
    return () => { cancelled = true; if (face) document.fonts.delete(face); };
  }, [id]);
  return error ? <p>{error}</p> : ready ? <p className="font-sample" style={{ fontFamily: `"collection-${id}"`, fontSize: 28 }}>The quick brown fox · Aa Bb 123</p> : <p>Loading saved font…</p>;
}
function ItemPreview({ item }: { item: CollectionItem }) {
  return item.kind === 'images' ? <ImagePreview id={item.id} title={item.title} /> : item.kind === 'fonts' ? <FontSample id={item.id} /> : <p className="note-body">{item.preview}</p>;
}
function CollectionEditor({ collection, items, busy, save, remove, onDirty }: { collection: Collection; items: CollectionItem[]; busy: boolean; save: (name: string, members: Member[]) => Promise<void>; remove: () => void; onDirty: (dirty: boolean) => void }) {
  const [name, setName] = useState(collection.name), [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [choice, setChoice] = useState('');
  const dirty = name !== collection.name, heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, busy]);
  const candidates = items.filter(item => !collection.members.some(member => memberKey(member) === memberKey(item)) && (kind === 'all' || item.kind === kind) && item.title.toLowerCase().includes(query.trim().toLowerCase()));
  function move(index: number, direction: number) { const members = [...collection.members]; [members[index], members[index + direction]] = [members[index + direction], members[index]]; void save(name, members); }
  return <section aria-label={`Collection ${collection.name}`} className="note-editor">
    <h2 ref={heading} tabIndex={-1}>{collection.name}</h2>
    <form onSubmit={event => { event.preventDefault(); void save(name, collection.members); }}><fieldset disabled={busy}><label>Collection name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><button className="secondary-button" disabled={!dirty}>Save name</button></fieldset></form>
    <p className="storage-note">Membership changes save immediately, including the name above. Sources are referenced without copying files. Deleted sources disappear from collections after reload.</p>
    <fieldset disabled={busy}><legend>Add existing items</legend>
      <label>Filter collection candidates<input type="search" value={query} onChange={event => { setQuery(event.target.value); setChoice(''); }} /></label>
      <label>Collection item type<select value={kind} onChange={event => { setKind(event.target.value); setChoice(''); }}><option value="all">All types</option><option value="notes">Notes</option><option value="images">Images</option><option value="pdfs">PDFs</option><option value="fonts">Saved fonts</option></select></label>
      <label>Item to add<select value={choice} onChange={event => setChoice(event.target.value)}><option value="">Choose an item</option>{candidates.map(item => <option key={memberKey(item)} value={memberKey(item)}>{item.kind} · {item.title}</option>)}</select></label>
      <button className="secondary-button" disabled={!candidates.some(item => memberKey(item) === choice) || collection.members.length >= 100} onClick={() => { const item = candidates.find(item => memberKey(item) === choice); if (item) void save(name, [...collection.members, { kind: item.kind, id: item.id }]); }}>Add to collection</button>
    </fieldset>
    <p aria-live="polite">{collection.members.length} of 100 items</p>
    <ol className="note-list">{collection.members.map((member, index) => {
      const item = items.find(item => memberKey(item) === memberKey(member));
      return <li key={memberKey(member)}><article className="note-card" aria-label={item?.title ?? 'Unavailable item'}>
        <h3>{index + 1}. {item ? <a href={memberUrl(item)}>{item.title}</a> : 'Item unavailable; reload collections'}</h3>
        <p className="storage-note">{member.kind}</p>{item && <ItemPreview item={item} />}
        <div className="backup-actions"><button className="secondary-button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item?.title ?? 'item'} up`}>Move up</button><button className="secondary-button" disabled={busy || index === collection.members.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item?.title ?? 'item'} down`}>Move down</button><button className="secondary-button" disabled={busy} onClick={() => void save(name, collection.members.filter((_, i) => i !== index))} aria-label={`Remove ${item?.title ?? 'item'} from collection`}>Remove membership</button></div>
      </article></li>;
    })}</ol>
    <button className="secondary-button" disabled={busy} onClick={remove}>Delete collection</button>
  </section>;
}
export function Collections() {
  const [library, setLibrary] = useState<CollectionsLibrary>({ collections: [], items: [] }), [selected, setSelected] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const lock = useRef(false), unsaved = useRef(false);
  useEffect(() => { let cancelled = false; localRequest<CollectionsLibrary>('collections').then(data => { if (!cancelled) setLibrary(data); }).catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setBusy(false); }); return () => { cancelled = true; }; }, []);
  async function change(input: object) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await localRequest<Collection | null>('collections', input);
      setLibrary(previous => ({ ...previous, collections: result ? [...previous.collections.filter(c => c.id !== result.id), result] : previous.collections.filter(c => c.id !== selected) }));
      if (result) { setSelected(result.id); setName(''); } else setSelected('');
      setStatus(result ? 'Collection saved on this Mac.' : 'Collection removed. Source items are kept.');
    } catch (error) { setError((error as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const collection = library.collections.find(c => c.id === selected);
  return <section className="collections-workspace" aria-label="Collections">
    {error && <p className="font-error" role="alert">{error}</p>}<p role="status">{status}</p>
    <form className="note-editor" onSubmit={event => { event.preventDefault(); if (unsaved.current && !window.confirm('Discard unsaved collection name edits?')) return; void change({ action: 'save', id: crypto.randomUUID(), expectedRevision: null, name, members: [] }); }}><fieldset disabled={busy}><label>New collection name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><button className="primary-button">Create collection</button></fieldset></form>
    <button className="secondary-button" disabled={busy} onClick={async () => { if (lock.current) return; if (unsaved.current && !window.confirm('Reload collections? Unsaved name edits will be discarded.')) return; lock.current = true; setBusy(true); try { setLibrary(await localRequest<CollectionsLibrary>('collections')); setError(''); setStatus('Collections reloaded.'); setReloadVersion(value => value + 1); } catch (error) { setError((error as Error).message); } finally { lock.current = false; setBusy(false); } }}>Reload collections</button>
    <label>Open collection<select disabled={busy} value={selected} onChange={event => { if (unsaved.current && !window.confirm('Switch collections? Unsaved name edits will be discarded.')) return; setSelected(event.target.value); }}><option value="">Choose a collection</option>{library.collections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.members.length})</option>)}</select></label>
    {collection && <CollectionEditor key={`${collection.id}:${collection.revision}:${reloadVersion}`} collection={collection} items={library.items} busy={busy} onDirty={value => { unsaved.current = value; }} save={async (name, members) => { await change({ action: 'save', id: collection.id, expectedRevision: collection.revision, name, members }); }} remove={() => { if (window.confirm(`Delete collection “${collection.name}”? Source items will be kept.`)) void change({ action: 'delete', id: collection.id, expectedRevision: collection.revision }); }} />}
    {!library.collections.length && !busy && <p className="empty-state">Create a small project collection, then add existing library items.</p>}
  </section>;
}
