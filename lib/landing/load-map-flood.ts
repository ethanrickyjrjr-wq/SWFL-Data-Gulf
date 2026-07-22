// lib/landing/load-map-flood.ts
//
// LIVE flood metric for /map — the "real env-swfl flood root" that
// docs/standards/data-roots.md:238 names as the fix for
// `sa0718_map_page_always_renders_hardcoded_mock_flo`.
//
// /map used to render three MapCanvas calls with NO override, so all three
// painted the import-quarantined mock fixture (lib/landing/home-map-data.ts)
// and served invented flood dollars as real, undisclosed. The data was never
// missing: env-swfl emits a `flood_by_zip` detail table (realized NFIP loss,
// AAL per insured property, per ZIP) and it already drives the live flood
// gradient on /r/zip-report/[zip] via lib/zip-report/load-ranked-signals.ts.
//
// BOUNDS COME FROM THE ROWS, NEVER FROM THE FIXTURE. A sibling defect
// (`sa0718_live_flood_gradient_bounds_are_numerically`) is exactly that: a
// "live" flood surface whose gradient bounds are numerically identical to the
// mock, i.e. calibration copied from fake data. `low`/`high` here are the real
// min/max of the rows actually rendered.
//
// Empty-tolerant by contract (four-lane / ODD): a brain that fails to load or
// holds no flood rows returns null and the caller falls back to the honest
// "Sample data — not live" path. Never throws, never invents a number.
import { loadParsedBrain } from "../fetch-brain";
import { CORE_SCOPE_ZIPS } from "../../refinery/lib/core-scope.mts";
import type { MetricDef } from "./home-map-types";

/**
 * Live per-ZIP flood metric, scoped to the map's drawable ZIP set (core scope —
 * the same root load-home-map-data.ts uses, so the two maps can never disagree
 * about which ZIPs exist).
 *
 * Returns null when there is no live flood row to show — the caller must NOT
 * substitute the fixture silently.
 */
export async function loadMapFlood(): Promise<MetricDef | null> {
  const env = await loadParsedBrain("env-swfl").catch(() => null);
  if (!env) return null;

  const table = env.output.detail_tables?.find((t) => t.id === "flood_by_zip");
  const data: Record<string, number> = {};

  for (const row of table?.rows ?? []) {
    const zip = row.key;
    if (!CORE_SCOPE_ZIPS.has(zip)) continue;
    const aal = row.cells["aal_usd_per_insured_property"];
    if (typeof aal === "number" && Number.isFinite(aal)) data[zip] = aal;
  }

  // key_metrics fallback for ZIPs the table omits (same two-lane read as
  // load-ranked-signals.ts — the per-ZIP metrics predate the detail table).
  if (Object.keys(data).length === 0) {
    for (const m of env.output.key_metrics ?? []) {
      const hit = /^swfl_zip_(\d{5})_flood_aal_usd_per_insured_property$/.exec(m.metric);
      if (hit && typeof m.value === "number" && Number.isFinite(m.value)) {
        if (CORE_SCOPE_ZIPS.has(hit[1])) data[hit[1]] = m.value;
      }
    }
  }

  const values = Object.values(data);
  if (values.length === 0) return null;

  return {
    label: "Flood loss",
    sublabel: "Realized NFIP loss per insured property",
    format: "currency",
    data,
    // Real endpoints of the rendered rows — never the fixture's.
    low: Math.min(...values),
    high: Math.max(...values),
    c0: "#1f4f4a",
    c1: "#3DC9C0",
    c2: "#b9ede8",
    sample: false,
  };
}
