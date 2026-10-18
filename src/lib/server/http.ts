import 'server-only';
export function guard(request: Request, mutation = false) {
  const host = request.headers.get('host') || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host)) throw new Error('Local access only: invalid Host.');
  const origin = request.headers.get('origin');
  if (origin && origin !== `${new URL(request.url).protocol}//${host}`) throw new Error('Local access only: invalid Origin.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('Cross-site access is not allowed.');
  if (mutation && (!origin || request.headers.get('x-wayoffmars') !== '1' || request.headers.get('content-type') !== 'application/json')) throw new Error('A same-origin app request is required.');
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 40 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Request exceeds the local import limit.');
  if (!request.body) throw new Error('Missing request body.');
  const reader = request.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Request exceeds the local import limit.'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid request body.');
  return data;
}
export const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' } });
