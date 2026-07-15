// app/api/deliverables/sent/route.ts
//
// GET /api/deliverables/sent — the signed-in user's own previously-blasted
// deliverables (id + a short label), for the "engaged with campaign ___"
// condition in ContactPickerModal. Only deliverables with a completed
// email_blasts row are listed — an unsent deliverable has no email_events to
// match against anyway.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: blasts, error: blastsErr } = await supabase
    .from("email_blasts")
    .select("deliverable_id, sent_at")
    .eq("user_id", user.id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (blastsErr) return NextResponse.json({ error: "read failed" }, { status: 500 });

  const ids = [...new Set((blasts ?? []).map((b) => b.deliverable_id))];
  if (ids.length === 0) return NextResponse.json([]);

  const { data: deliverables, error: delivErr } = await supabase
    .from("deliverables")
    .select("id, instruction, campaign_key")
    .in("id", ids);
  if (delivErr) return NextResponse.json({ error: "read failed" }, { status: 500 });

  const byId = new Map((deliverables ?? []).map((d) => [d.id, d]));
  const sentAtById = new Map((blasts ?? []).map((b) => [b.deliverable_id, b.sent_at]));
  const out = ids.map((id) => {
    const d = byId.get(id);
    const sentAt = sentAtById.get(id);
    const label =
      (d?.instruction ?? "").trim().slice(0, 60) ||
      d?.campaign_key ||
      `Sent ${sentAt ? new Date(sentAt).toLocaleDateString() : ""}`;
    return { id, label };
  });
  return NextResponse.json(out);
}
