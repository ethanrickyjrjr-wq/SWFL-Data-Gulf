# Narrative PDF Path + unpdf Serverless Reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 12 files, keywords: schema, architecture

**Goal:** Every live deliverable id yields a PDF-shaped outcome (bytes, doc-report skin, or the empty-print degrade) — and the PDF text-layer fallback works on Vercel.

**Architecture:** Two route-level edits wire the narrative shape into the EXISTING doc-report skin (`/p/[id]/print`): the print route drops its email-only gate and serves every non-block-canvas row; the pdf-bytes route 307s docless rows to the print route. The two redirects are loop-proof because they branch on the SAME predicate (`EmailDocSchema.safeParse(doc)`) in opposite directions. Separately, `lib/pdf/extract.ts` swaps `pdf-parse` (stock pdfjs, needs `DOMMatrix`, dead on Vercel) for `unpdf` (serverless PDF.js build).

**Tech Stack:** Next.js App Router route handlers, bun:test with `mock.module`, zod (`EmailDocSchema`), `@react-pdf/renderer` (writer, untouched), `unpdf` (new reader).

**Spec:** `docs/superpowers/specs/2026-07-12-pdf-narrative-path-design.md`

## Global Constraints

- Verify with `bunx next build`, never `npx tsc`.
- `git add` explicit paths only — the index is shared with concurrent sessions. Never `git add -A`.
- Gate 1: the `package.json` change and `bun.lock` must be staged in the SAME commit (Task 1).
- No push in any task — commits stay local; push is operator-gated (Task 4 hands off).
- `parsePdfText` contract is frozen: bytes in → `{ text, pages }` or `null`, NEVER throws.
- The pdf route's POST handler (Email Lab live-doc render) is untouched.
- Blast attach gate (`include_pdf && template === "block-canvas"`) and all `/p/[id]` page buttons are untouched.
- Loop guard invariant: pdf route redirects to print ONLY when `EmailDocSchema.safeParse(doc)` FAILS; print route redirects to pdf ONLY when it SUCCEEDS.

---

### Task 1: Reader swap — `pdf-parse` → `unpdf` in `lib/pdf/extract.ts`

**Files:**
- Modify: `lib/pdf/extract.ts` (full rewrite below)
- Modify: `lib/pdf/__tests__/no-eager-pdfjs.test.ts:41,56-60`
- Create: `lib/pdf/__tests__/extract.test.ts`
- Modify: `lib/pdf/README.md:66-68` (vendor-facts bullet)
- Modify: `app/api/projects/[id]/extract-pdf/route.ts:98,166` (`via` label) + its pdf-parse comments
- Modify: `package.json` + `bun.lock` (remove pdf-parse, add unpdf)

**Interfaces:**
- Consumes: `renderEmailDocToBuffer(doc) → Promise<Buffer>` from `@/lib/pdf` (existing writer, used as the test fixture generator).
- Produces: `parsePdfText(data: ArrayBuffer | Uint8Array | Buffer) → Promise<{ text: string; pages: number } | null>` — signature unchanged; later tasks don't touch it.

- [ ] **Step 1: Swap the dependency and verify the installed surface (RULE 0.4)**

```bash
bun remove pdf-parse
bun add --exact unpdf
bun -e "const u = await import('unpdf'); console.log(typeof u.getDocumentProxy, typeof u.extractText)"
```

Expected: last command prints `function function`. Record the pinned version:

```bash
grep '"unpdf"' package.json
```

Expected: a line like `"unpdf": "1.3.2"` — use THIS exact version string in Step 6's README bullet. Confirm nothing else imports pdf-parse:

```bash
grep -rn --include='*.ts' --include='*.tsx' --include='*.mts' 'from "pdf-parse"\|import("pdf-parse")' lib app components scripts refinery
```

Expected: only `lib/pdf/extract.ts` (and `lib/pdf/__tests__/no-eager-pdfjs.test.ts` string matches).

- [ ] **Step 2: Write the failing round-trip test**

Create `lib/pdf/__tests__/extract.test.ts`:

```ts
// Writer→reader round-trip: the PDF our own writer emits must be readable by our
// own text-layer reader. This is the behavioural proof that the serverless reader
// actually extracts (the no-eager-pdfjs guard only proves it loads lazily).
import { test, expect } from "bun:test";
import type { EmailDoc } from "@/lib/email/doc/types";
import { renderEmailDocToBuffer, parsePdfText } from "@/lib/pdf";

const DOC: EmailDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "LATO_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [{ id: "t1", type: "text", props: { body: "UNPDFROUNDTRIP sentinel body" } }],
};

test("writer→reader round-trip extracts the text layer", async () => {
  const buf = await renderEmailDocToBuffer(DOC);
  const res = await parsePdfText(buf);
  expect(res).not.toBeNull();
  // Extraction may re-space glyph runs; compare space-stripped.
  expect(res!.text.replace(/\s+/g, "")).toContain("UNPDFROUNDTRIP");
  expect(res!.pages).toBeGreaterThanOrEqual(1);
});

test("garbage bytes → null, no throw", async () => {
  expect(await parsePdfText(new Uint8Array([9, 9, 9, 9]))).toBeNull();
});
```

- [ ] **Step 3: Run it — round-trip must FAIL (pdf-parse is gone; extract.ts still imports it)**

```bash
bun test lib/pdf/__tests__/extract.test.ts
```

Expected: FAIL — `parsePdfText` returns null (the lazy `import("pdf-parse")` now rejects), so the round-trip assertion fails.

- [ ] **Step 4: Rewrite `lib/pdf/extract.ts`**

Replace the whole file with:

```ts
// lib/pdf/extract.ts — the ONE text-layer extraction fallback (zero API cost).
//
// Used by /api/projects/[id]/extract-pdf when Claude vision fails or is skipped.
// Claude is still primary (it handles scanned/image-only PDFs that have no text
// layer); the text-layer read catches PDFs Claude missed, at no token cost.
//
// Engine: `unpdf` (unjs) — its bundled PDF.js is a SERVERLESS build (browser-specific
// references stripped, worker inlined), so unlike the stock `pdfjs-dist` that
// `pdf-parse` pulled in, it loads without DOMMatrix/ImageData/Path2D and therefore
// works in the Vercel serverless Node runtime. Verified in-session against the
// installed package + https://github.com/unjs/unpdf (RULE 0.4).
//
// LOADED LAZILY, ON PURPOSE — do not hoist this back to a module-scope import.
// `lib/pdf/index.ts` re-exports this file, and two routes behind that barrel only
// ever WRITE PDFs; a module-scope reader import is dead bundle weight for them and
// once took prod down when the reader couldn't load at all (see
// lib/pdf/__tests__/no-eager-pdfjs.test.ts — the guard that keeps this invariant).

export interface PdfTextResult {
  /** Concatenated document text (trimmed, non-empty). */
  text: string;
  /** Page count, from extractText's totalPages. */
  pages: number;
}

/**
 * Extract the text layer from a PDF. Returns `null` for image-only, encrypted,
 * or otherwise unreadable PDFs (Claude was right to leave those `failed`).
 */
export async function parsePdfText(
  data: ArrayBuffer | Uint8Array | Buffer,
): Promise<PdfTextResult | null> {
  const mod = await import("unpdf").catch(() => null);
  if (!mod) return null;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  let pdf: Awaited<ReturnType<typeof mod.getDocumentProxy>> | null = null;
  try {
    pdf = await mod.getDocumentProxy(bytes);
    const { totalPages, text } = await mod.extractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    if (!trimmed) return null;
    return { text: trimmed, pages: totalPages };
  } catch {
    return null;
  } finally {
    await pdf?.destroy().catch(() => {});
  }
}
```

- [ ] **Step 5: Update the guard test, then run the lib/pdf suite**

In `lib/pdf/__tests__/no-eager-pdfjs.test.ts`:

Line 41, replace:

```ts
  const BROWSER_ONLY = ["pdf-parse", "pdfjs-dist"];
```

with (pdf-parse stays on the list so it can never sneak back):

```ts
  const BROWSER_ONLY = ["unpdf", "pdf-parse", "pdfjs-dist"];
```

Replace the last test (lines 56–60) with:

```ts
  it("extract.ts still uses unpdf — lazily, inside the function", () => {
    const src = readFileSync(join(PDF_DIR, "extract.ts"), "utf8");
    expect(hasStaticImportOf(src, "unpdf")).toBe(false);
    expect(src).toContain('await import("unpdf")');
  });
```

Run:

```bash
bun test lib/pdf
```

Expected: ALL PASS (round-trip, garbage-bytes null, guard tests, existing email-doc-pdf tests including its `parsePdfText returns null for non-PDF bytes`).

- [ ] **Step 6: Update the vendor-facts bullet + the `via` labels**

In `lib/pdf/README.md`, replace the `pdf-parse@2.4.5` bullet (lines 66–68) with (substitute the exact version from Step 1):

```markdown
- **unpdf@<version-from-step-1>**: the text-layer reader. Bundles a SERVERLESS build of
  PDF.js (README: v5.6.205 — browser refs stripped, worker inlined), so it loads without
  `DOMMatrix` on Vercel. Surface: `getDocumentProxy(data: Uint8Array) → Promise<PDFDocumentProxy>`;
  `extractText(pdf, { mergePages: true }) → { totalPages, text: string }`; free via
  `pdf.destroy()`. Verified in-session: https://github.com/unjs/unpdf
```

Also update line 23's capability row if it names pdf-parse (`extract.ts` → `parsePdfText` stays; engine name only).

In `app/api/projects/[id]/extract-pdf/route.ts`: change both `via: "pdf-parse"` response values (lines 98 and 166) to `via: "text-layer"`, and reword the three comments that name pdf-parse (lines 81–83, 109–110, 157–158) to say "text-layer fallback (unpdf)". No logic changes.

- [ ] **Step 7: Commit (Gate 1: lockfile rides along)**

```bash
git add lib/pdf/extract.ts lib/pdf/__tests__/extract.test.ts lib/pdf/__tests__/no-eager-pdfjs.test.ts lib/pdf/README.md "app/api/projects/[id]/extract-pdf/route.ts" package.json bun.lock
git commit -m "feat(pdf): swap pdf-parse for unpdf — text-layer fallback now loads on Vercel serverless" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `/p/[id]/print` serves every deliverable shape

**Files:**
- Modify: `app/p/[id]/print/route.ts:43-45` (+ row type, + one import)
- Create: `app/p/[id]/print/route.test.ts`

**Interfaces:**
- Consumes: `buildEmailDeliverableModel(row) → GroundedReportModel | null` (accepts EVERY narrative row — reads only `items_snapshot + narrative + scope`, never branches on template); `renderGroundedReport(model, { skin: "pdf" }) → Promise<string>`; `EmailDocSchema` from `@/lib/email/doc/schema`.
- Produces: GET behavior Task 3's redirect target relies on — narrative/corrupt-doc rows → 200 HTML; parseable block-canvas rows → 307 to `/api/deliverables/[id]/pdf`.

- [ ] **Step 1: Write the failing route test**

Create `app/p/[id]/print/route.test.ts`:

```ts
// Mirrors the mock-module posture of app/api/deliverables/[id]/trash/route.test.ts.
import { test, expect, mock, beforeEach } from "bun:test";

const narrative = {
  exec_summary: "Cape Coral inventory is rising into summer.",
  sections: [{ title: "Overview", intro: "Listings climbed through June." }],
  inference_notes: [],
};

const baseRow = {
  template: "market-overview",
  status: "active",
  deleted_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
  scope_kind: null,
  scope_value: null,
  items_snapshot: [] as unknown[],
  narrative,
  doc: null as unknown,
};

// Minimal doc that PASSES EmailDocSchema (globalStyle required; blocks min 1; id minted).
const VALID_DOC = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "LATO_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [{ type: "text", props: { body: "Hello" } }],
};

let row: Record<string, unknown> | null = { ...baseRow };
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            row ? { data: row, error: null } : { data: null, error: { message: "not found" } },
        }),
      }),
    }),
  }),
}));

const { GET } = await import("./route");
const req = new Request("http://localhost/p/d1/print");
const params = { params: Promise.resolve({ id: "d1" }) };

beforeEach(() => {
  row = { ...baseRow };
});

test("a narrative template renders the doc-report skin — the email-only 422 is gone", async () => {
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(await res.text()).toContain("window.print()");
});

test("the email template still renders (regression)", async () => {
  row = { ...baseRow, template: "email" };
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("window.print()");
});

test("block-canvas with a parseable doc redirects to its real bytes route", async () => {
  row = { ...baseRow, template: "block-canvas", doc: VALID_DOC };
  const res = await GET(req, params);
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/api/deliverables/d1/pdf");
});

test("block-canvas with a corrupt doc does NOT redirect — loop pin", async () => {
  row = { ...baseRow, template: "block-canvas", doc: { blocks: [] } };
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("window.print()");
});

test("a contentless narrative row serves the empty degrade page, not an error", async () => {
  row = {
    ...baseRow,
    narrative: { exec_summary: "", sections: [], inference_notes: [] },
  };
  const res = await GET(req, params);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("no content to print yet");
});

test("revoked → 404", async () => {
  row = { ...baseRow, status: "revoked" };
  expect((await GET(req, params)).status).toBe(404);
});

test("trashed → 404", async () => {
  row = { ...baseRow, deleted_at: "2026-07-10T00:00:00.000Z" };
  expect((await GET(req, params)).status).toBe(404);
});
```

- [ ] **Step 2: Run it — the narrative/block-canvas/degrade tests must FAIL against the email-only gate**

```bash
bun test "app/p/[id]/print/route.test.ts"
```

Expected: FAIL — narrative, block-canvas, and contentless tests get 422 (`print skin is available for email deliverables only`); the email regression + 404 tests pass.

- [ ] **Step 3: Implement — replace the email-only gate**

In `app/p/[id]/print/route.ts`:

Add to the imports:

```ts
import { EmailDocSchema } from "@/lib/email/doc/schema";
```

Widen the row type on the select (line 37) so `doc` is readable:

```ts
    .single<EmailDeliverableRow & { status: string; deleted_at: string | null; doc: unknown }>();
```

Replace lines 43–45:

```ts
  if (data.template !== "email") {
    return new NextResponse("print skin is available for email deliverables only", { status: 422 });
  }
```

with:

```ts
  // block-canvas WITH a parseable doc → its real bytes path. The parse check is the
  // loop guard: /api/deliverables/[id]/pdf redirects HERE only when this exact parse
  // FAILS, so the two redirects can never cycle. Every other live row — all six
  // narrative templates, plus a block-canvas row whose doc is corrupt — falls through
  // to the doc-report skin below.
  if (data.template === "block-canvas" && EmailDocSchema.safeParse(data.doc).success) {
    return NextResponse.redirect(new URL(`/api/deliverables/${id}/pdf`, req.url), 307);
  }
```

Rename the handler's first parameter from `_req` to `req` (it is now used) and update the docblock's first lines to say the route is the letter-size PDF skin of ANY narrative deliverable (block-canvas redirects to its bytes route) — not "email" only.

- [ ] **Step 4: Run the tests — all pass**

```bash
bun test "app/p/[id]/print/route.test.ts"
```

Expected: 7 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add "app/p/[id]/print/route.ts" "app/p/[id]/print/route.test.ts"
git commit -m "feat(pdf): /p/[id]/print serves every deliverable shape — doc-report skin for all narrative templates" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `GET /api/deliverables/[id]/pdf` — 307 to the print skin instead of 422

**Files:**
- Modify: `app/api/deliverables/[id]/pdf/route.ts:50-62` (GET only)
- Create: `app/api/deliverables/[id]/pdf/route.test.ts`

**Interfaces:**
- Consumes: Task 2's print-route behavior (redirect target `/p/[id]/print` renders 200 for any docless row).
- Produces: GET invariant for the live probe in Task 4 — parseable doc → `%PDF` bytes; anything else live → 307 `Location: /p/<id>/print`; revoked/trashed/missing → 404. The 422 is gone from GET.

- [ ] **Step 1: Write the failing route test**

Create `app/api/deliverables/[id]/pdf/route.test.ts`:

```ts
// Mirrors the mock-module posture of app/api/deliverables/[id]/trash/route.test.ts.
// GET only — POST (Email Lab live-doc render) is out of scope for this build.
import { test, expect, mock, beforeEach } from "bun:test";

const VALID_DOC = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "LATO_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [{ type: "text", props: { body: "Hello" } }],
};

const baseRow = {
  doc: null as unknown,
  status: "active",
  deleted_at: null as string | null,
  data_as_of: "2026-07-01T00:00:00.000Z",
  template: "market-overview",
};

let row: Record<string, unknown> | null = { ...baseRow };
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row }) }),
      }),
    }),
  }),
}));
mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));

const { GET } = await import("./route");

function makeReq() {
  return new Request("http://localhost/api/deliverables/d1/pdf") as Parameters<typeof GET>[0];
}
const params = { params: Promise.resolve({ id: "d1" }) };

beforeEach(() => {
  row = { ...baseRow };
});

test("a narrative row 307s to the print skin — no more 422", async () => {
  const res = await GET(makeReq(), params);
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/p/d1/print");
});

test("a corrupt-doc block-canvas row also 307s (print route owns the fallback)", async () => {
  row = { ...baseRow, template: "block-canvas", doc: { blocks: [] } };
  const res = await GET(makeReq(), params);
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/p/d1/print");
});

test("a block-canvas row with a parseable doc still returns real PDF bytes", async () => {
  row = { ...baseRow, template: "block-canvas", doc: VALID_DOC };
  const res = await GET(makeReq(), params);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  const buf = new Uint8Array(await res.arrayBuffer());
  expect(new TextDecoder("latin1").decode(buf.subarray(0, 4))).toBe("%PDF");
});

test("missing row → 404", async () => {
  row = null;
  expect((await GET(makeReq(), params)).status).toBe(404);
});

test("revoked → 404", async () => {
  row = { ...baseRow, status: "revoked" };
  expect((await GET(makeReq(), params)).status).toBe(404);
});

test("trashed → 404", async () => {
  row = { ...baseRow, deleted_at: "2026-07-10T00:00:00.000Z" };
  expect((await GET(makeReq(), params)).status).toBe(404);
});
```

- [ ] **Step 2: Run it — the two 307 tests must FAIL (route currently 422s)**

```bash
bun test "app/api/deliverables/[id]/pdf/route.test.ts"
```

Expected: FAIL — both redirect tests receive 422; bytes + 404 tests pass.

- [ ] **Step 3: Implement — select `template`, replace the 422 with the redirect**

In `app/api/deliverables/[id]/pdf/route.ts`, GET only. Change the select (line 52):

```ts
    .select("doc, status, deleted_at, data_as_of, template")
```

Replace lines 59–62:

```ts
  const parsed = EmailDocSchema.safeParse(data.doc);
  if (!parsed.success) {
    return new Response("no PDF available for this deliverable", { status: 422 });
  }
```

with:

```ts
  const parsed = EmailDocSchema.safeParse(data.doc);
  if (!parsed.success) {
    // No parseable doc → this deliverable's PDF is the doc-report print skin.
    // Complement of the print route's guard (it redirects HERE only when this exact
    // parse SUCCEEDS on a block-canvas row), so the pair can never cycle. Covers all
    // six narrative templates AND a block-canvas row with a corrupt doc — every live
    // id yields a PDF-shaped outcome; only revoked/trashed/missing 404.
    return Response.redirect(new URL(`/p/${id}/print`, req.url), 307);
  }
```

Rename GET's first parameter from `_req` to `req` (now used) and update both uses. Update the file's top docblock: GET no longer 422s — docless rows redirect to `/p/[id]/print`.

- [ ] **Step 4: Run the tests — all pass**

```bash
bun test "app/api/deliverables/[id]/pdf/route.test.ts"
```

Expected: 6 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add "app/api/deliverables/[id]/pdf/route.ts" "app/api/deliverables/[id]/pdf/route.test.ts"
git commit -m "feat(pdf): GET /api/deliverables/[id]/pdf 307s docless rows to the print skin — 422 retired" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification + ledger prep (push stays operator-gated)

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md` (sync this build's line)

**Interfaces:**
- Consumes: all three prior commits.
- Produces: a push-ready branch state + the exact live-probe commands the operator runs post-deploy.

- [ ] **Step 1: Full local gates**

```bash
bun test lib/pdf "app/p/[id]/print" "app/api/deliverables/[id]/pdf"
bunx next build
```

Expected: all tests pass; build completes with no type errors. If `next build` flags anything in the touched routes, fix within this task before proceeding.

- [ ] **Step 2: SESSION_LOG entry + build-queue sync**

Append a top-of-file SESSION_LOG entry (what changed: unpdf swap, print-route universal skin, pdf GET redirect; loop-guard note; what's next: operator push → deploy → live probes → close `narrative_deliverable_no_pdf_path` + `pdf_narrative_path_live_verify`). Sync `_AUDIT_AND_ROADMAP/build-queue.md`. Commit both:

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(session-log): narrative PDF path + unpdf reader built — awaiting operator push + live verify" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Hand off to operator — DO NOT PUSH**

Show `git log --oneline` of the new commits and give the operator the post-deploy probe script (run against prod AFTER they push via `node scripts/safe-push.mjs` and Vercel deploys):

```bash
# narrative id (pick one from the 17 — e.g. from the 07/11 probe list):
curl -sI "https://www.swfldatagulf.com/api/deliverables/<narrative-id>/pdf" | grep -i "HTTP\|location"
# expect: 307 + location: /p/<narrative-id>/print
curl -sI "https://www.swfldatagulf.com/p/<narrative-id>/print" | grep -i "HTTP\|content-type"
# expect: 200 + text/html

# block-canvas id (regression):
curl -s "https://www.swfldatagulf.com/api/deliverables/<block-canvas-id>/pdf" | head -c 4
# expect: %PDF
```

Then close both checks with that evidence:

```bash
node scripts/check.mjs close narrative_deliverable_no_pdf_path
node scripts/check.mjs close pdf_narrative_path_live_verify
```

(Checks are prod evidence — close only after the probes above return the expected values, never from the dev run alone. The extraction fallback lane can't be forced live without a Claude failure; its evidence is the round-trip unit test + the serverless build loading — record that honestly in the log, don't overclaim.)
