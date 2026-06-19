/**
 * Event insert layer (Phase 4G) — cooldown check, 48-hour notify batching, and DB write.
 *
 * Called by any pipeline that has scored a ScoredEvent and wants to persist it for a project.
 * Handles the anti-fatigue rules from spec §4G:
 *   1. Score gate — enforced upstream by the scorer; we store whatever we receive.
 *   2. Tier-5 silence — enforced upstream; final_score = 0 rows will have inject_ai = false.
 *   3. Cooldown window — same (project_id, entity_brand_key, event_type) within cooldown_until → suppress.
 *   4. Event type confidence discount — enforced upstream by scoreEvent().
 *   5. Batching — max 1 notify_user per project per 48h (batch message suppresses extras).
 *   6. User dismissal — excluded by the read path (dismissed_at filter); not an insert concern.
 *   7. Stale event cutoff — enforced at read time (180-day filter in page.tsx query).
 *
 * Fire-and-forget callers should catch errors. insertProjectEvent never throws.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoredEvent } from "@/lib/signals/types";

/** Cooldown defaults per event_type (days). Openings are stable facts → long cooldown. */
const COOLDOWN_DAYS: Partial<Record<ScoredEvent["event_type"], number>> = {
  opening: 90,
  anchor_announced: 90,
  construction_start: 60,
  permit_filed: 30,
  closing: 30,
  zoning_change: 30,
  business_news: 14,
};

const NOTIFY_BATCH_WINDOW_HOURS = 48;

export interface InsertEventResult {
  inserted: boolean;
  suppressed: boolean;
  suppressed_reason?: "cooldown" | "batch_window" | "insert_error";
}

export async function insertProjectEvent(
  supabase: SupabaseClient,
  projectId: string,
  event: ScoredEvent,
  opts: { geocode_source?: "zip_centroid" | "exact" } = {},
): Promise<InsertEventResult> {
  try {
    // ── 1. Cooldown check ──────────────────────────────────────────────────────
    // Only check when we have a real brand key (unclassified events don't need tracking).
    if (event.entity_brand_key && event.entity_brand_key !== "_unclassified") {
      const { data: cooldownRow } = await supabase
        .from("project_events")
        .select("id")
        .eq("project_id", projectId)
        .eq("entity_brand_key", event.entity_brand_key)
        .eq("event_type", event.event_type)
        .not("cooldown_until", "is", null)
        .gt("cooldown_until", new Date().toISOString())
        .maybeSingle();

      if (cooldownRow) {
        // Track the suppressed event so it exists in the record — but don't notify or inject.
        await supabase.from("project_events").insert({
          project_id: projectId,
          entity_name: event.entity_name,
          entity_brand_key: event.entity_brand_key,
          event_type: event.event_type,
          event_date: event.event_date,
          lat: event.lat,
          lng: event.lng,
          distance_miles: event.distance_miles,
          brand_tier: event.brand_tier,
          brand_weight: event.brand_weight,
          final_score: event.final_score,
          radius_band: event.radius_band,
          notify_user: false,
          inject_ai: false,
          ai_summary: event.ai_summary,
          headline: event.headline ?? null,
          source: event.source,
          source_url: event.source_url ?? null,
          suppressed_reason: "cooldown",
          geocode_source: opts.geocode_source ?? null,
        });
        return { inserted: true, suppressed: true, suppressed_reason: "cooldown" };
      }
    }

    // ── 2. 48-hour notify batch window ─────────────────────────────────────────
    // If another event already fired a user notification for this project in the last 48h,
    // keep inject_ai but suppress notify_user to avoid back-to-back pings.
    let notifyUser = event.notify_user;
    if (notifyUser) {
      const windowSince = new Date(
        Date.now() - NOTIFY_BATCH_WINDOW_HOURS * 3_600_000,
      ).toISOString();
      const { count } = await supabase
        .from("project_events")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("notify_user", true)
        .not("notified_at", "is", null)
        .gte("notified_at", windowSince);

      if ((count ?? 0) > 0) {
        notifyUser = false;
      }
    }

    // ── 3. Compute cooldown_until ──────────────────────────────────────────────
    const cooldownDays = COOLDOWN_DAYS[event.event_type] ?? 30;
    const cooldownUntil = new Date(Date.now() + cooldownDays * 86_400_000).toISOString();

    // ── 4. Insert ──────────────────────────────────────────────────────────────
    const { error } = await supabase.from("project_events").insert({
      project_id: projectId,
      entity_name: event.entity_name,
      entity_brand_key: event.entity_brand_key ?? null,
      event_type: event.event_type,
      event_date: event.event_date,
      lat: event.lat,
      lng: event.lng,
      distance_miles: event.distance_miles,
      brand_tier: event.brand_tier,
      brand_weight: event.brand_weight,
      final_score: event.final_score,
      radius_band: event.radius_band,
      notify_user: notifyUser,
      inject_ai: event.inject_ai,
      ai_summary: event.ai_summary,
      headline: event.headline ?? null,
      source: event.source,
      source_url: event.source_url ?? null,
      suppressed_reason: event.suppressed_reason ?? null,
      cooldown_until: cooldownUntil,
      geocode_source: opts.geocode_source ?? null,
    });

    if (error) {
      console.error("[project_events] insert error:", error.message);
      return { inserted: false, suppressed: false, suppressed_reason: "insert_error" };
    }

    return { inserted: true, suppressed: !notifyUser && event.notify_user };
  } catch (err) {
    console.error("[project_events] insertProjectEvent threw:", err);
    return { inserted: false, suppressed: false, suppressed_reason: "insert_error" };
  }
}
