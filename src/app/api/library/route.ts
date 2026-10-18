import { asset, pdfRecord, kindOf, list, mutate } from '@/lib/server/repository';
import { guard, readBody, response } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { guard(request); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try {
    const params = new URL(request.url).searchParams;
    if (params.get('kind') === 'pdf') return response(pdfRecord(params.get('id') || ''));
    return response(params.get('kind') === 'asset' ? asset(params.get('id') || '') : list(kindOf(params.get('kind'))));
  } catch (error) { return response({ error: error instanceof Error ? error.message : 'Local library could not be read.' }, 400); }
}
export async function POST(request: Request) {
  try { guard(request, true); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try { return response(await mutate(kindOf(new URL(request.url).searchParams.get('kind')), await readBody(request))); }
  catch (error) { return response({ error: error instanceof Error ? error.message : 'Local library could not be saved.' }, 400); }
}
