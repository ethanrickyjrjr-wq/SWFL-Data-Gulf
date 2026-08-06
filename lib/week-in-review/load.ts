/**
 * Week in Review — the pure contract.
 *
 * Design: docs/superpowers/specs/2026-08-06-week-in-review-design.md
 * Plan:   docs/superpowers/plans/2026-08-06-week-in-review-plan.md
 *
 * ⛔ T11 (docs/standards/data-roots.md:76,:119) — READ BEFORE TOUCHING ANY PRICE FIGURE.
 * A price cut has TWO honest answers that disagree BY DESIGN:
 *   · `listing_transitions.price_delta` — OUR FORWARD-ONLY sweep. Sees only cuts
 *     that happened after we started watching a listing. Complete inside a window,
 *     blind before it.
 *   · `steadyapi_listing_events_v.price_change` — the VENDOR'S BACKWARD history.
 *     Carries the full trail back to the original ask, but only for the ~17.9k
 *     properties we probed, so it can NEVER roll up to a ZIP or county.
 *
 * A week-in-review asks exactly one question — what happened INSIDE this window —
 * so the forward-only lane's known blindness costs nothing here, and the vendor
 * lane would be actively wrong (it cannot form an area statistic). This is the one
 * surface where that root is not a compromise but the correct choice.
 *
 * Never sum across the lanes. Never let the vendor lane reach an area share (that
 * root is `listing_momentum_stats.price_reduced_share`, T3).
 */

import type { MarketEventGrain, MarketFact } from "@/lib/email/zip-events/types";
import { loadMarketAreas } from "@/lib/email/zip-events/market-areas";
import { selectAllPaged } from "@/refinery/lib/paginate.mts";
// KNOWN-DEBT(data_lake): listing_transitions/listing_state live in the data_lake
// schema, which the typed Supabase client intentionally does not cover — see
// utils/supabase/service-role.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

/** The ONLY table this surface reads. Asserted by test, not by convention. */
export const ALLOWED_SOURCE_TABLE = "listing_transitions" as const;

/**
 * The buckets. These are the states the daily sweep already writes — NOT a
 * taxonomy authored here. Counts measured live 08/06/2026 over the prior 7 days
 * (design §1): 1,060 price changes · 527 went pending · 122 sold out of pending ·
 * 74 back on market · 73 sold direct · 27 withdrawn from active · 25 withdrawn
 * from pending.
 *
 * Adding a kind means the sweep started writing one. Renaming a kind means
 * someone stopped reading the feed and started authoring it.
 */
export const TRANSITION_KINDS = [
  "active->active",
  "active->holding",
  "holding->sold",
  "holding->active",
  "active->sold",
  "active->withdrawn",
  "holding->withdrawn",
] as const;

export type TransitionKind = (typeof TRANSITION_KINDS)[number];

/** Reader-facing bucket labels. Kept beside the kinds so a new kind forces one. */
export const KIND_LABELS: Record<TransitionKind, string> = {
  "active->active": "Price changes",
  "active->holding": "Went pending",
  "holding->sold": "Sold out of pending",
  "holding->active": "Back on market",
  "active->sold": "Sold direct",
  "active->withdrawn": "Withdrawn from active",
  "holding->withdrawn": "Withdrawn from pending",
};

export interface Window {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, inclusive. */
  end: string;
}

export interface WeekEvent {
  kind: TransitionKind;
  count: number;
  facts: MarketFact[];
}

/**
 * Empty and ERROR are different values, deliberately.
 *
 * `lib/figures/sourced.ts` collapses "no rows" and "query failed" into `[]`, which
 * is right for a figure list and WRONG here: on this surface a genuinely quiet ZIP
 * and a broken query would render identically as "nothing happened". That is the
 * §6.3 failure mode, and it is the one place this module must NOT copy that shape.
 */
export type WeekInReviewResult =
  | { ok: true; events: WeekEvent[]; coverage?: { covered: number; total: number } }
  | { ok: false; reason: string };

export function emptyResult(): WeekInReviewResult {
  return { ok: true, events: [] };
}

export function errorResult(reason: string): WeekInReviewResult {
  return { ok: false, reason };
}

/** Only an `ok` result may reach a reader. An error renders as an error. */
export function isRenderable(r: WeekInReviewResult): boolean {
  return r.ok;
}

/**
 * §6.2 — silent window truncation.
 *
 * The sweep is blind before it began watching. A window opening before coverage
 * starts renders an artificially quiet market as though it were the real one, with
 * no visible tell. Refuse it rather than caveat it.
 */
export function windowWithinCoverage(w: Window, coverageStart: string): boolean {
  return w.start >= coverageStart;
}

/**
 * §6.6 — grain leak.
 *
 * A city figure computed from a partial ZIP set, presented as the city's number,
 * is an unsourced claim wearing a real number's clothes. Full coverage needs no
 * label; anything short of it says so plainly.
 */
export function grainCoverageLabel(c: { covered: number; total: number }): string | null {
  if (c.total > 0 && c.covered === c.total) return null;
  return `Based on ${c.covered} of ${c.total} ZIP codes with recorded activity in this window.`;
}

// ─── The loader — one query against listing_transitions, joined to
// listing_state for geo (design §4: "geo resolved through listing_state" for
// zip/city/county; "area" resolves through the committed market-areas fixture
// instead, since it is not a listing_state column). ───

/** One `listing_transitions` row exactly as the lake hands it back — every
 *  field nullable except `at`/`address_key`, matching the table's real nulls
 *  (from_state is null on a first-seen row). */
export interface TransitionRow {
  address_key: string;
  from_state: string | null;
  to_state: string | null;
  at: string;
  price: number | null;
  price_delta: number | null;
}

/** address_key -> the three geo columns listing_state actually carries. */
export interface GeoRow {
  address_key: string;
  zip_code: string | null;
  city: string | null;
  county: string | null;
}

export interface WeekInReviewDeps {
  /** Injectable lake reads — tests never touch Supabase (mirrors
   *  lib/why-not-selling/cut-history.ts's CutHistoryDeps). */
  fetchCoverageStart?: () => Promise<string | null>;
  /** The full known ZIP set for this grain+key, independent of the window —
   *  the denominator for §6.6's covered/total label. */
  fetchFootprintZips?: (grain: MarketEventGrain, key: string) => Promise<string[]>;
  fetchTransitions?: (window: Window) => Promise<TransitionRow[]>;
  fetchGeo?: (addressKeys: string[]) => Promise<GeoRow[]>;
}

const MAX_FACTS_PER_KIND = 5;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function normalizeCountyKey(key: string): string {
  return key.replace(/\s*County$/i, "").trim();
}

/** Earliest `at` on the feed (excluding baseline seed rows) — the §6.2 guard. */
async function defaultFetchCoverageStart(): Promise<string | null> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema("data_lake")
    .from(ALLOWED_SOURCE_TABLE)
    .select("at")
    .eq("seed", false)
    .order("at", { ascending: true })
    .limit(1);
  const row = ((data ?? []) as { at: string }[])[0];
  return row?.at ?? null;
}

/** The full ZIP set for a grain+key, read live from listing_state for
 *  city/county (per design §4 — geo resolved through listing_state, not a
 *  fixture) or from the committed market-areas fixture for "area". */
async function defaultFetchFootprintZips(grain: MarketEventGrain, key: string): Promise<string[]> {
  if (grain === "zip") return [key];
  if (grain === "area") {
    const area = loadMarketAreas().find((a) => a.area_id === key);
    return area?.zips ?? [];
  }
  const db = createServiceRoleClientUntyped();
  const col = grain === "county" ? "county" : "city";
  const value = grain === "county" ? normalizeCountyKey(key) : key;
  const rows = await selectAllPaged<{ zip_code: string | null }>(
    () =>
      db
        .schema("data_lake")
        .from("listing_state")
        .select("zip_code")
        .eq("sale_or_rent", "sale")
        .eq(col, value) as never,
    ["zip_code", "address_key"],
  );
  return [...new Set(rows.map((r) => r.zip_code).filter((z): z is string => !!z))];
}

/** One query against listing_transitions for the whole window, whole
 *  coverage — grain filtering happens after the geo join, not here. Weekly
 *  volume runs into the thousands (measured design §1: ~1,908/week whole
 *  coverage), past PostgREST's 1000-row page cap, so this MUST paginate. */
async function defaultFetchTransitions(window: Window): Promise<TransitionRow[]> {
  const db = createServiceRoleClientUntyped();
  return selectAllPaged<TransitionRow & { id: number }>(
    () =>
      db
        .schema("data_lake")
        .from(ALLOWED_SOURCE_TABLE)
        .select("id, address_key, from_state, to_state, at, price, price_delta")
        .eq("source_name", "api_feed")
        .eq("seed", false)
        .eq("sale_or_rent", "sale")
        .gte("at", window.start)
        .lte("at", window.end) as never,
    "id",
  );
}

/** address_key -> geo, chunked (mirrors zipJoin in lib/email/zip-events/state.ts). */
async function defaultFetchGeo(addressKeys: string[]): Promise<GeoRow[]> {
  const db = createServiceRoleClientUntyped();
  const out: GeoRow[] = [];
  for (const part of chunk([...new Set(addressKeys)], 200)) {
    if (part.length === 0) continue;
    const { data, error } = await db
      .schema("data_lake")
      .from("listing_state")
      .select("address_key, zip_code, city, county")
      .eq("sale_or_rent", "sale")
      .in("address_key", part);
    if (error) throw new Error(`listing_state geo join: ${error.message}`);
    out.push(...((data ?? []) as GeoRow[]));
  }
  return out;
}

function matchesGrain(g: GeoRow | undefined, grain: MarketEventGrain, key: string): boolean {
  if (!g || !g.zip_code) return false;
  if (grain === "zip") return g.zip_code === key;
  if (grain === "city") return g.city === key;
  if (grain === "county") return g.county === normalizeCountyKey(key);
  return false; // "area" checked by the caller via the footprint ZIP set
}

/**
 * The week-in-review query. Empty-tolerant exactly like getSourcedFigures
 * (lib/figures/sourced.ts): no creds, no rows, or an error returns a value the
 * caller can render, never a throw — but per §6.3, empty and error are
 * different VALUES here, not the same collapsed shape.
 */
export async function loadWeekInReview(
  grain: MarketEventGrain,
  key: string,
  window: Window,
  deps: WeekInReviewDeps = {},
): Promise<WeekInReviewResult> {
  const fetchCoverageStart = deps.fetchCoverageStart ?? defaultFetchCoverageStart;
  const fetchFootprintZips = deps.fetchFootprintZips ?? defaultFetchFootprintZips;
  const fetchTransitions = deps.fetchTransitions ?? defaultFetchTransitions;
  const fetchGeo = deps.fetchGeo ?? defaultFetchGeo;

  try {
    const coverageStart = await fetchCoverageStart();
    if (coverageStart && !windowWithinCoverage(window, coverageStart)) {
      return errorResult(
        `window starts ${window.start}, before feed coverage begins ${coverageStart}`,
      );
    }

    const footprintZips = new Set(await fetchFootprintZips(grain, key));
    if (footprintZips.size === 0) {
      return errorResult(`no known ZIP coverage for ${grain} "${key}"`);
    }

    const transitions = await fetchTransitions(window);
    const geo = await fetchGeo(transitions.map((t) => t.address_key));
    const geoByKey = new Map(geo.map((g) => [g.address_key, g]));

    const byKind = new Map<TransitionKind, WeekEvent>();
    const coveredZips = new Set<string>();

    for (const t of transitions) {
      const g = geoByKey.get(t.address_key);
      const inGrain =
        grain === "area"
          ? !!g?.zip_code && footprintZips.has(g.zip_code)
          : matchesGrain(g, grain, key);
      if (!inGrain || !g?.zip_code) continue;

      const kind = `${t.from_state}->${t.to_state}`;
      if (!(TRANSITION_KINDS as readonly string[]).includes(kind)) continue;
      const typedKind = kind as TransitionKind;

      coveredZips.add(g.zip_code);
      const existing = byKind.get(typedKind) ?? { kind: typedKind, count: 0, facts: [] };
      existing.count += 1;
      if (existing.facts.length < MAX_FACTS_PER_KIND) {
        const fact = factForTransition(typedKind, t);
        if (fact) existing.facts.push(fact);
      }
      byKind.set(typedKind, existing);
    }

    if (byKind.size === 0) return emptyResult();

    const coverage = { covered: coveredZips.size, total: footprintZips.size };
    return { ok: true, events: [...byKind.values()], coverage };
  } catch (e) {
    return errorResult(
      e instanceof Error ? e.message : "unknown error querying listing_transitions",
    );
  }
}

/** One sourced fact per transition row, built ONLY from real columns already
 *  fetched — never an inferred or invented figure. Price-change kind carries
 *  the delta; every other kind carries the price the record moved at. */
function factForTransition(kind: TransitionKind, t: TransitionRow): MarketFact | null {
  if (t.price == null) return null;
  if (kind === "active->active") {
    if (t.price_delta == null) return null;
    return {
      label: KIND_LABELS[kind],
      from: t.price - t.price_delta,
      to: t.price,
      value: t.price_delta,
      unit: "$",
      source: "SWFL Data Gulf",
    };
  }
  return {
    label: KIND_LABELS[kind],
    value: t.price,
    unit: "$",
    source: "SWFL Data Gulf",
  };
}

/** Re-exported so callers never reach for a second grain enum. */
export type { MarketEventGrain };
