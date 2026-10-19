# wayoffmars

A local Mac library for fonts, images, design notes and searchable PDF text. No accounts,
remote uploads, hosted database, synchronization or deployment.

## Run locally

Use **Node 22.16 or newer in the Node 22 release line** and npm. SQLite uses
Node's built-in `node:sqlite` (experimental in this runtime; no native addon).
Implementation follows the [Node 22.16 SQLite documentation](https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html).

```sh
npm ci
npm run dev
# production:
npm run build
npm start
```

Open http://localhost:3000 or http://127.0.0.1:3000. Native scripts bind to
127.0.0.1; production forces loopback. The API validates loopback Host and exact
Origin, rejects cross-site requests, and requires a custom header and JSON for
mutations. Do not expose it through a proxy, tunnel, LAN binding or port forward.
There is no authentication against other processes/users on this Mac.

## Font previews and installed fonts

The Fonts workspace previews uploaded TTF, OTF, WOFF and WOFF2 files. Text, size,
tracking (em), line height, alignment, and text/background colors apply only to
specimens. Preview settings reset when leaving the page; Reset appearance restores
tracking, leading, alignment and colors without changing text or size.

**Browse installed fonts** optionally requests the browser's Local Font Access
permission from a click. Desktop Chrome supports this API in a secure context
(including loopback localhost/127.0.0.1). Safari, Firefox and unsupported browsers
retain the file-import workflow. Denying or dismissing permission does not block
uploaded fonts. Browser site settings can revoke a remembered font permission.

The returned font list remains in tab memory. Select a face and choose **Preview
installed font** to read its bytes into a temporary preview. **Save to library** is
an explicit, separate action that validates, hashes and stores a copy through the
existing local API. Until saved, installed previews are excluded from exports and
backups; changing selection, clearing the preview or leaving the page releases it.
Browsing again refreshes the inventory. If a font has been removed or cannot be
read, retry browsing or choose its file. Saved copies remain available independently
of OS installation. Nothing sends font inventories or bytes to external services.

No weight synthesis, variable-axis editor or OpenType feature parser is added.
Automated font-access checks use mocked handles and synthetic permission outcomes;
they never grant real browser font permissions or enumerate the user's fonts.

## Local storage and existing browser libraries

By default the library lives at:

```text
~/Library/Application Support/wayoffmars/
  library.sqlite       # records, PDF page text, file metadata, import receipts
  library.sqlite-wal   # SQLite journal while in use; never copy just the main DB
  library.sqlite-shm
  assets/<sha256>      # immutable binary files; filenames never become paths
```

Override with an absolute `WAYOFFMARS_DATA_DIR` when starting the app and backup
commands. Development and production share this default, independent of working
directory. Runtime data is outside the checkout by default. `.gitignore` and
`.dockerignore` also exclude `data/`, `.wayoffmars-data/`, `backups/`, SQLite files
and incomplete backup folders. Keep any custom data directory outside the repo.

**Nothing automatically migrates your IndexedDB library.** Open **Local library**
in the same browser profile and exact address (hostname and port) you previously
used, then select **Import browser library**. This explicitly reads the old
`wayoffmars-notes`, `wayoffmars-pdfs` and `wayoffmars-fonts` version-1 stores and
copies validated records and font bytes to local storage. Your IndexedDB records
are never edited or deleted. Each result appears in the import report.

- Imports commit one record at a time and verify readback and binary checksums.
  Stop or interruption leaves completed records intact; rerun to continue.
- Receipts make repeat imports idempotent, including a lost network response.
  A previously imported record stays skipped if subsequently edited or deleted in
  SQLite. This is a one-way import, not a sync or restore mechanism.
- Same identity with different metadata/content is a **conflict**, skipped without
  changing either copy. Keep the SQLite version, or manually copy a conflicting
  browser note as a new note. The old browser data remains available for recovery.
- Invalid or unreadable records are reported and retained in IndexedDB; healthy
  records can continue. A newer browser schema is not opened or downgraded.
- Legacy PDF records contain text only, with no original bytes. They remain fully
  searchable. Use Attach original to associate the exact original file when you still have it.

All browser profiles/ports served by the same local data directory now see the
same library. Refresh other tabs to see changes. Notes use transactional revision
checks; stale edits/deletes fail and the draft can be saved as a new note. Drafts
still use tab session storage, with navigation warnings and refresh recovery.

Assets are atomically written, fsynced and checksum verified before the record
transaction commits. Interrupted writes can leave unreferenced assets; deletion
removes the library record but retains bytes on disk to avoid racing backups.
Backups copy only referenced assets. To reclaim old assets, restore a verified
backup into a new directory and switch to it after stopping the app. Keep the old
folder until the restored library is checked. This is not secure erasure.

## Full-library backup and restore

A plain copy of a live SQLite file is unsafe. Use the database-aware command:

```sh
npm run backup -- /absolute/path/to/new-backup
# With a custom library:
WAYOFFMARS_DATA_DIR=/absolute/path/to/library npm run backup -- /absolute/path/to/new-backup
```

The app may remain open: the SQLite backup API takes a consistent snapshot, then
copies and SHA-256-verifies every asset referenced by that snapshot. Immutable
assets remain available during concurrent edits/deletes. An integrity check and
manifest cover the database and assets. A completed folder is published only
when verification succeeds. Failed `.pending-*` folders are incomplete and can
be removed after checking the error. Store completed backups independently of
the Mac; backups contain unencrypted personal content and font files.

Restore **after stopping the app**, always into a new directory:

```sh
npm run restore -- /absolute/path/to/backup /absolute/path/to/new-library
WAYOFFMARS_DATA_DIR=/absolute/path/to/new-library npm start
```

Restore verifies the manifest, database checksum/integrity/version, and all
referenced asset checksums, including import receipts. It never overwrites an
existing destination. Check the restored library before removing the old folder.
Remember to use the chosen data path on subsequent starts. No broad merging or
synchronization is performed.

The Fonts page's existing JSON export/import remains a **fonts-only** portable
backup (including preview-only fonts), with 500-font/100-MiB envelope limits.
Use the full-library command for notes, PDF text and original PDFs as well.

## Docker

The existing standalone Docker configuration remains supported with persistent
storage. Docker listens on all interfaces *inside* the container; publish only
to Mac loopback. A named volume survives container removal and image rebuilds:

```sh
docker build -t wayoffmars:local .
docker run --rm -d --name wayoffmars \
  -p 127.0.0.1:3001:3000 \
  -v wayoffmars-data:/data wayoffmars:local
```

Open http://localhost:3001. The image uses `WAYOFFMARS_DATA_DIR=/data` and runs as
non-root `node`; the named volume is initialized with that directory's ownership.
Never omit the named mount (an anonymous volume is hard to recover) or remove the
named volume unless discarding its library is intended. Native and Docker data
are separate. No runtime content is baked into the image.

For a Docker backup, stop the container first, copy the volume to an empty staging
folder using a temporary container, then run the same database-aware backup tool
against that staging folder on the Mac. For example:

```sh
docker stop wayoffmars
mkdir /tmp/wayoffmars-volume-copy
docker run --rm -v wayoffmars-data:/data:ro \
  -v /tmp/wayoffmars-volume-copy:/copy node:22-bookworm-slim \
  sh -c 'cp -a /data/. /copy/'
WAYOFFMARS_DATA_DIR=/tmp/wayoffmars-volume-copy npm run backup -- /absolute/path/to/new-backup
```

To restore into Docker: stop the app, run the restore command into a new Mac
folder, then copy that verified folder into a **new** named Docker volume and
chown its contents to `node:node` (UID/GID 1000). Run the image with that new volume
mounted at `/data`. Keep the old volume until verification. Do not copy a live DB
or overwrite an in-use volume. Docker runtime checks require Docker Desktop.

## Fonts, notes and PDF search

Fonts accept TTF, OTF, WOFF and WOFF2 up to 20 MiB. SHA-256 deduplicates renamed
copies; the browser decodes before normal imports. Preview text/size are transient.
Failed saves remain preview-only with Retry saving; remove/undo persists locally.

Notes require a title/body, with optional comma-separated tags and HTTP(S) source.
Limits: title 200, body 50,000, tags 1,000 and source 2,048 characters. Tags
deduplicate ignoring case; source links are not fetched. Content renders as text.

PDFs accept text-based documents up to **20 MiB / 300 pages / 100,000 characters
per page / 2 million per document**. PDF.js runs in a dedicated browser worker,
with progress, cancellation and a 60-second timeout. Worker, CMaps and standard
fonts come from the app's pinned dependency (`predev`/`prebuild` prepare them),
never a CDN. Scanned/image-only, encrypted and XFA documents are rejected. Mixed
text/image PDFs keep physical page offsets. Extraction order and font mappings
may affect search; there is no OCR.

Combined search remains browser-side over saved records. All literal keywords
must match within a note's title/body/tags or one PDF page plus its filename.
Physical page numbers include blanks and ignore printed/roman labels. Notes rank
title matches above tags/body; PDFs rank filename matches above text, with recency
and stable IDs as tie breakers. Snippets are highlighted; PDF results cap at 100
matching pages with total count. Search preserves note drafts.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm test
```

Tests use installed Mac Google Chrome through Playwright and a new temporary
SQLite/asset directory under `/tmp/wayoffmars-test-*`, served on 127.0.0.1:3107.
They refuse `TEST_BASE_URL` and never reuse a user's running app. Browser contexts
are isolated, with synthetic PDF and licensed Source Serif font fixtures. Existing
browser libraries are never imported by these tests. Screenshots/results stay in
`/tmp/wayoffmars-*`. Tests cover glyph rendering, drafts/conflicts, search, limits,
failures/retries, explicit migration, lost responses, security checks, fresh-process
persistence, and backup/restore. Simulated drops do not prove Finder dragging.

The previously reported five high-severity audit findings are in the development
ESLint chain. No broad lint/dependency upgrade is included in this work.

## Open a cited PDF page

New PDF imports save both extracted text and the original file in one committed
record, with SHA-256-verified immutable bytes in `assets/<sha256>`. Success is not
reported until both are durable. The existing import size/page/text limits,
progress, cancellation and duplicate handling still apply. Reimporting identical
bytes skips the record; it does not replace metadata or implicitly attach a
legacy original. Use the explicit attachment action for that case.

Search in Notes, then choose **Open page N**. A separate tab renders that exact
one-based **physical** page using the pinned PDF.js canvas API. The viewer checks
the original hash, size and page count. Previous/Next and Go navigate physical
pages, including blank/image pages; reload preserves the page URL. The expandable
text below the canvas comes from the original page, not from the search index.
Implementation follows the [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
and [rendering examples](https://mozilla.github.io/pdf.js/examples/).

For older text-only PDFs, **Attach original** validates the selected PDF through
the same parser/limits, requires its SHA-256 hash, byte size and page count to
match, and associates bytes without changing indexed text, metadata or revision.
Renamed files are fine if bytes match. A changed/resaved PDF is a different file
and is rejected. Use Import PDF for a separate changed document. Reattachment is
idempotent and protects against stale records deleted/reimported in another tab.
Canceling the picker does nothing; Cancel reattachment stops validation before
saving. Once saving begins, keep the page open until the result is shown.

Missing or damaged originals never remove searchable text. The viewer explains
the problem and offers Retry and Reselect original; a checksum-matching file can
repair missing/damaged bytes. If the original is unavailable, text search still
works and cited-page opening remains unavailable. Full-library backup and restore
include every attached original.

The viewer uses canvas only: no PDF scripting manager, embedded HTML, interactive
forms, annotation links or external PDF resources. Binary responses use an
attachment/octet-stream response with `nosniff`, same-origin policy and sandbox
CSP; they are not embedded in a browser-native PDF viewer. Canvas dimensions and
image sizes are bounded and opening times out after 60 seconds. Very large or
unusual artwork/images may not render completely; search text remains available.
There is no annotation editing, printing UI, OCR, or full-featured PDF reader.

Tests verify actual canvas pixels and extracted original-page text at physical
pages 1, 2 (image-only) and 3 despite roman printed labels; navigation, reload,
legacy/mismatched/repeated attachment, missing files, cancellation, invalid pages,
checksum/revision rejection, inactive embedded scripts/links, and original bytes
in verified backups. Mac Chrome desktop/mobile viewport checks are automated;
Safari and Docker runtime are not verified here.

## Image references

Open **Images**, choose **Import image**, then open a gallery item to edit its
title, HTTP(S) source URL and short why-saved description. Source URLs are stored
without fetching. Still PNG, JPEG and WebP are supported up to 20 MiB, 12,000
pixels on either side and 24 megapixels. Animated images, SVG/HTML and malformed
files are rejected by signature checking and a full server-side Sharp decode.
Original bytes are preserved and deduplicated by SHA-256 even after renaming.

Metadata saves and confirmed deletion check the current revision; stale edits
require copying your draft and reloading. Unsaved metadata has a navigation
warning but is not recovered after closing the tab. Missing/damaged files show
a preview error; restore a verified backup for recovery. Deletion retains
unreferenced asset bytes under the existing backup-safe retention policy.
Full-library backups include images and their metadata. Schema 1 libraries
migrate transactionally to schema 3 on first use; older backups remain restorable.

On a saved note, choose **Manage linked images**, select an imported image and
choose **Link image**. Image details show **Linked notes**, with controls to link
or unlink saved notes. **Open** takes you directly to the associated image or
note. Links save immediately and are separate from unsaved text/metadata edits.
Refresh links to see changes from other tabs. Unlink keeps both items; deleting
a note or image removes its links through SQLite foreign keys while keeping the
other record. Stale link actions are rejected if either record changed.

Full-library backup/restore includes references alongside image metadata and
original bytes. Schema 2 image libraries migrate to schema 3 without changing
records or assets. There is no OCR, image AI, annotation or moodboard behavior.

Image/link checks include all three raster formats, original-byte equality,
duplicate imports, malformed and animated payloads (including APNG), size and
dimension limits, stale revisions, write failures/retries, both linking views,
cascading deletion, schema 1/2 migrations, future-schema rejection and verified
backup roundtrips. Production stop/start and serving a restored backup were also
checked using an isolated temporary library with Mac Chrome desktop/mobile
previews and direct-reference navigation. The real user library was not used
for these checks. Safari and Docker runtime remain unverified.
