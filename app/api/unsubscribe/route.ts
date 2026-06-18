// /api/unsubscribe?id=<contact_id> — STATELESS. No auth, no cookies: mail clients
// (Gmail one-click via List-Unsubscribe-Post) and recipients hit this directly.
// Service-role flips `unsubscribed=true` on the contact; a blast then excludes it.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";

async function unsubscribe(contactId: string | null): Promise<void> {
  if (!contactId) return;
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("contacts").update({ unsubscribed: true }).eq("id", contactId);
  } catch {
    // Never surface an error to the unsubscriber — best-effort is enough.
  }
}

// Gmail's one-click List-Unsubscribe-Post sends a POST.
export async function POST(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  await unsubscribe(id);
  return new NextResponse("unsubscribed", { status: 200 });
}

// A recipient clicking the footer link sends a GET — confirm in plain HTML.
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  await unsubscribe(id);
  return new NextResponse(
    '<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center">' +
      "<h2>You've been unsubscribed.</h2><p>You won't receive further emails from this sender.</p>" +
      "</body></html>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
