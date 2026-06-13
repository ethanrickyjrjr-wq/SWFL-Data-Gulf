/**
 * welcome/answer — the live {answer} producer for the grounded welcome route.
 *
 * Turns an already-assembled LocationDossier into the typed WelcomeAnswer (hero
 * cards) the client renders, with the SAME no-invention guarantees as the prose
 * path:
 *   • GATING comes from the dossier line (is_true_zip, coverage_label, source) —
 *     never reconstructed, never relabeled. A county figure can never be stamped
 *     as a ZIP fact (the MOAT).
 *   • The brain is re-loaded ONLY to read the structured value/format/units/
 *     direction/fetched_at for the SAME row the dossier matched. It can never
 *     become a second, ungated source.
 *   • value grain matches is_true_zip BY CONSTRUCTION: a true-ZIP line yields
 *     only a per-ZIP value (or no card); a coarse line yields only the coarse
 *     headline (or no card). No regex over prose — a missing value drops the
 *     card (the no-invention floor), it is never reconstructed.
 *   • the FLOOD card is doubly gated (explicit ZIP + a real per-ZIP AAL row),
 *     mirroring the prose path's env-swfl suppression (grounded.ts).
 *
 * Sources never leak: domain via prettySource (default-deny allowlist), url
 * dropped when isInternalSource — both belts the client's citationLink.
 */
import type { LocationDossier } from "@/lib/zip-dossier";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";
import type { BrainOutputMetric } from "@/refinery/types/brain-output.mts";
import { loadParsedBrain } from "@/lib/fetch-brain";
import { prettySource, representativeFreshnessToken } from "@/lib/welcome/grounded";
import {
  isInternalSource,
  type MetricFormat,
  type PlaceEcho,
  type WelcomeAnswer,
  type WelcomeMetric,
} from "@/lib/welcome/frames";

/** A hero card's identity + how to extract its value from its brain. Ordered. */
interface HeroCard {
  key: string;
  label: string;
  brain_id: string;
  /** Branch (a): a zip-grain detail-table column id whose cell is the per-ZIP value. */
  detailColumn?: string;
  /** Branch (b): the specific key_metric slug fragment for the per-ZIP value
   *  (matched together with `_zip_<zip>`). Targeting the EXACT fragment avoids the
   *  generic-first-`_zip_` mis-pick (e.g. rentals' YoY% precedes its rent index). */
  zipMetric?: string;
  /** Branch (c): the explicit key_metric slug for the coarse (county/regional)
   *  fallback. Omit → no coarse card (e.g. flood is per-ZIP only). */
  coarseMetric?: string;
}

// home value (Redfin per-ZIP) + rent (Zillow ZORI per-ZIP) + flood AAL (FEMA NFIP,
// coastal/claim-gated, per-ZIP only). Permits is intentionally absent: permits-swfl
// holds no ZIP grain and its headline is a corridor z-score (ratio) — not a clean
// consumer hero number. Add an entry here once a clean county count exists.
const HERO_CARDS: HeroCard[] = [
  {
    // Redfin median SALE PRICE (transaction-based, mix-shift sensitive) — labeled
    // "Median Sale Price", NOT "…Value", so a luxury-heavy month can't make the
    // label lie. ZHVI (home-values-swfl) stays an upstream / the /charts trend.
    key: "home_value",
    label: "Median Sale Price",
    brain_id: "housing-swfl",
    detailColumn: "median_sale_price",
    coarseMetric: "housing_median_sale_price_swfl",
  },
  {
    key: "rent",
    label: "Median Rent",
    brain_id: "rentals-swfl",
    detailColumn: "rent_index_latest",
    coarseMetric: "rental_rent_index_zori_regional_median",
  },
  {
    key: "flood_aal",
    label: "Annual Flood Loss (per property)",
    brain_id: "env-swfl",
    zipMetric: "flood_aal_usd_per_insured_property",
  },
];

const MAX_CARDS = 4;

interface Picked {
  value: number | string;
  display_format: MetricFormat;
  units?: string;
  direction?: "rising" | "falling" | "stable";
  fetched_at: string;
}

/** A per-ZIP value for the same row the dossier matched, or null (→ drop the card). */
function pickPerZip(brain: ParsedBrain, zip: string, card: HeroCard): Picked | null {
  // (a) a zip-grain detail-table row keyed === zip → the card's designated column cell.
  if (card.detailColumn) {
    for (const table of brain.output.detail_tables ?? []) {
      if (table.grain !== "zip") continue;
      const col = table.columns.find((c) => c.id === card.detailColumn);
      if (!col) continue;
      const row = table.rows.find((r) => r.key === zip);
      if (!row) continue;
      const v = row.cells[col.id];
      if (v == null || typeof v === "boolean") continue; // absent / flag cell → not a value
      return {
        value: v,
        display_format: col.display_format ?? "raw",
        units: col.units,
        fetched_at: table.source.fetched_at,
      };
    }
  }
  // (b) a per-ZIP key_metric whose slug carries `_zip_<zip>` AND the card's fragment.
  if (card.zipMetric) {
    const frag = card.zipMetric;
    const m = (brain.output.key_metrics ?? []).find(
      (km) => km.metric.includes(`_zip_${zip}`) && km.metric.includes(frag),
    );
    if (m) return fromMetric(m);
  }
  return null;
}

/** The coarse (county/regional) headline value, or null. */
function pickCoarse(brain: ParsedBrain, card: HeroCard): Picked | null {
  if (!card.coarseMetric) return null;
  const m = (brain.output.key_metrics ?? []).find((km) => km.metric === card.coarseMetric);
  return m ? fromMetric(m) : null;
}

function fromMetric(m: BrainOutputMetric): Picked {
  return {
    value: m.value,
    display_format: m.display_format ?? "raw",
    units: m.units,
    direction: m.direction,
    fetched_at: m.source.fetched_at,
  };
}

export interface BuildWelcomeAnswerInput {
  dossier: LocationDossier;
  /** True only when the USER typed the 5 digits (gates the flood card). */
  explicitZip: boolean;
  /** The clean place echo, computed once by the route (identityForLocation). */
  place: PlaceEcho;
  /** DI seam — defaults to the real disk loader; tests inject a stub. */
  loadBrain?: (slug: string) => Promise<ParsedBrain | null>;
}

/**
 * Build the hero-card answer from a dossier, or null when no hero card matched.
 * Gating fields ride from the dossier line; the brain supplies only the figure.
 */
export async function buildWelcomeAnswer(
  input: BuildWelcomeAnswerInput,
): Promise<WelcomeAnswer | null> {
  const { dossier, explicitZip, place } = input;
  const loadBrain = input.loadBrain ?? loadParsedBrain;
  const zip = dossier.zip;
  const metrics: WelcomeMetric[] = [];

  for (const card of HERO_CARDS) {
    if (metrics.length >= MAX_CARDS) break;

    const line = dossier.lines.find((l) => l.brain_id === card.brain_id);
    if (!line) continue; // brain didn't cover this location → no card

    // ── FLOOD GATE — evaluated on the dossier line, before any brain load ──
    if (card.key === "flood_aal") {
      if (!explicitZip) continue; // a town spans ZIPs → suppress (mirrors grounded.ts)
      if (!line.is_true_zip) continue; // no real per-ZIP AAL row → suppress (inland ZIPs)
    }

    const brain = await loadBrain(card.brain_id);
    if (!brain) continue;

    // Grain-consistent: true-ZIP → per-ZIP value only; coarse → headline only.
    const picked = line.is_true_zip && zip ? pickPerZip(brain, zip, card) : pickCoarse(brain, card);
    if (!picked) continue; // no value for the matched grain → drop the card (no invention)

    metrics.push({
      key: card.key,
      label: card.label,
      value: picked.value, // ← brain (structured), the same row the dossier matched
      display_format: picked.display_format, // ← brain
      units: picked.units, // ← brain
      direction: picked.direction, // ← brain
      is_true_zip: line.is_true_zip, // ← DOSSIER (gating), never the brain
      coverage_label: line.coverage_label, // ← DOSSIER, never relabeled
      source: {
        domain: prettySource(line.source_url, line.source_citation), // default-deny
        url: isInternalSource(line.source_url) ? "" : line.source_url, // belt the client
        as_of: picked.fetched_at?.slice(0, 7) ?? "", // YYYY-MM, from source.fetched_at
        citation: line.source_citation,
      },
    });
  }

  if (metrics.length === 0) return null;
  return { freshness_token: representativeFreshnessToken(dossier) ?? "", place, metrics };
}
