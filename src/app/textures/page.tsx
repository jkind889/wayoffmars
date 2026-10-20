import { SiteHeader } from '@/components/site-header';
import { ImageLibrary } from '@/components/image-library';
export default function Textures() {
  return <><SiteHeader active="textures" /><main className="shell main-content"><div className="page-intro"><h1>Your texture library</h1><p>Reusable surfaces, grain, and patterns from your images.</p></div><ImageLibrary textures /></main></>;
}
