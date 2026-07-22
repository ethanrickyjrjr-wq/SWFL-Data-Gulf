import { fetchBrain } from "@/lib/fetch-brain";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { CORE_SCOPE_ZIPS } from "@/refinery/lib/core-scope.mts";
import { mapPivotedCityRows, type PivotedSeries } from "@/lib/charts/pivoted-series";
import type { DisplayMetric } from "@/refinery/render/speaker.mts";
import type { CorridorEntry, PivotedCityMonth } from "@/types/viz";

/**
 * Live data for `/demo` (`app/demo/page.tsx`). Replaces the static
 * `fixtures/*.json` snapshots that page shipped with.
 *
 * KNOWN-DEBT(data_lake: reads corridor_profiles + data_lake chart aggregates
 * via the untyped service-role client, same as app/charts/page.tsx — the
 * generated Database type doesn't cover these tables/schema).
 */

// SWFL core-county FIPS the env-swfl/fema-nfip brain filters flood claims to
// (Lee, Collier, Hendry) — refinery/sources/fema-nfip-source.mts SWFL_COUNTIES.
// Duplicated here as 3 literal FIPS codes (not query logic) so this page's
// flood count matches what the brain itself reports; not exported there.
const SWFL_FLOOD_COUNTY_FIPS = ["12071", "12021", "12051"];

export interface DemoBrainSummary {
  conclusion: string;
  caveats: string[];
  confidencePct: number;
  /** Already MM/DD/YYYY per DisplayBrain's freshness-token cleaning — never the raw token. */
  freshnessAsOf: string;
  dataSources: number;
  metrics: DisplayMetric[];
}

// ZHVI is a smoothed typical-value INDEX, never a median (docs/standards/data-roots.md
// T2) — but at least one live brain's own metric label still says "median ZHVI"
// (an upstream labeling bug, not fixed here). Drop any metric carrying that
// combination before it ever reaches this page, regardless of which brain it's from.
const MEDIAN_ZHVI_MISLABEL = /median.*zhvi|zhvi.*median/i;

export function safeMetrics(metrics: DisplayMetric[], take: number): DisplayMetric[] {
  return metrics.filter((m) => !MEDIAN_ZHVI_MISLABEL.test(m.label)).slice(0, take);
}

/**
 * Master's own OUTPUT.conclusion is cross-vertical synthesis text (lists
 * every upstream brain id) — unsuitable for display raw, which is exactly
 * why `display` (the sanitized DisplayBrain projection) exists. Key metrics
 * come from the on-theme CRE/housing/flood leaf brains instead of master's
 * own metrics (SBA/macro-flavored, wrong theme for this page).
 */
export async function loadDemoBrainSummary(origin: string): Promise<DemoBrainSummary> {
  const [master, cre, homeValues, env] = await Promise.all([
    fetchBrain("master", { tier: 2, origin }),
    fetchBrain("cre-swfl", { tier: 2, origin }),
    fetchBrain("home-values-swfl", { tier: 2, origin }),
    fetchBrain("env-swfl", { tier: 2, origin }),
  ]);

  return {
    conclusion: master.display.conclusion,
    caveats: master.display.summaryCaveats,
    confidencePct: master.display.confidencePct,
    freshnessAsOf: master.display.freshnessToken,
    dataSources: master.output.upstream_count,
    metrics: [
      ...safeMetrics(cre.display.metrics, 2),
      ...safeMetrics(homeValues.display.metrics, 2),
      ...safeMetrics(env.display.metrics, 2),
    ],
  };
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Live read of `corridor_profiles` (verified, non-deleted) — same predicate
 * as `refinery/sources/cre-source.mts` and `refinery/tools/regen-corridor-fixture.mts`.
 * Reads the table directly instead of the committed `fixtures/corridor-rents.json`
 * snapshot, which has no regen cadence and drifts stale.
 */
export async function loadDemoCorridorRents(): Promise<CorridorEntry[]> {
  const supabase = createServiceRoleClientUntyped();
  const { data, error } = await supabase
    .from("corridor_profiles")
    .select("corridor_name, city, asking_rent_psf, vacancy_rate_pct, absorption_sqft")
    .is("deleted_at", null)
    .eq("verification_status", "verified");

  if (error || !data) return [];

  const seen = new Set<string>();
  const out: CorridorEntry[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const name = String(row.corridor_name ?? "").trim();
    if (!name) continue;
    const id = slugify(name);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      submarket: String(row.city ?? "").trim(),
      nnn_asking_rent_per_sqft: toNum(row.asking_rent_psf),
      vacancy_pct: toNum(row.vacancy_rate_pct),
      absorption_sqft: toNum(row.absorption_sqft),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Live read of `data_lake.zhvi_pivoted` — same view + mapper `app/charts/page.tsx`
 * uses for its metro panels. Stays labeled as ZHVI (index), never "median" —
 * the one sanctioned remaining ZHVI use.
 */
export async function loadDemoZhviTrend(): Promise<PivotedSeries> {
  const supabase = createServiceRoleClientUntyped();
  const { data, error } = await supabase
    .schema("data_lake")
    .from("zhvi_pivoted")
    .select("month, cape_coral, fort_myers, naples")
    .order("month", { ascending: true });

  if (error) return { entries: [], asOf: undefined, rowCount: 0 };
  return mapPivotedCityRows(data as PivotedCityMonth[] | null);
}

export interface DemoStats {
  swflZips: number;
  floodRecords: number;
}

/**
 * `swflZips` is the canonical core-scope denominator (`/charts` uses the same
 * constant). `floodRecords` is a live count of `data_lake.fema_nfip_claims`
 * filtered to the SWFL core counties — same scope the env-swfl brain reports.
 */
export async function loadDemoStats(): Promise<DemoStats> {
  const supabase = createServiceRoleClientUntyped();
  const { count, error } = await supabase
    .schema("data_lake")
    .from("fema_nfip_claims")
    .select("id", { count: "exact", head: true })
    .in("county_code", SWFL_FLOOD_COUNTY_FIPS);

  return {
    swflZips: CORE_SCOPE_ZIPS.size,
    floodRecords: error || count == null ? 0 : count,
  };
}

/** Maps a real BrainOutputMetric direction to the tile's bullish/bearish/neutral indicator. */
export function metricDirectionToTone(direction: string): "bullish" | "bearish" | "neutral" {
  if (direction === "rising") return "bullish";
  if (direction === "falling") return "bearish";
  return "neutral";
}
