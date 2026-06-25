// POST /api/projects/[id]/extract-pdf — read an uploaded PDF with Claude vision
// and patch the matching `file` item with `extracted_text` so every downstream
// build sees the flyer's real content, not just its file name.
//
// Vendor-First (verified in-session against platform.claude.com/.../pdf-support):
// a base64 inline `document` block is GA — it needs NO `anthropic-beta` header
// (that header is only for the Files API `file_id` source). Request cap is 32 MB;
// our uploads are ≤ 10 MB, so base64 (~13 MB) is well within. Model is Haiku 4.5
// (PDF-vision capable, ~5× cheaper than Sonnet; flyers are 1–2 pages).
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { projectItemsSchema, type ProjectItem } from "@/lib/project/items";
import { UPLOADS_BUCKET } from "@/lib/project/signed-upload-url";
import { getAnthropic, agentsAreMocked } from "@/refinery/agents/anthropic.mts";
import { parsePdfText, buildExtractionPrompt, EXTRACTION_MAX_TOKENS } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXTRACTION_MODEL = "claude-haiku-4-5";

/** Re-read the latest items and replace just the target item by id, so a
 *  concurrent edit elsewhere in the project isn't clobbered by a stale array. */
async function patchItemById(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  itemId: string,
  patch: Partial<Extract<ProjectItem, { kind: "file" }>>,
): Promise<void> {
  const { data: project } = await supabase
    .from("projects")
    .select("items")
    .eq("id", projectId)
    .maybeSingle();
  const parsed = projectItemsSchema.safeParse(project?.items);
  if (!parsed.success) return;
  const next = parsed.data.map((it) =>
    it.id === itemId && it.kind === "file" ? { ...it, ...patch } : it,
  );
  await supabase
    .from("projects")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const itemId = body?.item_id;
  if (!itemId || typeof itemId !== "string") {
    return NextResponse.json({ error: "item_id required" }, { status: 400 });
  }

  // RLS proves ownership — a non-owner's project is invisible (→ 404).
  const { data: project } = await supabase
    .from("projects")
    .select("items")
    .eq("id", id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const items = projectItemsSchema.safeParse(project.items);
  if (!items.success) {
    return NextResponse.json({ error: "invalid items" }, { status: 500 });
  }
  const item = items.data.find((it) => it.id === itemId);
  if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 });
  if (item.kind !== "file" || item.mime !== "application/pdf") {
    return NextResponse.json({ error: "item is not a PDF" }, { status: 400 });
  }

  // No model key (offline/dev) → Claude vision is unavailable, but a text-layer
  // PDF can still be read with zero API cost via pdf-parse. Try that first; only
  // image-only / unreadable PDFs fall through to "skipped".
  if (agentsAreMocked()) {
    try {
      const sr = createServiceRoleClient();
      const { data: fileData, error: dlErr } = await sr.storage
        .from(UPLOADS_BUCKET)
        .download(item.storage_path);
      if (!dlErr && fileData) {
        const bytes = Buffer.from(await fileData.arrayBuffer());
        const fb = await parsePdfText(bytes);
        if (fb && fb.text) {
          await patchItemById(supabase, id, itemId, {
            extracted_text: fb.text,
            extraction_status: "done",
          });
          return NextResponse.json({ status: "done", via: "pdf-parse" });
        }
      }
    } catch {
      // fall through to skipped — leave the item un-extracted
    }
    return NextResponse.json({ status: "skipped", reason: "extraction unavailable" });
  }

  await patchItemById(supabase, id, itemId, { extraction_status: "processing" });

  // Held outside the try so the downloaded bytes survive into the catch, where
  // the zero-cost pdf-parse text-layer fallback can reuse them.
  let pdfBytes: Buffer | null = null;

  try {
    // Private bucket → only the service role can read the object bytes.
    const sr = createServiceRoleClient();
    const { data: fileData, error: dlErr } = await sr.storage
      .from(UPLOADS_BUCKET)
      .download(item.storage_path);
    if (dlErr || !fileData) {
      throw new Error(`storage download failed: ${dlErr?.message ?? "no data"}`);
    }
    pdfBytes = Buffer.from(await fileData.arrayBuffer());
    const pdfBase64 = pdfBytes.toString("base64");

    const client = getAnthropic();
    const response = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: EXTRACTION_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: buildExtractionPrompt() },
          ],
        },
      ],
    });

    const extracted = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!extracted) throw new Error("model returned no text");

    await patchItemById(supabase, id, itemId, {
      extracted_text: extracted,
      extraction_status: "done",
    });
    return NextResponse.json({ status: "done" });
  } catch (err) {
    // Claude vision failed — try the zero-cost text-layer fallback on the bytes
    // we already downloaded. A text-layer PDF is still recoverable here.
    if (pdfBytes) {
      const fb = await parsePdfText(pdfBytes);
      if (fb && fb.text) {
        await patchItemById(supabase, id, itemId, {
          extracted_text: fb.text,
          extraction_status: "done",
        });
        return NextResponse.json({ status: "done", via: "pdf-parse" });
      }
    }
    const reason = err instanceof Error ? err.message : "extraction failed";
    await patchItemById(supabase, id, itemId, { extraction_status: "failed" });
    return NextResponse.json({ status: "failed", reason }, { status: 500 });
  }
}
