import type { CorridorNormalized } from "../../../refinery/sources/cre-source.mts";
import type { MetricRow } from "../_components/metrics-table";

/**
 * Corridor display helpers shared by the drill-down page
 * (app/r/cre-swfl/[corridor]/page.tsx) and the narrative bake adapter
 * (lib/narratives/corridor-inputs.ts) — moved here verbatim so the bake can
 * never cite a metric row the page doesn't render (spec §One root).
 */

export function stripCitations(text: string): string {
  return text.replace(/\[(?:internal|web)-\d+\]/g, "");
}

export function buildMetricRows(c: CorridorNormalized): MetricRow[] {
  const rows: MetricRow[] = [];
  if (c.cap_rate_pct !== null) {
    rows.push({
      label: "Cap rate",
      value: `${c.cap_rate_pct.toFixed(1)}%`,
      direction: c.cap_rate_direction,
      sourceUrl: c.cap_rate_source_url,
    });
  }
  if (c.vacancy_rate_pct !== null) {
    rows.push({
      label: "Vacancy",
      value: `${c.vacancy_rate_pct.toFixed(1)}%`,
      direction: c.vacancy_rate_direction,
      sourceUrl: c.vacancy_rate_source_url,
    });
  }
  if (c.absorption_sqft !== null) {
    rows.push({
      label: "Net absorption",
      value: `${c.absorption_sqft >= 0 ? "+" : ""}${c.absorption_sqft.toLocaleString()} sf`,
      direction: c.absorption_sqft_direction,
      sourceUrl: c.absorption_sqft_source_url,
    });
  }
  if (c.asking_rent_psf !== null) {
    rows.push({
      label: "Asking rent (NNN)",
      value: `$${c.asking_rent_psf.toFixed(2)}/sf`,
      direction: c.asking_rent_psf_direction,
      sourceUrl: c.asking_rent_psf_source_url,
    });
  }
  return rows;
}
