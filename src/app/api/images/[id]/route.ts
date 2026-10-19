import { originalImage } from '@/lib/server/images';
import { guard, response } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { guard(request); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try {
    const { bytes, format } = originalImage((await context.params).id);
    return new Response(Uint8Array.from(bytes), { headers: {
      'Content-Type': `image/${format}`, 'Cache-Control': 'no-store', 'Content-Length': String(bytes.length),
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    } });
  } catch (error) { return response({ error: (error as Error).message }, 404); }
}
