import { pdfOriginal } from '@/lib/server/repository';
import { guard, response } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { guard(request); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try {
    const bytes = pdfOriginal((await context.params).id);
    return new Response(Uint8Array.from(bytes), { headers: {
      'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="original.pdf"',
      'Cache-Control': 'no-store', 'Content-Length': String(bytes.length), 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin',
    } });
  } catch (error) { return response({ error: error instanceof Error ? error.message : 'Original could not be read.' }, 404); }
}
