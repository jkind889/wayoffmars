import { FontLibrary } from "@/components/font-library";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="shell header-content">
          <span className="wordmark">wayoffmars</span>
          <span className="page-label">Font library</span>
        </div>
      </header>
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
