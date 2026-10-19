/* Native navigation lets the note editor's beforeunload guard protect unsaved edits. */
/* eslint-disable @next/next/no-html-link-for-pages */
export function SiteHeader({ active }: { active?: "fonts" | "notes" | "library" | "images" | "tags" }) {
  return <header className="site-header"><div className="shell header-content">
    <span className="wordmark">wayoffmars</span>
    <nav className="site-nav" aria-label="Library">
      <a href="/" aria-current={active === "fonts" ? "page" : undefined}>Fonts</a>
      <a href="/notes" aria-current={active === "notes" ? "page" : undefined}>Notes</a>
      <a href="/images" aria-current={active === "images" ? "page" : undefined}>Images</a>
      <a href="/tags" aria-current={active === "tags" ? "page" : undefined}>Tags</a>
    <a href="/library" aria-current={active === "library" ? "page" : undefined}>Local library</a>
    </nav>
  </div></header>;
}
