# PDF/HTML visual-parity regression test

**Date:** 2026-07-14 · **Slug:** `pdf-html-visual-parity` · **Check:** `pdf_html_visual_parity_live_verify`
Prompted by a design-inspiration pass over Penpot (github.com/penpot/penpot) — its core lesson
(canvas state and shipped output should be the same code path, not a re-implementation that can
silently diverge) is already how this repo's HTML render paths work. This spec closes the one
place that lesson can't apply directly.

## Problem

An `EmailDoc` renders through three engines. Two of them — free-tier HTML
(`lib/email/blocks/EmailDocRenderer.tsx`) and grid-tier HTML (`lib/email/compile-grid.ts`) —
already share one component (`BlockRenderer.tsx`, explicitly commented "shared by the canvas DOM
view AND the server render() export") and one font/head builder (`lib/email/blocks/email-head.ts`),
enforced by `lib/email/__tests__/font-parity.test.ts`. That test exists because the two paths used
to diverge silently (grid emitted an empty `<Head>`, dropping webfonts) — the fix was "stop
re-implementing, share one root," and a parity test locks it in.

The PDF engine (`lib/pdf/email-doc-pdf.tsx`, `@react-pdf/renderer`) cannot share that root —
`@react-pdf` has its own primitive set (`View`/`Text`/`Image`), not HTML, so `PdfBlock` is a
genuine second implementation of all 12 block types. That duplication is structurally forced, not
a shortcut someone skipped. The existing safety net for it —
`lib/pdf/__tests__/email-doc-pdf.test.ts` — only proves every block type produces *a* valid PDF
buffer (existence). It has no equivalent to `font-parity.test.ts`'s "these two paths agree"
check, because there was never a way to compare a PDF against HTML pixel-for-pixel.

Three production bugs already slipped through that exact gap, each fixed and documented as code
comments in `email-doc-pdf.tsx`, none caught by any test:

1. **Squashed logo** — `@react-pdf`'s `Image` defaults `objectFit` to `"fill"`, unlike HTML's
   implicit `"contain"` behavior with a max-width/max-height pair.
2. **Stretched logo** — flexbox `alignItems` defaults to `"stretch"`; the header's box didn't set
   `alignItems: "flex-start"`, so every child (including the logo) stretched to the header's full
   width.
3. **Header bleeding onto page 2** — `PAGE_TOP_PAD` margin math left a wrapped block's
   continuation flush against the physical page edge on page 2+.

All three are geometry/positioning bugs, not text-rendering bugs. That distinction drives the
whole design below.

## Research evidence (crawl4ai, fetched 07/14/2026 — RULE 0.4)

- **Playwright cannot cleanly rasterize an existing PDF file.** `page.pdf()` only goes HTML→PDF.
  No documented, supported Playwright API renders an arbitrary PDF's page N to a screenshot —
  navigating to a PDF loads Chromium's built-in viewer chrome (toolbar, sidebar), which isn't a
  clean crop and isn't a documented test pattern. Playwright is still useful here, but only for
  the HTML side (`page.setContent()` + screenshot, which *is* documented).
- **`pdf-to-img@6.2.0`** (github.com/k-yle/pdf-to-img, MIT, 141★) is the actual tool for this —
  its own README demos `expect(page).toMatchImageSnapshot()` on rasterized PDF pages. Its only
  declared runtime dependency is `pdfjs-dist@~5.6.205` (confirmed via `registry.npmjs.org`), but
  its source (`src/index.ts`, `src/canvasFactory.ts`) renders via `pdfjs-dist`'s legacy Node
  build, which requires the native `canvas` package (node-canvas, a Cairo binding) to actually
  produce pixels — `canvas` appears only in `pdf-to-img`'s own devDependencies (used for its
  tests), so a consumer must install it themselves. **This means adding `pdf-to-img` really means
  adding two new devDependencies, one of them native** (prebuilt binaries exist for common
  platforms including win32 x64, but it's still a real new install, not a pure-JS drop-in).
- **`@react-pdf/renderer`'s `<Image>`** (react-pdf.org/components#image) accepts a Buffer, a
  `{ data: Buffer, format }` object, or a string (URL or Node filesystem path). Data-URI strings
  aren't called out explicitly in the docs table — treated here as "probably works, confirm with
  a smoke test during implementation," not assumed.
- **Font rendering will never match between engines.** The PDF path uses `@react-pdf` built-ins
  (Helvetica/Times-Roman); the HTML path uses real webfonts (Lato, Playfair Display, etc.) per
  `lib/brand/fonts.ts`. A literal full-page pixel diff would show large differences on every doc
  regardless of correctness — either useless or thresholded so loose it stops catching anything.
  This ruled out "just pixelmatch the whole page" as the primary check.

## Design

### 1. Two-layer check, one shared raster pipeline

**Layer 1 — region-strict, blocking.** For each fixture doc, crop the image/photo block from both
renders and compare geometry derived from the real pixels (not from re-reading style props — a
lint that just checks "is `objectFit` set" wouldn't catch a *new* wrong default the way a pixel
check does). Tight tolerance (~5%, sized to absorb minor layout-driven surround differences, not
the shape of the image itself).

**Layer 2 — full-page loose, informational-leaning.** A coarse `pixelmatch` over the two full
rasters (resized to a shared aspect ratio first), asserted only against a high ceiling (~50%
differing pixels). Won't catch subtle issues — font noise buries those — but is a cheap tripwire
for catastrophic breakage (a block that fails to render entirely, a backdrop color wrong across
the whole page, a blank PDF). Logs the actual diff ratio unconditionally so a slow drift is
visible in test output before it ever trips the ceiling.

Both layers consume the same two rasters per fixture — no separate pipeline for layer 2.

### 2. New dependencies (devDependencies only, nothing production-facing)

- `pdf-to-img` + `canvas` — rasterizes a `renderEmailDocToBuffer` PDF page to a PNG buffer.
- `pixelmatch` + `pngjs` — pure JS, no native code. Diffs two decoded PNGs, returns a differing-
  pixel count.
- Playwright is already a dependency (`package.json:136`, plus `@playwright/test` at
  `package.json:115`) — used here only for `page.setContent(html)` + a full-page screenshot of
  the HTML render, via the plain `playwright` package's programmatic API (`chromium.launch()`)
  called from inside a `bun:test` file. No new browser install beyond what's already provisioned:
  `emails/visual-regression.playwright.ts` + `playwright.config.ts` already depend on a working
  Chromium install for `bun run test:visual`. That existing suite is a **separate** setup — its
  own `@playwright/test` runner, its own config scoped to `testDir: "./emails"` — and won't pick
  up this new file (its `testMatch` only matches `visual-regression.playwright.ts`). No conflict,
  no shared config, just the same underlying browser binary already on disk.

### 3. Fixtures — new, not `FULL_DOC`

Two minimal single-block `EmailDoc` fixtures, not the existing 12-block `FULL_DOC` (too busy to
crop cleanly, and mixing concerns would make a failing assertion ambiguous about which block
broke):

- **Header fixture** — one `header` block, `logoUrl` set to a small, deliberately non-square test
  PNG (e.g. 400×100, a high-contrast two-tone pattern) encoded as a `data:image/png;base64,...`
  URI. Non-square is deliberate: a squash/stretch bug is far more visually obvious on a wide image
  than a square one, where a fill-vs-contain mistake can look almost identical.
- **Agent-hero fixture** — one `agent-hero` block, `photoUrl` set the same way with its own test
  image.

Both fixtures are plain `EmailDoc` objects rendered unmodified through *both* paths
(`renderEmailDocHtml` and `renderEmailDocToBuffer`) — one object, two calls, so the comparison is
apples-to-apples by construction, not two independently-authored docs that happen to look similar.

### 4. Data flow

1. `renderEmailDocHtml(doc)` → HTML string → Playwright `page.setContent()` → full-page PNG
   screenshot (buffer A).
2. `renderEmailDocToBuffer(doc)` → PDF buffer → `pdf-to-img` at a fixed `scale` → page-1 PNG
   buffer (buffer B).
3. A small pure function, `findContentBoundingBox(png, backgroundColor)`, scans rows/columns for
   the first/last pixel deviating from the background color beyond a color-distance threshold,
   returning `{x, y, width, height}`. Runs independently on A and B.
4. Layer 1 assertion: `|ratioA − ratioB| / ratioA < 0.05` where `ratio = width / height`.
5. Layer 2 assertion: `pixelmatch(A_resized, B_resized) / totalPixels < 0.5`, logged regardless of
   pass/fail.

### 5. Page-break bleed (bug #3) — PDF-only, same tooling, same PR

The third named bug has no HTML side to compare against — HTML email never paginates, so there's
nothing to diff it *against*. It gets its own check using the same bounding-box technique, but
applied only to the PDF raster: render a fixture doc long enough to force a page break, rasterize
page 2 via `pdf-to-img`, and assert the first non-background pixel row is at least `PAGE_TOP_PAD`
px from the top (with tolerance). This stays in this same build rather than opening a separate
untracked gap, since it reuses 100% of the rasterization/bounding-box code already built for
layers 1 and 2.

### 6. Error handling

If `pdf-to-img`/`canvas` fails to load (native binary mismatch) or Playwright's Chromium isn't
installed, the test fails loudly with the standard install guidance — no silent skip. A visual
regression gate that can silently no-op is worse than not having one.

### 7. Where it lives

New file: `lib/pdf/__tests__/pdf-html-visual-parity.test.ts`, alongside the existing
`email-doc-pdf.test.ts` (which is unchanged — it stays the "every block type renders" gate; this
new file is the "renders *correctly relative to HTML*" gate).

## Out of scope

- Extending pixel-parity coverage to all 12 block types — this build covers the two blocks that
  have actually had geometry bugs (header logo, agent-hero photo) plus the page-break case. Adding
  more blocks later is a mechanical extension of the same fixtures/functions, not a redesign.
- Wiring this test into the pre-push gate hooks as a blocking gate. It runs as a normal `bun test`
  in the suite for now; promoting it to a hard pre-push gate (like the `assert_landed` report-only
  → blocking pattern) is a decision for after it's proven non-flaky over real runs.
- Any change to production rendering code (`BlockRenderer`, `PdfBlock`, `email-head.ts`) — this
  build is test-only. No `data-block-id` or other test hooks are added to shared block components;
  isolation comes entirely from single-block fixtures, not from targeting elements inside a busier
  doc.
- A general "any two renders can be diffed" framework. This is a fixture-per-known-bug-class
  pattern, not a generic visual-regression harness.

## Verification

`bun test lib/pdf/__tests__/pdf-html-visual-parity.test.ts` — all layer-1/layer-2 assertions pass
locally (this repo's bun:test suite runs via local pre-push hooks per RULE 1; no generic
push-triggered GHA workflow for it was found, so "in CI" isn't asserted here without checking
where/whether this specific suite executes remotely). `bunx next build` (never bare `tsc`) to
confirm the new devDependencies don't break the production build (they shouldn't — nothing here
is imported outside test files). Live-verify `pdf_html_visual_parity_live_verify` closes once the
suite is green with the new file present and it has been run at least once on a machine other than
the one that built it, to catch any native-binary (`canvas`) install issue early.
