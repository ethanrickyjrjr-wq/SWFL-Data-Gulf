// lib/email/load-campaign-stats.ts
//
// Thin server loader for the hub Campaigns card: fetch the user's stored
// send/engagement rows and hand them to the pure aggregator. email_events RLS
// (migrations/20260628_email_events.sql) grants SELECT to service_role ONLY —
// ownership is proven by the cookie-scoped queries first, the escalated reads
// stay .eq(user_id) — the exact blast-results/route.ts grammar.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { campaignStats, type CampaignStats } from "@/lib/email/campaign-stats";

export async function loadCampaignStats(
  userClient: SupabaseClient<Database>,
  userId: string,
): Promise<CampaignStats> {
  const [{ data: blasts }, { data: schedules }] = await Promise.all([
    userClient
      .from("email_blasts")
      .select("deliverable_id, sent_at")
      .eq("user_id", userId)
      .eq("status", "sent"),
    userClient.from("email_schedules").select("id, deliverable_id").eq("user_id", userId),
  ]);

  const db = createServiceRoleClient();
  const [{ data: events }, { data: sends }] = await Promise.all([
    db
      .from("email_events")
      .select("did, event, created_at")
      .eq("user_id", userId)
      .not("did", "is", null),
    db.from("email_sends").select("schedule_id, sent_at").eq("user_id", userId),
  ]);

  const didBySchedule = new Map(
    (schedules ?? []).map((s) => [s.id, s.deliverable_id ?? null] as const),
  );
  const scheduledSends = (sends ?? []).flatMap((s) => {
    const did = s.schedule_id != null ? didBySchedule.get(s.schedule_id) : null;
    return did ? [{ sent_at: s.sent_at, deliverable_id: did }] : [];
  });

  const dids = [
    ...new Set([
      ...(blasts ?? []).map((b) => b.deliverable_id),
      ...scheduledSends.map((s) => s.deliverable_id),
    ]),
  ];
  const { data: deliverables } = dids.length
    ? await userClient
        .from("deliverables")
        .select("id, project_id, campaign_key, instruction")
        .in("id", dids)
    : { data: [] };

  return campaignStats({
    blasts: blasts ?? [],
    deliverables: deliverables ?? [],
    events: events ?? [],
    scheduledSends,
  });
}
