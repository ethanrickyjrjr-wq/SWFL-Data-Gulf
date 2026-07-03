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

// Cold-outreach recipients (Increment 2) carry ?rid=<outreach_recipients.id> instead of
// ?id=. Flip their status to 'unsubscribed' (the drip runner's shouldSend then excludes
// them) and log the event for our internal numbers. Best-effort, same as above.
async function unsubscribeOutreach(rid: string | null): Promise<void> {
  if (!rid) return;
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("outreach_recipients")
      .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
      .eq("id", rid);
    await supabase.from("outreach_events").insert({ recipient_id: rid, event: "unsubscribed" });
  } catch {
    // best-effort
  }
}

// Weekly-read subscribers (Lane D) carry ?wid=<weekly_read_subscribers.id>. Flip
// status to 'unsubscribed' (the weekly runner's shouldSend then excludes them).
// Best-effort, same contract as the branches above.
async function unsubscribeWeeklyRead(wid: string | null): Promise<void> {
  if (!wid) return;
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("weekly_read_subscribers")
      .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
      .eq("id", wid);
  } catch {
    // best-effort
  }
}

async function handle(req: NextRequest): Promise<void> {
  const params = new URL(req.url).searchParams;
  await unsubscribe(params.get("id"));
  await unsubscribeOutreach(params.get("rid"));
  await unsubscribeWeeklyRead(params.get("wid"));
}

// Gmail's one-click List-Unsubscribe-Post sends a POST.
export async function POST(req: NextRequest) {
  await handle(req);
  return new NextResponse("unsubscribed", { status: 200 });
}

// A recipient clicking the footer link sends a GET — confirm in plain HTML.
export async function GET(req: NextRequest) {
  await handle(req);
  return new NextResponse(
    '<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center">' +
      "<h2>You've been unsubscribed.</h2><p>You won't receive further emails from this sender.</p>" +
      "</body></html>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
