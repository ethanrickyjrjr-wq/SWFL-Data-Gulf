// GET the most recent split-test's aggregated results for a deliverable. Reads
// the latest email_blasts row carrying a non-null variant_config, then groups
// email_events (did-tagged, variant-tagged — Task 1's webhook branch) through
// the pure variantResults aggregator. Known limitation (see plan Global
// Constraints): did is the DELIVERABLE id, not the blast id — re-splitting the
// same deliverable blends prior events into the new read.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { variantResults } from "@/lib/email/variant-results";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: blast, error: blastErr } = await supabase
    .from("email_blasts")
    .select("contact_ids, variant_config")
    .eq("deliverable_id", id)
    .eq("user_id", user.id)
    .not("variant_config", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (blastErr) {
    return NextResponse.json({ error: "blast fetch failed" }, { status: 500 });
  }

  if (!blast?.variant_config) {
    return NextResponse.json({ hasSplitTest: false });
  }

  const config = blast.variant_config as { subjects?: string[] | null; ctas?: string[] | null };
  const variantCount = config.subjects?.length ?? config.ctas?.length ?? 0;
  if (variantCount < 2) {
    return NextResponse.json({ hasSplitTest: false });
  }

  // email_events RLS (migrations/20260628_email_events.sql) grants SELECT to
  // service_role ONLY — no user policy (operator-internal data). Ownership of
  // this blast is already proven above via the cookie-scoped, user_id-filtered
  // email_blasts query; only this read needs to escalate, the same way the
  // webhook writer (app/api/webhooks/resend/route.ts) already does for writes.
  const db = createServiceRoleClient();
  const { data: events, error: eventsErr } = await db
    .from("email_events")
    .select("variant, event")
    .eq("did", id)
    .in("event", ["opened", "clicked"]);
  if (eventsErr) {
    return NextResponse.json({ error: "events fetch failed" }, { status: 500 });
  }

  const results = variantResults({
    contactIds: (blast.contact_ids as string[]) ?? [],
    variantCount,
    labels: {
      subjects: config.subjects ?? undefined,
      ctas: config.ctas ?? undefined,
    },
    events: (events ?? []) as { variant: string | null; event: string }[],
  });

  return NextResponse.json({ hasSplitTest: true, results });
}
