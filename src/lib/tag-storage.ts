import { localRequest } from './local-client';
export type Tag = { key: string; label: string };
export type TaggedRecord = { kind: 'notes' | 'images' | 'pdfs'; id: string; title: string; revision: string; addedAt: number; tags: Tag[] };
export type TagLibrary = { vocabulary: (Tag & { count: number })[]; records: TaggedRecord[] };
export const readTags = () => localRequest<TagLibrary>('tags');
export const saveTags = (record: TaggedRecord, tags: string[]) => localRequest<TaggedRecord>('tags', { kind: record.kind, id: record.id, expectedRevision: record.revision, tags });
export const recordUrl = (record: Pick<TaggedRecord, 'kind' | 'id'>) => record.kind === 'notes' ? `/notes#note-${encodeURIComponent(record.id)}` : record.kind === 'images' ? `/images?image=${encodeURIComponent(record.id)}` : `/pdf/${encodeURIComponent(record.id)}`;
