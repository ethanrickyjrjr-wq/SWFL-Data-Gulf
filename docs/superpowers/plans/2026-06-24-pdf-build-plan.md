# PDF Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 11 files, keywords: schema

**Goal:** Full PDF capability — blast block-canvas emails, generate real PDFs, attach as option, browser viewer, thumbnails, extraction fallback.

**Install first:** `bun add @react-pdf/renderer@4.5.1 react-pdf@10.4.1 pdf-parse@2.4.5`

**Stack:** `@react-pdf/renderer` v4.5.1 (`renderToBuffer` → `Promise<Buffer>`). Resend `attachments: [{ content: Buffer, filename: string }]` — raw Buffer, no base64 needed (verified against resend-node SDK source). `pdf-parse` v2.4.5 by Mehmet Kozan — Node ≥20, has `pdf-parse/node` export. `react-pdf` v10.4.1 — browser viewer, wraps its own pdfjs-dist.

---

## Global Constraints

- `react-hooks/set-state-in-effect` is a hard lint error — use set-state-during-render
- Never `git add -A` — stage explicit paths only
- `bun test` before every push, `bunx next build` to catch TS errors
- SESSION_LOG entry required before every push
- No new branches — work on `main`

---

## File Map

### Created
- `lib/email/pdf/EmailDocPdf.tsx` — react-pdf layout component for EmailDoc blocks
- `app/api/deliverables/[id]/pdf/route.ts` — GET → PDF buffer download
- `app/api/projects/[id]/items/[itemId]/thumbnail/route.ts` — stores browser-captured PNG

### Modified
- 🔴 `app/api/deliverables/[id]/blast/route.ts` — T1 (block-canvas) + T4 (PDF attachment option)
- `components/contacts/ContactPickerModal.tsx` — T4 (attach PDF checkbox)
- `app/p/[id]/page.tsx` — T5 (Download PDF button)
- `app/api/projects/[id]/extract-pdf/route.ts` — T6 (pdf-parse fallback)
- `app/project/[id]/workspace/ItemDetail.tsx` — T7a (react-pdf viewer) + T7e (thumbnail display)
- `lib/project/items.ts` — T7b (thumbnail_url field)
- `components/project/UploadDrop.tsx` — T7d (capture thumbnail at upload)

---

## Task 1 — Fix block-canvas blast (broken today)

**Root cause:** `app/api/deliverables/[id]/blast/route.ts:79` hardcodes `template !== "email"` — rejects every block-canvas deliverable built in Email Lab. `deliverables.doc` (JSONB) is live (`20260624_materials_hub.sql:12`), `select("*")` picks it up, just needs the render branch.

**Files:**
- 🔴 Modify: `app/api/deliverables/[id]/blast/route.ts`

- [ ] **Step 1: Write failing test**

```ts
// Append to existing blast route test or create app/api/deliverables/[id]/blast/route.test.ts
it("accepts block-canvas template", async () => {
  // mock deliverable with template: "block-canvas", doc: validEmailDoc
  // expect POST to not return 400 "deliverable is not an email"
});
```

- [ ] **Step 2: Replace the template guard**

`app/api/deliverables/[id]/blast/route.ts` — replace lines 79–84:

```ts
// Before:
if (deliverable.template !== "email") {
  return NextResponse.json({ error: "deliverable is not an email" }, { status: 400 });
}

// After:
const BLASTABLE = ["email", "block-canvas"];
if (!BLASTABLE.includes(deliverable.template)) {
  return NextResponse.json({ error: "deliverable is not sendable" }, { status: 400 });
}
```

- [ ] **Step 3: Add block-canvas render branch**

Replace the existing render block (lines ~109–124) with:

```ts
import type { EmailDoc } from "@/lib/email/doc/types";

let baseHtml: string;

if (deliverable.template === "block-canvas" && deliverable.doc) {
  const { render } = await import("@react-email/render");
  const { EmailDocEmail } = await import("@/lib/email/blocks/EmailDocRenderer");
  baseHtml = await render(EmailDocEmail({ doc: deliverable.doc as EmailDoc }));
} else {
  const model = buildEmailDeliverableModel(deliverable, { siteOrigin: BASE_URL });
  if (model) {
    baseHtml = await renderGroundedReport(model, { skin: "email" });
  } else {
    baseHtml =
      `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px">` +
      `<p style="font-size:16px;color:#111">Your market report is ready.</p>` +
      `<p><a href="${escAttr(webUrl)}" style="display:inline-block;background:#3DC9C0;color:#fff;` +
      `padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Report</a></p>` +
      `</body></html>`;
  }
}
```

- [ ] **Step 4: Verify**

`bun test` — existing blast tests pass, new block-canvas test passes. `bunx next build` clean.

---

## Task 2 — PDF layout component

**Root cause:** Nothing generates a PDF buffer from an `EmailDoc`. This component is the shared primitive used by T3 (download route) and T4 (blast attachment).

**Files:**
- Create: `lib/email/pdf/EmailDocPdf.tsx`

- [ ] **Step 1: Create the component**

```tsx
// lib/email/pdf/EmailDocPdf.tsx
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { EmailDoc, EmailBlock } from "@/lib/email/doc/types";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", backgroundColor: "#ffffff", padding: 40 },
  header: { marginBottom: 16, borderBottom: "1px solid #eeeeee", paddingBottom: 12 },
  hero: { marginBottom: 20 },
  heroValue: { fontSize: 28, fontWeight: "bold" },
  heroLabel: { fontSize: 12, color: "#666666", marginTop: 4 },
  heroProse: { fontSize: 11, color: "#333333", marginTop: 8, lineHeight: 1.5 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCell: { flex: 1, padding: 10, backgroundColor: "#f8f8f8", borderRadius: 4 },
  statValue: { fontSize: 18, fontWeight: "bold" },
  statLabel: { fontSize: 10, color: "#666666", marginTop: 2 },
  signal: { padding: 12, backgroundColor: "#f0fafa", marginBottom: 16, borderRadius: 4 },
  text: { fontSize: 11, color: "#333333", lineHeight: 1.6, marginBottom: 12 },
  footer: { marginTop: 24, borderTop: "1px solid #eeeeee", paddingTop: 10, fontSize: 9, color: "#999999" },
});

function PdfBlock({ block, doc }: { block: EmailBlock; doc: EmailDoc }) {
  const accent = doc.globalStyle.accentColor;
  switch (block.type) {
    case "header":
      return (
        <View style={s.header}>
          {block.props.companyName && (
            <Text style={{ fontSize: 14, fontWeight: "bold", color: accent }}>
              {block.props.companyName}
            </Text>
          )}
          {block.props.tagline && (
            <Text style={{ fontSize: 10, color: "#666666" }}>{block.props.tagline}</Text>
          )}
        </View>
      );
    case "hero":
      return (
        <View style={s.hero}>
          {block.props.kicker && (
            <Text style={{ fontSize: 10, color: accent, textTransform: "uppercase" }}>
              {block.props.kicker}
            </Text>
          )}
          {block.props.value && <Text style={s.heroValue}>{block.props.value}</Text>}
          {block.props.label && <Text style={s.heroLabel}>{block.props.label}</Text>}
          {block.props.prose && <Text style={s.heroProse}>{block.props.prose}</Text>}
        </View>
      );
    case "stats":
      return (
        <View style={s.statsRow}>
          {block.props.stats.map((stat, i) => (
            <View key={i} style={s.statCell}>
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      );
    case "signal":
      return (
        <View style={s.signal}>
          {block.props.title && (
            <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>
              {block.props.title}
            </Text>
          )}
          {block.props.body && <Text style={s.text}>{block.props.body}</Text>}
        </View>
      );
    case "text":
      return <Text style={s.text}>{block.props.body ?? ""}</Text>;
    case "image":
      return block.props.url ? (
        <Image src={block.props.url} style={{ width: "100%", marginBottom: 12 }} />
      ) : null;
    case "footer":
      return (
        <View style={s.footer}>
          <Text>{block.props.companyName ?? ""}</Text>
          {block.props.address && <Text>{block.props.address}</Text>}
        </View>
      );
    default:
      return null;
  }
}

export function EmailDocPdf({ doc }: { doc: EmailDoc }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {doc.blocks.map((block) => (
          <PdfBlock key={block.id} block={block} doc={doc} />
        ))}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Verify it imports cleanly**

`bunx next build` — no TS errors on the new file.

---

## Task 3 — PDF download route

**Root cause:** No server endpoint to get a PDF file from a deliverable. Window.print() requires the user to be in a browser and manually save.

**Files:**
- Create: `app/api/deliverables/[id]/pdf/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/deliverables/[id]/pdf/route.ts
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { EmailDocPdf } from "@/lib/email/pdf/EmailDocPdf";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceRoleClient();

  const { data } = await db.from("deliverables").select("*").eq("id", id).single();
  if (!data) return new Response("not found", { status: 404 });
  if (data.status === "revoked") return new Response("not found", { status: 404 });
  if (data.deleted_at) return new Response("not found", { status: 404 });

  const parsed = EmailDocSchema.safeParse(data.doc);
  if (!parsed.success) return new Response("no PDF available for this deliverable", { status: 422 });

  const buffer = await renderToBuffer(createElement(EmailDocPdf, { doc: parsed.data }));

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
```

Note: `createElement` not JSX — same pattern as `email-lab/render/route.ts` line 29.

- [ ] **Step 2: Verify**

`bunx next build` clean.

---

## Task 4 — PDF attachment option in blast + modal

**Root cause:** No way to attach a PDF to a blast email. Resend takes `attachments: [{ content: Buffer, filename: string }]` — verified against resend-node SDK source. User opt-in only (default off — attachments increase email size).

**Files:**
- 🔴 Modify: `app/api/deliverables/[id]/blast/route.ts`
- Modify: `components/contacts/ContactPickerModal.tsx`
- Modify: `app/p/[id]/SendToContactsHandle.tsx`

- [ ] **Step 1: Wire PDF generation into the blast route**

In `app/api/deliverables/[id]/blast/route.ts`, after the `baseHtml` block is built, add:

```ts
import { createElement } from "react";

// After baseHtml is assigned:
const includePdf =
  body?.include_pdf === true &&
  deliverable.template === "block-canvas" &&
  deliverable.doc;

let pdfBuffer: Buffer | null = null;
if (includePdf) {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { EmailDocPdf } = await import("@/lib/email/pdf/EmailDocPdf");
  pdfBuffer = await renderToBuffer(
    createElement(EmailDocPdf, { doc: deliverable.doc as EmailDoc }),
  );
}
```

In the messages map, add the attachment when present:

```ts
const messages = batch.map((c) => {
  const unsubUrl = `${BASE_URL}/api/unsubscribe?id=${c.id}`;
  return {
    from,
    to: [c.email],
    subject,
    html: withFooter(baseHtml, webUrl, unsubUrl),
    ...(replyTo ? { replyTo } : {}),
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    ...(pdfBuffer
      ? { attachments: [{ content: pdfBuffer, filename: "report.pdf" }] }
      : {}),
  };
});
```

- [ ] **Step 2: Pass `isBlockCanvas` into the modal**

`app/p/[id]/SendToContactsHandle.tsx` — add prop and pass through:

```tsx
export function SendToContactsHandle({
  deliverableId,
  isBlockCanvas,
}: {
  deliverableId: string;
  isBlockCanvas: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="...">
        Send to contacts
      </button>
      {open && (
        <ContactPickerModal
          deliverableId={deliverableId}
          isBlockCanvas={isBlockCanvas}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

Update the call site in `app/p/[id]/page.tsx` to pass `isBlockCanvas={deliverable.template === "block-canvas"}`.

- [ ] **Step 3: Add checkbox to ContactPickerModal**

`components/contacts/ContactPickerModal.tsx`:

Add `isBlockCanvas: boolean` to the `Props` interface.

Add state: `const [attachPdf, setAttachPdf] = useState(false);`

After the subject `<input>` (line 125), add:

```tsx
{isBlockCanvas && (
  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
    <input
      type="checkbox"
      checked={attachPdf}
      onChange={(e) => setAttachPdf(e.target.checked)}
      className="h-4 w-4 accent-gulf-teal"
    />
    Attach PDF report
  </label>
)}
```

In `handleSend` (line 57), update the body:

```ts
body: JSON.stringify({
  contact_ids: Array.from(selected),
  ...(subject.trim() ? { subject: subject.trim() } : {}),
  ...(attachPdf ? { include_pdf: true } : {}),
}),
```

- [ ] **Step 4: Verify**

`bun test` — existing blast tests pass. `bunx next build` clean.

---

## Task 5 — Download PDF button on /p/[id]

**Root cause:** No way to download a PDF from a deliverable page without the browser print dialog.

**Files:**
- Modify: `app/p/[id]/page.tsx`

- [ ] **Step 1: Add the button**

Find where `<DeliveryButtons>` and the print button are rendered. For block-canvas deliverables add alongside them:

```tsx
{deliverable.template === "block-canvas" && (
  <a
    href={`/api/deliverables/${deliverable.id}/pdf`}
    download
    className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-gray-300 hover:border-white/20 hover:text-white"
  >
    Download PDF
  </a>
)}
```

- [ ] **Step 2: Verify**

`bunx next build` clean. Visit a block-canvas deliverable, click Download PDF, confirm file downloads.

---

## Task 6 — pdf-parse fallback extraction

**Root cause:** When Claude extraction fails (`extraction_status: "failed"`), text-layer PDFs are permanently stuck. `pdf-parse/node` handles text-layer PDFs at zero API cost. Claude handles scanned/image PDFs; pdf-parse catches the rest.

**Files:**
- Modify: `app/api/projects/[id]/extract-pdf/route.ts`

- [ ] **Step 1: Write failing test**

In the extract-pdf test (or create one): mock a Claude failure response → verify the item ends up with `extraction_status: "done"` after the fallback fires.

- [ ] **Step 2: Add the fallback**

After the block that patches `extraction_status: "failed"`, add:

```ts
import { PDFParse } from "pdf-parse/node";

// ... after patching failed status:
try {
  const parser = new PDFParse({ buffer: pdfBuffer });
  const { text } = await parser.getText();
  if (text?.trim()) {
    await patchItemById(supabase, id, itemId, {
      extracted_text: text.trim(),
      extraction_status: "done",
    });
  }
} catch {
  // Encrypted or image-only — Claude was right, leave as failed
}
```

Note: `pdfBuffer` is already in scope — fetched earlier for the Claude call.

- [ ] **Step 3: Verify**

`bun test` — fallback test passes. `bunx next build` clean.

---

## Task 7 — react-pdf browser viewer + PDF thumbnail

**Root cause:** `<object>` embed is dead on mobile Safari and can't do cross-origin PDFs. No visual thumbnail for filed PDF files in the project board.

**Files:**
- Modify: `app/project/[id]/workspace/ItemDetail.tsx`
- Modify: `lib/project/items.ts`
- Create: `app/api/projects/[id]/items/[itemId]/thumbnail/route.ts`
- Modify: `components/project/UploadDrop.tsx`

### T7a — react-pdf viewer

- [ ] **Step 1: Add CSS imports**

In `app/layout.tsx` or the project workspace layout:
```ts
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
```

- [ ] **Step 2: Replace `<object>` in ItemDetail.tsx**

Lines 202–231 — replace the PDF render block:

```tsx
import dynamic from "next/dynamic";
import { useState, useRef } from "react";

const { Document, Page } = dynamic(
  () => import("react-pdf").then((m) => ({ default: m })),
  { ssr: false },
);

// In the PDF case:
const [numPages, setNumPages] = useState(0);
const [pageNum, setPageNum] = useState(1);

return (
  <div>
    {url ? (
      <>
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          className="w-full rounded border border-white/10 overflow-hidden"
        >
          <Page pageNumber={pageNum} width={480} />
        </Document>
        {numPages > 1 && (
          <div className="mt-2 flex items-center gap-3 text-xs text-white/50">
            <button
              disabled={pageNum <= 1}
              onClick={() => setPageNum((p) => p - 1)}
              className="disabled:opacity-30"
            >
              ←
            </button>
            <span>{pageNum} / {numPages}</span>
            <button
              disabled={pageNum >= numPages}
              onClick={() => setPageNum((p) => p + 1)}
              className="disabled:opacity-30"
            >
              →
            </button>
          </div>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-[11px] text-gulf-teal underline underline-offset-2"
        >
          Open PDF
        </a>
      </>
    ) : (
      <p className="text-sm text-gray-500 italic">{item.caption || "Attachment"} (unavailable)</p>
    )}
    <p className="mt-1 text-[11px] text-gray-500">Provided by agent</p>
    <FrozenSnapshotNote filedAt={item.added_at} />
  </div>
);
```

### T7b — thumbnail_url schema field

- [ ] **Step 1: Add field to items.ts**

`lib/project/items.ts` — in the `file` kind object (after `extraction_status`):
```ts
thumbnail_url: z.string().optional(),
```

### T7c — thumbnail storage route

- [ ] **Step 1: Run SQL for the bucket**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Public read thumbnails"
ON storage.objects FOR SELECT
USING (bucket_id = 'thumbnails');

CREATE POLICY "Service role insert thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'thumbnails');
```

- [ ] **Step 2: Create the route**

`app/api/projects/[id]/items/[itemId]/thumbnail/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { projectItemsSchema } from "@/lib/project/items";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: project } = await supabase
    .from("projects").select("items").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { dataUrl } = await req.json();
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "invalid dataUrl" }, { status: 400 });
  }

  const base64 = dataUrl.replace("data:image/png;base64,", "");
  const buffer = Buffer.from(base64, "base64");
  const storagePath = `${user.id}/${itemId}.png`;

  const admin = createServiceRoleClient();
  const { error: uploadError } = await admin.storage
    .from("thumbnails")
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from("thumbnails").getPublicUrl(storagePath);

  // Patch the item
  const parsed = projectItemsSchema.safeParse(project.items);
  if (!parsed.success) return NextResponse.json({ error: "invalid items" }, { status: 500 });
  const next = parsed.data.map((it) =>
    it.id === itemId && it.kind === "file" ? { ...it, thumbnail_url: publicUrl } : it,
  );
  await supabase.from("projects").update({ items: next }).eq("id", id);

  return NextResponse.json({ url: publicUrl });
}
```

### T7d — capture thumbnail at upload time

- [ ] **Step 1: Add off-screen renderer to UploadDrop**

`components/project/UploadDrop.tsx` — after a PDF file item is created and `extract-pdf` fires:

```tsx
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

const PdfCapture = dynamic(() => import("./PdfCapture"), { ssr: false });
```

Create `components/project/PdfCapture.tsx`:

```tsx
"use client";
import { useRef } from "react";
import { Document, Page } from "react-pdf";

interface Props {
  url: string;
  projectId: string;
  itemId: string;
  onDone: () => void;
}

export function PdfCapture({ url, projectId, itemId, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <div style={{ position: "absolute", left: -9999, top: -9999, width: 400, height: 1 }}>
      <Document file={url}>
        <Page
          pageNumber={1}
          width={400}
          canvasRef={canvasRef}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          onRenderSuccess={() => {
            const dataUrl = canvasRef.current?.toDataURL("image/png");
            if (!dataUrl) { onDone(); return; }
            fetch(`/api/projects/${projectId}/items/${itemId}/thumbnail`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ dataUrl }),
            }).finally(onDone);
          }}
        />
      </Document>
    </div>
  );
}
```

In `UploadDrop.tsx`, mount `<PdfCapture>` after a PDF upload completes, unmount when `onDone` fires.

### T7e — show thumbnail in ItemDetail

- [ ] **Step 1: Display thumbnail above viewer**

`app/project/[id]/workspace/ItemDetail.tsx` — in the PDF case, above the `<Document>`:

```tsx
{item.thumbnail_url && (
  <img
    src={item.thumbnail_url}
    alt="Page 1 preview"
    className="mb-2 w-full rounded border border-white/10 object-contain"
    style={{ maxHeight: 200 }}
  />
)}
```

- [ ] **Step 2: Verify end-to-end**

Upload a PDF → thumbnail appears in ItemDetail → `bunx next build` clean.

---

## Execution Order

```
T1  →  ship (unblocks block-canvas blast, standalone)
T2  →  T3  →  T4  →  T5  (PDF generation chain)
T6  (standalone, any time — just adds fallback to extract-pdf)
T7a →  T7b →  T7c →  T7d →  T7e  (thumbnail chain, react-pdf already installed after T2)
```

T1 and T6 are fully independent. T2 must land before T3, T4, T5. T7 sub-tasks are sequential but independent of the PDF generation chain — start after `bun add` installs react-pdf (part of the T2 install).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 4 | `app/api/deliverables/[id]/blast/route.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
