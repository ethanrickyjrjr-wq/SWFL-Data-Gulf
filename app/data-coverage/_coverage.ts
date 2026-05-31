/**
 * Display supplement for the /data-coverage page.
 *
 * The registry (ingest/cadence_registry.yaml → _registry.generated.ts) owns the
 * OPERATIONAL facts: which pipelines exist, cadence, volume floor, blocked note,
 * the resolved schema.table. This file owns only the DISPLAY facts the registry
 * can't carry: a plain-English label, the consuming brain, the coverage date
 * column, and whether that brain is live (severity amplifier — no runtime source
 * for "is this brain live", so it's set by hand, same no-drift pattern).
 *
 * KEYED BY the registry `name`. The drift test (drift.test.mts) fails CI if any
 * ACTIVE pipeline (registry `pipelines:`) lacks an entry here, or if any key here
 * is absent from the registry. `not_yet_running:` pipelines are exempt — the two
 * parked rows below (bls_oews_swfl, fdle_crime_swfl) are optional, shown so the
 * lake's full picture is visible.
 *
 * date_col / date_kind verified against information_schema 2026-05-31.
 */
import { REGISTRY_ENTRIES, type RegistryEntry } from "./_registry.generated";
import type { DateKind } from "./health";

export interface SupplementEntry {
  label: string;
  /** Consuming brain slug for /r/{brainId}; null when no brain consumes it yet. */
  brainId: string | null;
  /** Coverage column for year-extraction (tier-2 only); null = no coverage query. */
  dateCol: string | null;
  dateKind: DateKind | null;
  /** Hand-maintained: does a live brain depend on this source? Amplifies severity. */
  brainIsLive: boolean;
}

export const SUPPLEMENT: Record<string, SupplementEntry> = {
  // ── Tier-1 (Parquet, freshness-only, no coverage query) ───────────────────
  zori_swfl_duckdb: {
    label: "ZORI rents — Tier-1 Parquet (cold)",
    brainId: "rentals-swfl",
    dateCol: null,
    dateKind: null,
    brainIsLive: true,
  },
  redfin_swfl: {
    label: "Redfin housing metrics — Tier-1 Parquet",
    brainId: "housing-swfl",
    dateCol: null,
    dateKind: null,
    brainIsLive: true,
  },
  hurdat2_fl: {
    label: "HURDAT2 hurricane tracks (FL) — Tier-1",
    brainId: "hurricane-tracks-fl",
    dateCol: null,
    dateKind: null,
    brainIsLive: true,
  },
  storm_history_swfl: {
    label: "NOAA storm events (SWFL) — Tier-1",
    brainId: "storm-history-swfl",
    dateCol: null,
    dateKind: null,
    brainIsLive: true,
  },
  usgs: {
    label: "USGS water readings — Tier-1 Parquet",
    brainId: "env-swfl",
    dateCol: null,
    dateKind: null,
    brainIsLive: true,
  },
  faf5: {
    label: "FAF5 freight flows — Tier-1",
    brainId: "logistics-swfl",
    dateCol: null,
    dateKind: null,
    brainIsLive: true,
  },
  fred_g17: {
    label: "FRED G.17 industrial production — cold, not yet consumed",
    brainId: null,
    dateCol: null,
    dateKind: null,
    brainIsLive: false,
  },
  bls_ppi: {
    label: "BLS construction PPI — cold, not yet consumed",
    brainId: null,
    dateCol: null,
    dateKind: null,
    brainIsLive: false,
  },
  census_vip: {
    label: "Census value of construction put-in-place — cold, not yet consumed",
    brainId: null,
    dateCol: null,
    dateKind: null,
    brainIsLive: false,
  },
  city_pulse: {
    label: "City Pulse — daily SWFL current events",
    brainId: "city-pulse-swfl",
    dateCol: null,
    dateKind: null,
    brainIsLive: true,
  },

  // ── Tier-2 (Postgres, full coverage + health) ─────────────────────────────
  bls_laus: {
    label: "BLS LAUS unemployment (Lee/Collier/FL)",
    brainId: "macro-swfl",
    dateCol: "year",
    dateKind: "year",
    brainIsLive: true,
  },
  bls_qcew: {
    label: "BLS QCEW wages & employment",
    brainId: "sector-credit-swfl",
    dateCol: "year",
    dateKind: "year",
    brainIsLive: true,
  },
  census_cbp: {
    label: "Census County Business Patterns (FL)",
    brainId: "macro-florida",
    dateCol: "year",
    dateKind: "year",
    brainIsLive: true,
  },
  usgs_tier2: {
    label: "USGS water readings — Postgres",
    brainId: "env-swfl",
    dateCol: "obs_date",
    dateKind: "date",
    brainIsLive: true,
  },
  fema: {
    label: "FEMA NFIP flood claims",
    brainId: "env-swfl",
    dateCol: "year_of_loss",
    dateKind: "year",
    brainIsLive: true,
  },
  leepa: {
    label: "Lee County Property Appraiser parcels",
    brainId: "properties-lee-value",
    dateCol: "last_sale_date",
    dateKind: "date",
    brainIsLive: true,
  },
  fhfa: {
    label: "FHFA house price index",
    brainId: "properties-lee-value",
    dateCol: "yr",
    dateKind: "year",
    brainIsLive: true,
  },
  fdot: {
    label: "FDOT AADT traffic counts (FL)",
    brainId: "traffic-swfl",
    dateCol: "yearx",
    dateKind: "year",
    brainIsLive: true,
  },
  lee_permits: {
    label: "Lee County building permits",
    brainId: "permits-swfl",
    dateCol: "issued_date",
    dateKind: "date",
    brainIsLive: true,
  },
  collier_permits: {
    label: "Collier County building permits",
    brainId: "permits-swfl",
    dateCol: "date_issued",
    dateKind: "date",
    brainIsLive: true,
  },
  fl_dor_tdt: {
    label: "FL DOR — Tourist Development Tax collections",
    brainId: "tourism-tdt",
    dateCol: "period",
    dateKind: "date",
    brainIsLive: true,
  },
  fl_dor_sales_tax: {
    label: "FL DOR — sales tax collections",
    brainId: "sector-credit-swfl",
    dateCol: "period",
    dateKind: "date",
    brainIsLive: true,
  },
  zori_swfl_tier2: {
    label: "ZORI rents — Postgres",
    brainId: "rentals-swfl",
    dateCol: "period_end",
    dateKind: "date",
    brainIsLive: true,
  },
  fgcu_reri_indicators: {
    label: "FGCU RERI economic indicators",
    brainId: "fgcu-reri",
    dateCol: "report_month",
    dateKind: "date",
    brainIsLive: true,
  },
  swfl_inc: {
    label: "SWFL Inc. business announcements",
    brainId: "econ-dev-swfl",
    dateCol: "announced_date",
    dateKind: "date",
    brainIsLive: true,
  },
  rsw_airport_monthly: {
    label: "RSW/PGD airport enplanements",
    brainId: "rsw-airport",
    dateCol: "report_month",
    dateKind: "date",
    brainIsLive: true,
  },

  // ── Optional parked rows (not_yet_running — exempt from the drift test) ────
  bls_oews_swfl: {
    label: "BLS OEWS occupational wages (SWFL)",
    brainId: "labor-demand-swfl",
    dateCol: "ref_year",
    dateKind: "year",
    brainIsLive: true,
  },
  fdle_crime_swfl: {
    label: "FDLE crime (SWFL)",
    brainId: "safety-swfl",
    dateCol: null,
    dateKind: null,
    brainIsLive: false,
  },
};

/** Registry entry merged with its display supplement; `untracked` when none exists. */
export interface CoverageSource extends RegistryEntry {
  label: string;
  brainId: string | null;
  brainIsLive: boolean;
  dateCol: string | null;
  dateKind: DateKind | null;
  untracked: boolean;
}

/**
 * The rows the page renders: every ACTIVE registry pipeline, plus any parked
 * pipeline that has a supplement entry (bls_oews, fdle). Parked rows WITHOUT a
 * supplement (e.g. bls_oews_swfl_tier1, the cold duplicate) are omitted.
 */
export function coverageSources(): CoverageSource[] {
  return REGISTRY_ENTRIES.filter(
    (e) => SUPPLEMENT[e.name] !== undefined || !e.not_yet_running,
  ).map((e) => {
    const s = SUPPLEMENT[e.name];
    return {
      ...e,
      label: s?.label ?? e.name,
      brainId: s?.brainId ?? null,
      brainIsLive: s?.brainIsLive ?? false,
      dateCol: s?.dateCol ?? null,
      dateKind: s?.dateKind ?? null,
      untracked: s === undefined,
    };
  });
}
