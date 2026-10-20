'use client';
import { useEffect, useRef, useState } from 'react';
import { localRequest, decodeBytes } from '@/lib/local-client';
import { loadFontBytes } from '@/lib/font-loader';
import { type Collection, type CollectionsLibrary, type CollectionItem, type Member, memberKey, memberUrl } from '@/lib/collection-model';
import { TagPicker } from './tag-picker';
import type { Tag } from '@/lib/tag-storage';
import { ImagePreview } from './image-preview';

function FontSample({ id }: { id: string }) {
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const load = useRef<{ id: string; promise: Promise<FontFace> } | null>(null);
  useEffect(() => {
    let cancelled = false, face: FontFace | undefined;
    if (load.current?.id !== id) load.current = { id, promise: localRequest<string>(`asset&id=${encodeURIComponent(id)}`).then(bytes => loadFontBytes(decodeBytes(bytes), `collection-${id}`)) };
    load.current.promise.then(loaded => { if (!cancelled) { face = loaded; document.fonts.add(loaded); setReady(true); } }).catch(() => { if (!cancelled) setError('Font preview unavailable. Open Fonts to repair the saved file.'); });
    return () => { cancelled = true; if (face) document.fonts.delete(face); };
  }, [id]);
  return error ? <p>{error}</p> : ready ? <p className="font-sample" style={{ fontFamily: `"collection-${id}"`, fontSize: 28 }}>The quick brown fox · Aa Bb 123</p> : <p>Loading saved font…</p>;
}
function ItemPreview({ item }: { item: CollectionItem }) {
  return item.kind === 'images' ? <ImagePreview id={item.id} title={item.title} /> : item.kind === 'fonts' ? <FontSample id={item.id} /> : <p className="note-body">{item.preview}</p>;
}
function DeferredFontSample({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={host}>{visible ? <FontSample id={id} /> : <p className="storage-note">Font preview loads when in view.</p>}</div>;
}
const itemLabels = { notes: 'Note', images: 'Image', pdfs: 'PDF', fonts: 'Font' };
function CollectionContents({ collection, items, busy, edit }: { collection: Collection; items: CollectionItem[]; busy: boolean; edit: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start' }); }, []);
  const byId = new Map(items.map(item => [memberKey(item), item]));
  return <section className="collection-contents" aria-label={`Collection ${collection.name}`}>
    <div className="collection-contents-heading"><h2 id="collection-detail-heading" ref={heading} tabIndex={-1}>{collection.name}</h2><button className="secondary-button" disabled={busy} onClick={edit}>Edit collection</button></div>
    {collection.tags.length > 0 && <ul className="note-tags" aria-label="Collection tags">{collection.tags.map(tag => <li key={tag.key}>{tag.label}</li>)}</ul>}
    <p className="storage-note">{collection.members.length} {collection.members.length === 1 ? 'item' : 'items'} · Collection order</p>
    {collection.members.length === 0 ? <p className="empty-state">This collection is empty. Choose Edit collection to add items from your library.</p> :
      <ol className="collection-items-grid" aria-label="Collection items">{collection.members.map((member, index) => {
        const item = byId.get(memberKey(member));
        return <li key={memberKey(member)}><article className="collection-item-card" aria-label={item?.title ?? 'Unavailable item'}>
          <div className={`collection-item-preview${member.kind === 'images' ? ' is-image' : ''}`}>
            {item ? item.kind === 'fonts' ? <DeferredFontSample id={item.id} /> : <ItemPreview item={item} /> : <p>Item unavailable. Reload collections to update this view.</p>}
          </div>
          <h3>{item ? <a href={memberUrl(item)}>{item.title}</a> : 'Unavailable item'}</h3>
          <p className="storage-note">{index + 1} · {itemLabels[member.kind]}</p>
        </article></li>;
      })}</ol>}
  </section>;
}
function CollectionEditor({ collection, items, vocabulary, busy, save, remove, onDirty }: { collection: Collection; items: CollectionItem[]; vocabulary: Tag[]; busy: boolean; save: (name: string, members: Member[], tags: string[]) => Promise<void>; remove: () => void; onDirty: (dirty: boolean) => void }) {
  const [name, setName] = useState(collection.name), [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [choice, setChoice] = useState('');
  const [tags, setTags] = useState(collection.tags.map(tag => tag.label)), [pending, setPending] = useState('');
  const dirty = name !== collection.name || !!pending.trim() || JSON.stringify(tags) !== JSON.stringify(collection.tags.map(tag => tag.label)), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, busy]);
  const candidates = items.filter(item => !collection.members.some(member => memberKey(member) === memberKey(item)) && (kind === 'all' || item.kind === kind) && item.title.toLowerCase().includes(query.trim().toLowerCase()));
  function move(index: number, direction: number) { const members = [...collection.members]; [members[index], members[index + direction]] = [members[index + direction], members[index]]; void save(name, members, tags); }
  return <section aria-label={`Collection ${collection.name}`} className="note-editor">
    <h2 id="collection-detail-heading" ref={heading} tabIndex={-1}>{collection.name}</h2>
    <form onSubmit={event => { event.preventDefault(); if (pending.trim()) return; void save(name, collection.members, tags); }}><fieldset disabled={busy}><label>Collection name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><TagPicker value={tags} vocabulary={vocabulary} onChange={setTags} onPendingChange={setPending} disabled={busy} /><button className="secondary-button" disabled={!dirty || !!pending.trim()}>Save collection details</button></fieldset></form>
    <p className="storage-note">Membership changes save immediately, including the name and tags above. Add or clear pending tag text before saving. Sources are referenced without copying files. Deleted sources disappear from collections after reload.</p>
    <fieldset disabled={busy || !!pending.trim()}><legend>Add existing items</legend>
      <label>Filter collection candidates<input type="search" value={query} onChange={event => { setQuery(event.target.value); setChoice(''); }} /></label>
      <label>Collection item type<select value={kind} onChange={event => { setKind(event.target.value); setChoice(''); }}><option value="all">All types</option><option value="notes">Notes</option><option value="images">Images</option><option value="pdfs">PDFs</option><option value="fonts">Saved fonts</option></select></label>
      <label>Item to add<select value={choice} onChange={event => setChoice(event.target.value)}><option value="">Choose an item</option>{candidates.map(item => <option key={memberKey(item)} value={memberKey(item)}>{item.kind} · {item.title}</option>)}</select></label>
      <button className="secondary-button" disabled={!candidates.some(item => memberKey(item) === choice) || collection.members.length >= 100} onClick={() => { const item = candidates.find(item => memberKey(item) === choice); if (item) void save(name, [...collection.members, { kind: item.kind, id: item.id }], tags); }}>Add to collection</button>
    </fieldset>
    <p aria-live="polite">{collection.members.length} of 100 items</p>
    <ol className="note-list">{collection.members.map((member, index) => {
      const item = items.find(item => memberKey(item) === memberKey(member));
      return <li key={memberKey(member)}><article className="note-card" aria-label={item?.title ?? 'Unavailable item'}>
        <h3>{index + 1}. {item ? <a href={memberUrl(item)}>{item.title}</a> : 'Item unavailable; reload collections'}</h3>
        <p className="storage-note">{member.kind}</p>{item && <ItemPreview item={item} />}
        <div className="backup-actions"><button className="secondary-button" disabled={busy || !!pending.trim() || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item?.title ?? 'item'} up`}>Move up</button><button className="secondary-button" disabled={busy || !!pending.trim() || index === collection.members.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item?.title ?? 'item'} down`}>Move down</button><button className="secondary-button" disabled={busy || !!pending.trim()} onClick={() => void save(name, collection.members.filter((_, i) => i !== index), tags)} aria-label={`Remove ${item?.title ?? 'item'} from collection`}>Remove membership</button></div>
      </article></li>;
    })}</ol>
    <button className="secondary-button" disabled={busy} onClick={remove}>Delete collection</button>
  </section>;
}
export function Collections() {
  const [library, setLibrary] = useState<CollectionsLibrary>({ collections: [], items: [], vocabulary: [] }), [selected, setSelected] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [query, setQuery] = useState(''), [tagFilter, setTagFilter] = useState(''), [untagged, setUntagged] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0), [editing, setEditing] = useState(false);
  const lock = useRef(false), unsaved = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null), newButton = useRef<HTMLButtonElement>(null), nameInput = useRef<HTMLInputElement>(null);
  const [createError, setCreateError] = useState('');
  const focusNew = useRef(false);
  useEffect(() => { if (createError) nameInput.current?.focus(); }, [createError]);
  useEffect(() => { if (!busy && focusNew.current) { focusNew.current = false; newButton.current?.focus(); } }, [busy]);
  function closeCreate() { dialog.current?.close(); newButton.current?.focus(); }
  function closeCollection() {
    if (unsaved.current && !window.confirm('Close collection? Unsaved collection edits will be discarded.')) return;
    const card = document.getElementById(`collection-card-${selected}`);
    setSelected(''); setEditing(false); (card ?? newButton.current)?.focus();
  }
  useEffect(() => { let cancelled = false; localRequest<CollectionsLibrary>('collections').then(data => { if (!cancelled) { setLibrary(data); setSelected(new URLSearchParams(window.location.search).get('collection') ?? ''); } }).catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setBusy(false); }); return () => { cancelled = true; }; }, []);
  useEffect(() => {
    if (!name.trim()) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [name]);
  async function change(input: object, creating = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setCreateError('');
    try {
      const result = await localRequest<Collection | null>('collections', input);
      if (creating) { dialog.current?.close(); setEditing(false); }
      setLibrary(previous => ({ ...previous, vocabulary: [...new Map([...previous.vocabulary, ...(result?.tags ?? [])].map(tag => [tag.key, tag])).values()].sort((a,b) => a.key.localeCompare(b.key)), collections: result ? [...previous.collections.filter(c => c.id !== result.id), result] : previous.collections.filter(c => c.id !== selected) }));
      if (result) { setSelected(result.id); if ('expectedRevision' in input && input.expectedRevision === null) setName(''); } else { setSelected(''); focusNew.current = true; }
      setStatus(result ? 'Collection saved on this Mac.' : 'Collection removed. Source items are kept.');
    } catch (error) { if (creating) { setCreateError((error as Error).message); } else setError((error as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const collection = library.collections.find(c => c.id === selected);
  const results = library.collections.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()) && (!tagFilter || c.tags.some(tag => tag.key === tagFilter)) && (!untagged || c.tags.length === 0));
  return <section className="collections-workspace" aria-label="Collections">
    {error && <p className="font-error" role="alert">{error}</p>}<p role="status">{status}</p>
    <div className="backup-actions">
    <button ref={newButton} className="primary-button" disabled={busy} onClick={() => { setCreateError(''); dialog.current?.showModal(); nameInput.current?.focus(); }}>New collection</button>
    <button className="secondary-button" disabled={busy} onClick={async () => { if (lock.current) return; if (unsaved.current && !window.confirm('Reload collections? Unsaved collection edits will be discarded.')) return; lock.current = true; setBusy(true); try { setLibrary(await localRequest<CollectionsLibrary>('collections')); setError(''); setStatus('Collections reloaded.'); setReloadVersion(value => value + 1); } catch (error) { setError((error as Error).message); } finally { lock.current = false; setBusy(false); } }}>Reload collections</button>
    </div>
    <dialog ref={dialog} className="collection-create-dialog" aria-labelledby="create-collection-title" onCancel={event => { event.preventDefault(); if (!lock.current) closeCreate(); }} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="library-heading"><h2 id="create-collection-title">New collection</h2><button className="secondary-button" aria-label="Close new collection" disabled={busy} onClick={closeCreate}>Close</button></div>
      <form className="note-editor" onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) { setCreateError('Enter a collection name.'); nameInput.current?.focus(); return; }
        if (unsaved.current && !window.confirm('Discard unsaved collection edits?')) return;
        void change({ action: 'save', id: crypto.randomUUID(), expectedRevision: null, name, members: [] }, true);
      }}>
        <fieldset disabled={busy}><label>New collection name<input ref={nameInput} required maxLength={120} value={name} aria-describedby={createError ? 'create-collection-error' : undefined} aria-invalid={createError ? true : undefined} onChange={event => { setName(event.target.value); setCreateError(''); }} /></label></fieldset>
        {createError && <p id="create-collection-error" className="font-error" role="alert">{createError}</p>}
        <div className="backup-actions"><button className="primary-button" disabled={busy}>{busy ? 'Creating collection…' : 'Create collection'}</button><button type="button" className="secondary-button" disabled={busy} onClick={closeCreate}>Cancel</button></div>
      </form>
    </dialog>
    <fieldset className="tag-filters"><legend>Filter collections</legend><div className="tag-filter-fields">
      <label>Search collections<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Collection tag<select value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="">All tags</option>{library.vocabulary.map(tag => <option key={tag.key} value={tag.key}>{tag.label}</option>)}</select></label>
    </div><div className="tag-filter-options"><label><input type="checkbox" checked={untagged} onChange={event => setUntagged(event.target.checked)} />Untagged collections</label></div>
      <button className="secondary-button" onClick={() => { setQuery(''); setTagFilter(''); setUntagged(false); }}>Clear collection filters</button>
      <p aria-live="polite">{results.length} of {library.collections.length} collections match</p>
    </fieldset>
    <ul className="collection-grid" aria-label="Saved collections">{results.map(c => <li key={c.id}>
      <button id={`collection-card-${c.id}`} className="collection-card" disabled={busy} aria-label={`Open collection ${c.name}`} aria-expanded={selected === c.id} aria-controls={selected === c.id ? 'collection-detail' : undefined} onClick={() => {
        if (selected === c.id) { document.getElementById('collection-detail-heading')?.focus(); return; }
        if (unsaved.current && !window.confirm('Switch collections? Unsaved collection edits will be discarded.')) return;
        setSelected(c.id); setEditing(false);
      }}>
        <span className="collection-card-title">{c.name}</span>
        <span className="storage-note">{c.members.length} {c.members.length === 1 ? 'item' : 'items'}</span>
        {c.tags.length > 0 && <span className="note-tags">{c.tags.map(tag => <span className="note-tag" key={tag.key}>{tag.label}</span>)}</span>}
      </button>
    </li>)}</ul>
    {!results.length && library.collections.length > 0 && <p className="empty-state">No collections match these filters.</p>}
    {collection && <div id="collection-detail">
      <div className="backup-actions"><button className="secondary-button" disabled={busy} onClick={closeCollection}>Close collection</button>
      {editing && <button className="secondary-button" disabled={busy} onClick={() => {
        if (unsaved.current && !window.confirm('Return to collection? Unsaved collection edits will be discarded.')) return;
        setEditing(false);
      }}>Back to collection</button>}</div>
      {!results.includes(collection) && <p className="storage-note">This open collection is outside the current filters.</p>}
    {editing ? <CollectionEditor key={`${collection.id}:${collection.revision}:${reloadVersion}`} collection={collection} items={library.items} vocabulary={library.vocabulary} busy={busy} onDirty={value => { unsaved.current = value; }} save={async (name, members, tags) => { await change({ action: 'save', id: collection.id, expectedRevision: collection.revision, name, members, tags }); }} remove={() => { if (window.confirm(`Delete collection “${collection.name}”? Source items will be kept.`)) void change({ action: 'delete', id: collection.id, expectedRevision: collection.revision }); }} /> : <CollectionContents key={`${collection.id}:${reloadVersion}`} collection={collection} items={library.items} busy={busy} edit={() => setEditing(true)} />}
    </div>}
    {!library.collections.length && !busy && <p className="empty-state">Create a small project collection, then add existing library items.</p>}
  </section>;
}
