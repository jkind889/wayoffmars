import 'server-only';
import sharp from 'sharp';
import { dataDirectory } from './database.mjs';
import { originalImage } from './images';
import { IMAGE_LIMITS } from '../image-model';

// Derived previews are disposable: no schema, asset writes, or backup changes.
// Each request still verifies the current source, even on a thumbnail cache hit.
const MAX_CACHE_BYTES = 16 * 1024 * 1024, MAX_CACHE_ENTRIES = 64;
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let cacheBytes = 0, active = 0;
const waiting: (() => void)[] = [];

async function withDecoder<T>(work: () => Promise<T>): Promise<T> {
  // Acquire before reading the original, bounding retained full-size buffers too.
  if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try { return await work(); }
  finally {
    const next = waiting.shift();
    if (next) next(); else active--;
  }
}
function remember(key: string, bytes: Buffer) {
  if (bytes.length > MAX_CACHE_BYTES) return;
  while (cache.size && (cache.size >= MAX_CACHE_ENTRIES || cacheBytes + bytes.length > MAX_CACHE_BYTES)) {
    const oldest = cache.keys().next().value!;
    cacheBytes -= cache.get(oldest)!.length;
    cache.delete(oldest);
  }
  cache.set(key, bytes); cacheBytes += bytes.length;
}

export function imageThumbnail(id: string): Promise<Buffer> {
  const key = `${dataDirectory()}:${id}`;
  const underway = pending.get(key);
  if (underway) return underway;
  const result = withDecoder(async () => {
    const { bytes } = originalImage(id);
    const saved = cache.get(key);
    if (saved) { cache.delete(key); cache.set(key, saved); return saved; }
    const thumbnail = await sharp(bytes, { failOn: 'warning', limitInputPixels: IMAGE_LIMITS.pixels })
      .autoOrient().resize({ width: 640, height: 440, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 1 }).timeout({ seconds: 15 }).toBuffer();
    remember(key, thumbnail);
    return thumbnail;
  }).finally(() => { pending.delete(key); });
  pending.set(key, result);
  return result;
}
