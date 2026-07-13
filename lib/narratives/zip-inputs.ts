import { assembleZipReport } from "../zip-report/assemble";
import { loadParsedBrain } from "../fetch-brain";
import { isCoreScope } from "@/refinery/lib/core-scope.mts";
import { selectDossierLines } from "../zip-dossier";
import { asOfFromToken } from "../project/as-of";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * ZIP surface adapter — a thin mapping over lib/zip-report/assemble.ts, the
 * ONE assembly root the report page also reads (spec §One root #1; the Phase B
 * mirror of the page's glue was extracted there in Phase E). The bake can
 * never cite a figure the page doesn't hold.
 */

/**
 * The bake population — CORE SCOPE ONLY (Lee + Collier).
 *
 * The housing table carries 94–126 keys: mailing-ZIP and other-metro spillover on
 * top of the real coverage. Unfiltered, this listed 91 ZIPs and would have PAID a
 * model to write market narration for Venice/Sarasota (34292, 34293) — places we do
 * not cover. Every ranked ZIP-grain display surface goes through `isCoreScope`
 * (spec 2026-07-11-zip-scope-core-design.md); this one was written without it and
 * silently re-opened the leak. Scope is 57 core ZIPs, and the test below pins it —
 * a new surface that forgets this gate now turns RED instead of quietly costing money.
 */
export async function listZipSurfaceKeys(): Promise<string[]> {
  const housing = await loadParsedBrain("housing-swfl");
  const rows = housing?.output.detail_tables?.find((t) => t.id === "housing_by_zip")?.rows ?? [];
  return rows.map((r) => r.key).filter((k) => /^\d{5}$/.test(k) && isCoreScope(k));
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
