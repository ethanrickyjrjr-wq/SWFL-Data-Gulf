import { fetchVerifiedCorridorRows } from "../../app/r/cre-swfl/corridors";
import { buildMetricRows, stripCitations } from "../../app/r/cre-swfl/corridor-metrics";
import { corridorKey } from "../../refinery/lib/corridor-display.mts";
import { normalizeCorridor, type CorridorNormalized } from "../../refinery/sources/cre-source.mts";
import { loadParsedBrain } from "../fetch-brain";
import { asOfFromToken } from "../project/as-of";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * Corridor surface adapter (spec §Phase E). Reads the SAME verified rows the
 * /r/cre-swfl/[corridor] route resolves against and the SAME metric rows the
 * page renders (app/r/cre-swfl/corridor-metrics.ts) — the bake can never cite
 * a figure the page doesn't hold. Context (cited character prose + intel
 * flags) is number-whitelisted by the validator, so its figures can't trip
 * the no-invention lint.
 */

/** Every corridor with a live drill-down page — the corridor bake population. */
export async function listCorridorSurfaceKeys(): Promise<string[]> {
  try {
    const rows = await fetchVerifiedCorridorRows();
    return [
      ...new Set(rows.map((r) => corridorKey(String(r.corridor_name ?? ""))).filter(Boolean)),
    ].sort();
  } catch {
    return []; // no lake creds (e.g. offline dry-run) — bake nothing, never crash
  }
}

export function corridorBakeFacts(c: CorridorNormalized): BakeFact[] {
  return buildMetricRows(c).map((m) => ({
    label: m.label,
    display: typeof m.value === "string" ? m.value : String(m.value),
    sub: c.metrics_period ? `period: ${c.metrics_period}` : null,
    why: null,
    source: "SWFL Data Gulf commercial corridor data",
  }));
}

export function corridorBakeContext(c: CorridorNormalized): string[] {
  const out: string[] = [];
  if (c.character_facts) {
    out.push(
      ...stripCitations(c.character_facts)
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
    );
  }
  for (const f of (c.flags ?? []).slice(0, 3)) out.push(f.flag);
  return out;
}

export async function assembleCorridorBakeInputs(slug: string): Promise<BakeInputs | null> {
  const rows = await fetchVerifiedCorridorRows();
  const row = rows.find((r) => corridorKey(String(r.corridor_name ?? "")) === slug);
  if (!row) return null;
  const c = normalizeCorridor(row);
  const facts = corridorBakeFacts(c);
  if (facts.length === 0) return null;

  const cre = await loadParsedBrain("cre-swfl");
  const sources = new Map<string, SourceRef>();
  for (const m of buildMetricRows(c)) {
    if (m.sourceUrl) {
      sources.set(m.sourceUrl, {
        label: "SWFL Data Gulf — commercial corridors",
        url: m.sourceUrl,
      });
    }
  }
  return {
    surface: "corridor",
    key: slug,
    place: c.display_name ?? c.name,
    county: c.county !== "Unknown" ? c.county : null,
    asOf: (cre ? asOfFromToken(cre.freshness_token) : null) ?? null,
    facts,
    context: corridorBakeContext(c),
    sources: [...sources.values()],
  };
}
