/**
 * Shared test fixtures for the corridor character generator (Steps 2 A1/C1).
 *
 * Two complete `BuildFactPackInput` payloads + helpers for building scoped
 * variants. Used by both `build-corridor-fact-pack.test.mts` (Stage A) and
 * `synthesize-corridor-character.test.mts` (Stage C). Keeping them in one
 * module guarantees Stage A and Stage C exercise the same shapes — the
 * synthesizer's input contract is exactly what the builder emits.
 *
 * Not exported through any pack registry; not imported at runtime; pure test
 * scaffolding.
 */

import type {
  BuildFactPackInput,
  PriorQuarterContext,
} from "./build-corridor-fact-pack.mts";
import type { CorridorNormalized } from "../sources/cre-source.mts";
import type { MarketbeatSwflNormalized } from "../sources/marketbeat-swfl-source.mts";
import type { LausSwflSummary } from "../sources/bls-laus-source.mts";

const GENERATED_AT = "2026-05-26T12:00:00.000Z";

/** Spread defaults onto a partial CorridorNormalized override. */
function makeCorridor(
  patch: Partial<CorridorNormalized> = {},
): CorridorNormalized {
  return {
    kind: "corridor",
    name: "Pine Ridge Rd Naples",
    city: "Naples",
    county: "Collier",
    corridor_type: "primary commercial",
    seasonal_index: 0.5,
    character: null,
    evolution_direction: null,
    tenant_mix: null,
    flags: [],
    source_url: "https://corridor-profiles.example/pine-ridge",
    cap_rate_source_url: null,
    vacancy_rate_source_url: null,
    absorption_sqft_source_url: null,
    asking_rent_psf_source_url: null,
    cap_rate_pct: 6.8,
    cap_rate_direction: "rising",
    vacancy_rate_pct: 5.2,
    vacancy_rate_direction: "rising",
    absorption_sqft: 12000,
    absorption_sqft_direction: "rising",
    asking_rent_psf: 32.5,
    asking_rent_psf_direction: "stable",
    metrics_period: "2026-Q1",
    metrics_verified_date: "2026-03-15",
    character_broker_narrative: null,
    character_render: null,
    character_facts: null,
    character_speculative: null,
    character_chart: null,
    character_citations: null,
    character_generated_at: null,
    character_fact_pack_vintage: null,
    ...patch,
  };
}

/**
 * Naples corridor with full MarketBeat YoY coverage. Two quarters one year
 * apart so vacancy / absorption / asking-rent YoY math fires.
 */
export function makeNaplesFullDataInput(
  overrides: Partial<BuildFactPackInput> = {},
): BuildFactPackInput {
  const marketbeatRows: MarketbeatSwflNormalized[] = [
    {
      kind: "marketbeat-swfl",
      source_name: "cw_marketbeat",
      submarket: "Naples",
      quarter: "2025-Q1",
      vacancy_rate: 4.8,
      asking_rent_nnn: 30.0,
      absorption_sqft: 8000,
      source_url: "https://cushwake.example/2025q1",
    },
    {
      kind: "marketbeat-swfl",
      source_name: "cw_marketbeat",
      submarket: "Naples",
      quarter: "2026-Q1",
      vacancy_rate: 6.1,
      asking_rent_nnn: 32.5,
      absorption_sqft: 14000,
      source_url: "https://cushwake.example/2026q1",
    },
  ];
  const blsLaus: LausSwflSummary = {
    kind: "laus-swfl-summary",
    reference_month: "2026M04",
    is_preliminary: true,
    fl_state: {
      unemployment_rate: 3.5,
      labor_force: 10_500_000,
      employed: 10_135_000,
      unemployment_rate_yoy_delta: 0.1,
    },
    lee_county: {
      unemployment_rate: 3.9,
      labor_force: 360_000,
      employed: 346_000,
      unemployment_rate_yoy_delta: 0.2,
    },
    collier_county: {
      unemployment_rate: 3.6,
      labor_force: 200_000,
      employed: 192_800,
      unemployment_rate_yoy_delta: 0.4,
    },
  };
  return {
    corridor: makeCorridor(),
    marketbeat_submarket_rows: marketbeatRows,
    bls_laus: blsLaus,
    zori_rows: [
      // Prior-year reading (mean = 2210 across 2 ZIPs)
      { zip_code: "34109", period_end: "2025-04-30", rent_index: 2200 },
      { zip_code: "34110", period_end: "2025-04-30", rent_index: 2220 },
      // Latest reading (mean = 2310 → +4.52% YoY)
      { zip_code: "34109", period_end: "2026-04-30", rent_index: 2300 },
      { zip_code: "34110", period_end: "2026-04-30", rent_index: 2320 },
    ],
    nfip_year_rows: [
      // 6+ non-storm years → 3v3 baseline computes.
      // recent 3 (2023, 2024, 2025) mean = 8 ; prior 3 (2020, 2021, 2022) mean = 5
      { year_of_loss: 2020, claim_count: 4, is_storm_year: false },
      { year_of_loss: 2021, claim_count: 5, is_storm_year: false },
      { year_of_loss: 2022, claim_count: 6, is_storm_year: false },
      { year_of_loss: 2023, claim_count: 7, is_storm_year: false },
      { year_of_loss: 2024, claim_count: 9, is_storm_year: false },
      { year_of_loss: 2025, claim_count: 8, is_storm_year: false },
    ],
    lee_permits: [], // Collier corridor — Lee permits gap fires
    fdot_aadt_rows: [
      // 2026 length-weighted: (45000*1 + 50000*2) / 3 = 48333 → rounded 48333
      // 2025 length-weighted: (42000*1 + 47000*2) / 3 = 45333
      // YoY pct: (48333 - 45333)/45333 * 100 ≈ 6.62%
      {
        year: 2025,
        county: "Collier",
        roadway: "PINE RIDGE RD",
        aadt: 42000,
        shape_length: 1.0,
      },
      {
        year: 2025,
        county: "Collier",
        roadway: "PINE RIDGE RD",
        aadt: 47000,
        shape_length: 2.0,
      },
      {
        year: 2026,
        county: "Collier",
        roadway: "PINE RIDGE RD",
        aadt: 45000,
        shape_length: 1.0,
      },
      {
        year: 2026,
        county: "Collier",
        roadway: "PINE RIDGE RD",
        aadt: 50000,
        shape_length: 2.0,
      },
    ],
    prior_quarter_context: null,
    generated_at: GENERATED_AT,
    ...overrides,
  };
}

/**
 * Lee corridor with permits data but no MarketBeat YoY (only latest quarter).
 * Exercises Lee-only permits-trailing-6mo path AND missing-prior-quarter gap.
 */
export function makeLeePermitsInput(
  overrides: Partial<BuildFactPackInput> = {},
): BuildFactPackInput {
  return {
    corridor: makeCorridor({
      name: "US-41 Fort Myers",
      city: "Fort Myers",
      county: "Lee",
      cap_rate_pct: 7.1,
      vacancy_rate_pct: 6.5,
      asking_rent_psf: 28.0,
      absorption_sqft: null, // gap_reason path
      absorption_sqft_direction: null,
    }),
    marketbeat_submarket_rows: [
      {
        kind: "marketbeat-swfl",
        source_name: "cw_marketbeat",
        submarket: "Fort Myers",
        quarter: "2026-Q1",
        vacancy_rate: 6.5,
        asking_rent_nnn: 28.0,
        absorption_sqft: 5000,
        source_url: "https://cushwake.example/ftm-2026q1",
      },
    ],
    bls_laus: null, // gap_reason path
    zori_rows: [], // gap_reason path
    nfip_year_rows: [
      // Only 2 non-storm years — 3v3 baseline cannot be computed.
      { year_of_loss: 2024, claim_count: 3, is_storm_year: false },
      { year_of_loss: 2025, claim_count: 4, is_storm_year: false },
    ],
    lee_permits: [
      // Trailing 6mo (after 2025-11-26): 4 permits.
      // Prior 6mo (2025-05-26 to 2025-11-26): 2 permits.
      // Delta = +2 → "stable" under stableBandAbs=3.
      { permit_id: "P001", issued_date: "2025-06-01", bucket: "commercial" },
      { permit_id: "P002", issued_date: "2025-09-15", bucket: "commercial" },
      { permit_id: "P003", issued_date: "2025-12-01", bucket: "commercial" },
      { permit_id: "P004", issued_date: "2026-01-15", bucket: "commercial" },
      { permit_id: "P005", issued_date: "2026-03-01", bucket: "commercial" },
      { permit_id: "P006", issued_date: "2026-05-26", bucket: "commercial" },
    ],
    fdot_aadt_rows: [], // gap_reason path
    prior_quarter_context: null,
    generated_at: GENERATED_AT,
    ...overrides,
  };
}

export function makePriorQuarterContext(): PriorQuarterContext {
  return {
    character_facts:
      "Vacancy ran at 4.8% in 2025-Q1 [internal-1]; asking rent held at $30.00/sqft NNN [internal-2].",
    character_speculative:
      "Prior-quarter speculation: medical-office tenancy was tracking toward expansion. Speculative — based partly on inferred data. Double-check.",
    generated_at: "2026-02-15T00:00:00.000Z",
    fact_pack_vintage: "OLDEST-2025-01",
  };
}
