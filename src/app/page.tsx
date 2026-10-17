import { SiteHeader } from "@/components/site-header";
import { FontLibrary } from "@/components/font-library";

export default function Home() {
  return (
    <>
      <SiteHeader active="fonts" />
      <main className="shell main-content">
        <div className="page-intro">
          <h1>Your font library</h1>
          <p>A home for the type you collect.</p>
        </div>
        <FontLibrary />
      </main>
    </>
  );
}
