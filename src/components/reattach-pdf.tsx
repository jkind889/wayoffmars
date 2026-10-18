'use client';
import { useEffect, useRef, useState } from 'react';
import type { SavedPdf } from '@/lib/pdf-model';
import { extractPdf } from '@/lib/pdf-extraction';
import { attachOriginal } from '@/lib/pdf-storage';

export function ReattachPdf({ pdf, onAttached }: { pdf: SavedPdf; onAttached: () => void }) {
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'saving'>('idle'), [status, setStatus] = useState(''), [error, setError] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (phase === 'idle') return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [phase]);
  async function attach(file: File) {
    if (controller.current) return;
    const operation = new AbortController(); controller.current = operation;
    setPhase('checking'); setError(''); setStatus('Checking original PDF…');
    let saving = false;
    try {
      const extracted = await extractPdf(file, operation.signal, (page, total) => setStatus(`Checking page ${page} of ${total}…`));
      operation.signal.throwIfAborted();
      if (extracted.id !== pdf.id || extracted.byteSize !== pdf.byteSize || extracted.pages.length !== pdf.pages.length) throw new Error('PDF checksum or page count mismatch. Choose the exact original file. Nothing was associated.');
      const bytes = await file.arrayBuffer(); operation.signal.throwIfAborted();
      saving = true; setPhase('saving'); setStatus('Saving original…');
      await attachOriginal(pdf, bytes); setStatus('Original attached and checksum verified.'); onAttached();
    } catch (error) {
      setStatus(operation.signal.aborted && !saving ? 'Reattachment canceled. Nothing was associated.' : '');
      if (!operation.signal.aborted || saving) setError(error instanceof Error ? error.message : 'Original could not be attached.');
    } finally { controller.current = null; setPhase('idle'); }
  }
  return <div className="pdf-reattach">
    <button type="button" className="secondary-button" disabled={phase !== 'idle'} onClick={() => input.current?.click()}>{pdf.hasOriginal ? 'Reselect original' : 'Attach original'}</button>
    <input className="visually-hidden" ref={input} type="file" accept=".pdf,application/pdf" aria-label={`Original PDF for ${pdf.filename}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attach(file); }} />
    {phase === 'checking' && <button className="secondary-button" onClick={() => controller.current?.abort()}>Cancel reattachment</button>}
    {status && <p role="status">{status}</p>}{error && <p role="alert" className="font-error">{error}</p>}
  </div>;
}
