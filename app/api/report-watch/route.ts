// app/api/report-watch/route.ts — POST: store a Why Isn't It Selling watch.
// Thin by design: parse the form, validate in the store, 303 back to the report with a
// banner param. "exists" reads as saved (same email already tracks this home — the
// outcome the user asked for). NO email is sent here — the sender is dark until
// wins_watch_email_live closes.
import { NextResponse, type NextRequest } from "next/server";
import { createWatch, validateWatchInput } from "@/lib/why-not-selling/watch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData().catch(() => null);
  const record: Record<string, unknown> = {};
  if (form) for (const [k, v] of form.entries()) record[k] = v;

  const input = validateWatchInput(record);
  const q = typeof record.q === "string" ? record.q : "";
  const dest = new URL("/r/why-isnt-it-selling", req.url);
  if (q) dest.searchParams.set("q", q);

  if (!input) {
    dest.searchParams.set("watch", "invalid");
    return NextResponse.redirect(dest, 303);
  }
  const out = await createWatch(input);
  dest.searchParams.set("watch", out === "error" ? "error" : "saved");
  return NextResponse.redirect(dest, 303);
}
