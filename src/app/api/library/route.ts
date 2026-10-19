import { readCollections, changeCollection } from '@/lib/server/collections';
import { readTagLibrary, changeTags } from '@/lib/server/tags';
import { asset, pdfRecord, kindOf, list, mutate } from '@/lib/server/repository';
import { guard, readBody, response } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { guard(request); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try {
    const params = new URL(request.url).searchParams;
    if (params.get('kind') === 'collections') return response(readCollections());
    if (params.get('kind') === 'tags') return response(readTagLibrary());
    if (params.get('kind') === 'pdf') return response(pdfRecord(params.get('id') || ''));
    return response(params.get('kind') === 'asset' ? asset(params.get('id') || '') : list(kindOf(params.get('kind'))));
  } catch (error) { return response({ error: error instanceof Error ? error.message : 'Local library could not be read.' }, 400); }
}
export async function POST(request: Request) {
  try { guard(request, true); } catch (error) { return response({ error: (error as Error).message }, 403); }
  try {
    const kind = new URL(request.url).searchParams.get('kind'), body = await readBody(request);
    return response(kind === 'collections' ? changeCollection(body) : kind === 'tags' ? changeTags(body) : await mutate(kindOf(kind), body));
  }
  catch (error) { return response({ error: error instanceof Error ? error.message : 'Local library could not be saved.' }, 400); }
}
