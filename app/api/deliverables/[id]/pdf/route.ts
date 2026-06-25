// GET/POST /api/deliverables/[id]/pdf — a real, downloadable PDF of a block-canvas
// email, rendered server-side through the single PDF root (lib/pdf). No browser
// print dialog; the bytes are also what the blast route attaches.
//
//  • GET  — render the SAVED `deliverables.doc` by id (durable link; used by the
//           Materials Hub row + any share context). Public-read like /p/[id],
//           but revoked/trashed deliverables 404.
//  • POST — render a doc passed in the body (the Email Lab's LIVE, maybe-unsaved
//           edits). Auth-gated to a signed-in user.
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { renderEmailDocToBuffer, pdfFilename } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

function fmtAsOf(ts: unknown): string | undefined {
  if (typeof ts !== "string") return undefined;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
}

/** A friendly filename seed from the doc's header/hero, else "report". */
function seedFromDoc(doc: { blocks: { type: string; props: Record<string, unknown> }[] }): string {
  for (const b of doc.blocks) {
    if (b.type === "header" && typeof b.props.companyName === "string") return b.props.companyName;
    if (b.type === "hero" && typeof b.props.value === "string") return b.props.value;
  }
  return "report";
}

function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceRoleClient();

  const { data } = await db
    .from("deliverables")
    .select("doc, status, deleted_at, data_as_of")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status === "revoked" || data.deleted_at) {
    return new Response("not found", { status: 404 });
  }

  const parsed = EmailDocSchema.safeParse(data.doc);
  if (!parsed.success) {
    return new Response("no PDF available for this deliverable", { status: 422 });
  }

  const buffer = await renderEmailDocToBuffer(parsed.data, { asOf: fmtAsOf(data.data_as_of) });
  return pdfResponse(buffer, pdfFilename(seedFromDoc(parsed.data)));
}

export async function POST(
  req: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> },
) {
  // Live-doc render (Email Lab download). Render whatever the signed-in editor has
  // on screen — independent of what's saved in the DB row.
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = EmailDocSchema.safeParse(body?.doc);
  if (!parsed.success) {
    return new Response("invalid email document", { status: 400 });
  }

  const buffer = await renderEmailDocToBuffer(parsed.data);
  return pdfResponse(buffer, pdfFilename(seedFromDoc(parsed.data)));
}
