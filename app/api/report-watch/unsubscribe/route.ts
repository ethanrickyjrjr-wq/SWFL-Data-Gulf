// app/api/report-watch/unsubscribe/route.ts — GET ?token=: stamp unsubscribed_at.
// One click, idempotent, plain text. Ends the (future) watch emails for this home.
import { type NextRequest } from "next/server";
import { unsubscribeWatch } from "@/lib/why-not-selling/watch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = await unsubscribeWatch(token);
  return new Response(ok ? "Unsubscribed." : "That link isn't valid.", {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
