'use client';
import { useState } from 'react';
import type { Collection } from '@/lib/collection-model';

export function ImageCollections({ id, collections, disabled, change }: { id: string; collections: Collection[]; disabled: boolean; change: (collection: Collection, add: boolean) => void }) {
  const [choice, setChoice] = useState('');
  const contains = (collection: Collection) => collection.members.some(member => member.kind === 'images' && member.id === id);
  const candidates = collections.filter(collection => !contains(collection));
  return <section className="image-collections" aria-label="Image collections">
    <h3>Collections</h3>
    <p className="storage-note">Add a reference to an existing collection. New members go last; arrange them on the Collections page.</p>
    <ul className="linked-records">{collections.filter(contains).map(collection => <li key={collection.id}><a href={`/collections?collection=${collection.id}`}>{collection.name}</a><button className="secondary-button" disabled={disabled} onClick={() => change(collection, false)}>Remove from {collection.name}</button></li>)}</ul>
    <fieldset disabled={disabled} className="link-form"><legend>Add to a collection</legend>
      <label>Choose collection<select value={choice} onChange={event => setChoice(event.target.value)}><option value="">Choose a collection</option>{candidates.map(collection => <option key={collection.id} value={collection.id}>{collection.name} ({collection.members.length}/100)</option>)}</select></label>
      <button className="secondary-button" disabled={!candidates.some(collection => collection.id === choice && collection.members.length < 100)} onClick={() => { const collection = candidates.find(collection => collection.id === choice); if (collection) { change(collection, true); setChoice(''); } }}>Add image to collection</button>
    </fieldset>
    <p><a href="/collections">Create or organize collections</a></p>
  </section>;
}
