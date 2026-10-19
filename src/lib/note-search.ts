import type { SavedNote } from "./note-storage";

type Range = { start: number; end: number };
export type TextPart = { text: string; match: boolean };
export type NoteResult = { note: SavedNote; score: number; snippets: string[] };
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function searchTerms(query: string): string[] {
  return [...new Map(query.trim().split(/\s+/u).filter(Boolean).map(term => [term.toLowerCase(), term])).values()];
}
function literal(term: string, global = false) { return new RegExp(escapePattern(term), global ? "giu" : "iu"); }

/** Preserve original text and offsets, including Unicode, without injecting HTML. */
function matchRanges(text: string, terms: string[]): Range[] {
  const ranges = terms.flatMap(term => Array.from(text.matchAll(literal(term, true)), match => ({ start: match.index, end: match.index + match[0].length })));
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Range[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
export function highlightText(text: string, terms: string[]): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const range of matchRanges(text, terms)) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), match: false });
    parts.push({ text: text.slice(range.start, range.end), match: true });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

/** Up to three contexts, chosen around the first occurrence of each matched keyword. */
export function matchingSnippets(body: string, terms: string[]): string[] {
  const text = body.replace(/\s+/gu, " ").trim();
  const matches = terms.flatMap(term => {
    const match = literal(term).exec(text);
    return match ? [{ start: match.index, end: match.index + match[0].length }] : [];
  }).sort((a, b) => a.start - b.start);
  const windows: Range[] = [];
  for (const match of matches.length ? matches : [{ start: 0, end: 0 }]) {
    const start = Math.max(0, match.start - 55);
    const end = Math.min(text.length, Math.max(start + 180, match.end + 40));
    const previous = windows.at(-1);
    if (previous && start <= previous.end && match.end + 40 - previous.start <= 320) {
      // Only extend a context when needed to include the next keyword itself.
      if (match.end > previous.end) previous.end = Math.min(text.length, match.end + 40);
    } else if (windows.length < 3) windows.push({ start, end });
  }
  return windows.map(({ start, end }) => {
    // Avoid splitting a UTF-16 surrogate pair at a context boundary.
    if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) start--;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end++;
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  });
}

/** Every literal keyword must occur in title, body or a tag. Source URLs are excluded. */
export function searchNotes(notes: SavedNote[], query: string): NoteResult[] {
  const terms = searchTerms(query);
  const patterns = terms.map(term => literal(term));
  const phrase = query.trim().replace(/\s+/gu, " ");
  const exactTitle = phrase ? new RegExp(`^${escapePattern(phrase)}$`, "iu") : null;
  const results: NoteResult[] = [];
  for (const note of notes) {
    const searchableText = [note.body, ...(note.excerpts ?? []).flatMap(excerpt => [excerpt.quotation, excerpt.observation, excerpt.filename])].join('\n');
    let score = 0;
    let matches = true;
    for (const pattern of patterns) {
      const title = pattern.test(note.title);
      const tag = note.tags.some(value => pattern.test(value));
      const body = pattern.test(searchableText);
      if (!title && !tag && !body) { matches = false; break; }
      score += title ? 10 : tag ? 5 : 1;
    }
    if (matches) results.push({ note, score: score + (exactTitle?.test(note.title) ? 100 : 0), snippets: terms.length ? matchingSnippets(searchableText, terms) : [] });
  }
  return results.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt || (a.note.id < b.note.id ? -1 : a.note.id > b.note.id ? 1 : 0));
}
