/**
 * app/p/[id]/print/route.ts — the letter-size PDF skin of ANY narrative deliverable.
 *
 * GET /p/<id>/print → the SAME frozen model as /p/<id> (buildEmailDeliverableModel over
 * items_snapshot + narrative + persisted scope — it never branches on template), rendered
 * through the grounded spine with `skin:"pdf"` (the `doc-report` shell: letter @page, no
 * CTA, watermark). An auto-print script fires window.print() on load so the browser's
 * "Save as PDF" dialog opens directly. A block-canvas row redirects to its real bytes
 * route instead (/api/deliverables/[id]/pdf), so this URL yields a PDF-shaped outcome
 * for EVERY live deliverable. Public-by-slug, mirroring the /p/[id] page (revoked → 404).
 *
 * Deliverable-keyed on purpose: NOT app/api/projects/[id]/print (project-keyed, a
 * different concern owned elsewhere). No collision; no auth needed beyond the unguessable
 * slug, exactly like the deliverable page.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import {
  buildEmailDeliverableModel,
  type EmailDeliverableRow,
} from "@/lib/deliverable/email-deliverable";
import { renderGroundedReport } from "@/lib/email/grounded-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTOPRINT =
  "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceRoleClient();

  const { data, error } = await db
    .from("deliverables")
    .select("*")
    .eq("id", id)
    .single<EmailDeliverableRow & { status: string; deleted_at: string | null; doc: unknown }>();

  if (error || !data) return new NextResponse("not found", { status: 404 });
  if (data.status === "revoked") return new NextResponse("not found", { status: 404 });
  // Trashed (FINAL BOSS Piece 4 soft-delete): don't serve a PDF for a deleted row.
  if (data.deleted_at) return new NextResponse("not found", { status: 404 });
  // block-canvas WITH a parseable doc → its real bytes path. The parse check is the
  // loop guard: /api/deliverables/[id]/pdf redirects HERE only when this exact parse
  // FAILS, so the two redirects can never cycle. Every other live row — all six
  // narrative templates, plus a block-canvas row whose doc is corrupt — falls through
  // to the doc-report skin below.
  if (data.template === "block-canvas" && EmailDocSchema.safeParse(data.doc).success) {
    return NextResponse.redirect(new URL(`/api/deliverables/${id}/pdf`, req.url), 307);
  }

  const model = buildEmailDeliverableModel(data);
  if (!model) {
    // After the any-grain change, a null model means NO CONTENT (no figures AND no prose) —
    // not "no ZIP". Mirror the /p/[id] page's graceful degrade instead of refusing: a
    // content-bearing email of any grain yields a model, so this only hits a truly empty one.
    const empty = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Deliverable</title><style>@page{size:letter;margin:1in;}body{font-family:system-ui,-apple-system,sans-serif;padding:2rem;color:#333;}</style></head><body><p>This deliverable has no content to print yet.</p>${AUTOPRINT}</body></html>`;
    return new NextResponse(empty, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  let html = await renderGroundedReport(model, { skin: "pdf" });
  html = html.includes("</body>")
    ? html.replace("</body>", `${AUTOPRINT}</body>`)
    : html + AUTOPRINT;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
