import { normalizeTags } from './tag-model.mjs';
export const NOTE_LIMITS = { title: 200, body: 50000, tags: 1000, source: 2048 };
export type NoteFields = { title: string; body: string; tags: string; source: string };
export type SavedNote = {
  id: string; title: string; body: string; tags: string[]; source: string;
  createdAt: number; updatedAt: number; revision: string;
};
export const EMPTY_NOTE: NoteFields = { title: "", body: "", tags: "", source: "" };
export function noteFields(note: SavedNote): NoteFields {
  return { title: note.title, body: note.body, tags: note.tags.join(","), source: note.source };
}
export function validFields(value: unknown): value is NoteFields {
  if (!value || typeof value !== "object") return false;
  return Object.entries(NOTE_LIMITS).every(([key, limit]) => {
    const field = (value as Record<string, unknown>)[key];
    return typeof field === "string" && field.length <= limit;
  });
}
export function validateSource(source: string): boolean {
  if (!source) return true;
  try { return ["http:", "https:"].includes(new URL(source).protocol); } catch { return false; }
}
export function validateNote(value: unknown): SavedNote {
  const note = value as SavedNote;
  if (!note || typeof note !== "object" || typeof note.id !== "string" || !note.id ||
      typeof note.revision !== "string" || !note.revision || !Array.isArray(note.tags) ||
      !note.tags.every(tag => typeof tag === "string" && tag.trim()) ||
      !validFields({ ...note, tags: note.tags.join(",") }) || !note.title.trim() || !note.body.trim() ||
      !validateSource(note.source) || !Number.isFinite(note.createdAt) || note.createdAt < 0 ||
      !Number.isFinite(note.updatedAt) || note.updatedAt < note.createdAt) {
    throw new Error("Unreadable note record. Its stored data has been kept.");
  }
  return note;
}
export function makeNote(fields: NoteFields, id: string, original: SavedNote | null, sourceTags = original?.tags): SavedNote {
  if (!validFields(fields)) throw new Error("A note field exceeds its allowed length.");
  // Preserve literal comma labels (and historical spelling) on body-only edits.
  const tags = sourceTags && fields.tags === sourceTags.join(",")
    ? [...sourceTags]
    : normalizeTags(fields.tags.split(",").map(tag => tag.trim()).filter(Boolean));
  return validateNote({ id, title: fields.title.trim(), body: fields.body.trim(), tags,
    source: fields.source.trim(), createdAt: original?.createdAt ?? Date.now(),
    updatedAt: Math.max(Date.now(), original?.createdAt ?? 0), revision: crypto.randomUUID() });
}
export class NoteConflictError extends Error {
  constructor() { super("This note changed in another tab. Your edits are still here. Save them as a new note, or cancel and reload to read the latest version."); }
}
