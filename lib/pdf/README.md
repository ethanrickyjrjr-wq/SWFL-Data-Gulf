# `lib/pdf` — the single PDF root

**Why this exists:** PDF logic used to be smeared across ~12 files, so a fix on one
page silently missed the same bug on another. This directory is the ONE place every
PDF concern lives. Same discipline as `lib/citations/clean-url.ts` (citations) and
the gulf-teal single-token sweep.

> **PDF issue? Start here.** Find the capability in the map below → it names the one
> root module that owns it and **every** surface that consumes it. Fix the root, fix
> every page.

---

## The map

| Capability | Root module (owns it) | Consumer surfaces (import the root) |
|---|---|---|
| **EmailDoc → PDF layout** (all 10 block types) | `email-doc-pdf.tsx` → `EmailDocPdf` | `render.ts` only — never reimplement a block here |
| **EmailDoc → PDF bytes** (server) | `render.ts` → `renderEmailDocToBuffer`, `pdfFilename` | `app/api/deliverables/[id]/pdf/route.ts` (download), `app/api/deliverables/[id]/blast/route.ts` (attach) |
| **Inline PDF viewer** (browser) | `PdfViewer.tsx` | `app/project/[id]/workspace/ItemDetail.tsx` |
| **PDF → PNG thumbnail** (browser capture) | `PdfCapture.tsx` | `components/project/UploadDrop.tsx` → `app/api/projects/[id]/items/[itemId]/thumbnail/route.ts` |
| **pdf.js worker config** | `pdfjs-worker.ts` | imported by `PdfViewer` + `PdfCapture` (side-effect) |
| **PDF text extraction fallback** | `extract.ts` → `parsePdfText` | `app/api/projects/[id]/extract-pdf/route.ts` |
| **Extraction prompt / sizing** | `doc-type.ts` → `buildExtractionPrompt`, `EXTRACTION_MAX_TOKENS` | `app/api/projects/[id]/extract-pdf/route.ts` |

Server/shared exports come from `@/lib/pdf` (the barrel). The two browser
components are imported by **direct path** (`@/lib/pdf/PdfViewer`,
`@/lib/pdf/PdfCapture`) and lazy-loaded with `next/dynamic({ ssr: false })` — pdfjs
has no `DOMMatrix` in Node, so it must never render server-side.

## Send / attach surfaces (consume the root indirectly)

A block-canvas email (`deliverables.template = "block-canvas"`, populated `doc`)
is sent/downloaded from where it actually lives — **not** `/p/[id]` (that route
redirects block-canvas to the Email Lab):

- **Email Lab toolbar** — `components/email-lab/EmailLabGridShell.tsx`: "Download PDF"
  (POSTs the live doc to the pdf route) + "Send to contacts". (Was `EmailLabShell.tsx`
  until the 2026-07-07 retire-block-shell pass deleted it.)
- **Materials Hub row** — `components/project/MaterialRow.tsx`: compact "Send".
- **Contact picker** — `components/contacts/ContactPickerModal.tsx`: the
  `Attach PDF report` checkbox (`include_pdf`), block-canvas only.

## Legacy print paths (NOT this root — browser `window.print()`)

These predate the root and render HTML, not `EmailDoc` PDF. Left as-is:

- `app/p/[id]/print/route.ts` + `components/PrintButton.tsx` — report deliverables.
- `lib/email/grounded-report.ts` (`skin: "pdf"`) — the "email" template print skin.

---

## Pinned vendor facts (verified in-session against installed packages — RULE 0.4)

Do not re-litigate these from memory; they were read from the installed SDK/types.

- **Resend** (`resend@6`): `resend.batch.send()` payload is
  `Omit<CreateEmailOptions, 'attachments'>` — **batch cannot attach files**. The
  attach-PDF path therefore sends per-recipient via `resend.emails.send()`, whose
  `Attachment.content` accepts a raw `Buffer` (no base64 needed).
- **@react-pdf/renderer@4.5.1**: `renderToBuffer(element) → Promise<Buffer>`. Listed
  in `next.config.ts` `serverExternalPackages`. Built-in fonts only
  (Helvetica / Times-Roman) — `EmailDocPdf` maps the doc font family onto those.
- **react-pdf@10.4.1** → bundles **pdfjs-dist@5.4.296**. Worker file is
  `pdfjs-dist/build/pdf.worker.min.mjs` (ESM). Browser-only.
- **pdf-parse@2.4.5**: import `{ PDFParse } from "pdf-parse"` (the **main** export —
  `pdf-parse/node` only exports `getHeader`). `new PDFParse({ data: bytes })` (field
  is `data`, not `buffer`); `getText() → { text, pages, total }`; call `destroy()`.

## Invariants

1. A new `EmailBlock` type → add a `case` in `email-doc-pdf.tsx` (the `never`
   guard fails the build otherwise — the PDF can never silently drop a block kind).
2. PDF bytes are produced **only** through `renderEmailDocToBuffer`. No route calls
   `renderToBuffer` directly.
3. The pdf.js worker is set **only** in `pdfjs-worker.ts`.
