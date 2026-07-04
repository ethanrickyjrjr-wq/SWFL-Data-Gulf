// lib/zip-report/load-ranked-signals.ts
//
// The ZIP report's ranked-signal pipeline, in ONE place. Loads the same brains,
// assembles the same flood/permits/census inputs, and runs the SAME
// `buildZipCandidates` → `rankSignals` the report page uses — so any consumer
// (today: the ZIP email seed, lib/email/zip-seed.ts) surfaces the identical
// ranked/percentile/movement values the webpage does for a given ZIP on a given
// day. It also returns the flood-driven shape fill color (computed with the same
// `computeZipGradient` the homepage map and report page use) and the place name.
//
// WHY A HELPER, NOT PAGE REUSE: the report page (app/r/zip-report/[zip]/page.tsx)
// still inlines this assembly to feed its many other UI needs (gaps, rail
// context, dossier). This helper is the extraction the page can adopt later to
// make email/webpage parity STRUCTURAL rather than same-inputs-by-convention;
// until then both call `buildZipCandidates`+`rankSignals` with the same inputs,
// so they agree today. (Follow-up: migrate the page onto this helper.)
//
// CENSUS POLICY: the ZIP email deliberately ships AT MOST ONE census line
// (median household income) — every other ACS figure rides a 2018–2022 vintage
// that reads stale next to this-week market rows (see lib/email/zip-seed.ts
// header). `censusPolicy: "income-only"` keeps only the income census VALUE in
// the candidate pool while passing the FULL census distribution through — so
// income's percentile is still computed against the whole SWFL distribution, not
// a truncated one. The webpage uses "all".

import { loadParsedBrain } from "../fetch-brain";
import { resolveZip } from "../../refinery/lib/zip-resolver.mts";
import { extractZipShape } from "../map/extract-zip-shape";
import { computeZipGradient, FLOOD_GRADIENT } from "../map/zip-color";
import { buildRegistryTableMap } from "./load-registry-tables";
import { rankSignals, type RankedSignal } from "./signal-rank";
import { buildZipCandidates, loadCensusSignals, type FloodZipRow } from "./candidates";
import { filterCensusValues } from "./census-values";
import { loadZipQuickSummary } from "../zip-summary/load";

/** The registry packs whose zip-grain tables feed the candidate pool — mirrors
 *  app/r/zip-report/[zip]/page.tsx's REGISTRY_PACK_IDS. */
const REGISTRY_PACK_IDS = [
  "housing-swfl",
  "home-values-swfl",
  "rentals-swfl",
  "active-rentals-swfl",
  "market-heat-swfl",
  "market-temperature-swfl",
  "listing-momentum-swfl",
  "seller-stress-swfl",
  "tier-divergence-swfl",
  "permits-commercial-swfl",
  "properties-collier-value",
] as const;

export interface RankedZipSignals {
  /** Deterministically ranked signals — same order the webpage renders. */
  ranked: RankedSignal[];
  /** True when a flood AAL is held for this ZIP (drives whether a fill is sent). */
  hasFlood: boolean;
  /** The shape fill color — computeZipGradient of the held flood AAL, identical to
   *  the webpage/homepage-map color. FALLBACK when no AAL (caller omits ?fill). */
  fillColor: string;
  /** Primary place name for the ZIP (resolveZip), else the ZIP itself. */
  place: string;
  /** True when a shape cutout exists for this ZIP. */
  shapeFound: boolean;
  /** De-duplicated sources across the ranked signals (label + url). */
  sources: { label: string; url: string }[];
}

/**
 * Load + rank a ZIP's signals. Returns `null` for an out-of-scope ZIP (the caller
 * decides how to degrade); empty-tolerant otherwise — a pack that fails to load or
 * holds no row for this ZIP simply contributes no candidate (never throws).
 */
export async function loadRankedZipSignals(
  zip: string,
  opts: { censusPolicy?: "all" | "income-only" } = {},
): Promise<RankedZipSignals | null> {
  const res = resolveZip(zip);
  if (!res.in_scope) return null;
  const place = (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? zip;

  const [registryBrains, env, permits, summary, censusSignals] = await Promise.all([
    Promise.all(REGISTRY_PACK_IDS.map((id) => loadParsedBrain(id))).then(
      (brains) => new Map(REGISTRY_PACK_IDS.map((id, i) => [id, brains[i]])),
    ),
    loadParsedBrain("env-swfl"),
    loadParsedBrain("permits-swfl"),
    loadZipQuickSummary(zip),
    loadCensusSignals(zip),
  ]);

  const registryTables = buildRegistryTableMap(registryBrains);
  const { found: shapeFound } = extractZipShape(zip);

  // ── Flood — flood_by_zip detail table first (all ZIPs); key_metrics fallback ──
  const floodTable = env?.output.detail_tables?.find((t) => t.id === "flood_by_zip");
  const floodRows: FloodZipRow[] = (floodTable?.rows ?? [])
    .map((r) => ({
      zip: r.key,
      aal: r.cells["aal_usd_per_insured_property"] as number,
      pctRank: typeof r.cells["pct_rank"] === "number" ? (r.cells["pct_rank"] as number) : null,
    }))
    .filter((r) => typeof r.aal === "number" && Number.isFinite(r.aal));
  let floodForZip: FloodZipRow | null = floodRows.find((r) => r.zip === zip) ?? null;
  const floodMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_usd_per_insured_property`,
  );
  const rankMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_pct_swfl_rank`,
  );
  if (!floodForZip && floodMetric && rankMetric) {
    floodForZip = { zip, aal: floodMetric.value as number, pctRank: rankMetric.value as number };
  }
  const hasFlood = floodForZip !== null;
  const floodSourceUrl = floodTable?.source.url ?? floodMetric?.source.url ?? "";
  const floodSourceCitation = floodTable?.source.citation ?? floodMetric?.source.citation ?? "";

  // ── Permits — permits_by_zip counts (Lee Accela feed) ──
  const permitsTable = permits?.output.detail_tables?.find((t) => t.id === "permits_by_zip");
  const permitsCountMap = new Map<string, number>();
  for (const r of permitsTable?.rows ?? []) {
    const n = r.cells["n_current"];
    if (typeof n === "number") {
      permitsCountMap.set(r.key, (permitsCountMap.get(r.key) ?? 0) + n);
    }
  }
  const hasPermits = (permitsCountMap.get(zip) ?? 0) > 0;
  const permitsSourceUrl = hasPermits ? (permitsTable?.source.url ?? "") : "";
  const permitsSourceCitation = hasPermits
    ? (permitsTable?.source.citation ?? "Lee County permits")
    : "";

  // ── Census — join summary figures with the numeric lookup. income-only policy
  // keeps ONLY the income VALUE (the distribution stays full, so income's
  // percentile is computed against the whole SWFL set). ──
  const censusPolicy = opts.censusPolicy ?? "all";
  const censusValues = filterCensusValues(
    summary.figures,
    censusSignals.numericByKey,
    censusPolicy,
  );

  const { candidates } = buildZipCandidates({
    zip,
    registryTables,
    floodRows,
    floodForZip,
    floodSource: floodSourceUrl
      ? { label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl }
      : undefined,
    permitsCounts: permitsCountMap,
    permitsSource: permitsSourceUrl
      ? { label: permitsSourceCitation, url: permitsSourceUrl }
      : undefined,
    censusValues,
    censusDistribution: censusSignals.distribution,
  });

  const ranked = rankSignals(candidates);

  // Same gradient the homepage map + report page paint the shape with.
  const fillColor = computeZipGradient(
    hasFlood ? (floodForZip as FloodZipRow).aal : undefined,
    FLOOD_GRADIENT.low,
    FLOOD_GRADIENT.high,
    FLOOD_GRADIENT.c0,
    FLOOD_GRADIENT.c1,
    FLOOD_GRADIENT.c2,
  );

  // De-dup sources by url (keep first label seen).
  const sourceMap = new Map<string, { label: string; url: string }>();
  for (const s of ranked) {
    if (s.source?.url && !sourceMap.has(s.source.url)) {
      sourceMap.set(s.source.url, { label: s.source.label, url: s.source.url });
    }
  }

  return {
    ranked,
    hasFlood,
    fillColor,
    place,
    shapeFound,
    sources: [...sourceMap.values()],
  };
}
