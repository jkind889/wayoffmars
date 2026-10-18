'use client';
import { useRef, useState } from 'react';
import { readLegacy, importLegacyRecord, type LegacyKind } from '@/lib/legacy-import';
export function LocalLibrary() {
  const [busy, setBusy] = useState(false), [report, setReport] = useState<string[]>([]);
  const stop = useRef(false);
  async function run() {
    if (busy) return;
    setBusy(true); stop.current = false; setReport([]);
    const results: string[] = [];
    try {
      for (const kind of ['notes', 'pdfs', 'fonts'] as LegacyKind[]) {
        if (stop.current) break;
        let records: unknown[];
        try { records = await readLegacy(kind); }
        catch (error) { results.push(`${kind}: ${String(error)}`); continue; }
        results.push(`${kind}: ${records.length} browser records found.`);
        for (const [index, record] of records.entries()) {
          if (stop.current) break;
          const label = (record as { title?: string; filename?: string; name?: string })?.title || (record as { filename?: string })?.filename || (record as { name?: string })?.name || `record ${index + 1}`;
          try { results.push(`${kind} — ${label}: ${await importLegacyRecord(kind, record)}`); }
          catch (error) { results.push(`${kind} — ${label}: failed; ${String(error)}`); }
          setReport([...results]);
        }
      }
      results.push(stop.current ? 'Stopped after the current record. Retry safely to continue.' : 'Import finished. Conflicts were skipped; neither copy was changed. Browser data was kept.');
      setReport(results);
    } finally { setBusy(false); }
  }
  return <section className="note-library" aria-label="Local library storage">
    <h1>Local library</h1>
    <p>Notes, searchable PDF text and fonts now live on this Mac in SQLite and a local asset folder. Nothing is sent to an external service.</p>
    <h2>Import your browser library</h2>
    <p>Use the same browser profile and address where you saved your library. This copies records and font bytes only when you choose Import. Existing text-only PDFs remain searchable. Your IndexedDB data is never deleted or edited.</p>
    <p>Each record is validated and verified after writing. You can stop and repeat the import. Already imported records are skipped, even if you later edited or deleted them here. Conflicting records are skipped: keep the SQLite version, or copy the browser note manually as a new note. No automatic overwrite.</p>
    <button className="primary-button" disabled={busy} onClick={() => void run()}>Import browser library</button>
    {busy && <button className="secondary-button" onClick={() => { stop.current = true; }}>Stop after current record</button>}
    <p aria-live="polite">{busy ? 'Importing… Keep this page open.' : ''}</p>
    {report.length > 0 && <div aria-label="Import report"><ul>{report.map((line, index) => <li key={index}>{line}</li>)}</ul><p>Reload Fonts or Notes to see the local library.</p></div>}
    <h2>Backup and restore</h2>
    <p>Run <code>npm run backup -- /absolute/path/to/new-backup</code> in the app folder. This creates a consistent SQLite snapshot and verifies every referenced asset. For restore, stop the app and run <code>npm run restore -- /absolute/path/to/backup /absolute/path/to/new-library</code>, then start with <code>WAYOFFMARS_DATA_DIR</code> set to that new library. See README for full steps.</p>
  </section>;
}
