import { SiteHeader } from '@/components/site-header';
import { ImageLibrary } from '@/components/image-library';
export default function Images() {
  return <><SiteHeader active="images" /><main className="shell main-content"><div className="page-intro"><h1>Your image library</h1><p>Keep the references that catch your eye.</p></div><ImageLibrary /></main></>;
}
