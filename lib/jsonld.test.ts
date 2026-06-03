import { test } from "bun:test";
import assert from "node:assert/strict";
import { brainJsonLd, corridorJsonLd } from "./jsonld.ts";
import type { DisplayBrain } from "../refinery/render/speaker.mts";
import type { CorridorNormalized } from "../refinery/sources/cre-source.mts";

const minBrain: DisplayBrain = {
  title: "SWFL Environment",
  scope: "Lee and Collier County FL flood and environmental risk.",
  freshnessToken: "SWFL-7421-v5-20260601",
  refinedAt: "2026-06-01",
  direction: "bullish",
  magnitudePct: 72,
  confidencePct: 85,
  conclusion: "Flood risk remains elevated in coastal ZIPs.",
  metrics: [
    {
      label: "AAL per policy",
      value: "$1,234",
      direction: "bearish",
      sourceLabel: "FEMA NFIP",
      sourceUrl: "https://www.fema.gov/nfip",
      sourceFull: "FEMA National Flood Insurance Program",
      fetchedAt: "2026-06-01",
    },
  ],
  summaryCaveats: [],
  detailCaveats: [],
};

function metric(i: number) {
  return {
    label: `Metric ${i}`,
    value: `${i}`,
    direction: "neutral",
    sourceLabel: "src",
    sourceUrl: "",
    sourceFull: "src full",
    fetchedAt: "2026-06-01",
  };
}

test("brainJsonLd: returns two blocks", () => {
  const ld = brainJsonLd(minBrain, "env-swfl");
  assert.equal(ld.length, 2);
});

test("brainJsonLd: first block is Dataset", () => {
  const [dataset] = brainJsonLd(minBrain, "env-swfl");
  assert.equal((dataset as Record<string, unknown>)["@type"], "Dataset");
});

test("brainJsonLd: Dataset url contains slug", () => {
  const [dataset] = brainJsonLd(minBrain, "env-swfl");
  assert.ok(
    ((dataset as Record<string, unknown>).url as string).includes("env-swfl"),
  );
});

test("brainJsonLd: Dataset variableMeasured maps metrics", () => {
  const [dataset] = brainJsonLd(minBrain, "env-swfl");
  const vm = (dataset as Record<string, unknown>).variableMeasured as unknown[];
  assert.equal(vm.length, 1);
  assert.equal((vm[0] as Record<string, unknown>).name, "AAL per policy");
});

test("brainJsonLd: second block is FAQPage", () => {
  const [, faq] = brainJsonLd(minBrain, "env-swfl");
  assert.equal((faq as Record<string, unknown>)["@type"], "FAQPage");
});

test("brainJsonLd: FAQPage first Q is conclusion-based", () => {
  const [, faq] = brainJsonLd(minBrain, "env-swfl");
  const first = (
    (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[]
  )[0];
  assert.ok((first.name as string).toLowerCase().includes("outlook"));
  assert.equal(
    (first.acceptedAnswer as Record<string, unknown>).text,
    minBrain.conclusion,
  );
});

test("brainJsonLd: FAQPage capped at 8 entries", () => {
  const manyMetrics = Array.from({ length: 20 }, (_, i) => metric(i));
  const [, faq] = brainJsonLd(
    { ...minBrain, metrics: manyMetrics },
    "env-swfl",
  );
  assert.ok(
    ((faq as Record<string, unknown>).mainEntity as unknown[]).length <= 8,
  );
});

test("brainJsonLd: empty conclusion drops the intro Q, no empty acceptedAnswer", () => {
  const manyMetrics = Array.from({ length: 20 }, (_, i) => metric(i));
  const [, faq] = brainJsonLd(
    { ...minBrain, conclusion: "", metrics: manyMetrics },
    "env-swfl",
  );
  const entries = (faq as Record<string, unknown>).mainEntity as Record<
    string,
    unknown
  >[];
  for (const e of entries) {
    assert.notEqual((e.acceptedAnswer as Record<string, unknown>).text, "");
  }
  assert.equal(entries.length, 8);
  assert.ok(!(entries[0].name as string).toLowerCase().includes("outlook"));
});

const minCorridor: CorridorNormalized = {
  kind: "corridor",
  name: "airport-pulling",
  display_name: "Airport-Pulling",
  city: "Naples",
  county: "Collier",
  corridor_type: "strip",
  seasonal_index: 0.8,
  character: "Mixed retail corridor showing signs of repositioning.",
  evolution_direction: "stabilizing",
  tenant_mix: "Service, QSR, medical",
  flags: [],
  source_url: null,
  cap_rate_source_url: null,
  vacancy_rate_source_url: null,
  absorption_sqft_source_url: null,
  asking_rent_psf_source_url: null,
  cap_rate_pct: 6.5,
  cap_rate_direction: "stable",
  vacancy_rate_pct: 8.2,
  vacancy_rate_direction: null,
  absorption_sqft: null,
  absorption_sqft_direction: null,
  asking_rent_psf: 22.5,
  asking_rent_psf_direction: "rising",
  metrics_period: "2026-Q1",
  metrics_verified_date: "2026-06-01",
  character_broker_narrative: null,
  character_render: null,
  character_facts: null,
  character_speculative: null,
  character_chart: null,
  character_citations: null,
  character_generated_at: null,
  character_fact_pack_vintage: null,
};

const TOKEN = "SWFL-7421-v5-20260601";

test("corridorJsonLd: returns two blocks", () => {
  const ld = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  assert.equal(ld.length, 2);
});

test("corridorJsonLd: first block is Place", () => {
  const [place] = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  assert.equal((place as Record<string, unknown>)["@type"], "Place");
});

test("corridorJsonLd: Place name is the passed display name, never raw slug", () => {
  const [place] = corridorJsonLd(
    { ...minCorridor, display_name: undefined },
    TOKEN,
    "Airport-Pulling",
  );
  assert.equal((place as Record<string, unknown>).name, "Airport-Pulling");
});

test("corridorJsonLd: FAQPage includes cap rate question", () => {
  const [, faq] = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<
    string,
    unknown
  >[];
  const capRateQ = entries.find((e) =>
    (e.name as string).toLowerCase().includes("cap rate"),
  );
  assert.ok(capRateQ, "expected a cap rate FAQ entry");
  assert.ok(
    (
      (capRateQ!.acceptedAnswer as Record<string, unknown>).text as string
    ).includes("6.5%"),
  );
});

test("corridorJsonLd: null metrics are omitted from FAQ", () => {
  const [, faq] = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<
    string,
    unknown
  >[];
  const absorptionQ = entries.find((e) =>
    (e.name as string).toLowerCase().includes("absorption"),
  );
  assert.equal(
    absorptionQ,
    undefined,
    "absorption_sqft is null — should not appear",
  );
});

test("corridorJsonLd: pre-sourcing corridor emits Place only, no empty FAQPage", () => {
  const bare: CorridorNormalized = {
    ...minCorridor,
    character: null,
    cap_rate_pct: null,
    vacancy_rate_pct: null,
    absorption_sqft: null,
    asking_rent_psf: null,
  };
  const ld = corridorJsonLd(bare, TOKEN, "Airport-Pulling");
  assert.equal(ld.length, 1);
  assert.equal((ld[0] as Record<string, unknown>)["@type"], "Place");
});
