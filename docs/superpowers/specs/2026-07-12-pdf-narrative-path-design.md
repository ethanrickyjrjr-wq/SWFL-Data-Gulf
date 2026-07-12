# Narrative PDF path via doc-report skin + unpdf serverless reader

**Date:** 2026-07-12
**Check:** `pdf_narrative_path_live_verify`
**Closes:** `narrative_deliverable_no_pdf_path` (after live verify)

## Problem

Two PDF gaps, both surfaced by the 07/11 outage audit (`docs/audit/2026-07-11-where-we-land.md`)
and the follow-up live probe (SESSION_LOG 07/11):

1. **17 of 37 live deliverables are the narrative shape** (template ∈ market-overview /
   bov-lite / client-email / one-pager / email / social — `doc` null) and have **no server
   PDF path**. `GET /api/deliverables/[id]/pdf` 422s for them (honest, not a crash), because
   it only renders a parseable `EmailDocSchema` doc. The doc-report PDF skin that already
   exists (`/p/[id]/print`, grounded spine `skin:"pdf"`, letter @page, watermark, autoprint)
   is gated to `template === "email"` only — the other five narrative templates get a bare
   browser `PrintButton` and nothing at the API.
2. **The zero-cost PDF text-layer fallback is dead in prod.** `lib/pdf/extract.ts` uses
   `pdf-parse`, which pulls stock `pdfjs-dist` — it needs `DOMMatrix`/`ImageData`/`Path2D`,
   absent in the Vercel serverless Node runtime. The lazy-import fix (`8a7f780b`) stopped the
   reader from killing the writer routes, but the reader itself still degrades to `null` on
   Vercel forever: any Claude-vision failure on a text-layer PDF is a silent extraction loss.

## Decisions (operator-approved 07/12)

- **Narrative shape → doc-report skin for all.** Routing fix, not a new render engine.
  - *Declined:* de-scope narrative shapes from PDF entirely (keeps the promise half-broken);
    real server bytes via a second react-pdf layout (multi-day build; only needed if narrative
    sends must ATTACH a PDF — they don't today, and the blast gate stays block-canvas-only).
- **Reader → swap `pdf-parse` for `unpdf`.** unpdf (unjs) ships a serverless build of PDF.js
  with browser-specific references stripped, the worker inlined, and polyfills — built to run
  where `DOMMatrix` doesn't exist (it targets Cloudflare Workers), and its README names itself
  the successor to `pdf-parse`. Source verified in-session via crawl4ai (RULE 0.4):
  https://github.com/unjs/unpdf — README states the bundled serverless PDF.js is v5.6.205.
  - *Declined:* off-route extraction worker (new moving part, added latency; Claude vision is
    primary on-route and works on Vercel); leaving the fallback dead (silent prod losses).

## What we're building

### 1. `/p/[id]/print` serves every deliverable shape

`app/p/[id]/print/route.ts`:

- Drop the `template !== "email"` → 422 gate.
- **block-canvas with a parseable doc** → 307 redirect to `/api/deliverables/[id]/pdf`
  (its real bytes path). The parse check happens HERE (import `EmailDocSchema`) — see the
  loop guard below.
- **Everything else** (all narrative templates, plus a block-canvas row whose doc fails to
  parse) → render through the existing doc-report skin exactly as `email` does today:
  `buildEmailDeliverableModel(row)` → `renderGroundedReport(model, { skin: "pdf" })` +
  autoprint. The builder already accepts every narrative row — it reads only
  `items_snapshot + narrative + scope`, never branches on template.
- Null model (no figures AND no prose) → the existing empty-content 200 degrade page, unchanged.
- Revoked / trashed / missing → 404, unchanged.

### 2. `GET /api/deliverables/[id]/pdf` never strands a live deliverable

`app/api/deliverables/[id]/pdf/route.ts` (GET only; POST — the Email Lab live-doc path —
untouched):

- Select `template` in addition to the current columns.
- Parseable doc → PDF bytes, unchanged.
- Unparseable/null doc AND `template !== "block-canvas"` → **307 redirect to `/p/[id]/print`**.
- Unparseable doc AND `template === "block-canvas"` → also 307 to `/p/[id]/print` (the print
  route's parse-guard means it will NOT bounce back — it falls through to the doc-report skin
  or the empty degrade page).
- The 422 disappears from GET. New invariant: **every live deliverable id yields a PDF-shaped
  outcome (bytes, doc-report skin, or the empty-print degrade); only revoked/trashed/missing
  404.**

**Loop guard (the one sharp edge):** the two redirects point at each other. They can never
cycle because the conditions are complementary on the SAME predicate — the pdf route redirects
only when `EmailDocSchema.safeParse(doc)` FAILS; the print route redirects only when it
SUCCEEDS. A corrupt-doc block-canvas row goes pdf → print → doc-report skin render, full stop.
A test pins this.

### 3. Explicitly de-scoped (stated, not silent)

- **PDF attachments stay block-canvas-only.** Blast route gate
  (`include_pdf && template === "block-canvas"`) and the ContactPickerModal checkbox are
  untouched. Browser print cannot produce attachment bytes; that is the declined
  "real server bytes" build, revisit only if narrative sends need attachments.
- **`/p/[id]` page affordances unchanged.** Non-email narrative pages keep their
  `PrintButton` (window.print preserves the richer template-specific layout); the email
  template keeps its "Save as PDF" → `/p/[id]/print` link. This build is route-level only.

### 4. Reader swap: `pdf-parse` → `unpdf` in `lib/pdf/extract.ts`

- `parsePdfText` keeps its exact contract — bytes in → `{ text, pages }` or `null`, never
  throws — and swaps the engine:
  `await import("unpdf")` (lazy, `.catch(() => null)` preserved) →
  `getDocumentProxy(bytes)` → `extractText(pdf, { mergePages: true })` → `{ totalPages, text }`;
  proxy `.destroy()` in `finally`.
- RULE 0.4 at implementation: re-verify the export names and destroy() surface against the
  INSTALLED package (node_modules), not just the README, before writing the code. Pin the
  exact installed version in `lib/pdf/README.md`'s vendor-facts block, replacing the
  `pdf-parse` bullet.
- `pdf-parse` removed from `package.json` (`lib/pdf/extract.ts` is its only importer —
  re-grep before removal). `bun install` + stage `bun.lock` in the same push (Gate 1).
- **Guard test extended:** `lib/pdf/__tests__/no-eager-pdfjs.test.ts` adds `unpdf` to the
  forbidden static-import list. The writer-never-loads-the-reader invariant holds even though
  unpdf CAN load serverless — it's still dead weight for the two write-only routes.
- Comment rewrite in `extract.ts`: the "merely loading pdfjs throws on Vercel" rationale
  becomes historical; the lazy import stays for bundle weight + the guard invariant, and the
  null-degrade contract stays for genuinely unreadable PDFs.

## Tests

- **Print route:** narrative template (e.g. `market-overview`) → 200 HTML containing
  doc-report skin markers; block-canvas with valid doc → 307 to the pdf route; block-canvas
  with corrupt doc → 200 doc-report/degrade (NO redirect — loop pin); revoked → 404.
- **PDF GET:** narrative row → 307 with `Location: /p/<id>/print`; block-canvas row →
  `application/pdf` bytes starting `%PDF`; corrupt-doc block-canvas row → 307 (and the
  follow-up print request 200s — loop pin from the other side).
- **Reader:** fixture text-layer PDF → non-null `{ text, pages }`; garbage bytes → null;
  guard test red if anyone hoists a static `unpdf`/`pdf-parse`/`pdfjs` import behind the barrel.

## Verification & ledger

1. Local: `bun test lib/pdf` + route tests + `bunx next build` (never `npx tsc`).
2. Deploy, then live-probe prod: one narrative id — `GET /api/deliverables/<id>/pdf` → 307 →
   `/p/<id>/print` 200 HTML; one block-canvas id — bytes with `%PDF` magic. (The extraction
   fallback lane can't be forced live without a Claude failure; its evidence is the unit
   fixture + the fact the serverless build loads — record that honestly, don't overclaim.)
3. Close `narrative_deliverable_no_pdf_path` and `pdf_narrative_path_live_verify` with the
   prod probe evidence (checks are prod evidence, not dev attestation).
4. SESSION_LOG entry + build-queue sync in the same push.
