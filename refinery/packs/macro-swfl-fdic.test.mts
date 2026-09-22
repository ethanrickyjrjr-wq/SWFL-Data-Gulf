import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import { macroSwfl } from "./macro-swfl.mts";

function lausFrag(): RawFragment {
  const county = {
    unemployment_rate: 4.0,
    unemployment_rate_yoy_delta: 0.1,
    labor_force: 1,
    employed: 1,
    unemployed: 1,
  };
  return {
    fragment_id: "laus",
    source_id: "bls_laus",
    source_trust_tier: 1,
    fetched_at: "2026-09-22T00:00:00Z",
    raw: {},
    normalized: {
      kind: "laus-swfl-summary",
      reference_month: "2026-07",
      is_preliminary: false,
      fl_state: county,
      lee_county: county,
      collier_county: county,
    },
  } as unknown as RawFragment;
}

function fdicFrag(partialHendry: boolean): RawFragment {
  const lee = {
    county_fips: "12071",
    year: 2026,
    deposits_usd: 21_115_545_000,
    deposits_yoy_pct: -5.28,
    branches: 162,
    banks: 33,
    partial_year: null,
  };
  const collier = {
    ...lee,
    county_fips: "12021",
    deposits_usd: 20_000_000_000,
    deposits_yoy_pct: 2.56,
    branches: 128,
    banks: 29,
  };
  const hendry = partialHendry
    ? {
        ...lee,
        county_fips: "12051",
        year: 2025,
        deposits_usd: 520_000_000,
        deposits_yoy_pct: 4,
        branches: 10,
        banks: 4,
        partial_year: 2026,
      }
    : null;
  return {
    fragment_id: "fdic",
    source_id: "fdic_sod",
    source_trust_tier: 1,
    fetched_at: "2026-09-22T00:00:00Z",
    raw: {},
    normalized: { kind: "fdic-deposits-swfl-summary", lee, collier, hendry },
  } as unknown as RawFragment;
}

function build(fragments: RawFragment[]) {
  const facts = macroSwfl.corpusSummary!(fragments);
  const out = macroSwfl.outputProducer!({ facts } as never);
  return { facts, out };
}

test("deposits land as a fact and as key_metrics in whole USD with the FDIC citation", () => {
  const { facts, out } = build([lausFrag(), fdicFrag(false)]);
  const fact = facts.find((f) => f.topic === "fdic_deposits");
  assert.ok(fact, "fdic_deposits fact missing");
  assert.deepEqual(
    fact.source_fragment_ids,
    ["fdic"],
    "the deposits fact must cite the FDIC fragment, not fall back to BLS",
  );
  assert.match(
    fact.value,
    /Lee County \$21,115,545,000 as of 06\/30\/2026 \(-5\.3% YoY; 162 branches, 33 banks\)/,
  );

  const lee = out.key_metrics.find((m) => m.metric === "fdic_lee_branch_deposits_usd");
  assert.ok(lee);
  assert.equal(lee.value, 21_115_545_000);
  assert.equal(lee.direction, "falling");
  assert.equal(lee.units, "USD");
  assert.match(lee.source.url, /api\.fdic\.gov\/banks\/sod\?filters=STCNTYBR:12071/);

  const yoy = out.key_metrics.find((m) => m.metric === "fdic_collier_branch_deposits_yoy_pct");
  assert.equal(yoy?.value, 2.56);
  assert.equal(yoy?.direction, "rising");
  assert.ok(out.key_metrics.some((m) => m.metric === "fdic_lee_bank_branches" && m.value === 162));
  assert.match(
    out.conclusion,
    /Bank branch deposits in Lee County stood at \$21,115,545,000 as of 06\/30\/2026 \(-5\.3% YoY\)/,
  );
});

test("no FDIC fragment → a caveat names the missing view, no deposit metrics are invented", () => {
  const { out } = build([lausFrag()]);
  assert.ok(out.key_metrics.every((m) => !m.metric.startsWith("fdic_")));
  assert.ok(out.caveats.some((c) => c.includes("fdic_sod_county_year_v")));
});

test("a partial newest year is named in caveats only for the counties it affects", () => {
  const { out } = build([lausFrag(), fdicFrag(true)]);
  // Hendry is not surfaced as a metric (Lee + Collier only), so its partial year is not a caveat either.
  assert.ok(!out.caveats.some((c) => c.includes("too few branches")));
});
