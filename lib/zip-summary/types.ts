/**
 * Per-ZIP "Quick Summary" contract — the seam between the crawl4ai pipeline
 * (Section A) and the ZIP report page (Section B).
 *
 * Spec: docs/superpowers/specs/2026-06-24-zip-report-rebuild-design.md
 * Section A handoff: docs/superpowers/plans/2026-06-24-zip-quick-summary-crawl-HANDOFF.md
 *
 * INVARIANT (no-invention / four-lane lane 3): every figure carries a real
 * `source_url`. An empty store is represented as `figures: []` — never a
 * fabricated number.
 */

export interface ZipSummaryFigure {
  /** Stable machine key, e.g. "population", "median_household_income". */
  key: string;
  /** Human label, e.g. "Population", "Median household income". */
  label: string;
  /** Display-ready value, e.g. "28,400", "$74,200". */
  value: string;
  /** Named public source URL — the citation. REQUIRED: no figure without a source. */
  source_url: string;
  /** Source label, e.g. "U.S. Census ACS 2023". */
  source_label: string;
  /** As-of date, MM/DD/YYYY. */
  as_of?: string;
}

export interface ZipQuickSummary {
  zip: string;
  /** Empty array when nothing is stored yet (empty-tolerant consumer). */
  figures: ZipSummaryFigure[];
  /** Newest figure's as-of, MM/DD/YYYY. */
  as_of?: string;
}
