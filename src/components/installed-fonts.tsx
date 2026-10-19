'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { loadFontBytes } from '@/lib/font-loader';
import type { SavedFont } from '@/lib/font-model';
import { localFontAvailability, localFontError, queryInstalledFonts, readInstalledFont, type LocalFontData } from '@/lib/local-fonts';

type Preview = { record: SavedFont; label: string; family: string };
const subscribeToCapability = () => () => {};
const serverCapability = () => 'Checking installed-font support…';
export function InstalledFonts({ disabled, text, style, onSave }: {
  disabled: boolean;
  text: string;
  style: CSSProperties;
  onSave: (font: SavedFont) => Promise<void>;
}) {
  const availability = useSyncExternalStore(subscribeToCapability, localFontAvailability, serverCapability);
  const [inventory, setInventory] = useState<LocalFontData[]>([]);
  const [selection, setSelection] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [phase, setPhase] = useState<'idle' | 'browsing' | 'loading' | 'saving'>('idle');
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const face = useRef<FontFace | null>(null), generation = useRef(0), locked = useRef(false);
  const previewRegion = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLSelectElement>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  const pendingFocus = useRef(false);
  useEffect(() => {
    return () => { generation.current += 1; if (face.current) document.fonts.delete(face.current); };
  }, []);
  useEffect(() => {
    if (!pendingFocus.current || phase !== 'idle' || disabled) return;
    pendingFocus.current = false;
    // Restore the initiating workflow only if the user has not moved elsewhere.
    const active = document.activeElement;
    if (active && active !== document.body && !region.current?.contains(active)) return;
    if (preview) previewRegion.current?.focus();
    else if (inventory.length) picker.current?.focus();
    else browseButton.current?.focus();
  }, [phase, preview, inventory, disabled]);
  const busy = disabled || phase !== 'idle';
  function clearPreview() {
    if (face.current) document.fonts.delete(face.current);
    face.current = null; setPreview(null);
  }
  async function browse() {
    if (disabled || locked.current) return;
    locked.current = true;
    pendingFocus.current = true;
    const current = ++generation.current;
    setPhase('browsing'); setError(''); setStatus(''); setInventory([]); setSelection(''); clearPreview();
    try {
      // No Permissions API await here: retain the click's transient activation.
      const fonts = await queryInstalledFonts();
      if (current !== generation.current) return;
      setInventory(fonts);
      setStatus(fonts.length ? `${fonts.length} installed font faces available. Choose one to preview.` : 'No installed fonts were returned. You can still choose font files.');
    } catch (error) { if (current === generation.current) setError(localFontError(error)); }
    finally { if (current === generation.current) { locked.current = false; setPhase('idle'); } }
  }
  async function load() {
    const font = inventory[Number(selection)];
    if (!selection || !font || busy || locked.current) return;
    locked.current = true;
    pendingFocus.current = true;
    const current = ++generation.current;
    setPhase('loading'); setError(''); setStatus(''); clearPreview();
    try {
      const record = await readInstalledFont(font);
      const family = `installed-${record.id}`;
      const loaded = await loadFontBytes(record.bytes, family);
      if (current !== generation.current) return;
      document.fonts.add(loaded); face.current = loaded;
      setPreview({ record, family, label: font.fullName || `${font.family} ${font.style}` });
      setStatus('Installed font preview ready. Save to library to retain a copy.');
    } catch (error) { if (current === generation.current) setError(localFontError(error)); }
    finally { if (current === generation.current) { locked.current = false; setPhase('idle'); } }
  }
  async function save() {
    if (!preview || busy || locked.current) return;
    locked.current = true;
    pendingFocus.current = true;
    const current = generation.current;
    setPhase('saving'); setError(''); setStatus('');
    try {
      await onSave(preview.record);
      if (current === generation.current) setStatus('A copy is saved in the library below and included in backups.');
    } catch (error) { if (current === generation.current) setError(`Font was not saved. ${localFontError(error)} Retry Save to library.`); }
    finally { if (current === generation.current) { locked.current = false; setPhase('idle'); } }
  }
  return <section ref={region} className="installed-fonts" aria-labelledby="installed-fonts-heading">
    <div className="library-heading"><h2 id="installed-fonts-heading">Installed on this Mac</h2>
      <button ref={browseButton} className="secondary-button" type="button" disabled={busy || Boolean(availability)} onClick={() => void browse()}>{phase === 'browsing' ? 'Requesting font access…' : 'Browse installed fonts'}</button>
    </div>
    <p className="storage-note">Optional browser permission. The font list stays in this tab. Only a selected preview is read; nothing is saved until you choose Save to library.</p>
    {availability && <p className="storage-note">{availability}</p>}
    {error && <p className="font-error" role="alert">{error}</p>}
    <p className="note-status" aria-live="polite">{phase === 'loading' ? 'Reading selected font…' : phase === 'saving' ? 'Saving selected font…' : status}</p>
    {inventory.length > 0 && <div className="installed-font-picker">
      <label>Installed font<select aria-label="Installed font" ref={picker} value={selection} disabled={busy} onChange={event => { setSelection(event.target.value); setError(''); setStatus(''); clearPreview(); }}>
        <option value="">Choose a font face</option>
        {inventory.map((font, index) => <option key={`${font.postscriptName}:${index}`} value={String(index)}>{font.fullName || `${font.family} ${font.style}`}</option>)}
      </select></label>
      <button className="secondary-button" type="button" disabled={busy || !selection} onClick={() => void load()}>Preview installed font</button>
    </div>}
    {preview && <div ref={previewRegion} tabIndex={-1} className="installed-font-preview" aria-label="Installed font preview">
      <div className="font-row-heading"><h3>{preview.label}</h3><button className="secondary-button" type="button" disabled={busy} onClick={() => void save()}>Save to library</button></div>
      <p className="font-save-status">Installed font · temporary preview</p>
      <p className="font-sample" style={{ ...style, fontFamily: `"${preview.family}"` }}>{text || ' '}</p>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => { pendingFocus.current = true; clearPreview(); setStatus('Installed preview cleared. Saved library copies are kept.'); }}>Clear installed preview</button>
    </div>}
  </section>;
}
