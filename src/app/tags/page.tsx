import { SiteHeader } from '@/components/site-header';
import { TagLibrary } from '@/components/tag-library';
export const metadata = { title: 'Shared tags | wayoffmars' };
export default function Tags() {
  return <><SiteHeader active="tags" /><main className="shell main-content"><div className="page-intro"><h1>Shared tags</h1><p>Find related notes, images, and PDFs.</p></div><TagLibrary /></main></>;
}
