# wayoffmars

A personal font library built with Next.js, React and TypeScript. Choose or drop
TTF, OTF, WOFF and WOFF2 files (up to 20 MiB each) to preview them in the browser.

## Daily development

Use Node.js 22 and npm:

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
