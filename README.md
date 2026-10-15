# wayoffmars

A personal graphic-design tool, starting with a font library.

## Local development

Use Node.js 22 (the scaffold was created with Node.js 22.16.0) and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. If that port is occupied, Next.js reports the port it uses in the terminal.

## Current scope

- Next.js App Router, React, TypeScript, ESLint, and plain CSS.
- A responsive library page with an empty state.
- A file picker and drop area for TTF, OTF, WOFF, and WOFF2 fonts (up to 20 MiB each).
- In-memory font loading through the browser FontFace API, with lorem ipsum previews in each loaded font.
- Per-file loading and error feedback. Failed files do not prevent other previews from loading.

Files are checked for supported extensions, nonempty content, size, and a recognized font signature before the browser attempts to decode them. Browser decoding determines whether a font can be previewed. Filenames label the previews; internal font metadata is not extracted.

Fonts stay in memory in the current tab. Refreshing clears the library. Files are not uploaded or saved. IndexedDB persistence, Docker, accounts, and cloud services remain future work.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

To serve a production build locally, run `npm run build` followed by `npm start`.

At setup, `npm audit --omit=dev` reports no production vulnerabilities. The full audit reports five high-severity findings in the ESLint dependency chain through `braces`; npm's suggested fix downgrades the Next.js lint configuration across major versions and has not been applied.

## Browser regression tests

`npm test` runs Playwright using installed Google Chrome, with a fresh isolated
browser context for each test. It reuses a running localhost:3000 dev server or
starts one. It never clears your normal Chrome profile or its saved fonts.
Set `TEST_BASE_URL=http://localhost:3001` to test another running instance.
Screenshots/results go under `/tmp/wayoffmars-*`, outside the repository.
Chrome must be installed; no browser is downloaded by npm install.

The suite uses licensed real Adobe Source Serif TTF, OTF, WOFF and WOFF2 fixtures
(see `tests/fixtures/fonts/README.md`). Chrome's rendered-glyph inspection verifies
custom-font glyph use, beyond checking CSS or FontFace load status. Tests cover
picker imports, simulated file drops, invalid and mixed batches, same-content
duplicates, refresh/reopened pages, mobile width, file read errors, quota errors,
transaction aborts, blocked storage, database reads and damaged saved records.
A simulated drop does not prove physical OS/Finder dragging works.
