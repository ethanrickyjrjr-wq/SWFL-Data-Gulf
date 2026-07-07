// scripts/project-feed/watch-digest.mts
//
// Daily digest adapter for Property Watch (spec 2026-07-07-property-watch-design.md). NOT a Next
// route — a standalone Bun process, run AFTER watch-scan.mts has inserted the day's nearby_* events.
//
// It groups every un-notified nearby_* project_events row (notify_user=true, notified_at IS NULL) by
// project into one digest each (pure core: lib/project/watch-digest.ts), and — in a real send — mails
// one email per project per day and stamps notified_at on exactly those rows. Zero qualifying events
// for a project → no email, no filler (spec).
//
// SEND IS OPERATOR-GATED (v1). The Watch TAB feed is the fully-wired v1 surface — the scan writes the
// events and the tab shows them live. The email channel's live transport (Resend batch + sender config
// + reply token + usage/paywall) is the platform's paid, outward-facing send path and is wired during
// the operator-run `property_watch_live_verify`, NOT here. This adapter therefore:
//   • --dry-run (and default) : compose + PRINT every digest; stamp nothing. The dev completion bar.
//   • --send                  : REFUSES unless WATCH_DIGEST_LIVE=1 is set by the operator, so a parked
//                               cron can never silently blast. Even then it only stamps notified_at
//                               after the injected send seam reports success (no stamp without a send).
//
// Run: bun scripts/project-feed/watch-digest.mts [--dry-run]

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { groupWatchDigests, type WatchEventForDigest } from "@/lib/project/watch-digest";

const SEND = process.argv.includes("--send");
const LIVE_OK = process.env.WATCH_DIGEST_LIVE === "1";
const WATCH_TYPES = ["nearby_new_listing", "nearby_price_cut", "nearby_sale"];

async function main(): Promise<number> {
  console.log(`[watch-digest] start · mode=${SEND ? "send" : "dry-run"}`);
  const db = createServiceRoleClient();

  // 1. Un-notified nearby_* events.
  const { data: eventRows, error: evErr } = await db
    .from("project_events")
    .select("id, project_id, ai_summary, event_date, event_type, created_at")
    .in("event_type", WATCH_TYPES)
    .eq("notify_user", true)
    .is("notified_at", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (evErr) {
    console.error(`FATAL: project_events query failed — ${evErr.message}`);
    return 1;
  }
  const events = (eventRows ?? []) as WatchEventForDigest[];
  if (events.length === 0) {
    console.log("  no un-notified nearby events — nothing to send.");
    return 0;
  }

  // 2. Project titles (for the subject line).
  const projectIds = [...new Set(events.map((e) => e.project_id))];
  const { data: projRows } = await db.from("projects").select("id, title").in("id", projectIds);
  const titleById = new Map<string, string | null>(
    (projRows ?? []).map((p) => [p.id as string, (p.title as string | null) ?? null]),
  );

  const digests = groupWatchDigests(events, titleById);
  console.log(`  ${events.length} event(s) → ${digests.length} project digest(s).`);

  // 3. Dry-run (default): print, stamp nothing.
  if (!SEND) {
    for (const d of digests) {
      console.log(
        `\n  ── ${d.subject}  (project ${d.project_id.slice(0, 8)}, ${d.lines.length} event(s))`,
      );
      for (const line of d.lines) console.log(`     • ${line}`);
    }
    console.log(`\n  [dry-run] composed ${digests.length} digest(s); stamped nothing.`);
    return 0;
  }

  // 4. Live send — hard-gated. A parked cron in --send mode without the operator's env flag is a no-op
  //    that stamps NOTHING (never mark an event notified when no email left the building).
  if (!LIVE_OK) {
    console.warn(
      "  --send given but WATCH_DIGEST_LIVE!=1 — live email transport is operator-gated " +
        "(property_watch_live_verify). Composed digests above were NOT sent and NOTHING was stamped.",
    );
    for (const d of digests) console.log(`  would send: ${d.subject} (${d.lines.length} event(s))`);
    return 0;
  }

  // The operator has opted in. The concrete Resend/sender-config/reply-token wiring lands with the
  // live-verify (kept out of the offline build so it can't be shipped unverified). Fail loud rather
  // than silently stamp: if execution reaches here, the send seam isn't wired yet.
  throw new Error(
    "WATCH_DIGEST_LIVE=1 but the live send seam is not wired in this build — wire it during " +
      "property_watch_live_verify, then stamp notified_at on each digest.event_ids only after a 2xx send.",
  );
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
