// Shared TypeScript interfaces for all viz components.
// Every component in components/viz/ imports from here.
// Do not duplicate these inline — keep the source of truth here.

export interface CorridorEntry {
  id: string;
  name: string;
  submarket: string;
  // Per-metric fields are nullable: the fixture is regenerated from
  // Supabase `corridor_profiles` (see refinery/tools/regen-corridor-fixture.mts),
  // and only the columns owned by that table are guaranteed populated.
  // permit_zscore/saturation_index require permits-swfl pack output;
  // lat/lng require a centroid table. Both are TODO joins — consumers
  // must null-filter before rendering on those fields.
  nnn_asking_rent_per_sqft: number | null;
  vacancy_pct: number | null;
  absorption_sqft: number | null;
  permit_zscore: number | null;
  saturation_index: number | null;
  lat: number | null;
  lng: number | null;
}

/**
 * CorridorEntry with all per-metric fields non-null. Use this as the type after
 * a filter that drops rows missing any of the optional fields, so downstream
 * code can dereference `.toFixed()` without re-checking for null.
 */
export type CleanCorridorEntry = {
  [K in keyof CorridorEntry]: NonNullable<CorridorEntry[K]>;
};

export interface ZHVIMonth {
  month: string; // "YYYY-MM"
  cape_coral: number | null;
  fort_myers: number | null;
  naples: number | null;
}

// Non-nullable version of ZHVIMonth used for chart rendering (nulls filtered before passing in).
export interface ZHVITrendEntry {
  month: string; // "YYYY-MM"
  cape_coral: number;
  fort_myers: number;
  naples: number;
}

export interface ZORIEntry {
  zip: string;
  city: string;
  county: string;
  trend: { month: string; rent: number }[];
}

export interface KeyMetric {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  change_pct: number;
}

export interface BrainOutput {
  id: string;
  conclusion: string;
  confidence: number; // 0–1
  freshness_token: string;
  updated_at: string;
  sources_count: number;
  key_metrics: KeyMetric[];
  caveats: string[];
}

export interface PermitMonth {
  month: string; // "YYYY-MM"
  zscore: number;
}

export interface PermitHeatmapRow {
  corridor: string;
  months: PermitMonth[];
}

export interface VizStats {
  corridors_tracked: number;
  sqft_analyzed: number;
  data_sources: number;
  swfl_zips: number;
  flood_records: number;
  brain_confidence: number;
}
