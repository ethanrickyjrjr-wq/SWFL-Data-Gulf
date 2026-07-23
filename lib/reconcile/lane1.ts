/**
 * lib/reconcile/lane1.ts — Plan C, the Lane-1 live lake lookup.
 *
 * Fetches our current cited fact for a `report_id` + metric, resiliently:
 *   • `lookupLakeFact` — the async I/O wrapper: `loadParsedBrain` (null-resilient)
 *     then the pure core. Wrapped in try/catch → `null` so a missing/invalid
 *     brain becomes `not_found`, NEVER a crash (B5).
 *   • `factFromParsedBrain` — PURE: catalog-gap-safe `expires` derivation, then
 *     EITHER a per-ZIP structured cell read (when `zip` is given) OR headline
 *     key_metrics slug resolution (no zip). No I/O, no throw; fully testable
 *     against a fixture `ParsedBrain` (no disk, no mock.module footgun).
 *
 * `expires` is derived catalog-gap-safe (B1/B2): a stamped `output.expires` wins;
 * else `expiresFor(refined_at, catalog.ttl_seconds)` when the brain is cataloged;
 * else it stays `undefined` — an uncataloged + unstamped brain is NEVER given a
 * fake TTL (the comparator maps `undefined` to `not_found`, not a false "expired").
 *
 * Per-ZIP reads the structured `detail_tables` cell (a comparable value) rather
 * than `fetchDetailRow`'s rendered prose — reconciliation needs the number, not
 * a text block. `slugOrLabel` in the per-ZIP branch IS the detail-table column
 * id (a per-ZIP caller, e.g. `ZIP_SIGNAL_BRAINS`, passes it directly) — it is
 * NEVER routed through headline key_metrics slug/label resolution, because a
 * real brain's headline metric id/label routinely differs from its own per-ZIP
 * column id (verified against `housing-swfl`: headline is
 * `housing_median_sale_price_swfl`, the ZIP column is `median_sale_price`) —
 * gating on the former silently broke every real per-ZIP lookup for a month
 * (fixed 2026-07-22, `piece3_track_b_verify`).
 */

import { loadParsedBrain } from "../fetch-brain";
import { BRAIN_CATALOG } from "../../refinery/packs/catalog.mts";
import { expiresFor } from "../../refinery/lib/freshness.mts";
import { resolveMetricSlug } from "./slug-map";
import type { LaneOneFact, LaneOneSource } from "./types";
import type { ParsedBrain } from "../../refinery/render/speaker.mts";
import type { BrainOutput, BrainOutputMetricSource } from "../../refinery/types/brain-output.mts";

/** Project a brain's metric/table receipt down to the lane-1 source shape. */
function toLaneOneSource(s: BrainOutputMetricSource): LaneOneSource {
  return { url: s.url, fetched_at: s.fetched_at, tier: s.tier, citation: s.citation };
}

function buildFact(
  brain_id: string,
  metric_slug: string,
  label: string,
  value: number | string,
  grain: string,
  source: BrainOutputMetricSource,
  expires: string | undefined,
  freshness_token: string | undefined,
): LaneOneFact {
  return {
    brain_id,
    metric_slug,
    label,
    value,
    grain,
    source: toLaneOneSource(source),
    ...(expires !== undefined ? { expires } : {}),
    ...(freshness_token !== undefined ? { freshness_token } : {}),
  };
}

/** Structured per-ZIP read: the cell for `slug` at `zip` across `detail_tables`. */
function findZipCell(
  output: BrainOutput,
  slug: string,
  zip: string,
): {
  value: number | string;
  label: string;
  grain: string;
  source: BrainOutputMetricSource;
} | null {
  const wantRaw = zip.trim();
  const want5 = wantRaw.match(/\d{5}/)?.[0] ?? wantRaw;
  for (const table of output.detail_tables ?? []) {
    const col = table.columns.find((c) => c.id === slug);
    if (col === undefined) continue;
    const row = table.rows.find((r) => r.key === wantRaw || r.key === want5);
    if (row === undefined) continue;
    const cell = row.cells[slug];
    // A boolean/empty/absent cell is not a comparable metric value.
    if (cell === null || cell === undefined || typeof cell === "boolean") continue;
    return { value: cell, label: col.label, grain: table.grain, source: table.source };
  }
  return null;
}

/**
 * PURE core — resolve a `LaneOneFact` from an already-loaded `ParsedBrain`.
 * Returns `null` for an unresolvable/ambiguous slug or a per-ZIP miss. Never
 * throws (the `expiresFor` derivation is R2-NaN-guarded).
 */
export function factFromParsedBrain(
  report_id: string,
  brain: ParsedBrain,
  slugOrLabel: string,
  zip?: string,
): LaneOneFact | null {
  const output = brain.output;

  // Derive expires — catalog-gap-safe (stamped wins; else derive when cataloged;
  // else undefined). expiresFor returns undefined on a corrupt refined_at (R2).
  const cat = BRAIN_CATALOG.find((e) => e.id === report_id);
  const expires =
    output.expires ?? (cat ? expiresFor(output.refined_at, cat.ttl_seconds) : undefined);

  // Per-ZIP: `slugOrLabel` IS the detail-table COLUMN id here (per-ZIP callers,
  // e.g. ZIP_SIGNAL_BRAINS, pass the table column id directly) — NOT a headline
  // key_metrics slug/label. Gating this on key_metrics resolution first (as the
  // no-zip path below does) is wrong: a real brain's headline metric id/label
  // (e.g. housing-swfl's "housing_median_sale_price_swfl") never normalize-matches
  // its own per-ZIP column id ("median_sale_price"), so resolution silently failed
  // for every real per-ZIP lookup before ever reaching `findZipCell`. Read the
  // structured cell (the comparable value) directly, at zip grain.
  if (zip !== undefined) {
    const cell = findZipCell(output, slugOrLabel, zip);
    if (cell === null) return null; // lake holds no row for this ZIP/column → not_found
    return buildFact(
      output.brain_id,
      slugOrLabel,
      cell.label,
      cell.value,
      cell.grain,
      cell.source,
      expires,
      brain.freshness_token,
    );
  }

  // Headline metric — resolve the slug against key_metrics: a direct metric-id
  // match wins; else label resolution (never guess: unknown/ambiguous → null).
  const direct = output.key_metrics.find((m) => m.metric === slugOrLabel);
  const slug = direct
    ? direct.metric
    : resolveMetricSlug(report_id, slugOrLabel, output.key_metrics);
  if (slug === null) return null;
  const metric = output.key_metrics.find((m) => m.metric === slug);
  if (metric === undefined) return null;

  // Grain from the master grain boundary when present; else "unknown" — a leaf
  // metric carries no per-metric grain field, and labeling it a specific "region"
  // would be an invented (and possibly wrong) claim. "unknown" is unranked in
  // GRAIN_RANK, so it never triggers a false out_of_grain.
  const grain = output.grain_boundary?.finest_grain ?? "unknown";
  return buildFact(
    output.brain_id,
    slug,
    metric.label,
    metric.value,
    grain,
    metric.source,
    expires,
    brain.freshness_token,
  );
}

/** Async I/O wrapper — load the brain off disk, then the pure core. Never throws. */
export async function lookupLakeFact(
  report_id: string,
  slugOrLabel: string,
  zip?: string,
): Promise<LaneOneFact | null> {
  try {
    const brain = await loadParsedBrain(report_id);
    if (brain === null) return null;
    return factFromParsedBrain(report_id, brain, slugOrLabel, zip);
  } catch {
    return null; // B5 + R2 — never throw across the lane boundary
  }
}
