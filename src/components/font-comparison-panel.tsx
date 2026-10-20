'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function FontComparisonPanel({ open, count, onClose, onCompare, onClear, children }: {
  open: boolean;
  count: number;
  onClose: () => void;
  onCompare: () => Promise<void>;
  onClear: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);

  return <aside id="font-comparison-panel" hidden={!open} className="font-comparison-panel" aria-labelledby="font-comparison-heading"
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }}>
    <div className="library-heading">
      <h2 id="font-comparison-heading" ref={heading} tabIndex={-1}>Font comparison</h2>
      <button ref={closeButton} type="button" className="secondary-button" onClick={onClose}>Close comparison</button>
    </div>
    <p className="storage-note" aria-live="polite">{count} of 4 fonts shortlisted. Choose 2–4 to compare. Selection stays while filtering and resets when leaving this page.</p>
    <div className="backup-actions">
      <button type="button" className="secondary-button" disabled={count < 2 || busy} onClick={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try { await onCompare(); setComparing(true); }
        catch (error) { setError((error as Error).message); }
        finally { lock.current = false; setBusy(false); }
      }}>{busy ? 'Loading comparison…' : 'Compare fonts'}</button>
      <button type="button" className="secondary-button" disabled={!count || busy} onClick={() => {
        onClear(); setComparing(false); setError('');
        closeButton.current?.focus();
      }}>Clear shortlist</button>
    </div>
    {error && <p role="alert" className="font-error">{error}</p>}
    {comparing && count > 0 ? children : <p className="storage-note">Shortlist fonts in the library, then choose Compare fonts to see their specimens here.</p>}
  </aside>;
}
