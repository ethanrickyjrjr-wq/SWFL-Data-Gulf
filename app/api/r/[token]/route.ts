// /api/r/<token> — the per-link click redirect. A wrapped email link points here; we
// decode the self-describing signed token, 302 the recipient to its real destination,
// and best-effort log a `clicked` row. ZERO database READ on the success path (the token
// carries everything), and the redirect happens whether or not the logging write does —
// a broken analytics write must never dead-end a recipient (link-click-routing design).
//
// Note: `/api/r/*`, NOT `/r/*` — the `/r` namespace is already the report-page surface
// (app/r/[slug] et al.), which would 404 a token slug.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { resolveTrackedRedirect, type TrackedRedirect } from "@/lib/email/tracked-links/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}

/** Fire-and-forget: caught + swallowed so a failed insert never fails the redirect. */
async function logClick(log: NonNullable<TrackedRedirect["log"]>): Promise<void> {
  try {
    const db = createServiceRoleClient();
    await db.from("link_events").insert({
      event_type: "clicked",
      recipient_id: log.ctx.rid,
      campaign_id: log.ctx.cid,
      step: log.ctx.step,
      button_key: log.ctx.bk,
      destination_url: log.dest,
      channel: log.ctx.ch,
    });
  } catch (err) {
    console.error(
      `[link-redirect] clicked-log failed (redirect still served): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  const { location, log } = resolveTrackedRedirect(token, { siteOrigin: siteOrigin(req) });
  if (log) await logClick(log);
  return NextResponse.redirect(location, { status: 302 });
}
