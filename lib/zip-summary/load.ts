import type { ZipQuickSummary } from "./types";

/**
 * Per-ZIP Quick Summary loader — the seam the ZIP report page renders from.
 *
 * STUB (Section B): returns an empty, well-formed summary so the page ships
 * grounded before the crawl pipeline lands. Section A (the crawl4ai pipeline —
 * docs/superpowers/plans/2026-06-24-zip-quick-summary-crawl-HANDOFF.md) replaces
 * THIS BODY with the real query against `data_lake.zip_quick_summary`, conforming
 * to ./types. Keep the signature stable — it is the only file the two sessions share.
 *
 * Empty-tolerant by contract (the ODD "empty-tolerant consumer"): no rows → `[]`,
 * never a fabricated figure.
 */
export async function loadZipQuickSummary(zip: string): Promise<ZipQuickSummary> {
  return { zip, figures: [] };
}
