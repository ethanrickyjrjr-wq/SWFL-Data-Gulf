import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import type { BrainOutput, BrainOutputMetric } from "../types/brain-output.mts";
import type { BrainInputNormalized } from "../sources/brain-input-source.mts";
import type { MarketbeatSwflNormalized } from "../sources/marketbeat-swfl-source.mts";
import type { CorridorNormalized } from "../sources/cre-source.mts";

process.env["REFINERY_SOURCE"] = "fixture";

const { creSwfl, computeMarketbeatParentRollups, sanitizeScrapedCitation } =
  await import("./cre-swfl.mts");
const { corridorSource } = await import("../sources/cre-source.mts");
const { marketbeatSwflSource } = await import("../sources/marketbeat-swfl-source.mts");

const NOW = "2026-05-22T00:00:00Z";

function pmMetric(slug: string, value: number | string): BrainOutputMetric {
  return {
    metric: slug,
    value,
    direction: "stable",
    label: slug,
    variable_type: "intensive",
    units: "ratio",
    source: {
      url: "test://permits-swfl",
      fetched_at: NOW,
      tier: 1,
      citation: "permits fixture",
    },
  };
}

function makePermitsOutput(saturationIndex: number, countyZ: number): BrainOutput {
  return {
    brain_id: "permits-swfl",
    version: 1,
    refined_at: NOW,
    direction: "neutral",
    magnitude: 0.5,
    drivers: [],
    overrides: [],
    conclusion: "test fixture — permits-swfl OUTPUT",
    key_metrics: [
      pmMetric("permits_lee_saturation_index", saturationIndex),
      pmMetric("permits_lee_county_weighted_avg_corridor_z", countyZ),
      pmMetric("permits_lee_top_heating_commercial_alteration", "us-41-fort-myers,daniels-pkwy"),
    ],
    caveats: [],
    contradicts: [],
    confidence: 0.7,
    joint_integrity: 1,
    confidence_dispersion: 0,
    chain_depth: 0,
    trust_tier: 1,
    upstream_count: 0,
    relevance: { decay_curve: "weeks", half_life_hours: 168, computed_at: NOW },
    exogenous_signals: [],
  };
}

function makePermitsFragment(output: BrainOutput): RawFragment {
  const norm: BrainInputNormalized = {
    kind: "brain-input",
    upstream_id: "permits-swfl",
    output,
  };
  return {
    fragment_id: "brain-input:permits-swfl:test",
    source_id: "brain-input:permits-swfl",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: {},
    normalized: norm as unknown as Record<string, unknown>,
  };
}

function minimalPackOutput() {
  return {
    pack: creSwfl,
    version: 1,
    refined_at: NOW,
    citations: [],
    facts: [],
    recentNote: "test",
  };
}

test("cre-swfl × permits-swfl: saturation >= 0.4 → conclusion mentions saturation + emits saturation signal metric", () => {
  const permitsOut = makePermitsOutput(0.5, 2.1);
  creSwfl.corpusSummary!([makePermitsFragment(permitsOut)]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(
    /saturation/i.test(result.conclusion),
    `expected 'saturation' in conclusion, got: ${result.conclusion}`,
  );
  const satMetric = result.key_metrics.find((m) => m.metric === "permits_lee_saturation_signal");
  assert.ok(satMetric, "expected permits_lee_saturation_signal in key_metrics");
  assert.equal(satMetric!.value, 0.5);
});

test("cre-swfl × permits-swfl: saturation < 0.4 → emits capital-flow z metric, no saturation metric", () => {
  const permitsOut = makePermitsOutput(0.2, 0.8);
  creSwfl.corpusSummary!([makePermitsFragment(permitsOut)]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const satMetric = result.key_metrics.find((m) => m.metric === "permits_lee_saturation_signal");
  assert.ok(!satMetric, "expected no saturation signal for low saturation");
  const zMetric = result.key_metrics.find((m) => m.metric === "permits_lee_capital_flow_z");
  assert.ok(zMetric, "expected permits_lee_capital_flow_z for low saturation path");
  assert.equal(zMetric!.value, 0.8);
});

test("cre-swfl × permits-swfl: no permits upstream → no permits metrics in output", () => {
  creSwfl.corpusSummary!([]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const satMetric = result.key_metrics.find((m) => m.metric === "permits_lee_saturation_signal");
  const zMetric = result.key_metrics.find((m) => m.metric === "permits_lee_capital_flow_z");
  assert.ok(!satMetric, "expected no saturation signal when permits absent");
  assert.ok(!zMetric, "expected no z signal when permits absent");
});

// --- corridor-pulse contribution count (B1) ---------------------------

function makeCorridorPulseFragment(signalCount: number): RawFragment {
  const key_metrics: BrainOutputMetric[] = Array.from({ length: signalCount }, (_, i) => ({
    metric: `signal_breaking_${i + 1}`,
    value: "Fort Myers Beach — a beachfront retail building changed hands",
    direction: "stable" as const,
    label: "Fort Myers Beach — breaking",
    variable_type: "categorical" as const,
    source: {
      url: `https://gulfshorebusiness.com/s${i + 1}`,
      fetched_at: NOW,
      tier: 2 as const,
      citation: `corridor-pulse signal ${i + 1}`,
    },
  }));
  const output: BrainOutput = {
    brain_id: "corridor-pulse-swfl",
    version: 1,
    refined_at: NOW,
    direction: "neutral",
    magnitude: 0,
    drivers: [],
    overrides: [],
    conclusion: "test fixture — corridor-pulse-swfl OUTPUT",
    key_metrics,
    caveats: [],
    contradicts: [],
    confidence: 0.7,
    joint_integrity: 1,
    confidence_dispersion: 0,
    chain_depth: 0,
    trust_tier: 2,
    upstream_count: 0,
    relevance: { decay_curve: "weeks", half_life_hours: 168, computed_at: NOW },
    exogenous_signals: [],
  };
  const norm: BrainInputNormalized = {
    kind: "brain-input",
    upstream_id: "corridor-pulse-swfl",
    output,
  };
  return {
    fragment_id: "brain-input:corridor-pulse-swfl:test",
    source_id: "brain-input:corridor-pulse-swfl",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: {},
    normalized: norm as unknown as Record<string, unknown>,
  };
}

// cre only builds a corpus when it has verified corridors (creCorpusSummary
// early-returns on zero corridors), so every case carries a corridor fragment —
// cre's normal state. The corridor-pulse fragment is the contribution under test.
test("cre-swfl × corridor-pulse: N live signals → corridor_pulse_signals_live = N", () => {
  creSwfl.corpusSummary!([
    makeCorridorFragment("Pine Ridge Rd Naples", "Naples"),
    makeCorridorPulseFragment(7),
  ]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const m = result.key_metrics.find((k) => k.metric === "corridor_pulse_signals_live");
  assert.ok(m, "expected a corridor_pulse_signals_live metric");
  assert.equal(m!.value, 7);
  assert.ok(
    typeof m!.source === "object" && m!.source.url.length > 0,
    "count metric must carry a well-formed source receipt",
  );
});

test("cre-swfl × corridor-pulse: corridors present but no corridor-pulse upstream → no count metric (gate on contribution, not wiring)", () => {
  creSwfl.corpusSummary!([makeCorridorFragment("Pine Ridge Rd Naples", "Naples")]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(
    !result.key_metrics.some((k) => k.metric === "corridor_pulse_signals_live"),
    "no corridor count metric when corridor-pulse is absent",
  );
});

test("cre-swfl × corridor-pulse: singleton reset — a second run without corridor-pulse clears the prior count", () => {
  creSwfl.corpusSummary!([
    makeCorridorFragment("Pine Ridge Rd Naples", "Naples"),
    makeCorridorPulseFragment(5),
  ]);
  creSwfl.outputProducer!(minimalPackOutput());
  creSwfl.corpusSummary!([makeCorridorFragment("Pine Ridge Rd Naples", "Naples")]);
  const run2 = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(
    !run2.key_metrics.some((k) => k.metric === "corridor_pulse_signals_live"),
    "a prior-run corridor count must not bleed into a run without corridor-pulse",
  );
});

// --- MarketBeat per-submarket fan-out ---------------------------------

function makeMbFragment(norm: MarketbeatSwflNormalized, fetched_at = NOW): RawFragment {
  return {
    fragment_id: `marketbeat_swfl:${norm.submarket}:${norm.quarter}`,
    source_id: "marketbeat_swfl",
    source_trust_tier: 2,
    fetched_at,
    raw: {},
    normalized: norm as unknown as Record<string, unknown>,
  };
}

function makeCorridorFragment(name: string, city: string): RawFragment {
  const norm: CorridorNormalized = {
    kind: "corridor",
    name,
    city,
    county: "Lee",
    submarket: null,
    corridor_type: "highway-strip-mall",
    seasonal_index: 0.3,
    character: null,
    evolution_direction: null,
    tenant_mix: null,
    flags: [],
    source_url: null,
    cap_rate_source_url: null,
    vacancy_rate_source_url: null,
    absorption_sqft_source_url: null,
    asking_rent_psf_source_url: null,
    cap_rate_pct: null,
    cap_rate_direction: null,
    vacancy_rate_pct: null,
    vacancy_rate_direction: null,
    absorption_sqft: null,
    absorption_sqft_direction: null,
    asking_rent_psf: null,
    asking_rent_psf_direction: null,
    metrics_period: null,
    metrics_verified_date: null,
    character_broker_narrative: null,
    character_render: null,
    character_facts: null,
    character_speculative: null,
    character_chart: null,
    character_citations: null,
    character_generated_at: null,
    character_fact_pack_vintage: null,
  };
  return {
    fragment_id: `corridor_profiles:${name}`,
    source_id: "corridor_profiles",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: {},
    normalized: norm as unknown as Record<string, unknown>,
  };
}

test("marketbeat: baseline non-regression — no marketbeat fragments → zero *_marketbeat_* keys", () => {
  creSwfl.corpusSummary!([makeCorridorFragment("Pine Ridge Rd Naples", "Naples")]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const mbKeys = result.key_metrics.filter((m) => m.metric.includes("marketbeat"));
  assert.equal(
    mbKeys.length,
    0,
    `expected zero marketbeat keys, got: ${mbKeys.map((m) => m.metric).join(", ")}`,
  );
});

test("marketbeat: per-submarket fan-out with the existing fixture emits exactly 9 new keys with pinned values", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const result = creSwfl.outputProducer!(minimalPackOutput());

  // Vacancy_rate — pinned to marketbeat fixture latest-verified picks.
  const vacNaples = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_naples");
  const vacFm = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_fort_myers");
  const vacCc = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_cape_coral");
  assert.ok(vacNaples && vacFm && vacCc);
  assert.equal(vacNaples!.value, 4.8);
  assert.equal(vacFm!.value, 8.2);
  assert.equal(vacCc!.value, 7.0);

  // Asking rent NNN.
  const rentNaples = result.key_metrics.find(
    (m) => m.metric === "asking_rent_nnn_marketbeat_naples",
  );
  const rentFm = result.key_metrics.find(
    (m) => m.metric === "asking_rent_nnn_marketbeat_fort_myers",
  );
  const rentCc = result.key_metrics.find(
    (m) => m.metric === "asking_rent_nnn_marketbeat_cape_coral",
  );
  assert.ok(rentNaples && rentFm && rentCc);
  assert.equal(rentNaples!.value, 41.5);
  assert.equal(rentFm!.value, 26.0);
  assert.equal(rentCc!.value, 22.5);

  // Absorption — extensive, count format, negative for Fort Myers Q3 (give-back).
  const absNaples = result.key_metrics.find(
    (m) => m.metric === "absorption_sqft_marketbeat_naples",
  );
  const absFm = result.key_metrics.find(
    (m) => m.metric === "absorption_sqft_marketbeat_fort_myers",
  );
  const absCc = result.key_metrics.find(
    (m) => m.metric === "absorption_sqft_marketbeat_cape_coral",
  );
  assert.ok(absNaples && absFm && absCc);
  assert.equal(absNaples!.value, 32000);
  assert.equal(absFm!.value, -5000);
  assert.equal(absCc!.value, 8000);
  assert.equal(absFm!.variable_type, "extensive");
  assert.equal(absFm!.units, "sqft");
  assert.equal(absFm!.display_format, "count");

  // Existing SWFL-wide medians stay on contract (augment, not replace).
  const swflVac = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_swfl");
  const swflRent = result.key_metrics.find((m) => m.metric === "asking_rent_nnn_marketbeat_swfl");
  assert.ok(swflVac && swflRent);
});

// --- MarketBeat per-SECTOR surfacing (industrial + office) -----------------
// Per-sector reversal (2026-06-08): industrial + office surface alongside retail
// as DISTINCT slugs, never blended across sectors. Retail keeps its bare grammar.

test("marketbeat per-sector: industrial + office emit sector-suffixed slugs, retail stays bare", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const has = (slug: string) => result.key_metrics.find((m) => m.metric === slug);

  // Retail Naples stays bare (no sector suffix) — backward compatible.
  const retailNaples = has("vacancy_rate_marketbeat_naples");
  assert.ok(retailNaples, "retail Naples must keep the bare slug");
  assert.equal(retailNaples!.value, 4.8);

  // Industrial Naples is its OWN slug with its OWN value (3.1), never the
  // retail value (4.8) and never an average of the two.
  const indNaples = has("vacancy_rate_marketbeat_naples_industrial");
  assert.ok(indNaples, "expected vacancy_rate_marketbeat_naples_industrial");
  assert.equal(indNaples!.value, 3.1);
  assert.notEqual(
    indNaples!.value,
    retailNaples!.value,
    "industrial and retail Naples vacancy must be distinct (no blending)",
  );

  // Industrial rent + absorption (all per-field flags true in the fixture).
  assert.equal(has("asking_rent_nnn_marketbeat_naples_industrial")?.value, 14.5);
  assert.equal(has("absorption_sqft_marketbeat_naples_industrial")?.value, 60000);

  // Office Fort Myers — vacancy + rent surface; absorption is DARK
  // (verified_absorption=false → nulled), so its slug must NOT emit.
  assert.equal(has("vacancy_rate_marketbeat_fort_myers_office")?.value, 11.7);
  assert.equal(has("asking_rent_nnn_marketbeat_fort_myers_office")?.value, 21.0);
  assert.ok(
    !has("absorption_sqft_marketbeat_fort_myers_office"),
    "office absorption is dark (per-field gate) → no slug",
  );
});

test("marketbeat per-sector: medical_office emits asking_rent_full_service (not asking_rent_nnn), coexists with retail + industrial Naples", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const has = (slug: string) => result.key_metrics.find((m) => m.metric === slug);

  const medNaples = has("vacancy_rate_marketbeat_naples_medical_office");
  assert.ok(medNaples, "expected vacancy_rate_marketbeat_naples_medical_office");
  assert.equal(medNaples!.value, 6.1);

  // Three sectors, three distinct values — never blended.
  assert.equal(has("vacancy_rate_marketbeat_naples")?.value, 4.8); // retail
  assert.equal(has("vacancy_rate_marketbeat_naples_industrial")?.value, 3.1);
  assert.equal(medNaples!.value, 6.1);

  const rent = has("asking_rent_full_service_marketbeat_naples_medical_office");
  assert.ok(rent, "expected asking_rent_full_service_marketbeat_naples_medical_office");
  assert.equal(rent!.value, 38.46);
  assert.equal(rent!.units, "USD/sqft");
  assert.equal(rent!.display_format, "currency");
  assert.ok(
    !has("asking_rent_nnn_marketbeat_naples_medical_office"),
    "medical_office never carries an NNN rent slug",
  );

  assert.equal(has("absorption_sqft_marketbeat_naples_medical_office")?.value, -12000);
});

test("marketbeat per-sector: medical_office parent-place area rollup stays within its own sector", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const result = creSwfl.outputProducer!(minimalPackOutput());

  // Naples + East Naples medical_office roll up to the naples parent. Median
  // of the two medical_office vacancies (6.1, 7.3) = 6.7 — computed ONLY from
  // medical_office rows, never mixing in retail (4.8) or industrial (3.1).
  const areaMed = result.key_metrics.find(
    (m) => m.metric === "vacancy_rate_marketbeat_naples_area_medical_office",
  );
  assert.ok(areaMed, "expected vacancy_rate_marketbeat_naples_area_medical_office rollup");
  assert.equal(areaMed!.value, 6.7);

  const rentArea = result.key_metrics.find(
    (m) => m.metric === "asking_rent_full_service_marketbeat_naples_area_medical_office",
  );
  assert.ok(
    rentArea,
    "expected asking_rent_full_service_marketbeat_naples_area_medical_office rollup",
  );
  assert.equal(rentArea!.value, 37.33); // median(38.46, 36.20) rounded to 2dp
  assert.equal(rentArea!.units, "USD/sqft");
});

test("marketbeat per-sector: parent-place area rollup stays within one sector", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const result = creSwfl.outputProducer!(minimalPackOutput());

  // Naples + East Naples industrial both roll up to the naples parent. Median
  // of the two industrial vacancies (3.1, 4.4) = 3.75 — computed ONLY from
  // industrial rows, never mixing in the retail Naples vacancy (4.8).
  const areaInd = result.key_metrics.find(
    (m) => m.metric === "vacancy_rate_marketbeat_naples_area_industrial",
  );
  assert.ok(areaInd, "expected vacancy_rate_marketbeat_naples_area_industrial rollup");
  assert.equal(areaInd!.value, 3.75); // median(3.1, 4.4) — industrial only
});

test("marketbeat per-sector: a per-sector disclosure caveat names the sector slugs", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const sectorCaveat = result.caveats.find(
    (c) =>
      c.includes("Per-sector MarketBeat metrics") && c.includes("never blended across sectors"),
  );
  assert.ok(
    sectorCaveat,
    `expected the per-sector disclosure caveat, got:\n${result.caveats.join("\n")}`,
  );
  assert.ok(
    sectorCaveat!.includes("vacancy_rate_marketbeat_naples_industrial"),
    "caveat must name the industrial slug",
  );
});

test("marketbeat per-sector: singleton reset clears the non-retail sector join between runs", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const run1 = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(
    run1.key_metrics.some((m) => m.metric === "vacancy_rate_marketbeat_naples_industrial"),
    "run1 should emit the industrial slug",
  );
  // Run 2: empty corpus — the per-sector join stash must reset (no leak).
  creSwfl.corpusSummary!([]);
  const run2 = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(
    !run2.key_metrics.some((m) => m.metric.includes("_industrial")),
    "no per-sector slug may bleed into a run with no marketbeat rows",
  );
});

test("marketbeat: citation enumerates matched corridors with 'matched X of Y mapped' denominator", async () => {
  const corridorFragments = await corridorSource.fetch();
  const mbFragments = await marketbeatSwflSource.fetch();
  creSwfl.corpusSummary!([...corridorFragments, ...mbFragments]);
  const result = creSwfl.outputProducer!(minimalPackOutput());

  // Fixture intersection with MARKETBEAT_SUBMARKET_MAP:
  //   Naples — 2 of 9 matched (Immokalee Rd North Naples, Pine Ridge Rd Naples)
  //   Fort Myers — 1 of 7 matched (Cleveland Ave Fort Myers)
  //   Cape Coral — 1 of 3 matched (Cape Coral Pkwy E)
  const vacNaples = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_naples");
  assert.ok(vacNaples);
  const naplesCite = vacNaples!.source.citation;
  assert.ok(
    /matched 2 of 9 mapped/.test(naplesCite),
    `Naples citation missing 'matched 2 of 9 mapped': ${naplesCite}`,
  );
  // Citations now emit plain user-facing display names, not road-suffix labels.
  assert.ok(naplesCite.includes("North Naples (Immokalee Rd)"));
  assert.ok(naplesCite.includes("Pine Ridge"));

  const vacFm = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_fort_myers");
  assert.ok(/matched 1 of 7 mapped/.test(vacFm!.source.citation));

  const vacCc = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_cape_coral");
  assert.ok(/matched 1 of 3 mapped/.test(vacCc!.source.citation));

  // URL encoding sanity — multi-word submarkets must be percent-encoded.
  // Fixture mode collapses to fixture:// path, so synth a live-mode check
  // by inspecting the Fort Myers fixture-mode URL doesn't crash. The proper
  // assertion lives in the live-mode invariant: encodeURIComponent('Fort Myers')
  // = 'Fort%20Myers'. We just guard that the raw space is never present.
  assert.ok(
    !vacFm!.source.url.includes("eq.Fort Myers"),
    `Fort Myers URL must not contain raw space: ${vacFm!.source.url}`,
  );
});

test("marketbeat: zero-matched-corridors caveat fires when submarket reports a value but no mapped corridor is in the corpus", () => {
  // Construct a corpus with only ONE corridor — and one that does NOT map to
  // Naples — so the Naples MarketBeat row has zero verified-corpus corridors
  // to tie back to.
  const lonely = makeCorridorFragment("Cape Coral Pkwy E", "Cape Coral");
  const naplesMb: MarketbeatSwflNormalized = {
    kind: "marketbeat-swfl",
    source_name: "cw_marketbeat",
    submarket: "Naples",
    quarter: "2026-Q3",
    vacancy_rate: 4.8,
    asking_rent_nnn: 41.5,
    absorption_sqft: 32000,
    source_url: "https://example.invalid/naples",
  };
  creSwfl.corpusSummary!([lonely, makeMbFragment(naplesMb)]);
  const result = creSwfl.outputProducer!(minimalPackOutput());

  // Naples metrics still ship — broker survey stands on its own.
  const vacNaples = result.key_metrics.find((m) => m.metric === "vacancy_rate_marketbeat_naples");
  assert.ok(vacNaples, "expected Naples vacancy metric to still ship");
  assert.equal(vacNaples!.value, 4.8);

  // Zero-matched caveat fires with `0 of its 9 mapped` wording.
  const caveatHit = result.caveats.find(
    (c) =>
      c.includes("Naples") &&
      c.includes("0 of its 9 mapped") &&
      c.includes("verified corpus this run"),
  );
  assert.ok(caveatHit, `expected zero-matched caveat, got caveats:\n${result.caveats.join("\n")}`);
});

test("marketbeat: singleton reset — running corpusSummary twice does not let a prior-run join bleed through", () => {
  // Run 1: full SWFL fixture-equivalent — Naples + Fort Myers + Cape Coral
  // mbRows with corridors that match each.
  const naples: MarketbeatSwflNormalized = {
    kind: "marketbeat-swfl",
    source_name: "cw_marketbeat",
    submarket: "Naples",
    quarter: "2026-Q3",
    vacancy_rate: 4.8,
    asking_rent_nnn: 41.5,
    absorption_sqft: 32000,
    source_url: "https://example.invalid/naples",
  };
  const fm: MarketbeatSwflNormalized = {
    kind: "marketbeat-swfl",
    source_name: "cw_marketbeat",
    submarket: "Fort Myers",
    quarter: "2026-Q3",
    vacancy_rate: 8.2,
    asking_rent_nnn: 26.0,
    absorption_sqft: -5000,
    source_url: "https://example.invalid/fm",
  };
  creSwfl.corpusSummary!([
    makeCorridorFragment("Pine Ridge Rd Naples", "Naples"),
    makeCorridorFragment("US-41 / Cleveland Ave Fort Myers", "Fort Myers"),
    makeMbFragment(naples),
    makeMbFragment(fm),
  ]);
  const run1 = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(
    run1.key_metrics.some((m) => m.metric === "vacancy_rate_marketbeat_fort_myers"),
    "run1 should emit Fort Myers vacancy",
  );

  // Run 2: empty corpus. If the prior-run join leaked, Fort Myers would still
  // be present. Reset block at top of creCorpusSummary must clear it.
  creSwfl.corpusSummary!([]);
  const run2 = creSwfl.outputProducer!(minimalPackOutput());
  const leakedKeys = run2.key_metrics.filter((m) => m.metric.includes("marketbeat"));
  assert.equal(
    leakedKeys.length,
    0,
    `expected zero marketbeat keys in run2 (post-reset), got: ${leakedKeys.map((m) => m.metric).join(", ")}`,
  );
});

// --- corridor_factor --------------------------------------------------------

function makeCorridorFragmentWithMetrics(
  name: string,
  city: string,
  cap: number,
  vac: number,
  abs: number,
  rent: number,
  vacancySourceUrl: string | null = null,
  submarket: string | null = name,
): RawFragment {
  const norm: CorridorNormalized = {
    kind: "corridor",
    name,
    city,
    county: "Lee",
    // Default: each hand-built metrics corridor is its own one-corridor
    // submarket so metric-median tests keep exercising the value math (a null
    // submarket drops the row from every stamped-metric aggregate). Pass an
    // explicit shared submarket to model the stamped-duplicate shape.
    submarket,
    corridor_type: "highway-strip-mall",
    seasonal_index: 0.3,
    character: null,
    evolution_direction: null,
    tenant_mix: null,
    flags: [],
    source_url: null,
    cap_rate_source_url: null,
    vacancy_rate_source_url: vacancySourceUrl,
    absorption_sqft_source_url: null,
    asking_rent_psf_source_url: null,
    cap_rate_pct: cap,
    cap_rate_direction: null,
    vacancy_rate_pct: vac,
    vacancy_rate_direction: null,
    absorption_sqft: abs,
    absorption_sqft_direction: null,
    asking_rent_psf: rent,
    asking_rent_psf_direction: null,
    metrics_period: null,
    metrics_verified_date: null,
    character_broker_narrative: null,
    character_render: null,
    character_facts: null,
    character_speculative: null,
    character_chart: null,
    character_citations: null,
    character_generated_at: null,
    character_fact_pack_vintage: null,
  };
  return {
    fragment_id: `corridor_profiles:${name}`,
    source_id: "corridor_profiles",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: {},
    normalized: norm as unknown as Record<string, unknown>,
  };
}

test("corridor_factor: appears in key_metrics with a finite numeric score when corridors have CRE metrics", () => {
  creSwfl.corpusSummary!([
    makeCorridorFragmentWithMetrics("A Fort Myers", "Fort Myers", 6, 8, 1000, 20),
    makeCorridorFragmentWithMetrics("B Naples", "Naples", 4, 4, 5000, 30),
    makeCorridorFragmentWithMetrics("C Fort Myers", "Fort Myers", 9, 15, 200, 15),
  ]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const cfMetric = result.key_metrics.find((m) => m.metric === "corridor_factor");
  assert.ok(cfMetric, "expected corridor_factor in key_metrics");
  assert.ok(
    typeof cfMetric!.value === "number" && Number.isFinite(cfMetric!.value),
    `expected a finite numeric corridor_factor value, got ${cfMetric!.value}`,
  );
  assert.ok(
    (cfMetric!.value as number) >= 0 && (cfMetric!.value as number) <= 100,
    `corridor_factor must be in [0, 100], got ${cfMetric!.value}`,
  );
  assert.equal(cfMetric!.units, "index 0-100");
  assert.equal(cfMetric!.display_format, "raw");
});

test("corridor_factor: absent when all corridors have null CRE metrics", () => {
  creSwfl.corpusSummary!([
    makeCorridorFragment("A", "Fort Myers"),
    makeCorridorFragment("B", "Naples"),
  ]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  assert.ok(
    !result.key_metrics.some((m) => m.metric === "corridor_factor"),
    "expected no corridor_factor when all corridors have null metrics",
  );
});

// --- MarketBeat coverage caveat: only fires on a REAL partial gap ----------
// The broker (MarketBeat) feed is frequently absent (deleted upstream) — its
// normal, expected state. When mbRows === [] every corridor lands in
// `unmatched`, which used to emit a "coverage is incomplete" caveat. That is
// the false "Fort Myers Beach did not join" signal: there is no broker survey
// at all, so there is nothing for it to be incomplete *about*.

test("marketbeat: empty MarketBeat feed (deleted) → no incomplete-coverage caveat", () => {
  // Corridors present, zero MarketBeat fragments — the normal post-delete
  // state. Every corridor is `unmatched` (no submarket rows to join against),
  // but a missing survey is not an incomplete survey.
  creSwfl.corpusSummary!([
    makeCorridorFragment("Pine Ridge Rd Naples", "Naples"),
    makeCorridorFragment("Cape Coral Pkwy E", "Cape Coral"),
  ]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const coverageCaveat = result.caveats.find((c) =>
    c.includes("Broker-survey (MarketBeat) coverage is incomplete"),
  );
  assert.ok(
    !coverageCaveat,
    `expected NO MarketBeat coverage caveat when the feed is empty, got caveats:\n${result.caveats.join("\n")}`,
  );
});

test("marketbeat: non-empty feed with an unmatched corridor → incomplete-coverage caveat fires", () => {
  // A Naples broker row IS present (mbRows.length > 0). One corridor maps to
  // Naples (matched); one has no alias entry (unmatched). That is a real
  // partial gap — the coverage caveat must still fire.
  const naplesMb: MarketbeatSwflNormalized = {
    kind: "marketbeat-swfl",
    source_name: "cw_marketbeat",
    submarket: "Naples",
    quarter: "2026-Q3",
    vacancy_rate: 4.8,
    asking_rent_nnn: 41.5,
    absorption_sqft: 32000,
    source_url: "https://example.invalid/naples",
  };
  creSwfl.corpusSummary!([
    makeCorridorFragment("Pine Ridge Rd Naples", "Naples"), // maps to Naples
    makeCorridorFragment("Nonexistent Corridor", "Naples"), // no alias → unmatched
    makeMbFragment(naplesMb),
  ]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const coverageCaveat = result.caveats.find((c) =>
    c.includes("Broker-survey (MarketBeat) coverage is incomplete"),
  );
  assert.ok(
    coverageCaveat,
    `expected the coverage caveat to fire on a real partial gap, got caveats:\n${result.caveats.join("\n")}`,
  );
});

// --- MarketBeat parent (place) rollups: "Naples area" median ---------------
// Sub-areas (East/North Naples, Golden Gate, Lely) roll UP to a parent-place
// median so a user asking about "Naples" gets the whole-area read, distinct
// from the own-city "Naples" row. Slug carries an `_area` suffix so it never
// collides with the own-city `..._marketbeat_naples` slug.

function mbRow(
  submarket: string,
  vacancy_rate: number | null,
  asking_rent_nnn: number | null,
  absorption_sqft: number | null,
): MarketbeatSwflNormalized {
  return {
    kind: "marketbeat-swfl",
    source_name: "mhs_databook",
    submarket,
    quarter: "2026-Q1",
    vacancy_rate,
    asking_rent_nnn,
    absorption_sqft,
    source_url: "https://example.invalid/mhs",
  };
}

test("rollup: Naples sub-areas + own-city roll up into a naples_area median", () => {
  const rollups = computeMarketbeatParentRollups([
    mbRow("Naples", 4.0, 40, 1000),
    mbRow("East Naples", 6.0, 30, 3000),
    mbRow("North Naples", 8.0, 50, 5000),
    mbRow("Cape Coral", 5.0, 25, 2000), // own place, single child → no rollup
  ]);
  const vac = rollups.find((r) => r.parentSlug === "naples" && r.field === "vacancy_rate");
  assert.ok(vac, "expected a naples vacancy_rate rollup");
  assert.equal(vac!.value, 6.0); // median(4,6,8)
  assert.equal(vac!.parentDisplay, "Naples");
  assert.equal(vac!.contributing.length, 3);
  // Single-child parents (Cape Coral) must NOT produce an area rollup.
  assert.ok(
    !rollups.some((r) => r.parentSlug === "cape_coral"),
    "single-child parent should not roll up",
  );
});

test("rollup: a field with only one non-null child value does not roll up", () => {
  const rollups = computeMarketbeatParentRollups([
    mbRow("Naples", 4.0, null, null),
    mbRow("East Naples", 6.0, null, 3000), // only East Naples has absorption
    mbRow("North Naples", 8.0, null, null),
  ]);
  // vacancy has 3 values → rolls up
  assert.ok(rollups.some((r) => r.parentSlug === "naples" && r.field === "vacancy_rate"));
  // asking_rent has 0 non-null → no rollup
  assert.ok(!rollups.some((r) => r.parentSlug === "naples" && r.field === "asking_rent_nnn"));
  // absorption has 1 non-null → median of one is redundant → no rollup
  assert.ok(!rollups.some((r) => r.parentSlug === "naples" && r.field === "absorption_sqft"));
});

test("rollup: Fort Myers area pulls in sub-areas incl. The Islands + sfm-san-carlos", () => {
  const rollups = computeMarketbeatParentRollups([
    mbRow("Fort Myers", 8.0, null, null),
    mbRow("North Fort Myers", 10.0, null, null),
    mbRow("sfm-san-carlos", 12.0, null, null),
    mbRow("The Islands", 6.0, null, null),
  ]);
  const vac = rollups.find((r) => r.parentSlug === "fort_myers" && r.field === "vacancy_rate");
  assert.ok(vac, "expected a fort_myers area rollup");
  assert.equal(vac!.value, 9.0); // median(8,10,12,6) = (8+10)/2
  assert.equal(vac!.contributing.length, 4);
});

test("rollup: an unresolved submarket is skipped, never invents a parent", () => {
  const rollups = computeMarketbeatParentRollups([
    mbRow("Atlantis", 4.0, null, null),
    mbRow("Gotham", 6.0, null, null),
  ]);
  assert.equal(rollups.length, 0);
});

// ── sanitizeScrapedCitation ──────────────────────────────────────────────────
// corridor-pulse signal source receipts arrive as RAW scraped page markdown
// (nav links, share buttons, full encoded URLs). Adopting one verbatim as the
// corridor_pulse_signals_live citation leaks that chrome into the user payload
// (violates the CLEAN rule of engagement). The sanitizer strips markdown-link
// chrome (keeping the visible text), collapses whitespace, and bounds length.

test("sanitizeScrapedCitation: strips markdown-link chrome but keeps the visible text", () => {
  const dirty =
    'Old Naples lease terminated: "[Skip to main content](https://x.example/article#main) [Facebook](https://x.example/share?u=long-encoded-url)"';
  const clean = sanitizeScrapedCitation(dirty);
  assert.ok(!clean.includes("]("), `markdown link syntax leaked: ${clean}`);
  assert.ok(!clean.includes("https://x.example/share"), `raw share URL leaked: ${clean}`);
  assert.ok(clean.includes("Skip to main content"), "kept the link text");
  assert.ok(clean.includes("Old Naples lease terminated"), "kept the headline");
});

test("sanitizeScrapedCitation: collapses newlines and runs of whitespace", () => {
  assert.equal(
    sanitizeScrapedCitation("line one\n\n  line two\t\tline three"),
    "line one line two line three",
  );
});

test("sanitizeScrapedCitation: bounds length with an ellipsis; short clean text passes through unchanged", () => {
  const short = "Restaurant lease terminated in Old Naples (Gulfshore Business).";
  assert.equal(sanitizeScrapedCitation(short), short);
  const clean = sanitizeScrapedCitation("x".repeat(500));
  assert.ok(clean.length <= 221, `expected bounded length, got ${clean.length}`);
  assert.ok(clean.endsWith("…"), "expected an ellipsis on truncation");
});

// ── corridor_vacancy detail_table (per-corridor vacancy as a consumable artifact) ──
// DETERMINISTIC emission, mirrors corridor_seasonality. Guardrail 2 (Step-0
// finding, operator-approved Option 1): the at-grain coverage_note rides ONLY on
// rows whose vacancy_rate_source_url is the incomplete MarketBeat submarket
// survey (per corridor_profiles that is Lehigh Acres only) — never an unsourced
// corridor, never a blanket footnote.
const MARKETBEAT_URL = "https://assets.cushmanwakefield.com/-/media/cw/marketbeat-pdf";

test("cre-swfl emits a deterministic corridor_vacancy detail_table", () => {
  creSwfl.corpusSummary!([
    // MarketBeat-sourced corridor → row present WITH coverage_note
    makeCorridorFragmentWithMetrics(
      "Lee Blvd Lehigh Acres",
      "Lehigh Acres",
      7,
      0.2,
      500,
      18,
      MARKETBEAT_URL,
    ),
    // unsourced corridor with vacancy → row present, NO coverage_note
    makeCorridorFragmentWithMetrics("Pine Ridge Rd Naples", "Naples", 6, 3.2, 4000, 32),
    // null-vacancy corridor → excluded from the table entirely
    makeCorridorFragment("Cape Coral Pkwy E", "Cape Coral"),
  ]);
  const out = creSwfl.outputProducer!(minimalPackOutput());

  const t = out.detail_tables?.find((d) => d.id === "corridor_vacancy");
  assert.ok(t, "corridor_vacancy detail_table must be present");
  assert.equal(t!.grain, "corridor");
  assert.equal(t!.columns[0].id, "vacancy_rate_pct");
  assert.equal(t!.columns[0].display_format, "percent");

  // one row per corridor with non-null vacancy; null-vacancy corridors excluded
  assert.equal(t!.rows.length, 2, "null-vacancy corridor must be excluded");
  assert.ok(
    t!.rows.every((r) => typeof r.cells.vacancy_rate_pct === "number"),
    "every row carries a numeric vacancy_rate_pct",
  );

  // coverage_note rides ONLY on the MarketBeat-sourced row, as a string.
  // Match on the stable `key` (raw corridor name); `label` is display-rewritten.
  const lehigh = t!.rows.find((r) => r.key.includes("Lehigh"));
  const naples = t!.rows.find((r) => r.key.includes("Naples"));
  assert.ok(lehigh, "Lehigh row present");
  assert.ok(naples, "Naples row present");
  assert.equal(
    typeof lehigh!.cells.coverage_note,
    "string",
    "MarketBeat-sourced row carries a coverage_note",
  );
  assert.ok(
    /marketbeat/i.test(lehigh!.cells.coverage_note as string),
    "coverage_note names the MarketBeat survey",
  );
  assert.equal(
    naples!.cells.coverage_note,
    undefined,
    "unsourced corridor must NOT carry a coverage_note (no fabricated provenance)",
  );
});

// --- Corridor-median grain: the 07/13 stamped-figure incident as law ----------
// corridor_profiles rent/vacancy/cap figures are C&W MarketBeat SUBMARKET
// values stamped onto every corridor in the submarket. The published medians
// must therefore be medians ACROSS SUBMARKETS — a median across corridor rows
// is corridor-count-weighted and lets one submarket's stamped copies outvote
// the rest (check corridor_grain_bug_is_live_on_embed_and_brain).

test("grain: stamped duplicate corridors collapse to ONE submarket vote in the SWFL medians", () => {
  creSwfl.corpusSummary!([
    // Naples: three corridors, identical stamped figures — the crowning shape.
    makeCorridorFragmentWithMetrics(
      "Waterside Shops",
      "Naples",
      6.7,
      1.8,
      1500,
      60.84,
      null,
      "Naples",
    ),
    makeCorridorFragmentWithMetrics(
      "5th Ave South",
      "Naples",
      6.7,
      1.8,
      6200,
      60.84,
      null,
      "Naples",
    ),
    makeCorridorFragmentWithMetrics(
      "Tamiami Naples",
      "Naples",
      6.7,
      1.8,
      800,
      60.84,
      null,
      "Naples",
    ),
    makeCorridorFragmentWithMetrics(
      "Cape Coral Pkwy E",
      "Cape Coral",
      6.7,
      2.5,
      3500,
      23.09,
      null,
      "Cape Coral",
    ),
  ]);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const rent = result.key_metrics.find((m) => m.metric === "asking_rent_psf_median");
  assert.ok(rent, "expected asking_rent_psf_median");
  // Corridor-weighted median of [60.84, 60.84, 60.84, 23.09] is 60.84 — the bug.
  // Submarket-grain median of [60.84, 23.09] is ~41.97.
  assert.notEqual(rent!.value, 60.84, "median must not be the stamped-majority value");
  assert.ok(
    (rent!.value as number) > 41.9 && (rent!.value as number) < 42.0,
    `expected the 2-submarket median (~41.97), got ${rent!.value}`,
  );
  assert.match(String(rent!.label), /2 of 2 submarkets/);
  assert.match(
    String(rent!.source.citation),
    /2 submarkets reporting asking_rent_psf \(4 corridors mapped\)/,
  );
});

test("grain: fixture-driven SWFL + county medians are submarket-grain; null-submarket corridors drop out", async () => {
  const corridorFragments = await corridorSource.fetch();
  creSwfl.corpusSummary!(corridorFragments);
  const result = creSwfl.outputProducer!(minimalPackOutput());
  const has = (slug: string) => result.key_metrics.find((m) => m.metric === slug);

  // Fixture submarket reps with a rent: North Naples 42.5 · Lehigh Acres 35.08 ·
  // Cape Coral 32.5 · Bonita Springs 26.5 (City of Fort Myers holds no values;
  // Pine Ridge 38.0 / Estero Blvd 45.0 / Gulf Coast 28.0 / Alico Flex 16.5 have
  // NO submarket and must not contribute). Median = (32.5 + 35.08) / 2 = 33.79.
  // The old corridor-weighted median over all 9 rent rows was 35.08.
  const rent = has("asking_rent_psf_median");
  assert.ok(rent, "expected asking_rent_psf_median");
  assert.equal(rent!.value, 33.79);
  assert.match(String(rent!.label), /4 of 5 submarkets/);

  const vac = has("vacancy_rate_median");
  assert.ok(vac, "expected vacancy_rate_median");
  assert.equal(vac!.value, 4.6); // median(0.2, 4.2, 5, 8) across submarkets

  const cap = has("cap_rate_median");
  assert.ok(cap, "expected cap_rate_median");
  assert.equal(cap!.value, 6.2); // median(5.8, 6.2, 7) across submarkets

  // County split rides the reps: Collier = North Naples alone; Lee = Lehigh /
  // Cape Coral / Bonita (City of Fort Myers has no values).
  const rentCollier = has("asking_rent_psf_median_collier");
  assert.ok(rentCollier, "expected asking_rent_psf_median_collier");
  assert.equal(rentCollier!.value, 42.5);
  assert.match(String(rentCollier!.label), /1 of 1 Collier submarkets/);
  const rentLee = has("asking_rent_psf_median_lee");
  assert.ok(rentLee, "expected asking_rent_psf_median_lee");
  assert.equal(rentLee!.value, 32.5);
  assert.match(String(rentLee!.label), /3 of 4 Lee submarkets/);

  // Absorption stays corridor-grain — it genuinely varies inside a submarket.
  const abs = has("absorption_sqft_median");
  assert.ok(abs, "expected absorption_sqft_median");
  assert.match(String(abs!.label), /corridors\)/);
});
