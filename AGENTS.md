<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project and scope

wayoffmars is a single-user, Mac-local library for fonts, images, design notes
and PDFs.
There are no accounts, cloud uploads or hosted services. Preserve the user's
favicon and unrelated working-tree edits. Images, image/note references, shared
tags and mixed views for notes/images/PDFs, font/image comparisons, ordered
project collections and cited PDF excerpts are implemented.
OCR, annotation, moodboards, font tagging and image AI are outside that scope.

## Code map

- `src/app/`: Next.js App Router pages and Node route handlers; `globals.css` is
  shared styling. `src/components/` holds client library/editor/viewer UIs.
- `src/lib/*-model.ts`: validation and serializable records; `*-storage.ts` and
  `local-client.ts`: same-origin API clients. Search runs in the browser.
- `src/lib/server/repository.ts`: validated mutations and revision checks;
  `database.mjs`: SQLite, migrations and content-addressed immutable assets.
  `images.ts`: raster validation/metadata; `image-links.ts`: revision-checked
  references backed by cascading SQLite foreign keys. `tags.ts` manages shared
  vocabulary/assignments (schema 4); note writes synchronize assignments while
  preserving legacy import receipts. `collections.ts` manages ordered references
  (schema 5); `excerpts.ts` validates PDF quotations and revision-checked note
  attachments (schema 6), retaining citation snapshots after source deletion.
  `http.ts`: loopback Host/Origin protections and bounded request reading.
- `scripts/library-backup.mjs`: database-aware backup/restore;
  `prepare-pdfjs.mjs`: pinned local worker/resources; `start-standalone.mjs`:
  production launcher. `tests/`: Playwright tests with synthetic/local fixtures.

## Commands and runtime

Use Node >=22.16 <23 (built-in experimental `node:sqlite`) and npm:
`npm ci`, `npm run dev`, `npm run build`, `npm start`.
Checks: `npm run lint`, `npm run typecheck`, `npm test` (installed Mac Google
Chrome). `predev`/`prebuild` prepare local PDF.js resources. Read the installed
Next.js guides above before changing framework code.

Native dev/start bind to loopback. Default persistent data is
`~/Library/Application Support/wayoffmars`: `library.sqlite`, WAL/SHM files and
`assets/<sha256>`. Use an absolute `WAYOFFMARS_DATA_DIR` for alternate libraries.
Never use, modify or import the real user library for tests. Playwright creates
`/tmp/wayoffmars-test-*`, uses port 3107 and refuses reuse of a running server.
Use explicit fresh temporary data paths for ad hoc tests and CLI checks too.
Test builds use `.next-check` to coexist with the normal dev server;
`WAYOFFMARS_CHECK_BUILD=1 npm run build` isolates a production check too.
Stop test servers afterward; never leave a test override as the normal app.

Docker uses `/data` and a persistent named volume, separate from native storage.
Publish only to Mac loopback (`127.0.0.1:3001:3000`); do not expose this unauthenticated
app via LAN, proxy or tunnel. See README for volume ownership and restore steps.

## Persistence and safety

Keep migrations transactional, preserve old records and reject future schemas.
Update backup version acceptance with schema changes; test migration from the
previous schema and backup roundtrip. SQLite foreign keys must be enabled on each
connection. Keep transactions short and use revision checks for stale edits and
deletes; never silently overwrite a newer record. Note drafts survive in tab
session storage and have navigation protection.

Validate content, identities, sizes and metadata on the server. Filenames must
never become paths. Store/checksum/fsync immutable assets before committing their
record; retain unreferenced bytes on deletion to avoid racing active backups.
Render user text safely, reject active content, and never fetch arbitrary source
URLs. Preserve same-origin API guards and bounded bodies.

Use `npm run backup -- /new/backup`; never copy a live SQLite file alone.
Use `npm run restore -- /backup /new/library` with the app stopped and a new
nonexistent destination. Verify checksums, integrity and referenced assets before
publishing a backup/restore. Never overwrite an existing library. Keep old data
until the restored library is checked. Fonts JSON export is fonts-only.

## Review and delivery

Inspect instructions, status, relevant code and tests before edits. Review each
meaningful slice before committing, fix findings and keep guidance and feature
slices in separate commits. Run appropriate automated checks plus lint, types,
build and full regressions; check browser behavior on Mac Chrome and responsive
layouts when changing UI. Report actual checks and unverified environments
accurately; do not claim Docker/Safari coverage without running them. Do not push
or deploy unless requested. Keep guidance concise and update it as features land.
