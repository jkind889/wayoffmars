import { PdfViewer } from '@/components/pdf-viewer';
import { SiteHeader } from '@/components/site-header';
export const metadata = { title: 'PDF page | wayoffmars' };
export default async function PdfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = typeof query.page === 'string' && /^[1-9][0-9]*$/.test(query.page) ? Number(query.page) : query.page === undefined ? 1 : 0;
  return <><SiteHeader /><main className="shell"><PdfViewer key={`${id}:${page}`} id={id} initialPage={page} /></main></>;
}
