import { resolveZip } from "../../refinery/lib/zip-resolver.mts";
import type { LocationInput } from "../../refinery/lib/location-resolver.mts";
import { loadParsedBrain } from "../fetch-brain";
import { buildRegistryTableMap } from "../zip-report/load-registry-tables";
import { rankSignals } from "../zip-report/signal-rank";
import {
  buildZipCandidates,
  loadCensusSignals,
  type CensusValue,
  type FloodZipRow,
} from "../zip-report/candidates";
import { loadZipQuickSummary } from "../zip-summary/load";
import { assembleLocationDossier, selectDossierLines } from "../zip-dossier";
import { asOfFromToken } from "../project/as-of";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * ZIP surface adapter — assembles BakeInputs from the SAME roots the report
 * page reads (candidates/signal-rank/dossier), so the bake can never cite a
 * figure the page doesn't hold. Glue intentionally mirrors
 * app/r/zip-report/[zip]/page.tsx; the full shared extraction lands with the
 * Phase E report-shell migration (see spec §One root #1).
 */

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

/** Every ZIP the housing registry ranks — the Phase B bake population. */
export async function listZipSurfaceKeys(): Promise<string[]> {
  const housing = await loadParsedBrain("housing-swfl");
  const rows = housing?.output.detail_tables?.find((t) => t.id === "housing_by_zip")?.rows ?? [];
  return rows.map((r) => r.key).filter((k) => /^\d{5}$/.test(k));
}

function stripStatAnnotation(text: string): string {
  return text.replace(/\s*\([^()]*:\s*[^()]+\)\s*$/, "");
}

export async function assembleZipBakeInputs(zip: string): Promise<BakeInputs | null> {
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

  // Flood (mirrors the page: detail table first, key_metrics fallback)
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

  // Permits (aggregate across corridors, page-identical)
  const permitsTable = permits?.output.detail_tables?.find((t) => t.id === "permits_by_zip");
  const permitsCountMap = new Map<string, number>();
  for (const r of permitsTable?.rows ?? []) {
    const n = r.cells["n_current"];
    if (typeof n === "number") permitsCountMap.set(r.key, (permitsCountMap.get(r.key) ?? 0) + n);
  }
  const permitsSourceUrl =
    (permitsCountMap.get(zip) ?? 0) > 0 ? (permitsTable?.source.url ?? "") : "";

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
      ? { label: permitsTable?.source.citation ?? "Lee County permits", url: permitsSourceUrl }
      : undefined,
    censusValues,
    censusDistribution: censusSignals.distribution,
  });
  const ranked = rankSignals(candidates);
  if (ranked.length === 0) return null;

  const facts: BakeFact[] = ranked.map((s) => ({
    label: s.label,
    display: s.display,
    sub: s.sub ?? null,
    why: s.why ?? null,
    source: s.source?.label ?? "SWFL Data Gulf",
  }));

  const contextLines = selectDossierLines(dossier.lines, 2)
    .filter((l) => !l.is_true_zip)
    .map((l) => stripStatAnnotation(l.text));

  const sources = new Map<string, SourceRef>();
  for (const s of ranked) if (s.source?.url) sources.set(s.source.url, s.source);
  for (const l of dossier.lines) {
    if (l.source_url)
      sources.set(l.source_url, {
        label: l.source_citation || "SWFL Data Gulf",
        url: l.source_url,
      });
  }

  const housing = registryBrains.get("housing-swfl");
  const freshnessToken =
    housing?.freshness_token ?? env?.freshness_token ?? Object.values(dossier.freshness_tokens)[0];

  const primaryPlace =
    (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;

  return {
    surface: "zip",
    key: zip,
    place: primaryPlace,
    county: res.county_names[0] ?? null,
    asOf: asOfFromToken(freshnessToken) ?? null,
    facts,
    context: contextLines,
    sources: [...sources.values()],
  };
}
