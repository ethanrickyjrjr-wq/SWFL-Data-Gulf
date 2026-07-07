// scripts/project-feed/watch-scan.mts
//
// Daily cron adapter for Property Watch (spec 2026-07-07-property-watch-design.md). NOT a Next
// route — a standalone Bun process the GHA cron invokes AFTER listing-lifecycle-daily has committed
// the day's transitions (same ordering as lifecycle-nudges).
//
// For every projects row with watch_enabled=true (and a resolved watch_lat/lon), it scans recent
// data_lake.listing_transitions (seed=false), joins each to its listing_state row for lat/lon +
// specs, haversine-filters to the project's radius, classifies (new-listing / price-cut / sale) via
// the pure core (lib/project/watch-event.ts), and inserts qualifying events via the EXISTING
// insertProjectEvent path with bypassBatchWindow (the daily digest is the batcher).
//
// IDEMPOTENT: a per-candidate existence check on (project_id, entity_brand_key, event_type,
// event_date) skips rows already inserted, so a same-day re-run or an overlapping manual run writes
// nothing new. The rolling `at >= today-N` window is a perf bound only — the existence check is what
// guarantees correctness, so a missed cron day self-heals on the next run.
//
// FOUR-LANE NO-INVENTION: a comp whose listing_state row has NULL lat/lon can't be distance-filtered,
// so it is EXCLUDED (counted), never guessed. Source-B (lifecycle_seed) rows that predate the api
// lat/lon columns fall out here by construction.
//
// Run: bun scripts/project-feed/watch-scan.mts [--dry-run]

// KNOWN-DEBT(data_lake: listing_state/listing_transitions live in the data_lake schema (typed public only))
import {
  createServiceRoleClient,
  createServiceRoleClientUntyped,
} from "@/utils/supabase/service-role";
import { haversineDistanceMiles } from "@/lib/signals/event-evaluator";
import { insertProjectEvent } from "@/lib/project/event-insert";
import {
  buildWatchEvent,
  type CompTransition,
  type CompState,
  type WatchSubject,
} from "@/lib/project/watch-event";

const DRY_RUN = process.argv.includes("--dry-run");
const WINDOW_DAYS = 7; // rolling scan bound (perf only; existence check owns correctness)

interface WatchProjectRow {
  id: string;
  user_id: string;
  watch_lat: number | null;
  watch_lon: number | null;
  watch_radius_miles: number;
  watch_price_cut_threshold_pct: number;
  watch_beds: number | null;
  watch_baths: number | null;
  watch_sqft: number | null;
  watch_price: number | null;
}

interface TransitionRow {
  source_name: string;
  address_key: string;
  sale_or_rent: string;
  from_state: string | null;
  to_state: string;
  at: string;
  price: number | null;
  price_delta: number | null;
  sold_date: string | null;
  sold_price: number | null;
}

interface StateRow {
  source_name: string;
  address_key: string;
  sale_or_rent: string;
  lat: number | null;
  lon: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  list_price: number | null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<number> {
  console.log(`[watch-scan] start · DRY_RUN=${DRY_RUN}`);
  const db = createServiceRoleClient();
  const lake = createServiceRoleClientUntyped();

  // 1. Watch-enabled projects with a resolved location.
  const { data: projRows, error: projErr } = await db
    .from("projects")
    .select(
      "id, user_id, watch_lat, watch_lon, watch_radius_miles, watch_price_cut_threshold_pct, watch_beds, watch_baths, watch_sqft, watch_price",
    )
    .eq("watch_enabled", true);
  if (projErr) {
    console.error(`FATAL: projects query failed — ${projErr.message}`);
    return 1;
  }
  const projects = ((projRows ?? []) as WatchProjectRow[]).filter(
    (p) => p.watch_lat != null && p.watch_lon != null,
  );
  if (projects.length === 0) {
    console.log("  no watch-enabled projects with a resolved location — nothing to do.");
    return 0;
  }

  // 2. Recent transitions (rolling window), for-sale only, real flow (seed=false).
  const windowStart = toDateOnly(new Date(Date.now() - WINDOW_DAYS * 86_400_000));
  const { data: transRows, error: transErr } = await lake
    .schema("data_lake")
    .from("listing_transitions")
    .select(
      "source_name, address_key, sale_or_rent, from_state, to_state, at, price, price_delta, sold_date, sold_price",
    )
    .eq("seed", false)
    .eq("sale_or_rent", "sale")
    .gte("at", windowStart);
  if (transErr) {
    console.error(`FATAL: listing_transitions query failed — ${transErr.message}`);
    return 1;
  }
  const transitions = (transRows ?? []) as TransitionRow[];
  if (transitions.length === 0) {
    console.log(`  no non-seed sale transitions since ${windowStart} — nothing to scan.`);
    return 0;
  }

  // 3. Join each transition to its listing_state row for lat/lon + specs.
  const addrKeys = [...new Set(transitions.map((t) => t.address_key))];
  const { data: stateRows, error: stateErr } = await lake
    .schema("data_lake")
    .from("listing_state")
    .select("source_name, address_key, sale_or_rent, lat, lon, beds, baths, sqft, list_price")
    .eq("sale_or_rent", "sale")
    .in("address_key", addrKeys);
  if (stateErr) {
    console.error(`FATAL: listing_state query failed — ${stateErr.message}`);
    return 1;
  }
  const stateByKey = new Map<string, StateRow>();
  for (const s of (stateRows ?? []) as StateRow[]) {
    stateByKey.set(`${s.source_name}|${s.address_key}|${s.sale_or_rent}`, s);
  }

  // 4. Build the comp list once (transition + geo-resolved state), excluding null-geo rows.
  let excludedNoGeo = 0;
  const comps: { transition: CompTransition; state: CompState }[] = [];
  for (const t of transitions) {
    const s = stateByKey.get(`${t.source_name}|${t.address_key}|${t.sale_or_rent}`);
    if (!s || s.lat == null || s.lon == null) {
      excludedNoGeo++;
      continue;
    }
    comps.push({
      transition: {
        from_state: t.from_state,
        to_state: t.to_state,
        at: t.at,
        price: t.price,
        price_delta: t.price_delta,
        sold_date: t.sold_date,
        sold_price: t.sold_price,
      },
      state: {
        address_key: s.address_key,
        lat: s.lat,
        lon: s.lon,
        beds: s.beds,
        baths: s.baths,
        sqft: s.sqft,
        list_price: s.list_price,
      },
    });
  }
  console.log(
    `  ${projects.length} watch project(s) · ${transitions.length} transition(s) since ${windowStart} · ${comps.length} geo-resolved comp(s) (${excludedNoGeo} excluded: no lat/lon)`,
  );

  // 5. Per project × comp: classify, dedup, insert.
  let inserted = 0;
  let dupes = 0;
  let candidates = 0;
  for (const p of projects) {
    const subject: WatchSubject = {
      beds: p.watch_beds,
      baths: p.watch_baths,
      sqft: p.watch_sqft,
      price: p.watch_price,
    };
    for (const c of comps) {
      const distance = haversineDistanceMiles(
        p.watch_lat as number,
        p.watch_lon as number,
        c.state.lat,
        c.state.lon,
      );
      const event = buildWatchEvent(
        subject,
        c.transition,
        c.state,
        distance,
        p.watch_radius_miles,
        p.watch_price_cut_threshold_pct,
      );
      if (!event) continue;
      candidates++;

      // Idempotency: skip if this exact (project, comp, type, date) row already exists.
      const { data: existing } = await db
        .from("project_events")
        .select("id")
        .eq("project_id", p.id)
        .eq("entity_brand_key", event.entity_brand_key as string)
        .eq("event_type", event.event_type)
        .eq("event_date", event.event_date)
        .maybeSingle();
      if (existing) {
        dupes++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [dry-run] would insert · project ${p.id.slice(0, 8)} · ${event.ai_summary}`);
        inserted++;
        continue;
      }

      const res = await insertProjectEvent(db, p.id, event, { bypassBatchWindow: true });
      if (res.inserted) inserted++;
    }
  }

  console.log(
    `  ${candidates} candidate(s) · ${dupes} already existed · ${inserted} ${DRY_RUN ? "would-insert" : "inserted"}. Done.`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
