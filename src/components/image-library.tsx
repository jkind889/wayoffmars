'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IMAGE_LIMITS, imageFields, type SavedImage, type ImageFields } from '@/lib/image-model';
import { localRequest, encodeBytes } from '@/lib/local-client';
import { ImageNoteLinks } from './image-note-links';
import { Comparison, CompareChoice, useShortlist } from './comparison';
import { readTags, type TagLibrary } from '@/lib/tag-storage';
import type { Collection, CollectionsLibrary } from '@/lib/collection-model';
import { ImageCollections } from './image-collections';
import { ImagePreview } from './image-preview';
const fieldsOf = (image: SavedImage): ImageFields => ({ title: image.title, source: image.source, description: image.description, texture: image.texture === true });
export function ImageLibrary({ textures = false }: { textures?: boolean }) {
  const basePath = textures ? '/textures' : '/images';
  const [images, setImages] = useState<SavedImage[]>([]), [selected, setSelected] = useState<SavedImage | null>(null);
  const [fields, setFields] = useState<ImageFields>({ title: '', source: '', description: '' });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const restoreFocus = useRef(false), input = useRef<HTMLInputElement>(null), lock = useRef(false), detail = useRef<HTMLElement>(null), importButton = useRef<HTMLButtonElement>(null);
  const shortlist = useShortlist();
  const [query, setQuery] = useState(''), [tagFilter, setTagFilter] = useState(''), [collectionFilter, setCollectionFilter] = useState('');
  const [tags, setTags] = useState<TagLibrary>({ vocabulary: [], records: [] }), [collections, setCollections] = useState<Collection[]>([]);
  const [organizationReady, setOrganizationReady] = useState(false), [organizationError, setOrganizationError] = useState('');
  const [existing, setExisting] = useState(''), [duplicate, setDuplicate] = useState<SavedImage | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const needsOrganization = textures || selected !== null;
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
  }, [loadVersion]);
  useEffect(() => {
    if (!needsOrganization) return;
    let cancelled = false;
    Promise.all([readTags(), localRequest<CollectionsLibrary>('collections')]).then(([tags, library]) => {
      if (!cancelled) { setTags(tags); setCollections(library.collections); setOrganizationReady(true); setOrganizationError(''); }
    }).catch(error => { if (!cancelled) { setOrganizationReady(false); setOrganizationError(`Tags and collections could not be loaded. Reload to retry. ${error.message}`); } });
    return () => { cancelled = true; };
  }, [loadVersion, needsOrganization]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy]);
  useEffect(() => { if (!busy && !loading && restoreFocus.current) { importButton.current?.focus(); restoreFocus.current = false; } });
  useEffect(() => { if (selected?.id) detail.current?.focus(); }, [selected?.id]);
  function choose(image: SavedImage | null) {
    if (lock.current || dirty && !window.confirm('Discard your unsaved image edits?')) return;
    setDuplicate(null); setSelected(image); if (image) setFields(fieldsOf(image));
    setError(''); setStatus('');
    window.history.replaceState(null, '', image ? `${basePath}?image=${image.id}` : basePath);
    if (!image) importButton.current?.focus();
  }
  async function importFile(file: File) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus(`Validating and saving “${file.name}”…`);
    try {
      if (!file.size || file.size > IMAGE_LIMITS.bytes) throw new Error('Choose an image up to 20 MiB.');
      const result = await localRequest<{ added: boolean; image: SavedImage }>('images', { action: 'save', filename: file.name, texture: textures, bytes: encodeBytes(await file.arrayBuffer()) });
      setImages(previous => [...previous.filter(image => image.id !== result.image.id), result.image]);
      setDuplicate(!result.added && textures ? result.image : null);
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
      window.history.replaceState(null, '', basePath); restoreFocus.current = true;
    } catch (error) { setError(`Image could not be deleted. ${(error as Error).message}`); }
    finally { lock.current = false; setBusy(false); }
  }
  function reload() {
    if (lock.current || dirty && !window.confirm('Reload images? Unsaved image edits will be discarded.')) return;
    restoreFocus.current = true; setLoading(true); setSelected(null); setDuplicate(null); setError(''); setOrganizationReady(false); setLoadVersion(value => value + 1);
  }
  async function changeMembership(collection: Collection, add: boolean) {
    if (!selected || lock.current || dirty) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const members = add ? [...collection.members, { kind: 'images' as const, id: selected.id }] : collection.members.filter(member => member.kind !== 'images' || member.id !== selected.id);
      const saved = await localRequest<Collection>('collections', { action: 'save', id: collection.id, expectedRevision: collection.revision, name: collection.name, members });
      setCollections(previous => previous.map(item => item.id === saved.id ? saved : item));
      setStatus(add ? `Added to “${saved.name}”.` : `Removed from “${saved.name}”. The image is kept.`);
    } catch (error) { setError(`${(error as Error).message} Use Reload to refresh collections.`); }
    finally { lock.current = false; setBusy(false); detail.current?.focus(); }
  }
  const visibleImages = images.filter(image => (image.texture === true) === textures);
  const imageTags = new Map(tags.records.filter(record => record.kind === 'images').map(record => [record.id, record.tags]));
  const collectionIds = new Set(collections.find(collection => collection.id === collectionFilter)?.members.filter(member => member.kind === 'images').map(member => member.id));
  const results = visibleImages.filter(image => `${image.title} ${image.description} ${image.filename}`.toLowerCase().includes(query.trim().toLowerCase()) && (!textures || (!tagFilter || imageTags.get(image.id)?.some(tag => tag.key === tagFilter)) && (!collectionFilter || collectionIds.has(image.id)))).sort((a,b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return <section className="notes-workspace" aria-label={textures ? 'Texture library' : 'Image library'}>
    <div className="notes-toolbar"><p className="storage-note">Still PNG, JPEG and WebP. Up to 20 MiB, 12,000 pixels per side and 24 megapixels. Original bytes stay on this Mac.</p>
      <button ref={importButton} className="primary-button" disabled={busy || loading} onClick={() => input.current?.click()}>{textures ? 'Import texture' : 'Import image'}</button>
      <button className="secondary-button" disabled={busy || loading} onClick={reload}>Reload {textures ? 'textures' : 'images'}</button>
      <input ref={input} type="file" className="visually-hidden" tabIndex={-1} aria-label="Choose image" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" disabled={busy || loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} />
    </div>
    {textures && <div className="texture-existing">
      <p className="storage-note">Textures appear here instead of in the Images gallery and keep their tags and collections. To classify an existing image, open it below, check “Use as texture”, and save.</p>
      <div className="link-form"><label>Existing image<select disabled={busy || loading} value={existing} onChange={event => setExisting(event.target.value)}><option value="">Choose an image to classify</option>{images.filter(image => !image.texture).map(image => <option key={image.id} value={image.id}>{image.title}</option>)}</select></label><button className="secondary-button" disabled={busy || loading || !images.some(image => image.id === existing && !image.texture)} onClick={() => { const image = images.find(image => image.id === existing); if (image) choose(image); }}>Review existing image</button></div>
    </div>}
    {duplicate && <p className="storage-note">The existing image was kept unchanged. <button className="secondary-button" disabled={busy} onClick={() => choose(images.find(image => image.id === duplicate.id) ?? duplicate)}>Review saved image</button></p>}
    {organizationError && <p className="font-error" role="alert">{organizationError}</p>}
    {error && <p className="font-error" role="alert">{error}</p>}<p className="note-status" role="status">{status}</p>
    {selected && <section ref={detail} tabIndex={-1} className="image-detail" aria-label="Image details">
      <div className="library-heading"><h2>{selected.title}</h2><button className="secondary-button" disabled={busy} onClick={() => choose(null)}>Close details</button></div>
      <ImagePreview key={selected.id} id={selected.id} title={selected.title} detail />
      <p className="storage-note">{selected.width} × {selected.height} · {selected.format.toUpperCase()} · {(selected.byteSize / 1024).toFixed(1)} KiB · {selected.filename}</p>
      <p className="image-original"><a className="secondary-button" href={`/api/images/${selected.id}?download=1`} download>Download original {selected.format.toUpperCase()}</a></p>
      <form className="note-editor" aria-label="Image editor" onSubmit={save}><fieldset disabled={busy}>
        <label>Image title<input required maxLength={IMAGE_LIMITS.title} value={fields.title} onChange={event => setFields({ ...fields, title: event.target.value })} /></label>
        <label>Source URL <span className="field-hint">Optional; stored without fetching</span><input type="url" maxLength={IMAGE_LIMITS.source} value={fields.source} onChange={event => setFields({ ...fields, source: event.target.value })} /></label>
        <label>Why saved <span className="field-hint">Optional short description</span><textarea rows={3} maxLength={IMAGE_LIMITS.description} value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></label>
        <label className="texture-classification"><input type="checkbox" checked={fields.texture === true} onChange={event => setFields({ ...fields, texture: event.target.checked })} />Use as texture</label>
        <p className="storage-note">Check to show in Textures; uncheck to show in Images. The original file, tags, and collection memberships stay saved.</p>
        <div className="backup-actions"><button className="primary-button" type="submit">{busy ? 'Saving…' : 'Save image details'}</button><button className="secondary-button" type="button" onClick={() => void remove()}>Delete image</button></div>
      </fieldset><p className="storage-note">{dirty ? 'Unsaved edits. Save before closing this tab.' : 'Details are saved on this Mac.'}</p></form>
      <p><a href={`/tags?kind=images&id=${encodeURIComponent(selected.id)}`}>Manage shared tags</a></p>
      {organizationReady && <ImageCollections key={`collections:${selected.id}`} id={selected.id} collections={collections} disabled={busy || dirty} change={(collection, add) => void changeMembership(collection, add)} />}
      {dirty && <p className="image-membership-hint storage-note">Save image details before changing collection membership.</p>}
      <ImageNoteLinks key={`${selected.id}:${selected.revision}`} kind="images" id={selected.id} disabled={busy} />
    </section>}
    <Comparison kind="images" count={shortlist.ids.length} onClear={shortlist.clear} onOpen={async () => { setImages(await localRequest<SavedImage[]>('images')); }}>
      <div className="comparison-grid">{shortlist.ids.map(id => { const image = images.find(item => item.id === id); return <article className="comparison-card" key={id}><h3>{image?.title ?? 'Image no longer available'}</h3>{image ? <><ImagePreview id={id} title={image.title} detail /><p>{image.width} × {image.height} · {image.format.toUpperCase()}</p><p>{image.description}</p></> : <p>This item was deleted. Remove it from the shortlist.</p>}<button type="button" className="secondary-button" onClick={() => shortlist.toggle(id)}>Remove from comparison</button></article>; })}</div>
    </Comparison>
    <label>{textures ? 'Filter textures' : 'Filter images'}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {textures && <fieldset className="tag-filters" disabled={!organizationReady}><legend>Filter textures by organization</legend><div className="tag-filter-fields">
      <label>Texture tag<select value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="">All tags</option>{tags.vocabulary.map(tag => <option key={tag.key} value={tag.key}>{tag.label}</option>)}</select></label>
      <label>Texture collection<select value={collectionFilter} onChange={event => setCollectionFilter(event.target.value)}><option value="">All collections</option>{collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label>
    </div><button className="secondary-button" onClick={() => { setQuery(''); setTagFilter(''); setCollectionFilter(''); }}>Clear texture filters</button></fieldset>}
    <div className="library-heading"><h2>{textures ? 'Saved textures' : 'Saved images'}</h2><span className="library-count">{textures ? `${results.length} of ${visibleImages.length} textures` : `${visibleImages.length} images`}</span></div>
    {loading ? <p role="status">Loading your images…</p> : !visibleImages.length ? <p className="empty-state">{textures ? 'Import a texture or classify an existing image to start.' : 'Import your first image reference.'}</p> : !results.length ? <p className="empty-state">No images match these filters.</p> : <ul className="image-gallery">{results.map(image => <li key={image.id}>
      <ImagePreview id={image.id} title={image.title} /><CompareChoice name={image.title} selected={shortlist.ids.includes(image.id)} full={shortlist.ids.length >= 4} onClick={() => shortlist.toggle(image.id)} /><button className="secondary-button" disabled={busy} onClick={() => choose(image)}>Open {image.title}</button>{image.description && <p>{image.description}</p>}{textures && !!imageTags.get(image.id)?.length && <ul className="note-tags" aria-label="Tags">{imageTags.get(image.id)!.map(tag => <li key={tag.key}>{tag.label}</li>)}</ul>}
    </li>)}</ul>}
  </section>;
}
