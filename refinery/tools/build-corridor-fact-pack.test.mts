/**
 * Stage A coverage for the corridor character generator.
 *
 * Covers each of the 9 metric builders + the OLDEST-vintage rollup +
 * null/gap_reason propagation for missing inputs. Pure unit test — no IO,
 * no Supabase, no Anthropic. Fixtures live in
 * `refinery/tools/corridor-character-fixtures.mts` and are shared with the
 * Stage C synthesizer test.
 */

import { test } from "bun:test";
import assert from "node:assert/strict";

import { buildCorridorFactPack } from "./build-corridor-fact-pack.mts";
import {
  makeLeePermitsInput,
  makeNaplesFullDataInput,
  makePriorQuarterContext,
} from "./corridor-character-fixtures.mts";

// ── Top-level shape ─────────────────────────────────────────────────────────

test("buildCorridorFactPack: returns the top-level identity fields verbatim from corridor", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  assert.equal(pack.corridor_name, "Pine Ridge Rd Naples");
  assert.equal(pack.city, "Naples");
  assert.equal(pack.county, "Collier");
  assert.equal(pack.corridor_type, "primary commercial");
  assert.equal(pack.generated_at, "2026-05-26T12:00:00.000Z");
});

test("buildCorridorFactPack: emits all 9 named metric buckets", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const expectedKeys = [
    "cap_rate",
    "vacancy_rate",
    "absorption_sqft",
    "asking_rent_psf",
    "unemployment_rate",
    "zori_rent_index",
    "permits_trailing_6mo",
    "nfip_claim_frequency",
    "fdot_aadt",
  ];
  for (const k of expectedKeys) {
    assert.ok(k in pack.metrics, `metrics missing key: ${k}`);
  }
});

test("buildCorridorFactPack: passes prior_quarter_context straight through", () => {
  const prior = makePriorQuarterContext();
  const pack = buildCorridorFactPack(
    makeNaplesFullDataInput({ prior_quarter_context: prior }),
  );
  assert.deepEqual(pack.prior_quarter_context, prior);
});

// ── cap_rate (no YoY math available; current verbatim) ──────────────────────

test("cap_rate: current value passed through verbatim with % unit and gap_reason on YoY", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const m = pack.metrics.cap_rate;
  assert.equal(m.current.value, 6.8);
  assert.equal(m.current.unit, "%");
  assert.equal(m.current.source_label, "corridor_profiles.cap_rate_pct");
  assert.equal(m.current.gap_reason, undefined);
  // YoY math is structurally unavailable for cap rate.
  assert.equal(m.important_math[0].label, "cap_rate_yoy_delta_pp");
  assert.equal(m.important_math[0].value, null);
  assert.ok(m.important_math[0].gap_reason);
});

test("cap_rate: null cap_rate_pct fires gap_reason on current", () => {
  const input = makeNaplesFullDataInput();
  input.corridor.cap_rate_pct = null;
  const pack = buildCorridorFactPack(input);
  assert.equal(pack.metrics.cap_rate.current.value, null);
  assert.match(
    pack.metrics.cap_rate.current.gap_reason!,
    /cap_rate_pct is null/,
  );
});

// ── vacancy_rate / asking_rent_psf MarketBeat YoY ───────────────────────────

test("vacancy_rate: YoY delta computes as 2026-Q1 minus 2025-Q1 (Naples full data)", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const v = pack.metrics.vacancy_rate;
  assert.equal(v.current.value, 5.2);
  assert.equal(v.current.unit, "%");
  const yoy = v.important_math[0];
  assert.equal(yoy.label, "vacancy_rate_yoy_delta_pp");
  assert.equal(yoy.value, 1.3); // 6.1 − 4.8
  assert.equal(yoy.unit, "pp");
  assert.equal(yoy.direction, "rising");
  assert.equal(yoy.gap_reason, undefined);
  assert.equal(yoy.inputs.length, 2);
});

test("asking_rent_psf: YoY delta computes from MarketBeat", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const yoy = pack.metrics.asking_rent_psf.important_math[0];
  assert.equal(yoy.label, "asking_rent_psf_yoy_delta");
  assert.equal(yoy.value, 2.5); // 32.5 − 30.0
  assert.equal(yoy.direction, "rising");
});

test("absorption_sqft: null corridor value fires gap_reason; MarketBeat YoY still computes", () => {
  const pack = buildCorridorFactPack(makeLeePermitsInput());
  const a = pack.metrics.absorption_sqft;
  assert.equal(a.current.value, null);
  assert.match(a.current.gap_reason!, /absorption_sqft is null/);
  // Only one MarketBeat row (2026-Q1, no 2025-Q1) → YoY gap_reason fires.
  const yoy = a.important_math[0];
  assert.equal(yoy.value, null);
  assert.ok(yoy.gap_reason);
});

test("MarketBeat YoY: missing prior-year quarter surfaces clear gap_reason on every metric", () => {
  const pack = buildCorridorFactPack(makeLeePermitsInput());
  for (const key of ["vacancy_rate", "asking_rent_psf"] as const) {
    const yoy = pack.metrics[key].important_math[0];
    assert.equal(yoy.value, null, `${key} should have null YoY`);
    assert.match(
      yoy.gap_reason!,
      /Prior-year same-quarter.*missing/,
      `${key} gap_reason should call out prior-year miss`,
    );
  }
});

// ── unemployment_rate (BLS LAUS) ─────────────────────────────────────────────

test("unemployment_rate: pulls from county summary with refMonth-derived vintage", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const u = pack.metrics.unemployment_rate;
  assert.equal(u.current.value, 3.6); // Collier
  assert.equal(u.current.unit, "%");
  assert.equal(u.current.vintage, "2026-04");
  assert.match(u.current.source_label, /Collier County/);
  assert.match(u.current.source_label, /preliminary/);
  const yoy = u.important_math[0];
  assert.equal(yoy.value, 0.4);
  assert.equal(yoy.direction, "rising");
});

test("unemployment_rate: null BLS summary fires gap_reason on current AND math", () => {
  const pack = buildCorridorFactPack(makeLeePermitsInput());
  const u = pack.metrics.unemployment_rate;
  assert.equal(u.current.value, null);
  assert.match(u.current.gap_reason!, /BLS LAUS summary not provided/);
  assert.equal(u.important_math[0].value, null);
  assert.ok(u.important_math[0].gap_reason);
});

// ── zori_rent_index ─────────────────────────────────────────────────────────

test("zori_rent_index: latest mean across ZIPs + YoY % vs prior-year same period", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const z = pack.metrics.zori_rent_index;
  // Latest mean: (2300 + 2320) / 2 = 2310 ; prior: (2200 + 2220) / 2 = 2210.
  assert.equal(z.current.value, 2310);
  assert.equal(z.current.unit, "ZORI index");
  assert.equal(z.current.vintage, "2026-04-30");
  const yoy = z.important_math[0];
  assert.equal(yoy.label, "zori_rent_index_yoy_pct");
  // (2310 - 2210) / 2210 * 100 = 4.5249... → r2 → 4.52
  assert.equal(yoy.value, 4.52);
  assert.equal(yoy.unit, "%");
  assert.equal(yoy.direction, "rising");
});

test("zori_rent_index: empty zori_rows fires gap_reason", () => {
  const pack = buildCorridorFactPack(makeLeePermitsInput());
  const z = pack.metrics.zori_rent_index;
  assert.equal(z.current.value, null);
  assert.match(z.current.gap_reason!, /No ZORI rows/);
  assert.equal(z.important_math[0].value, null);
});

// ── permits_trailing_6mo ─────────────────────────────────────────────────────

test("permits_trailing_6mo: Collier corridor fires Lee-only gap_reason", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const p = pack.metrics.permits_trailing_6mo;
  assert.equal(p.current.value, null);
  assert.match(p.current.gap_reason!, /Collier County/);
  assert.equal(p.important_math[0].value, null);
});

test("permits_trailing_6mo: Lee corridor with permits returns trailing count + direction", () => {
  const pack = buildCorridorFactPack(makeLeePermitsInput());
  const p = pack.metrics.permits_trailing_6mo;
  assert.equal(typeof p.current.value, "number");
  assert.equal(p.current.unit, "permits");
  assert.equal(p.current.vintage, "2026-05-26");
  const m = p.important_math[0];
  assert.equal(m.label, "permits_trailing_6mo_direction");
  assert.equal(typeof m.value, "number");
  // Direction must be one of the classifier outputs.
  assert.ok(["rising", "falling", "stable"].includes(m.direction!));
});

test("permits_trailing_6mo: Lee corridor with zero permits fires gap_reason", () => {
  const input = makeLeePermitsInput();
  input.lee_permits = [];
  const pack = buildCorridorFactPack(input);
  const p = pack.metrics.permits_trailing_6mo;
  assert.equal(p.current.value, null);
  assert.match(p.current.gap_reason!, /Zero permits joined/);
});

// ── nfip_claim_frequency ─────────────────────────────────────────────────────

test("nfip_claim_frequency: 6+ non-storm years computes 3v3 baseline delta", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const n = pack.metrics.nfip_claim_frequency;
  // Latest year claim_count = 8 (2025).
  assert.equal(n.current.value, 8);
  assert.equal(n.current.unit, "claims/yr");
  assert.equal(n.current.vintage, "2025-01");
  const m = n.important_math[0];
  // recent3 mean = (7+9+8)/3 = 8 ; prior3 mean = (4+5+6)/3 = 5 ; delta = 3.
  assert.equal(m.value, 3);
  assert.equal(m.direction, "rising");
});

test("nfip_claim_frequency: fewer than 4 non-storm years fires gap_reason on math", () => {
  const pack = buildCorridorFactPack(makeLeePermitsInput());
  const n = pack.metrics.nfip_claim_frequency;
  // Current still passes through the latest row's count.
  assert.equal(n.current.value, 4);
  assert.equal(n.important_math[0].value, null);
  assert.match(n.important_math[0].gap_reason!, /Fewer than 4/);
});

test("nfip_claim_frequency: empty input fires gap_reason on current AND math", () => {
  const input = makeNaplesFullDataInput({ nfip_year_rows: [] });
  const pack = buildCorridorFactPack(input);
  const n = pack.metrics.nfip_claim_frequency;
  assert.equal(n.current.value, null);
  assert.match(n.current.gap_reason!, /No NFIP claims rolled up/);
});

// ── fdot_aadt ───────────────────────────────────────────────────────────────

test("fdot_aadt: length-weighted mean computes for latest year + YoY pct", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  const f = pack.metrics.fdot_aadt;
  // 2026 weighted: (45000 + 50000*2) / 3 = 48333.33... → rounded 48333.
  assert.equal(f.current.value, 48333);
  assert.equal(f.current.unit, "AADT");
  assert.equal(f.current.vintage, "2026-01");
  const m = f.important_math[0];
  assert.equal(m.label, "aadt_yoy_pct");
  // Prior: (42000 + 47000*2) / 3 = 45333.33.
  // (48333.33 - 45333.33) / 45333.33 * 100 = 6.6176... → r2 = 6.62.
  assert.equal(m.value, 6.62);
});

test("fdot_aadt: empty rows fires gap_reason and no important_math", () => {
  const pack = buildCorridorFactPack(makeLeePermitsInput());
  const f = pack.metrics.fdot_aadt;
  assert.equal(f.current.value, null);
  assert.match(f.current.gap_reason!, /No FDOT AADT segments/);
  assert.deepEqual(f.important_math, []);
});

// ── OLDEST vintage rollup ───────────────────────────────────────────────────

test("fact_pack_vintage: OLDEST scan picks earliest YYYY-MM across all inputs", () => {
  const pack = buildCorridorFactPack(makeNaplesFullDataInput());
  // Naples fixture has NFIP rows reaching back to 2020 → OLDEST-2020-01.
  assert.equal(pack.fact_pack_vintage, "OLDEST-2020-01");
});

test("fact_pack_vintage: returns OLDEST-UNKNOWN when no vintaged inputs survive", () => {
  // Wipe every dated input on the Lee fixture; cap_rate has no period so it
  // can't anchor the vintage either.
  const input = makeLeePermitsInput();
  input.corridor.metrics_period = null;
  input.corridor.metrics_verified_date = null;
  input.marketbeat_submarket_rows = [];
  input.bls_laus = null;
  input.zori_rows = [];
  input.nfip_year_rows = [];
  input.lee_permits = [];
  input.fdot_aadt_rows = [];
  const pack = buildCorridorFactPack(input);
  assert.equal(pack.fact_pack_vintage, "OLDEST-UNKNOWN");
});

test("fact_pack_vintage: NFIP year inputs anchor when older than other sources", () => {
  const input = makeLeePermitsInput();
  // Lee fixture: metrics_period 2026-Q1, MarketBeat 2026-Q1, permits back to
  // 2025-06-01, NFIP rows reach 2024 → 2024-01 wins as OLDEST.
  const pack = buildCorridorFactPack(input);
  assert.equal(pack.fact_pack_vintage, "OLDEST-2024-01");
});
