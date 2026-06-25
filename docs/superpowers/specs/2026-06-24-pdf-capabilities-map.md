# PDF Capabilities Map — Problems, Use Cases & Library Decisions

**Date:** 2026-06-24  
**Author:** Research session (crawl4ai + full codebase audit)  
**Status:** Reference / decision guide — not a build plan  

---

## What `pdftoppm` is (and why it doesn't work here)

`pdftoppm` is a CLI binary from the **Poppler** library that rasterizes PDF pages to images (PNG/PPM/JPEG). You call it like `pdftoppm -png input.pdf output` and it writes `output-1.png`, `output-2.png`, etc.

**It cannot run on Vercel** — it's a native system binary. Vercel's Linux sandbox doesn't have Poppler installed, you can't `apt-get` at runtime, and bundling the compiled binary bloats the function and isn't officially supported.

**It cannot run in the browser** — native binary, no WASM build available.

Same problem applies to `pdf2pic` (requires `graphicsmagick` + `ghostscript`) and `puppeteer`/`playwright` (headless Chrome). All three require system-level installation that Vercel Fluid Compute doesn't support.

---

## What we already have (audited from code)

| Capability | Status | Where |
|---|---|---|
| AI reads PDF content (text extraction) | ✅ LIVE | `app/api/projects/[id]/extract-pdf/route.ts` — Claude vision base64 |
| Extracted text in deliverable narrative | ✅ LIVE | `lib/deliverable/build.ts` — `[N] DOCUMENT — {content}` |
| Extracted text in conversation AI | ✅ LIVE | `lib/assistant/conversation-path.ts` — `buildUploadsBlock()` |
| PDF inline preview in project board | ✅ LIVE | `app/project/[id]/workspace/ItemDetail.tsx` — `<object>` embed |
| Deliverable → PDF via browser print | ✅ LIVE | `app/p/[id]/print/route.ts` — `window.print()` auto-trigger |
| Upload + store PDF files | ✅ LIVE | `components/project/UploadDrop.tsx` → Supabase Storage |
| Email blast with deliverable content | ✅ SPEC (2026-06-18) | `docs/superpowers/plans/2026-06-18-pdf-email-blast.md` |
| PDF as email visual template | ❌ DEFERRED | `GET DONE/pdf-template-and-user-data-token.md` |
| Server-side PDF render to image | ❌ NOT BUILT | See library map below |
| Server-side PDF generation (not print) | ❌ NOT BUILT | `pdf-lib` or `@react-pdf/renderer` |

---

## Library map — what each does, Vercel compatibility

### `pdfjs-dist` v6.0.227 — **THE right choice for most things**

- Mozilla's PDF.js pre-built distribution
- Pure JavaScript / WASM — zero native binary deps
- **Works on Vercel** (Node.js functions), **works in browser**
- 20M+ weekly downloads, actively maintained
- Can do:
  - **Text extraction** — `getTextContent()` page by page
  - **Render page to canvas** → convert to PNG (this is the `pdftoppm` equivalent without the binary)
  - **Get page dimensions**, metadata, outline
- Cons: not optimized for table extraction; large bundle (~2.5MB) so lazy-load or server-only

```ts
// Server-side page → image (pdftoppm equivalent, works on Vercel)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { createCanvas } from 'canvas'; // node-canvas, also pure-JS

const doc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: 2.0 });
const canvas = createCanvas(viewport.width, viewport.height);
const ctx = canvas.getContext('2d');
await page.render({ canvasContext: ctx as any, viewport }).promise;
const pngBuffer = canvas.toBuffer('image/png');
```

- Needs `node-canvas` for server-side canvas (pure C bindings, but pre-built binaries exist for modern Node — works on Vercel)

### `react-pdf` v10.4.1 — **browser PDF viewer component**

- Wraps `pdfjs-dist` in React components (`<Document>`, `<Page>`)
- Client-side only — renders pages to canvas in the browser
- Better than our current `<object>` embed: controls, page navigation, text selection, search
- No server support
- Use for: the project board inline viewer upgrade, edit lab PDF panel

```tsx
import { Document, Page } from 'react-pdf';

<Document file={signedUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
  <Page pageNumber={currentPage} width={600} />
</Document>
```

### `pdf-parse` v2.4.5 — **pure-JS text extraction**

- Newer package (not the dead 1.x version), pure TypeScript, browser + Node
- Extracts: text, images, tables, metadata, document info
- Good for: when you DON'T want to use a Claude API call for extraction (cost-sensitive, bulk processing)
- Fallback: use this when Claude vision fails or times out on large PDFs
- Note: Claude vision is BETTER for scanned/image PDFs — `pdf-parse` only works on text-layer PDFs

```ts
import { PDFParse } from 'pdf-parse';
const parser = new PDFParse({ buffer: pdfBuffer });
const result = await parser.getText();
// result.text, result.images, result.tables
```

### `pdf-lib` v1.17.1 — **create and modify PDFs programmatically**

- Pure JS, works anywhere (Node, browser, Deno, React Native)
- Can: create PDFs from scratch, merge PDFs, add pages, embed fonts/images, fill forms
- Cannot: render pages as images, extract text
- Use for: generating a real PDF from our deliverable HTML (server-side, pixel-stable, no browser needed)

### `@react-pdf/renderer` — **generate PDF from React components (JSX → PDF)**

- Different from `react-pdf` (which DISPLAYS PDFs)
- Write JSX, get a PDF file out — like printing but server-side and pixel-stable
- Works on Vercel, no binaries needed
- Use for: the "email me the PDF" flow, generating a PDF deliverable without requiring the user's browser

### `pdf2pic` — **DO NOT USE on Vercel**

- Requires `graphicsmagick` + `ghostscript` system binaries
- Same problem as `pdftoppm` — native binary, no Vercel support
- Only valid in a Docker container or dev machine where you can `apt-get install`

### `puppeteer` / `playwright` — **DO NOT USE on Vercel for PDF**

- Headless Chrome — only viable as a Vercel separate service or external lambda
- Way overkill for PDF-to-image; massively oversized for Vercel functions
- Reserve for: screenshot-based visual regression tests only

---

## Use cases — right tool for each

### 1. AI reads PDF content correctly

**Current:** Claude vision (base64 inline) via `extract-pdf/route.ts` → `extracted_text` stored on `ProjectItem`  
**Status:** ✅ LIVE AND WORKING  
**Problem:** Fails on password-protected PDFs (returns `extraction_status: "failed"`). Also doesn't know what's a table vs body text — just flat extraction.  
**Enhancement:** Add `pdf-parse` as fallback when Claude extraction fails (scanned PDFs need Claude; text-layer PDFs can use `pdf-parse` at near-zero cost).  
**Another gap:** The extraction prompt doesn't distinguish between a property flyer (want: address, price, sq ft, description) vs a market report (want: headline stats, table data, date). A smarter prompt that detects document type first would improve results.

### 2. PDF preview in the browser

**Current:** `<object data={url} type="application/pdf" style={{ height: "260px" }}>` in `ItemDetail.tsx`  
**Status:** ✅ Works but limited — no page controls, no text selection, blocked on mobile Safari, doesn't work for cross-origin PDFs  
**Better:** `react-pdf` (`<Document>` + `<Page>`) — gives controls, page navigation, text selection, search. Works cross-browser. Needs lazy import to keep bundle size down.  
**Use cases where preview matters:**  
- Project board: see the PDF inline without leaving the page ← current `<object>` works OK here  
- Email lab: user uploads a property flyer → wants to see it while composing the email → needs page-by-page viewer  
- Deliverable detail (`/p/[id]`): "here's the source document this email was built from"

### 3. Convert PDF pages to images (the `pdftoppm` use case)

**Why you'd want it:** Embed a page of a PDF as an image in an email (can't use CSS/PDFs in email clients), generate a thumbnail for the Materials Hub card, show a "page 1 preview" in the project board without loading the whole PDF.  
**How to do it on Vercel:**  
- Server-side: `pdfjs-dist` (text render to canvas) + `node-canvas` → PNG buffer → Supabase Storage → serve as image
- Browser-side: `react-pdf` renders to canvas → call `canvas.toDataURL()` → you have your PNG
- `pdftoppm` and `pdf2pic` are NOT options here

```ts
// Server route: POST /api/projects/[id]/items/[itemId]/thumbnail
// → downloads PDF from Storage → pdfjs renders page 1 → PNG → uploads to thumbnail bucket → returns URL
```

**Use cases:**
- Materials Hub card thumbnail (show page 1 of a property flyer as the card image)
- Email embed: "include first page of this PDF as an image in the email body"
- Bulk preview generation at upload time (background job)

### 4. Generate a pixel-stable PDF deliverable (server-side, no browser)

**Current:** `window.print()` route — user's browser triggers a print dialog, they save as PDF  
**Problem:** Not automatable. Can't be emailed. Requires the user to be present and know how to use "Save as PDF" in their print dialog. Also browser print fidelity varies.  
**Better for email delivery:** `@react-pdf/renderer` — takes JSX, produces a real `.pdf` file that can be attached to an email or stored in Supabase Storage.  
**Better for HTML-accurate render:** `puppeteer` running as a separate Vercel Function (or external service) that visits `/p/[id]/print` and prints to PDF. More work to set up but pixel-perfect.  
**Current plan (2026-06-07 spec):** Keep `window.print()` as v1 — deliberate. Server PDF adds a dep. Defer until "email me the PDF" demand exists. This is still the right call.

### 5. PDF as a visual template (fill with data, regenerate)

**Current:** Not built. Listed in `GET DONE/pdf-template-and-user-data-token.md`  
**Use case:** Agent has a branded listing flyer PDF template. Data tokens like `{{price}}`, `{{address}}`, `{{sq_ft}}` are in the PDF. User fills in new property data, system regenerates the PDF with the new values.  
**Library:** `pdf-lib` — can load an existing PDF, read form fields or text positions, overwrite values, save new PDF.  
**Complexity:** High. PDF text fields need to be real fillable PDF form fields (not just rendered text at a pixel position). If the template is a Canva/InDesign export with embedded text, `pdf-lib` can't easily target specific text to replace. The right architecture is: template stored as a fillable PDF form + `pdf-lib` fills the form fields.

### 6. User files a PDF from a report page

**Current:** `useFiler()` + `dispatchAddItem()` event → works ON the project page but SILENTLY FAILS off it  
**Status:** Bug. Planned fix in `2026-06-23-filing-charts-suggestions-pdf.md` Task 1  
**Fix:** `POST /api/projects/[id]/add-item` — already specced and coded in the plan doc above  

### 7. PDF in email body (email lab use case)

**Use cases:**
- Show extracted text in the email AI context so the email content matches the PDF ← ✅ LIVE
- Embed a PDF page as an inline image in the email HTML ← NOT BUILT (needs page-to-PNG conversion)
- Attach the PDF file to the email ← NOT BUILT (Resend supports attachments)
- Link to PDF stored in Supabase ← already possible, signed URL in email

**The "embed as image" path:**  
`POST /api/projects/[id]/items/[itemId]/thumbnail` → pdfjs renders page 1 → PNG → stored in a `thumbnails` bucket (public, no expiry) → URL embeds in email `<img src="...">`.

### 8. Cross-document library / "Document Library"

**Status:** Deferred in `GET DONE/pdf-template-and-user-data-token.md`  
**Use case:** User uploads a listing agreement once, can reference it across multiple projects  
**What's needed:** `documents` table (user-level, not project-level) + move `extracted_text` to document level + `ProjectItem.kind: "doc_ref"` that points to a document ID instead of embedding the file

---

## Decision matrix

| Need | Best library | Works on Vercel | Works in browser | Native deps |
|---|---|---|---|---|
| Extract text from PDF | Claude vision (current) OR `pdf-parse` (fallback) | ✅ | ✅ | None |
| Display PDF pages | `react-pdf` (wraps pdfjs-dist) | N/A | ✅ | None |
| Render PDF page → PNG on server | `pdfjs-dist` + `node-canvas` | ✅ | N/A | node-canvas pre-built |
| Render PDF page → PNG in browser | `react-pdf` canvas export | N/A | ✅ | None |
| Create PDF from scratch | `@react-pdf/renderer` (JSX→PDF) OR `pdf-lib` | ✅ | ✅ | None |
| Modify/fill existing PDF | `pdf-lib` | ✅ | ✅ | None |
| Thumbnail for project card | `pdfjs-dist` + `node-canvas` server-side | ✅ | N/A | node-canvas pre-built |
| "Save as PDF" user action | `window.print()` (current) | N/A | ✅ | None (browser built-in) |
| pdftoppm equivalent | `pdfjs-dist` + `node-canvas` | ✅ | N/A | node-canvas pre-built |
| Attach PDF to email | Resend `attachments` param | ✅ | N/A | None |

---

## Problems / gaps to solve (prioritized)

### P0 — already planned, just not shipped

- **Filing off-project-page fails silently** → Task 1 in `2026-06-23-filing-charts-suggestions-pdf.md`

### P1 — real and blocking email lab value

- **No PDF thumbnail generation** → user can't see which PDF is which in Materials Hub; email can't embed a page image
- **PDF preview broken on mobile Safari** → `<object>` is blocked; `react-pdf` fixes this

### P2 — extraction quality

- **Single flat extraction prompt** → works OK but loses table structure; a "detect doc type first" step would improve email drafting from market reports vs property flyers
- **No `pdf-parse` fallback** → if Claude extraction fails (timeout, quota), item is stuck at `extraction_status: "failed"` with no recovery path
- **Large PDFs hit token limits** → 20-page market report = 30k-60k tokens; no page-chunking logic exists

### P3 — nice to have

- **No PDF attachment in email blast** → Resend supports `attachments: [{ filename, content }]`; just need to fetch from Storage and pass through
- **No server-side PDF generation** → `window.print()` is fine for now, but "send me the PDF" demand will arrive
- **No PDF template fill** → high complexity, deferred correctly

---

## Recommended next additions (not a plan, just order of value)

1. **`react-pdf` for browser preview** — drop-in upgrade to `<object>` in `ItemDetail.tsx`. Add `react-pdf` package, lazy-import the `<Document>/<Page>` component, add page controls. Fixes mobile Safari. Low risk.

2. **PDF thumbnail route** — `POST /api/projects/[id]/items/[itemId]/thumbnail`. Uses `pdfjs-dist` (server import) + `node-canvas`. Fires at upload time alongside `extract-pdf`. Uploads PNG to a `thumbnails` Supabase bucket (public). Returns URL stored in a new `thumbnail_url` field on the `file` item. Unlocks Materials Hub cards and email image embeds.

3. **`pdf-parse` fallback extraction** — if Claude extraction returns `status: "failed"`, auto-retry with `pdf-parse` for text-layer PDFs. Costs nothing (no API call). Add as a second step in the extraction route.

4. **Resend attachment support** — add `attachments` support to the blast route. Let user opt in to "include PDF as attachment" when blasting. Needs: fetch file from Storage → base64 encode → pass to `resend.batch.send()`.

---

## Notes on current Claude vision approach

The existing `extract-pdf/route.ts` uses `anthropic-beta: files-api-2025-04-14` header. This was the beta header — **verify this is still the correct header** before the next extraction work. The current model is `claude-sonnet-4-6`. This is correct (as of 2026-06-24 knowledge; claude-haiku-4-5 would be cheaper for extraction but lower accuracy on complex layouts).

Password-protected PDFs: correctly returns `extraction_status: "failed"` — no fix possible without the password.

Scanned PDFs (image-only, no text layer): Claude vision handles these; `pdf-parse` cannot. This is a key advantage of the Claude approach over pure-JS text parsing.
