import { LocalLibrary } from '@/components/local-library';
import { SiteHeader } from '@/components/site-header';
export default function LibraryPage() { return <><SiteHeader active="library" /><main className="shell"><LocalLibrary /></main></>; }
