# wayoffmars

A personal font library built with Next.js, React and TypeScript. Choose or drop
TTF, OTF, WOFF and WOFF2 files (up to 20 MiB each) to preview them in the browser.

## Daily development

Use Node.js 22.13 or newer in the Node 22 release line and npm:

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Next.js reports a different port if 3000 is occupied.
Source edits refresh the page automatically. Use native development for daily
work; a production build is available with `npm run build` then `npm start`.

## Docker: run the production app

Start Docker Desktop first. An **image** is the built application package; a
**container** is a running instance of it. The Dockerfile installs the lockfile
with `npm ci`, builds Next.js standalone output, then copies only runtime files
and static/public assets into the final stage. It runs as the non-root `node` user.

From this project folder:

```bash
docker build -t wayoffmars:local .
docker run --rm -d --name wayoffmars -p 127.0.0.1:3001:3000 wayoffmars:local
```

Open http://localhost:3001. In `127.0.0.1:3001:3000`, the app listens on port
**3000 inside** the container and Docker makes it available at **3001 on your
computer**. The `127.0.0.1` binding keeps it local. `EXPOSE 3000` documents the
internal port; `-p` publishes it. If 3001 is busy, use another host port such as
`127.0.0.1:3002:3000` and open localhost:3002.

```bash
docker ps                         # running containers and health
docker logs wayoffmars             # server output
docker stop wayoffmars             # stop; --rm also removes this container
```

A container uses the source captured at build time. After edits, rebuild the
image and create a new container; restarting the old one keeps its old code:

```bash
docker build -t wayoffmars:local .
docker stop wayoffmars
docker run --rm -d --name wayoffmars -p 127.0.0.1:3001:3000 wayoffmars:local
```

Skip the stop command if it is already stopped. For daily editing, use
`npm run dev` on your computer for automatic refresh; Docker here packages a
production build. No font-data volume is required because fonts live in the
browser. Changing the host port changes the library’s origin; use a backup to
transfer fonts from localhost:3000 to localhost:3001.

See Docker’s [multi-stage build guide](https://docs.docker.com/build/building/multi-stage/)
and [port publishing guide](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/).

## Your font library

- Font bytes, filenames, sizes and import dates are saved in IndexedDB (schema
  version 1). A SHA-256 content hash is the stable identity. Renamed copies are
  skipped; different font bytes/formats remain separate entries.
- “Saved in this browser” appears only after the storage transaction completes.
  Storage failures leave a usable preview with “Retry saving”. One bad file or
  saved record does not prevent healthy fonts from loading. Damaged saved records
  are kept; dismissing an error only hides its row for this page session.
- Change preview text or size for the current page. These controls reset on a new
  page or refresh and are not part of backups.
- Remove deletes a saved font after the deletion commits and unregisters its
  preview. “Undo removal” restores the most recently removed font until the next
  removal or refresh. Keep a backup before larger changes.
- Export backup downloads a JSON file containing a version 1 manifest plus the
  complete font bytes as base64. The manifest records `format`, `version`, export
  time and each font’s hash, filename, byte size and import date. Backups are
  unencrypted and contain the fonts themselves; observe the fonts’ licenses.
- Import backup merges into the current library. It validates the envelope,
  metadata, byte sizes, SHA-256 hashes, signatures and browser decoding. Duplicates
  are skipped; invalid entries get individual errors while valid entries restore.
  Backups support up to 500 fonts and 100 MiB per file (base64 adds about one third
  to the original size). Export includes preview-only fonts. Unreadable saved
  records are explicitly reported as omitted and kept in storage. If storage
  cannot be read, export can back up currently loaded fonts with a partial-backup
  warning.

Files are never uploaded. Storage belongs to one **browser profile and origin**:
protocol, hostname and port all matter. `localhost:3000`, `127.0.0.1:3000` and
`localhost:3001` have separate libraries. Switching profiles or opening another
address does not carry your fonts over; export/import a backup to transfer them.
Other open tabs see changes after refresh, without live synchronization.

Browser storage is not a permanent archive. Clearing site data, private browsing,
profile deletion, browser eviction, disk failures or quota limits can erase or
prevent saving fonts. Keep the original files and independent backups. Docker
will serve the app; it does not store or back up your browser’s font data.

Files are checked for extension, size and signature, then decoded with FontFace.
Filenames label previews; internal font naming metadata is not extracted. Unsupported
characters can still fall back to another font; the tests verify actual custom
Latin glyph rendering with the included fixtures.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

`npm test` uses installed Google Chrome through Playwright, with fresh isolated
contexts. It reuses a running localhost:3000 dev server or starts one. It never
clears your normal Chrome profile or saved fonts. Set
`TEST_BASE_URL=http://localhost:3001 npm test` to test another running instance.
No browser is downloaded by `npm ci`. Screenshots/results go under
`/tmp/wayoffmars-*`, outside the repository.

The tests use licensed real Adobe Source Serif TTF, OTF, WOFF and WOFF2 fixtures
(see `tests/fixtures/fonts/README.md`). Chrome's rendered-glyph inspection checks
custom font use beyond CSS or FontFace load status. Coverage includes picker and
simulated drop imports, invalid/mixed batches, duplicates, persistence, mobile
width, file/database read failures, quota, transaction aborts, blocked storage,
damaged saved records, controls, removal/undo and backup restoration. Simulated
drops do not prove physical OS/Finder dragging works.

The existing five high-severity npm audit findings are in the development ESLint
chain through `braces`. npm's suggested fix changes major lint-configuration
versions and has not been applied. Check `npm audit --omit=dev` separately for the
production dependency set.

## Your design notes

Open **Notes** from the header to create, edit and delete your own notes. Title and
body are required; comma-separated tags and an HTTP(S) source URL are optional.
URLs are references only: the app does not fetch their contents. Notes render as
plain text. Limits are 200 characters for titles, 50,000 for bodies, 1,000 for the
comma-separated tag field and 2,048 for source URLs. Tags deduplicate ignoring case.

Notes use a separate `wayoffmars-notes` IndexedDB database (schema version 1).
Changes appear as saved or deleted only after their transaction commits. Failed
saves retain the editor and failed deletes retain the note. Unreadable stored
records are kept while healthy records load. Revision checks prevent stale tabs
from overwriting/deleting newer edits; conflicted edits can be saved as a new note.

Unfinished edits are copied to session storage for recovery after refresh in the
same tab. Replacing or canceling an unsaved draft requires confirmation; leaving
with edits prompts the browser's navigation warning. If draft recovery storage
fails, the editor warns you to keep the page open or copy the text. Closing the
tab may discard an unfinished draft. Save notes before closing it.

Notes have the same browser-profile/origin and eviction limitations as fonts.
There is no note backup/export or live tab synchronization, and font backups do
not include notes. Refresh other tabs to see saved changes.

Search notes by typing literal keywords into **Search notes and PDFs**. Matching ignores
capitalization and requires every whitespace-separated keyword somewhere in the
title, body, or tags. It supports partial words and treats punctuation literally;
there is no query syntax, stemming, semantic matching, or source-URL search.
An empty/whitespace query shows all notes. Results rank exact full-title matches
first, then weighted keyword matches (title 10, tag 5, body 1 per keyword using its
strongest field), with newest edit time and stable note ID breaking ties.

Matching text is highlighted in titles, tags and up to three short body contexts.
“Read full note” expands the saved body. Search operates on saved notes; changing
the query keeps unsaved edits in the editor. Saving or deleting updates results
immediately. The query resets on refresh. Search and snippets run entirely in the
browser and do not send note text anywhere.


## Local PDF search

On **Notes**, use **Import PDF** in the PDF section. Import one text-based PDF at
a time, up to **20 MiB**, **300 pages**, **100,000 extracted characters per page**
and **2 million characters per document**. Parsing runs in a dedicated PDF.js
worker, with page progress, cancellation and a 60-second timeout. The worker,
CMaps and standard fonts are served from this app, never a CDN. Nothing is uploaded.
`predev` and `prebuild` generate these versioned resources under `public/pdfjs/`
from the pinned dependency; generated files are ignored by Git and ESLint.

Only the filename, byte size, content hash, import date and extracted page text
are persisted in the separate `wayoffmars-pdfs` IndexedDB database (schema v1).
Original PDF bytes are not retained. Keep your source files: there is no PDF
viewer, download or backup/export in this slice. Identical bytes, even under a
new filename, are skipped atomically. Different PDFs with the same filename can
coexist. Import success and deletion are shown only after storage commits.
Deletion uses the same confirmation pattern as notes and prevents stale tabs
from deleting a document that another tab has deleted and reimported.

The shared search shows note results and PDF results in separate groups. PDF
matches require every literal keyword in the filename or **the same page's text**;
terms on different pages do not combine into a match. Page references are the
one-based physical position in the PDF, including blank/image-only pages, rather
than printed page labels such as roman numerals. Each matching page shows its
filename, page number and highlighted text contexts. Filename-only matches show
page context. Empty queries list imported PDFs. PDF matches rank filename hits
above page-text hits, then by newest import, stable content identity and page.
Search yields between page batches and displays at most 100 matching pages with
the full match count; narrow the query to see other matches.

Scanned/image-only PDFs, password-protected PDFs and XFA forms are rejected with
an explanation. A PDF containing both text and image-only pages imports with a
persistent count of pages without searchable text. Malformed or unsupported
content, limits, storage failure and quota errors do not save a partial import.
Extraction follows the PDF's text runs; complex reading order, missing character
mappings, ligatures and line-end hyphenation can affect search. There is no OCR,
semantic/AI search, account, sync or remote storage. Other tabs see changes after
refresh. Clearing browser site data can remove the collection; font backups do
not include PDF text or notes.

`pdf-model.ts` defines storage-independent records; `pdf-extraction.ts` parses
local input, `pdf-search.ts` produces page matches, and `pdf-storage.ts` is the
IndexedDB adapter. A future storage backend can replace the adapter without
combining extraction/search with persistence.

The PDF tests use generated, valid PDF fixtures through the real parser in the
Mac's installed Google Chrome. They cover mixed text/image pages, physical page
references despite roman page labels, adjacent text runs, reload persistence,
combined note/PDF search, duplicates, confirmed deletion, stale tabs, cancellation,
timeout, malformed/unsupported inputs, limits, corrupted records and storage
failures. Existing notes and font suites remain regression coverage. Tests use
isolated browser contexts and do not touch the user's saved libraries.
