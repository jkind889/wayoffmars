"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { loadFontBytes, readFont } from "@/lib/font-loader";
import { fontIdentity, readSavedFonts, removeSavedFont, saveFont, storageError, validateSavedFont, type SavedFont } from "@/lib/font-storage";
import { createBackup, readBackup, readBackupFont } from "@/lib/font-backup";
import { localRequest } from "@/lib/local-client";
import { Comparison, CompareChoice, useShortlist } from "./comparison";
import { InstalledFonts } from "./installed-fonts";
import { DEFAULT_FONT_APPEARANCE, FontPreviewControls, specimenAppearance } from "./font-preview-controls";

type PreviewFont = { id: string; name: string } & (
  | { status: "loading" }
  | { status: "ready"; family: string; saved: boolean }
  | { status: "error"; message: string }
);
type FontSource = { name: string; read: () => Promise<SavedFont> };
const SAMPLE_TEXT = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const message = (error: unknown) => error instanceof Error ? error.message : "This font could not be loaded.";

export function FontLibrary() {
  const inputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fonts, setFonts] = useState<PreviewFont[]>([]);
  const [isRestoring, setIsRestoring] = useState(true);
  const [storageMessage, setStorageMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [previewText, setPreviewText] = useState(SAMPLE_TEXT);
  const [previewSize, setPreviewSize] = useState(32);
  const [appearance, setAppearance] = useState(DEFAULT_FONT_APPEARANCE);
  const previewStyle = { ...specimenAppearance(appearance), fontSize: `${previewSize}px` };
  const [removed, setRemoved] = useState<SavedFont | null>(null);
  const working = useRef(false);
  const records = useRef(new Map<string, SavedFont>());
  const loadedFaces = useRef(new Map<string, FontFace>());
  const generation = useRef(0);
  const shortlist = useShortlist();
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [installedComparisons, setInstalledComparisons] = useState<{ id: string; name: string; family: string }[]>([]);
  const compareFaces = useRef(new Map<string, FontFace>());
  const comparisonLock = useRef(false);
  useEffect(() => { const faces = compareFaces.current; return () => { for (const face of faces.values()) document.fonts.delete(face); }; }, []);
  useEffect(() => { for (const [id, face] of compareFaces.current) { if (!shortlist.ids.includes(id)) { document.fonts.delete(face); compareFaces.current.delete(id); } } }, [shortlist.ids]);
  async function shortlistInstalled(record: SavedFont, name: string) {
    if (comparisonLock.current || shortlist.ids.length >= 4) return;
    comparisonLock.current = true;
    const currentGeneration = generation.current;
    try {
      const id = `installed:${record.id}`, family = `compare-${record.id}`;
      if (!compareFaces.current.has(id)) {
        const face = await loadFontBytes(record.bytes, family);
        if (generation.current !== currentGeneration) return;
        if (!shortlist.toggle(id)) return;
        document.fonts.add(face); compareFaces.current.set(id, face);
      }
      setInstalledComparisons(previous => [...previous.filter(item => item.id !== id && shortlist.ids.includes(item.id)), { id, name, family }]);
    } finally { comparisonLock.current = false; }
  }
  const disabled = isRestoring || isWorking;

  useEffect(() => {
    const faces = loadedFaces.current;
    const savedRecords = records.current;
    const currentGeneration = generation.current;
    async function restore() {
      try {
        const saved = await readSavedFonts();
        for (const value of saved) {
          if (generation.current !== currentGeneration) return;
          const id = value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : crypto.randomUUID();
          const name = value && typeof value === "object" && "name" in value && typeof value.name === "string" ? value.name : "Unreadable saved font";
          try {
            const font = await validateSavedFont(value);
            const family = `wayoffmars-${font.id}`;
            const face = await loadFontBytes(font.bytes, family);
            if (generation.current !== currentGeneration) return;
            document.fonts.add(face);
            faces.set(font.id, face);
            savedRecords.set(font.id, font);
            setFonts((previous) => [...previous, { id: font.id, name: font.name, status: "ready", family, saved: true }]);
          } catch (error) {
            if (generation.current !== currentGeneration) return;
            setFonts((previous) => [...previous, { id, name, status: "error", message: `${message(error)} Stored data has been kept. Reimport the original file to repair it.` }]);
          }
        }
      } catch (error) {
        if (generation.current === currentGeneration) setStorageMessage(`Saved fonts could not be read. ${storageError(error)} You can still preview new files. Reload to retry reading.`);
      } finally {
        if (generation.current === currentGeneration) setIsRestoring(false);
      }
    }
    void restore();
    return () => {
      generation.current += 1;
      for (const face of faces.values()) document.fonts.delete(face);
      faces.clear();
      savedRecords.clear();
    };
  }, []);

  const readyCount = fonts.filter((font) => font.status === "ready").length;
  const loadingCount = fonts.filter((font) => font.status === "loading").length;
  const errorCount = fonts.filter((font) => font.status === "error").length;

  function beginWork() {
    if (isRestoring || working.current) return false;
    working.current = true;
    setIsWorking(true);
    return true;
  }
  function endWork() { working.current = false; setIsWorking(false); }

  // The caller holds the work lock. Decode sequentially to bound batch memory.
  async function importSources(sources: FontSource[]) {
    const currentGeneration = generation.current;
    let duplicates = 0, successes = 0;
    const entries = sources.map((source) => ({ ...source, id: `pending-${crypto.randomUUID()}` }));
    setFonts((previous) => [...previous, ...entries.map(({ id, name }): PreviewFont => ({ id, name, status: "loading" }))]);
    for (const { name, read, id } of entries) {
      if (generation.current !== currentGeneration) return;
      let result: PreviewFont;
      try {
        const record = await read();
        if (generation.current !== currentGeneration) return;
        if (records.current.has(record.id)) {
          duplicates++;
          setFonts((previous) => previous.filter((font) => font.id !== id));
          continue;
        }
        const family = `wayoffmars-${record.id}`;
        const face = await loadFontBytes(record.bytes, family);
        if (generation.current !== currentGeneration) return;
        let saved = false;
        try { await saveFont(record); saved = true; }
        catch (error) {
          if (generation.current !== currentGeneration) return;
          setStorageMessage(`A font could not be saved. ${storageError(error)} Keep its original file or export a backup before closing this page.`);
        }
        if (generation.current !== currentGeneration) return;
        document.fonts.add(face);
        loadedFaces.current.set(record.id, face);
        records.current.set(record.id, record);
        result = { id: record.id, name: record.name, status: "ready", family, saved };
        successes++;
      } catch (error) {
        if (generation.current !== currentGeneration) return;
        result = { id, name, status: "error", message: message(error) };
      }
      setFonts((previous) => previous.filter((font) => font.id === id || font.id !== result.id).map((font) => font.id === id ? result : font));
    }
    setImportMessage(`${successes} ${successes === 1 ? "file" : "files"} loaded.${duplicates ? ` ${duplicates} duplicate ${duplicates === 1 ? "file" : "files"} skipped (same contents).` : ""}`);
  }

  async function selectFiles(files: File[]) {
    if (!beginWork()) { setImportMessage("Please wait for the current operation, then drop or choose files again."); return; }
    setImportMessage("");
    try {
      await importSources(files.map((file) => ({ name: file.name, read: async () => {
        const bytes = await readFont(file);
        return { id: await fontIdentity(bytes), name: file.name, bytes, size: bytes.byteLength, addedAt: Date.now() };
      } })));
    } finally { endWork(); }
  }

  async function retrySave(id: string) {
    const record = records.current.get(id);
    if (!record || !beginWork()) return;
    try {
      await saveFont(record);
      setFonts((previous) => previous.map((font) => font.id === id && font.status === "ready" ? { ...font, saved: true } : font));
      setStorageMessage("");
    } catch (error) { setStorageMessage(storageError(error)); }
    finally { endWork(); }
  }

  async function saveInstalledFont(input: SavedFont) {
    if (!beginWork()) throw new Error("Wait for the current library operation, then retry.");
    const currentGeneration = generation.current;
    try {
      // Preserve the existing filename/date for a matching library asset.
      const record = await validateSavedFont(records.current.get(input.id) ?? input);
      const family = `wayoffmars-${record.id}`;
      const face = loadedFaces.current.get(record.id) ?? await loadFontBytes(record.bytes, family);
      await saveFont(record);
      if (generation.current !== currentGeneration) return;
      document.fonts.add(face);
      loadedFaces.current.set(record.id, face);
      records.current.set(record.id, record);
      setFonts(previous => [...previous.filter(font => font.id !== record.id), { id: record.id, name: record.name, status: "ready", family, saved: true }]);
      setStorageMessage("");
    } finally { if (generation.current === currentGeneration) endWork(); }
  }

  async function removeFont(font: PreviewFont) {
    if (font.status !== "ready" || !beginWork()) return;
    try {
      // Keep the row and FontFace if the deletion does not commit.
      if (font.saved) await removeSavedFont(font.id);
      const record = records.current.get(font.id);
      const face = loadedFaces.current.get(font.id);
      if (face) document.fonts.delete(face);
      loadedFaces.current.delete(font.id);
      records.current.delete(font.id);
      setFonts((previous) => previous.filter((entry) => entry.id !== font.id));
      setRemoved(record ?? null);
      setImportMessage(`${font.name} removed. Undo is available until you remove another font or reload.`);
    } catch (error) { setStorageMessage(`Font could not be removed. ${storageError(error)}`); }
    finally { endWork(); }
  }

  async function undoRemoval() {
    if (!removed || !beginWork()) return;
    try {
      await importSources([{ name: removed.name, read: async () => removed }]);
      if (records.current.has(removed.id)) setRemoved(null);
    } finally { endWork(); }
  }

  async function exportBackup() {
    if (!beginWork()) return;
    try {
      const collection = new Map(records.current);
      let skipped = 0;
      let partialWarning = "";
      try {
        for (const value of await readSavedFonts()) {
          try {
            const record = await validateSavedFont(value);
            if (!collection.has(record.id)) {
              await loadFontBytes(record.bytes, `backup-${record.id}`);
              collection.set(record.id, record);
            }
          } catch { skipped++; }
        }
      } catch (error) {
        if (!collection.size) throw new Error(`Backup could not read saved storage. ${storageError(error)} Retry after restoring storage access.`);
        partialWarning = ` Only currently loaded fonts were exported because saved storage could not be read. ${storageError(error)}`;
      }
      const blob = createBackup(Array.from(collection.values()));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `wayoffmars-fonts-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setImportMessage(`Backup exported with ${collection.size} fonts.${skipped ? ` ${skipped} unreadable saved records were not exported; their stored data has been kept.` : ""}${partialWarning}`);
    } catch (error) { setStorageMessage(message(error)); }
    finally { endWork(); }
  }

  async function restoreBackup(file: File) {
    if (!beginWork()) return;
    setImportMessage("");
    try {
      const entries = await readBackup(file);
      await importSources(entries.map((value, index) => ({
        name: value && typeof value === "object" && "name" in value && typeof value.name === "string" ? value.name : `Backup entry ${index + 1}`,
        read: () => readBackupFont(value),
      })));
    } catch (error) { setStorageMessage(message(error)); }
    finally { endWork(); }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    setIsDragging(!disabled);
  }
  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setIsDragging(false);
  }

  return (
    <>
      <section aria-label="Select font files" className={`drop-zone${isDragging ? " is-dragging" : ""}`}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(event) => {
          event.preventDefault(); setIsDragging(false);
          if (event.dataTransfer.files.length) void selectFiles(Array.from(event.dataTransfer.files));
        }}>
        <h2>Drop font files here</h2>
        <p className="file-formats">TTF, OTF, WOFF and WOFF2</p>
        <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,.woff2" multiple disabled={disabled} hidden aria-label="Choose font files"
          onChange={(event) => {
            if (event.currentTarget.files?.length) void selectFiles(Array.from(event.currentTarget.files));
            event.currentTarget.value = "";
          }} />
        <button type="button" className="primary-button" disabled={disabled} aria-describedby="selection-note" onClick={() => inputRef.current?.click()}>Choose font files</button>
      </section>

      <div className="selection-feedback" role="status" aria-atomic="true">
        <p id="selection-note" className="selection-note">
          {isRestoring ? "Loading saved fonts…" : fonts.length > 0
            ? `${readyCount} ${readyCount === 1 ? "font" : "fonts"} ready to preview.${loadingCount ? ` ${loadingCount} loading.` : ""}${errorCount ? ` ${errorCount} could not be loaded.` : ""} Saved fonts stay on this Mac.`
            : "Fonts are saved on this Mac. Nothing leaves this Mac."}
          {storageMessage ? ` ${storageMessage}` : ""}{importMessage ? ` ${importMessage}` : ""}
        </p>
      </div>

      <section className="library font-library" aria-labelledby="library-heading">
        <div className="library-heading">
          <h2 id="library-heading">Library</h2>
          <span className="library-count">{readyCount} {readyCount === 1 ? "font" : "fonts"}</span>
        </div>
        <div className="library-tools">
          <label className="preview-text">Preview text
            <textarea value={previewText} maxLength={5000} rows={3} onChange={(event) => setPreviewText(event.target.value)} />
          </label>
          <label className="preview-size">Preview size: {previewSize}px
            <input type="range" min="12" max="96" value={previewSize} onChange={(event) => setPreviewSize(Number(event.target.value))} />
          </label>
          <FontPreviewControls value={appearance} onChange={setAppearance} />
          <div className="backup-actions">
            <button type="button" className="secondary-button" disabled={disabled} onClick={() => void exportBackup()}>Export backup</button>
            <button type="button" className="secondary-button" disabled={disabled} onClick={() => backupInputRef.current?.click()}>Import backup</button>
            {removed ? <button type="button" className="secondary-button" disabled={disabled} onClick={() => void undoRemoval()}>Undo removal</button> : null}
          </div>
          <input ref={backupInputRef} type="file" accept=".json,application/json" hidden disabled={disabled} aria-label="Choose backup file" onChange={(event) => {
            const file = event.currentTarget.files?.[0]; if (file) void restoreBackup(file); event.currentTarget.value = "";
          }} />
          <p className="storage-note">Saved on this Mac. Use Local library to import older browser data and back up the complete library.</p>
        </div>
        <Comparison kind="fonts" count={shortlist.ids.length} onClear={shortlist.clear} onOpen={async () => {
          const saved = await localRequest<{ id: string }[]>('fonts');
          setMissing(fonts.filter(font => font.status === 'ready' && font.saved && !saved.some(item => item.id === font.id)).map(font => font.id));
        }}>
          <label>Comparison text<textarea maxLength={5000} value={previewText} onChange={event => setPreviewText(event.target.value)} /></label>
          <label>Comparison size: {previewSize}px<input type="range" min="12" max="96" value={previewSize} onChange={event => setPreviewSize(Number(event.target.value))} /></label>
          <FontPreviewControls value={appearance} onChange={setAppearance} />
          <div className="comparison-grid">{shortlist.ids.map(id => {
            const installed = installedComparisons.find(item => item.id === id);
            const saved = fonts.find(item => item.id === id);
            const font = installed ?? (saved?.status === 'ready' && !missing.includes(id) ? saved : null);
            return <article key={id} className="comparison-card"><h3>{font?.name ?? 'Font no longer available'}</h3><p className="storage-note">{installed ? 'Installed font · temporary comparison' : saved?.status === 'ready' && saved.saved ? 'Saved on this Mac' : 'Preview only'}</p>{font ? <p className="font-sample" style={{ ...previewStyle, fontFamily: `"${font.family}"` }}>{previewText || ' '}</p> : <p>This font was removed or could not be loaded.</p>}<button type="button" className="secondary-button" onClick={() => shortlist.toggle(id)}>Remove from comparison</button></article>;
          })}</div>
        </Comparison>
        <label>Filter saved fonts<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="font-specimens">
        <InstalledFonts disabled={disabled} text={previewText} style={previewStyle} onSave={saveInstalledFont} onCompare={shortlistInstalled} comparisonFull={shortlist.ids.length >= 4} comparisonIds={shortlist.ids} />
        {fonts.length === 0 ? (
          <div className="empty-state"><h3>Your collection starts here.</h3><p>Choose a font file to get started.</p></div>
        ) : (
          <ul className="font-list" aria-label="Selected fonts">
            {fonts.filter(font => font.name.toLowerCase().includes(query.trim().toLowerCase())).map((font) => (
              <li key={font.id} className="font-row" aria-busy={font.status === "loading"}>
                <div className="font-row-heading">
                  <h3>{font.name}</h3>
                  {font.status === "ready" ? <button type="button" className="secondary-button" disabled={disabled} aria-label={`Remove ${font.name}`} onClick={() => void removeFont(font)}>Remove</button> : null}
                  {font.status === "error" ? <button type="button" className="secondary-button" disabled={disabled} aria-label={`Dismiss error for ${font.name}`} onClick={() => setFonts((previous) => previous.filter((entry) => entry.id !== font.id))}>Dismiss error</button> : null}
                </div>
                {font.status === "ready" ? (
                  <>
                    <CompareChoice name={font.name} selected={shortlist.ids.includes(font.id)} full={shortlist.ids.length >= 4} onClick={() => shortlist.toggle(font.id)} />
                    <p className="font-save-status">{font.saved ? "Saved on this Mac" : "Preview only — not saved"}</p>
                    {!font.saved ? <button type="button" className="secondary-button" disabled={disabled} onClick={() => void retrySave(font.id)}>Retry saving</button> : null}
                    <p className="font-sample" style={{ ...previewStyle, fontFamily: `"${font.family}"` }}>{previewText || " "}</p>
                  </>
                ) : (
                  <p className={font.status === "error" ? "font-error" : "font-loading"}>{font.status === "error" ? font.message : "Loading font…"}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>
    </>
  );
}
