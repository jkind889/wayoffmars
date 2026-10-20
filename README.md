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

Open **http://wayoffmars.localhost:3000** in desktop Chrome. The original
http://localhost:3000 and http://127.0.0.1:3000 addresses still work. Chrome
resolves this `.localhost` name to loopback itself; no domain purchase, hosts-file
edit, proxy, certificate, or system DNS change is needed. Other tools using the
Mac system resolver may not resolve the name; use 127.0.0.1 for those tools.

Start with the same `npm run dev` command (restart an already-running app after
updating). For production, rebuild with `npm run build` before `npm start`.
The app must be running to use the address. Native scripts still bind to
127.0.0.1; production forces loopback. The API allows only the exact local
hostnames above and IPv6 loopback, validates the exact Origin, rejects cross-site
requests, and requires a custom header and JSON for
mutations. Do not expose it through a proxy, tunnel, LAN binding or port forward.
There is no authentication against other processes/users on this Mac.

The hostname does not change the server's SQLite/asset directory or migrate data.
Saved library items are shared across these addresses when connected to the same
server. Browser state is separate for each origin (scheme, hostname and port):
finish/save note and image drafts at the old address before switching. Old
IndexedDB libraries remain at their original address; perform any explicit legacy
import there first. Browser-local preferences and temporary previews do not carry
over. Chrome's installed-font permission belongs to the new origin too: use
**Browse installed fonts** to request it if needed. No permission is granted by
this change, and saved font files remain available without that permission.

## Font previews and installed fonts

The Fonts workspace previews uploaded TTF, OTF, WOFF and WOFF2 files. Text, size,
tracking (em), line height, alignment, and text/background colors apply only to
specimens. Preview settings reset when leaving the page; Reset appearance restores
tracking, leading, alignment and colors without changing text or size.

**Browse installed fonts** optionally requests the browser's Local Font Access
permission from a click. Desktop Chrome supports this API in a secure context
(including wayoffmars.localhost, localhost and 127.0.0.1). Safari, Firefox and
unsupported browsers retain the file-import workflow. Denying or dismissing permission does not block
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
must match within a note's title/body/tags/quotations/observations or one PDF page plus its filename.
Physical page numbers include blanks and ignore printed/roman labels. Notes rank
title matches above tags/body; PDFs rank filename matches above text, with recency
and stable IDs as tie breakers. Snippets are highlighted; PDF results cap at 100
matching pages with total count. Search preserves note drafts.

Notes display 25 results per page. Previous/Next and the page selector keep every
result reachable; search still covers all saved notes. **List** is the initial
layout, with compact titles and tags. **Grid** arranges cards with short previews;
it is not a draggable board. The choice is remembered in this browser when local
storage is available. Changing views keeps the current search, page and draft.
Open a note's title (or **Read full note** in search) to visit its dedicated
`/notes/[id]` page with the full body, source, citations and image links. **Edit**
and **Delete** are available there, with the existing draft and confirmation
protections. **Back to saved notes** restores the search/page context and the
remembered list/grid layout. Search/page context also survives refresh through
the URL. Old `#note-…` links still open the corresponding detail page. Missing
notes offer a clear return path; failed reads are reported separately. Only the
detail page renders a full body, with search highlights when opened from results.
Browser Find sees only rendered content; use app search to find other notes.

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

Gallery, linked-image and collection previews use local WebP thumbnails up to
640×440 pixels, loaded near the viewport. Orientation and transparency are
preserved; images are not enlarged. Detail and comparison views use the originals.
Existing images acquire thumbnails on demand without reimporting or migrating.

Thumbnails are disposable server-memory entries, capped at 64 previews / 16 MiB,
with at most two conversions at once. Restart or eviction regenerates them on the
next request, so first viewing can spend time converting images. Every request
checks the current original's existence and checksum, including cache hits; a
cached preview cannot hide a missing, damaged or deleted source. Failed previews
can be retried, and the original remains available through image details when
healthy. No thumbnails are written to the library or included in backups: restore
keeps the original assets and regenerates previews as needed.

Metadata saves and confirmed deletion check the current revision; stale edits
require copying your draft and reloading. Unsaved metadata has a navigation
warning but is not recovered after closing the tab. Missing/damaged files show
a preview error; restore a verified backup for recovery. Deletion retains
unreferenced asset bytes under the existing backup-safe retention policy.
Full-library backups include images and their metadata. Schema 1 libraries
migrate transactionally to schema 7 on first use; older backups remain restorable.

On a saved note, choose **Manage linked images**, select an imported image and
choose **Link image**. Image details show **Linked notes**, with controls to link
or unlink saved notes. **Open** takes you directly to the associated image or
note. Links save immediately and are separate from unsaved text/metadata edits.
Refresh links to see changes from other tabs. Unlink keeps both items; deleting
a note or image removes its links through SQLite foreign keys while keeping the
other record. Stale link actions are rejected if either record changed.

Full-library backup/restore includes references alongside image metadata and
original bytes. Schema 2 image libraries migrate to schema 7 without changing
records or assets. There is no OCR, image AI, annotation or moodboard behavior.

Image/link checks include all three raster formats, original-byte equality,
duplicate imports, malformed and animated payloads (including APNG), size and
dimension limits, stale revisions, write failures/retries, both linking views,
cascading deletion, schema 1/2 migrations, future-schema rejection and verified
backup roundtrips. Production stop/start and serving a restored backup were also
checked using an isolated temporary library with Mac Chrome desktop/mobile
previews and direct-reference navigation. The real user library was not used
for these checks. Safari and Docker runtime remain unverified.


## Textures

Open **Textures** to browse reusable texture images. **Import texture** uses the
same still PNG/JPEG/WebP validation, original storage and lazy thumbnails as
Images. New imports are marked as textures. Renamed duplicate files keep their
existing metadata and classification; **Review saved image** opens that record
for an explicit change.

To reuse an existing image, choose **Existing image**, **Review existing image**,
check **Use as texture**, then **Save image details**. The same checkbox is also
available in Images. Classified textures appear only in the Textures gallery;
Images shows unclassified images. Uncheck and save to return an item to Images
while retaining its original, tags, links and collection memberships. Existing
libraries are never automatically classified, and a tag named “Texture” does
not change classification.

Filter textures by title/filename/description, shared image tag, and collection.
Image details provide **Manage shared tags**, controls to add/remove membership
in existing collections, and **Download original** for the exact saved bytes.
Membership additions append; organize their order or create a collection on
**Collections**. Save image edits before changing membership. Collection tags
apply to the collection itself and are independent of member image tags.

**Reload textures/images** refreshes changes from other tabs and asks before
discarding unsaved metadata. Classification uses the image's revision checks;
collection changes use the collection's revision checks. Classification is an
optional boolean in existing image metadata, needs no asset migration, and
survives full-library backup/restore. No image copies, texture editor, procedural
generator, animation or additional file formats are introduced.

Checks use fresh temporary libraries and Mac Chrome at 1280×900 and 390×844:
imports/duplicates, reversible classification, validation and stale writes,
original download byte equality, thumbnail reuse, tag/collection filters,
ordered membership preservation, failed/cancelled flows, keyboard focus, and
backup/restore. Safari and Docker runtime remain unverified.

## Shared tags

Open **Tags**, or choose **Manage shared tags** on a note, image detail or PDF.
Choose **Edit tags**, type a label or select an autocomplete suggestion, and
press Enter / **Add tag**. Remove individual labels with their named remove
buttons, then **Save tags**. Pending input must be added or cleared before saving.
Changes stay local. Unsaved tag edits have a navigation warning; save before
closing the tab. Use **Cancel**, then **Reload tags** after a conflict.

Filter by one or more tags, item type, and title/filename keywords. Every selected
tag and keyword must match. **Clear filters** restores all items. Results link
to their original note, image, PDF or collection; this view does not search
body/page text. Fonts are not included. Explicit note/image links remain independent.

Labels are trimmed and compared using the same lowercase convention as note
tags. Duplicate assignments collapse; the first saved spelling becomes the shared
display label. Tag input is limited to 1,000 characters per item, including commas
between labels. Empty labels and non-text values are rejected. Unused vocabulary
stays available for reuse; there is no global rename, merge, hierarchy or deletion.
The note editor keeps its comma-separated field for ordinary labels. Labels with
literal commas are edited individually in **Shared tags** and survive body-only
edits and saving a conflicting note as a copy.

Schema 4 adds vocabulary and assignment tables transactionally on first library
access. Existing note JSON, labels, revisions, original assets and legacy import
receipts are preserved. Assignment keys deduplicate existing labels without
losing their note associations. Repeated opens/imports do not duplicate tags or
restore removed assignments. Old backups (schemas 1–3) still restore and then
migrate on opening; schema 4 backups include tags. Newer schemas are rejected.
Tag saves advance the item's revision, so stale note/image edits and PDF deletes
cannot overwrite them. Deleting an item cascades only its assignments; removing
a tag keeps the item and its explicit links.

After updating, restart the app to load all new handlers (rebuild first for a
production launch). Older app versions cannot open a schema 7 library. Shared-tag
QA uses fresh temporary libraries and a separate `.next-check` build directory, preserving the normal
dev server. Coverage includes migration/legacy backup,
normalization, repeated import, conflicts, deletion, keyboard/focus, combined
filters, mobile layout and full-library backup roundtrip. Safari and Docker
runtime remain unverified.


## Mixed library views and comparisons

In **Tags**, choose **Untagged** to find notes, images and PDFs without tag
assignments, or **Recently added** to sort newest first. Note/image creation dates
and PDF import dates are preserved; editing tags does not move an item to the
front. Type filters, title search and every-selected-tag filtering work together.
**Filter by tag** uses the same autocomplete as tag editing. Fonts remain untagged
and outside this mixed view.

In **Fonts**, open **Font comparison** to show a side panel, then shortlist 2–4
fonts and choose **Compare fonts** inside it. **Clear shortlist** also lives in
the panel. The library stays usable alongside it on desktop; on narrow screens,
the panel stacks above the library controls. **Comparison settings** contains the
shared specimen controls. Escape while focused inside the panel or **Close
comparison** closes it and returns focus to its opener without clearing selection.
In **Images**, **Compare images** opens the existing comparison dialog.

Shortlists survive title filtering within the page. Missing/deleted items are
checked each time you choose **Compare fonts** or **Compare images**. Font text,
size, tracking, line height, alignment and colors stay synchronized with the main
specimens. Installed fonts require the existing explicit permission and preview
steps; **Shortlist installed font** keeps a temporary decoded copy without saving
it. Clear/removal releases that copy. Shortlists reset when leaving the page.

## Project collections

Open **Collections** to browse a responsive grid of project cards with names,
tags and item counts. Select a card to browse its contents in an ordered grid
with square previews, titles and item types. Titles open the source item. Image
and texture cards use lazy thumbnails, note/PDF snippets stay bounded, and font
previews load near the viewport and release their font faces when closed.
**Edit collection** opens the name, tags, membership, ordering and deletion
controls. **Back to collection** returns to the grid, asking before discarding
unsaved edits. **Close collection** returns focus to its project card.

**New collection** opens a name dialog: Enter creates it and opens its contents,
while Cancel, Close or Escape
returns to the button and keeps the name draft for this visit. Errors keep the
dialog open for correction or retry. Then add existing notes, images, PDFs or
saved fonts. Type/title filters narrow the candidate list. Membership changes and
**Move up/down** save immediately; they also save edited collection names and tags.
Previews and source links use existing records and assets, without binary copies.
The limit is 100 collections, each containing up to 100 distinct items.

Use the existing tag autocomplete in a collection and **Save collection details**
to save its name/tags. Pending tag text must be added or cleared first. Tags use
the same vocabulary as notes, images and PDFs; they do not tag collection
members. The Collections page filters by name, tag and untagged status. An open
collection remains available even when it falls outside the filters. Collections
also appear in the shared **Tags** view with direct links back to their contents.

Removing membership or deleting a collection keeps all source items. Deleting a
source removes its memberships and changes affected collection revisions; use
**Reload collections** to see external changes or recover from a stale edit.
Name/tag edits have navigation protection but are not recovered after closing
the tab. Schema 5 added ordered references; schema 7 adds collection tag
assignments with cascading foreign keys to the existing collections and shared
vocabulary. Migration preserves member order, revisions, existing assignments
and import receipts; repeated opens are idempotent. Backups from schemas 1–7
remain supported. Restart after updating; rebuild first for production.

## PDF excerpts in notes

Choose **Read pages and capture excerpts** on a PDF, **Capture excerpt from page**
on a search result, or **Open cited page** on a saved excerpt. In the page viewer,
select a passage in **Extracted page text** and choose **Capture selected text**.
Keyboard selection works too. The quotation can be shortened or replaced with a
continuous passage from that page. Whitespace is normalized; the server verifies
it against saved extracted text. Add an optional **Observation**, choose a new or
existing note, then **Save excerpt to note**.

Quotation, observation, original PDF identity, filename and physical page are
stored separately from the note body. Note search includes quotations and
observations. Existing note bodies/tags remain intact. Adding/removing an excerpt
advances the note revision, protecting unfinished note edits in other tabs.
Conflicts keep the excerpt draft; **Reload note choices** refreshes revisions
without discarding it. One unfinished excerpt is recovered in the current tab on
refresh. Save before closing the tab. Limits: 10,000 quotation characters,
5,000 observation characters and 100 excerpts per note.

Text-only legacy PDFs can supply excerpts; attach their original to view the
physical page. Missing/damaged original files do not prevent capture from saved
text. Deleting a PDF keeps its saved quotations, observations and citation
metadata, with an explicit source-deleted message. Reimporting that PDF does not
automatically reconnect historical excerpts. Deleting a note deletes its excerpt
records. **Remove excerpt** removes its observation too, while keeping the PDF.
There is no OCR, page annotation or automatic URL fetching.

Schema 6 adds excerpts transactionally. Schemas 1–5 and their backups remain
readable and migrate on opening; future schemas are rejected. Full-library
backup/restore includes ordered collections and excerpt relationships and verifies
foreign keys, checksums and original assets. Fonts JSON export remains fonts-only.
Restart the app after updating; rebuild first for production. No manual migration
or import is needed. To return to an older app version, restore a verified
full-library backup made before the upgrade into a new library directory.

The regression suite uses installed Mac Chrome and isolated temporary libraries.
`WAYOFFMARS_CHECK_BUILD=1 npm run build` uses `.next-check` without replacing a
normal dev build. The production launcher still uses the ordinary `.next` build.
Safari and Docker runtime have not been verified for these additions.
