import { resolveZip } from "../../refinery/lib/zip-resolver.mts";
import type { LocationInput } from "../../refinery/lib/location-resolver.mts";
import { loadParsedBrain } from "../fetch-brain";
import { buildRegistryTableMap } from "./load-registry-tables";
import { rankSignals } from "./signal-rank";
import {
  buildZipCandidates,
  loadCensusSignals,
  type CensusValue,
  type FloodZipRow,
} from "./candidates";
import { loadZipQuickSummary } from "../zip-summary/load";
import { assembleLocationDossier } from "../zip-dossier";

/**
 * ONE assembly root for a ZIP's report data (spec 2026-07-09-zip-page-destination
 * §One root #1). Both consumers read THIS: the report page
 * (app/r/zip-report/[zip]/page.tsx) and the narrative bake adapter
 * (lib/narratives/zip-inputs.ts) — so the bake can never cite a figure the page
 * doesn't hold, and neither copy can drift.
 *
 * HASH-STABILITY LANDMINE: assembleZipBakeInputs hashes facts derived from
 * `ranked` — any change to the derivations below re-bakes every ZIP surface.
 * Behavior-preserving edits only; verified against a recorded pre-refactor
 * inputsHash (see the Phase E plan, Task 3).
 */

export const REGISTRY_PACK_IDS = [
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
  // Demoted-only today (3 rail citations in candidates.ts) — registry-coverage.test.ts
  // fails if a pack the registry references is missing from this list.
  "active-listings-swfl",
] as const;

type ParsedBrain = Awaited<ReturnType<typeof loadParsedBrain>>;

export interface ZipReportAssembly {
  res: ReturnType<typeof resolveZip>;
  primaryPlace: string | null;
  freshnessToken: string | undefined;
  registryBrains: Map<string, ParsedBrain>;
  registryTables: ReturnType<typeof buildRegistryTableMap>;
  env: ParsedBrain;
  permits: ParsedBrain;
  dossier: Awaited<ReturnType<typeof assembleLocationDossier>>;
  summary: Awaited<ReturnType<typeof loadZipQuickSummary>>;
  censusSignals: Awaited<ReturnType<typeof loadCensusSignals>>;
  censusValues: CensusValue[];
  floodRows: FloodZipRow[];
  floodForZip: FloodZipRow | null;
  floodSourceUrl: string;
  floodSourceCitation: string;
  permitsCountMap: Map<string, number>;
  permitsCount: number;
  permitsSourceUrl: string;
  permitsSourceCitation: string;
  candidates: ReturnType<typeof buildZipCandidates>["candidates"];
  gaps: ReturnType<typeof buildZipCandidates>["gaps"];
  railContext: ReturnType<typeof buildZipCandidates>["railContext"];
  ranked: ReturnType<typeof rankSignals>;
}

/** Load + derive everything both the page and the bake share for one ZIP.
 *  Returns null when the ZIP is out of scope (caller decides 404 vs panel). */
export async function assembleZipReport(zip: string): Promise<ZipReportAssembly | null> {
  const res = resolveZip(zip);
  if (!res.in_scope) return null;
  const loc: LocationInput = { kind: "zip", resolution: res };

  const [registryBrains, env, permits, dossier, summary, censusSignals] = await Promise.all([
    Promise.all(REGISTRY_PACK_IDS.map((id) => loadParsedBrain(id))).then(
      (brains) => new Map(REGISTRY_PACK_IDS.map((id, i) => [id, brains[i]])),
    ),
    loadParsedBrain("env-swfl"),
    loadParsedBrain("permits-swfl"),
    assembleLocationDossier(loc),
    loadZipQuickSummary(zip),
    loadCensusSignals(zip),
  ]);
  const registryTables = buildRegistryTableMap(registryBrains);

  // ── Flood — flood_by_zip detail table first, key_metrics fallback ──────────
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
  const floodSourceUrl = floodTable?.source.url ?? floodMetric?.source.url ?? "";
  const floodSourceCitation = floodTable?.source.citation ?? floodMetric?.source.citation ?? "";

  // ── Permits (aggregate across corridors) ────────────────────────────────────
  const permitsTable = permits?.output.detail_tables?.find((t) => t.id === "permits_by_zip");
  const permitsCountMap = new Map<string, number>();
  for (const r of permitsTable?.rows ?? []) {
    const n = r.cells["n_current"];
    if (typeof n === "number") permitsCountMap.set(r.key, (permitsCountMap.get(r.key) ?? 0) + n);
  }
  const permitsCount = permitsCountMap.get(zip) ?? 0;
  const permitsSourceUrl = permitsCount > 0 ? (permitsTable?.source.url ?? "") : "";
  const permitsSourceCitation =
    permitsCount > 0 ? (permitsTable?.source.citation ?? "Lee County permits") : "";

  // ── Candidate pool + deterministic ranking ──────────────────────────────────
  const censusValues: CensusValue[] = summary.figures.flatMap((fig) => {
    const value = censusSignals.numericByKey.get(fig.key);
    if (value === undefined) return [];
    return [
      {
        key: fig.key,
        label: fig.label,
        value,
        display: fig.value,
        sourceLabel: fig.source_label,
        sourceUrl: fig.source_url,
      },
    ];
  });
  const { candidates, gaps, railContext } = buildZipCandidates({
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

  const housing = registryBrains.get("housing-swfl");
  const freshnessToken =
    housing?.freshness_token ?? env?.freshness_token ?? Object.values(dossier.freshness_tokens)[0];
  const primaryPlace =
    (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;

  return {
    res,
    primaryPlace,
    freshnessToken,
    registryBrains,
    registryTables,
    env,
    permits,
    dossier,
    summary,
    censusSignals,
    censusValues,
    floodRows,
    floodForZip,
    floodSourceUrl,
    floodSourceCitation,
    permitsCountMap,
    permitsCount,
    permitsSourceUrl,
    permitsSourceCitation,
    candidates,
    gaps,
    railContext,
    ranked,
  };
}
