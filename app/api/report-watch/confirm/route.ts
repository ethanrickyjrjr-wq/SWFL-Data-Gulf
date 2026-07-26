// app/api/report-watch/confirm/route.ts — GET ?token=: stamp confirmed_at.
// Plain-text by design (a link target, not a page). Note the confirmation EMAIL that
// carries this link does not send yet — dark until wins_watch_email_live closes.
import { type NextRequest } from "next/server";
import { confirmWatch } from "@/lib/why-not-selling/watch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = await confirmWatch(token);
  return new Response(ok ? "Confirmed." : "That link isn't valid.", {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
