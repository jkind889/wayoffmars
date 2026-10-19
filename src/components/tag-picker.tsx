'use client';
import { useId, useRef, useState } from 'react';
import { normalizeTags, tagKey, TAG_LIMIT } from '@/lib/tag-model.mjs';
import type { Tag } from '@/lib/tag-storage';

/** Native datalist supplies keyboard autocomplete; buttons make every removal explicit. */
export function TagPicker({ value, vocabulary, onChange, onPendingChange, disabled = false, label = 'Add tag', help = 'Choose an existing tag or type a new one, then press Enter or Add tag. Save to apply your changes.' }: { value: string[]; vocabulary: Tag[]; onChange: (tags: string[]) => void; onPendingChange: (value: string) => void; disabled?: boolean; label?: string; help?: string }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(''), [error, setError] = useState('');
  function add() {
    try {
      if (!pending.trim()) throw new Error('Enter a tag to add.');
      const label = vocabulary.find(tag => tag.key === tagKey(pending))?.label ?? pending.trim();
      const next = normalizeTags([...value, label]);
      onChange(next); setPending(''); onPendingChange(''); setError(''); input.current?.focus();
    } catch (error) { setError((error as Error).message); }
  }
  return <div className="tag-picker">
    <ul className="tag-chips" aria-label="Assigned tags">{value.map((tag, index) => <li key={`${tag}-${index}`}><span>{tag}</span><button type="button" disabled={disabled} aria-label={`Remove tag ${tag}`} onClick={() => { onChange(value.filter((_, i) => i !== index)); input.current?.focus(); }}>×</button></li>)}</ul>
    <label htmlFor={id}>{label}</label>
    <div className="search-controls"><input ref={input} id={id} list={`${id}-options`} value={pending} disabled={disabled} maxLength={TAG_LIMIT} aria-describedby={`${id}-help`} onChange={event => { setPending(event.target.value); onPendingChange(event.target.value); setError(''); }} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); add(); }
      if (event.key === 'Escape') { event.preventDefault(); setPending(''); onPendingChange(''); }
    }} /><button type="button" className="secondary-button" disabled={disabled} onClick={add}>{label}</button></div>
    <datalist id={`${id}-options`}>{vocabulary.filter(tag => !value.some(label => tagKey(label) === tag.key)).map(tag => <option key={tag.key} value={tag.label} />)}</datalist>
    <p className="storage-note" id={`${id}-help`}>{help}</p>
    {pending.trim() && <p className="storage-note">“{pending}” has not been added yet.</p>}
    {error && <p role="alert" className="font-error">{error}</p>}
  </div>;
}
