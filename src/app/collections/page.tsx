import { SiteHeader } from '@/components/site-header';
import { Collections } from '@/components/collections';
export const metadata = { title: 'Project collections | wayoffmars' };
export default function Page() { return <><SiteHeader active="collections" /><main className="shell main-content"><div className="page-intro"><h1>Project collections</h1><p>Bring references together in a useful order.</p></div><Collections /></main></>; }
