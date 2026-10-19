'use client';
import { useRef, useState, type ReactNode } from 'react';

export function useShortlist() {
  const [ids, setIds] = useState<string[]>([]), current = useRef<string[]>([]);
  return { ids, toggle: (id: string) => {
    const previous = current.current;
    const added = !previous.includes(id) && previous.length < 4;
    current.current = previous.includes(id) ? previous.filter(value => value !== id) : added ? [...previous, id] : previous;
    setIds(current.current); return added;
  }, clear: () => { current.current = []; setIds([]); } };
}
export function CompareChoice({ name, selected, full, onClick, disabled = false }: { name: string; selected: boolean; full: boolean; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="secondary-button" aria-label={`Compare ${name}`} aria-pressed={selected} disabled={disabled || full && !selected} onClick={onClick}>{selected ? 'Shortlisted ✓' : 'Shortlist'}</button>;
}
export function Comparison({ count, kind, onOpen, onClear, children }: { count: number; kind: string; onOpen: () => Promise<void>; onClear: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false), opener = useRef<HTMLButtonElement>(null), toolbar = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <div ref={toolbar} tabIndex={-1} className="comparison-toolbar">
    <p className="storage-note" aria-live="polite">{count} of 4 {kind} shortlisted. Choose 2–4 to compare. Selection stays while filtering and resets when leaving this page.</p>
    <button ref={opener} type="button" className="secondary-button" disabled={count < 2 || busy} onClick={async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setError('');
      try { await onOpen(); setOpen(true); dialog.current?.showModal(); } catch (error) { setError((error as Error).message); }
      finally { lock.current = false; setBusy(false); }
    }}>Compare {kind}</button>
    <button type="button" className="secondary-button" disabled={!count || busy} onClick={onClear}>Clear shortlist</button>
    {error && <p role="alert" className="font-error">{error}</p>}
    <dialog ref={dialog} className="comparison-dialog" onClose={() => { setOpen(false); (opener.current?.disabled ? toolbar.current : opener.current)?.focus(); }} aria-label={`Compare ${kind}`}>
      <div className="library-heading"><h2>Compare {kind}</h2><button type="button" className="secondary-button" onClick={() => dialog.current?.close()}>Close comparison</button></div>
      {open && children}
    </dialog>
  </div>;
}
