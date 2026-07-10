import { assembleZipReport } from "../zip-report/assemble";
import { loadParsedBrain } from "../fetch-brain";
import { selectDossierLines } from "../zip-dossier";
import { asOfFromToken } from "../project/as-of";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * ZIP surface adapter — a thin mapping over lib/zip-report/assemble.ts, the
 * ONE assembly root the report page also reads (spec §One root #1; the Phase B
 * mirror of the page's glue was extracted there in Phase E). The bake can
 * never cite a figure the page doesn't hold.
 */

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
  const a = await assembleZipReport(zip);
  if (!a || a.ranked.length === 0) return null;
  const { ranked, dossier, freshnessToken, primaryPlace, res } = a;

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
