import { readImageLinks, changeImageLink } from '@/lib/server/image-links';
import { guard, readBody, response } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { guard(request); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try { return response(readImageLinks()); }
  catch (error) { return response({ error: (error as Error).message }, 400); }
}
export async function POST(request: Request) {
  try { guard(request, true); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try { return response(changeImageLink(await readBody(request))); }
  catch (error) { return response({ error: (error as Error).message }, 400); }
}
