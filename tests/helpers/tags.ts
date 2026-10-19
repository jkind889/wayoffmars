import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const imageBytes = () => sharp({ create: { width: 80, height: 60, channels: 3, background: '#777777' } }).png().toBuffer();
import { makePdf, textPage } from './pdf';
import type { APIRequestContext } from '@playwright/test';
import type { TagLibrary, TaggedRecord } from '../../src/lib/tag-storage';
export const headers = { Origin: 'http://127.0.0.1:3107', 'X-Wayoffmars': '1', 'Content-Type': 'application/json' };
export const note = { id: 'tag-note', title: 'Color study', body: 'A quiet palette.', tags: [' Design ', 'DESIGN', 'Color'], source: '', createdAt: 1, updatedAt: 1, revision: 'note-v1' };
export const post = (request: APIRequestContext, kind: string, data: object) => request.post(`/api/library?kind=${kind}`, { headers, data });
export const library = async (request: APIRequestContext): Promise<TagLibrary> => (await request.get('/api/library?kind=tags')).json();
export async function seed(request: APIRequestContext) {
  expect((await post(request, 'notes', { action: 'import', record: note })).ok()).toBe(true);
  const image = (await (await post(request, 'images', { action: 'save', filename: 'Palette.png', bytes: (await imageBytes()).toString('base64') })).json()).image;
  const bytes = makePdf([textPage('Color and type')]);
  const pdf = { id: createHash('sha256').update(bytes).digest('hex'), filename: 'Design.pdf', byteSize: bytes.length, pages: [{ number: 1, text: 'Color and type' }], revision: 'pdf-v1', importedAt: 1 };
  expect((await post(request, 'pdfs', { action: 'save', pdf, original: bytes.toString('base64') })).ok()).toBe(true);
  return { image, pdf };
}
export const assign = (request: APIRequestContext, record: Pick<TaggedRecord, 'kind' | 'id' | 'revision'>, tags: unknown) => post(request, 'tags', { kind: record.kind, id: record.id, expectedRevision: record.revision, tags });
