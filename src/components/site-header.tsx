/* Native navigation lets the note editor's beforeunload guard protect unsaved edits. */
/* eslint-disable @next/next/no-html-link-for-pages */
export function SiteHeader({ active }: { active: "fonts" | "notes" }) {
  return <header className="site-header"><div className="shell header-content">
    <span className="wordmark">wayoffmars</span>
    <nav className="site-nav" aria-label="Library">
      <a href="/" aria-current={active === "fonts" ? "page" : undefined}>Fonts</a>
      <a href="/notes" aria-current={active === "notes" ? "page" : undefined}>Notes</a>
    </nav>
  </div></header>;
}
