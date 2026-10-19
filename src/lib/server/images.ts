import 'server-only';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { dataDirectory, digest, openLibrary, readAsset, storeAsset } from './database.mjs';
import { imageFields, IMAGE_LIMITS, type SavedImage } from '../image-model';

export async function importImage(input: Record<string, unknown>) {
  if (typeof input.bytes !== 'string' || input.bytes.length > Math.ceil(IMAGE_LIMITS.bytes / 3) * 4) throw new Error('Choose a PNG, JPEG or WebP up to 20 MiB.');
  const bytes = Buffer.from(input.bytes, 'base64');
  if (!bytes.length || bytes.length > IMAGE_LIMITS.bytes || bytes.toString('base64') !== input.bytes) throw new Error('Invalid image bytes.');
  // Reject active formats before invoking a decoder, regardless of filename/MIME.
  const signature = bytes.subarray(0, 12);
  if (!(signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || signature.subarray(0,3).equals(Buffer.from([255,216,255])) || (signature.subarray(0,4).toString() === 'RIFF' && signature.subarray(8,12).toString() === 'WEBP'))) throw new Error('Only PNG, JPEG and WebP image contents are supported.');
  // libvips decodes APNG's first frame without reporting pages. Inspect the
  // bounded PNG chunk stream so unvalidated animation frames are never served.
  if (signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    let offset = 8, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (length > bytes.length - offset - 12) throw new Error('Damaged PNG chunk.');
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw new Error('Animated PNG images are not supported. Choose a still image.');
      offset += length + 12;
      if (type === 'IEND') { ended = length === 0 && offset === bytes.length; break; }
    }
    if (!ended) throw new Error('Damaged PNG structure.');
  }
  const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: IMAGE_LIMITS.pixels });
  let metadata;
  try {
    metadata = await decoder.metadata();
    if (!['png','jpeg','webp'].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width > IMAGE_LIMITS.dimension || metadata.height > IMAGE_LIMITS.dimension || metadata.width * metadata.height > IMAGE_LIMITS.pixels || (metadata.pages ?? 1) !== 1) throw new Error('dimensions');
    // Full decode catches truncated/corrupt payloads; never replace the original bytes.
    await decoder.timeout({ seconds: 15 }).raw().toBuffer();
  } catch { throw new Error('Image is damaged, animated, or exceeds 12,000 pixels per side / 24 megapixels. Choose a still PNG, JPEG or WebP.'); }
  const filename = typeof input.filename === 'string' ? input.filename.slice(0, 255) : 'Image';
  const now = Date.now();
  const record: SavedImage = { ...imageFields({ title: filename.slice(0, IMAGE_LIMITS.title) || 'Image', source: '', description: '' }), id: digest(bytes), revision: randomUUID(), filename, byteSize: bytes.length, width: metadata.width!, height: metadata.height!, format: metadata.format as SavedImage['format'], createdAt: now, updatedAt: now };
  const directory = dataDirectory(), db = openLibrary(directory);
  try {
    db.exec('BEGIN IMMEDIATE');
    const existing = db.prepare("SELECT data FROM records WHERE kind='images' AND id=?").get(record.id);
    if (existing) { db.exec('COMMIT'); return { added: false, image: JSON.parse(String(existing.data)) as SavedImage }; }
    storeAsset(directory, record.id, bytes);
    db.prepare("INSERT INTO records VALUES('images',?,?,?)").run(record.id, JSON.stringify(record), record.id);
    db.exec('COMMIT'); return { added: true, image: record };
  } finally { db.close(); }
}
export function changeImage(input: Record<string, unknown>) {
  if (typeof input.id !== 'string' || !/^[a-f0-9]{64}$/.test(input.id)) throw new Error('Invalid image identity.');
  const db = openLibrary();
  try {
    db.exec('BEGIN IMMEDIATE');
    const row = db.prepare("SELECT data FROM records WHERE kind='images' AND id=?").get(input.id);
    if (!row) throw new Error('This image was deleted. Reload the gallery.');
    const current = JSON.parse(String(row.data)) as SavedImage;
    if (input.expectedRevision !== current.revision) throw new Error('This image changed in another tab. Copy your edits and reload before retrying.');
    if (input.action === 'delete') {
      db.prepare("DELETE FROM records WHERE kind='images' AND id=?").run(input.id);
      db.exec('COMMIT'); return true;
    }
    if (input.action !== 'update') throw new Error('Unknown image operation.');
    const image = { ...current, ...imageFields(input.fields), updatedAt: Math.max(Date.now(), current.createdAt), revision: randomUUID() };
    db.prepare("UPDATE records SET data=? WHERE kind='images' AND id=?").run(JSON.stringify(image), image.id);
    db.exec('COMMIT'); return image;
  } finally { db.close(); }
}
export function originalImage(id: string) {
  const directory = dataDirectory(), db = openLibrary(directory);
  try {
    const row = db.prepare("SELECT data,asset FROM records WHERE kind='images' AND id=?").get(id);
    if (!row?.asset) throw new Error('This image is no longer in the library.');
    const record = JSON.parse(String(row.data)) as SavedImage, bytes = readAsset(directory, String(row.asset));
    if (bytes.length !== record.byteSize || !['png','jpeg','webp'].includes(record.format)) throw new Error('Image metadata is damaged. Restore a verified backup.');
    return { bytes, format: record.format };
  } finally { db.close(); }
}
