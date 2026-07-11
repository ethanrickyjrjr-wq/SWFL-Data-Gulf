import { test } from "bun:test";
import assert from "node:assert/strict";
import { brainJsonLd, corridorJsonLd, deskJsonLd } from "./jsonld.ts";
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
  assert.ok(((dataset as Record<string, unknown>).url as string).includes("env-swfl"));
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
  const first = ((faq as Record<string, unknown>).mainEntity as Record<string, unknown>[])[0];
  assert.ok((first.name as string).toLowerCase().includes("outlook"));
  assert.equal((first.acceptedAnswer as Record<string, unknown>).text, minBrain.conclusion);
});

test("brainJsonLd: FAQPage capped at 8 entries", () => {
  const manyMetrics = Array.from({ length: 20 }, (_, i) => metric(i));
  const [, faq] = brainJsonLd({ ...minBrain, metrics: manyMetrics }, "env-swfl");
  assert.ok(((faq as Record<string, unknown>).mainEntity as unknown[]).length <= 8);
});

test("brainJsonLd: empty conclusion drops the intro Q, no empty acceptedAnswer", () => {
  const manyMetrics = Array.from({ length: 20 }, (_, i) => metric(i));
  const [, faq] = brainJsonLd({ ...minBrain, conclusion: "", metrics: manyMetrics }, "env-swfl");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[];
  for (const e of entries) {
    assert.notEqual((e.acceptedAnswer as Record<string, unknown>).text, "");
  }
  assert.equal(entries.length, 8);
  assert.ok(!(entries[0].name as string).toLowerCase().includes("outlook"));
});

test("brainJsonLd: FAQ metric answer embeds sourceUrl when present", () => {
  const [, faq] = brainJsonLd(minBrain, "env-swfl");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[];
  const aalQ = entries.find((e) => (e.name as string).includes("AAL per policy"));
  assert.ok(aalQ, "expected an AAL metric FAQ entry");
  assert.ok(
    ((aalQ!.acceptedAnswer as Record<string, unknown>).text as string).includes(
      "https://www.fema.gov/nfip",
    ),
    "metric answer should embed the source url",
  );
});

test("brainJsonLd: FAQ metric answer is url-free when sourceUrl is empty", () => {
  const noUrl = {
    ...minBrain,
    metrics: [{ ...minBrain.metrics[0], sourceUrl: "" }],
  };
  const [, faq] = brainJsonLd(noUrl, "env-swfl");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[];
  const aalQ = entries.find((e) => (e.name as string).includes("AAL per policy"));
  const text = (aalQ!.acceptedAnswer as Record<string, unknown>).text as string;
  assert.ok(!text.includes("http"), "no url when sourceUrl is empty");
  assert.ok(!text.includes("()"), "no dangling empty parens");
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
  const entries = (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[];
  const capRateQ = entries.find((e) => (e.name as string).toLowerCase().includes("cap rate"));
  assert.ok(capRateQ, "expected a cap rate FAQ entry");
  assert.ok(
    ((capRateQ!.acceptedAnswer as Record<string, unknown>).text as string).includes("6.5%"),
  );
});

test("corridorJsonLd: null metrics are omitted from FAQ", () => {
  const [, faq] = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[];
  const absorptionQ = entries.find((e) => (e.name as string).toLowerCase().includes("absorption"));
  assert.equal(absorptionQ, undefined, "absorption_sqft is null — should not appear");
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

function capRateText(c: CorridorNormalized): string {
  const [, faq] = corridorJsonLd(c, TOKEN, "Airport-Pulling");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[];
  const capQ = entries.find((e) => (e.name as string).toLowerCase().includes("cap rate"));
  return (capQ!.acceptedAnswer as Record<string, unknown>).text as string;
}

test("corridorJsonLd: metric answer embeds per-metric source url", () => {
  const text = capRateText({
    ...minCorridor,
    cap_rate_source_url: "https://costar.example/cap",
  });
  assert.ok(text.includes("https://costar.example/cap"));
});

test("corridorJsonLd: metric source url falls back to corridor.source_url", () => {
  const text = capRateText({
    ...minCorridor,
    cap_rate_source_url: null,
    source_url: "https://costar.example/fallback",
  });
  assert.ok(text.includes("https://costar.example/fallback"));
});

test("corridorJsonLd: metric answer is url-free when no source url at all", () => {
  // minCorridor has every *_source_url and source_url null
  assert.ok(!capRateText(minCorridor).includes("http"));
});

test("corridorJsonLd: each metric uses its own per-metric source url", () => {
  const c: CorridorNormalized = {
    ...minCorridor,
    cap_rate_source_url: "https://costar.example/cap",
    vacancy_rate_source_url: "https://costar.example/vac",
  };
  const [, faq] = corridorJsonLd(c, TOKEN, "Airport-Pulling");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[];
  const capQ = entries.find((e) => (e.name as string).toLowerCase().includes("cap rate"));
  const vacQ = entries.find((e) => (e.name as string).toLowerCase().includes("vacancy"));
  const capText = (capQ!.acceptedAnswer as Record<string, unknown>).text as string;
  const vacText = (vacQ!.acceptedAnswer as Record<string, unknown>).text as string;
  assert.ok(capText.includes("https://costar.example/cap"));
  assert.ok(!capText.includes("https://costar.example/vac"));
  assert.ok(vacText.includes("https://costar.example/vac"));
});

test("deskJsonLd: Dataset is accessible-for-free and has a creator", () => {
  const [ds] = deskJsonLd([
    { label: "Median list", value: 345000, sourceLabel: "SWFL Data Gulf" },
  ]) as Record<string, unknown>[];
  assert.equal(ds.isAccessibleForFree, true);
  assert.equal((ds.creator as Record<string, unknown>)["@type"], "Organization");
  assert.equal((ds.creator as Record<string, unknown>).name, "SWFL Data Gulf");
});

test("deskJsonLd: spatialCoverage names Lee and Collier", () => {
  const [ds] = deskJsonLd([{ label: "x", value: 1, sourceLabel: "s" }]) as Record<
    string,
    unknown
  >[];
  const json = JSON.stringify(ds.spatialCoverage);
  assert.ok(json.includes("Lee County"));
  assert.ok(json.includes("Collier County"));
});

test("deskJsonLd: emits temporalCoverage when provided, omits when not", () => {
  const [withTc] = deskJsonLd(
    [{ label: "x", value: 1, sourceLabel: "s" }],
    "2026-07-10",
    "2026-05-01/2026-07-10",
  ) as Record<string, unknown>[];
  assert.equal(withTc.temporalCoverage, "2026-05-01/2026-07-10");
  const [without] = deskJsonLd(
    [{ label: "x", value: 1, sourceLabel: "s" }],
    "2026-07-10",
  ) as Record<string, unknown>[];
  assert.equal("temporalCoverage" in without, false);
});

test("brainJsonLd: Dataset carries creator + isAccessibleForFree + temporalCoverage", () => {
  const [ds] = brainJsonLd(minBrain, "env-swfl") as Record<string, unknown>[];
  assert.equal(ds.isAccessibleForFree, true);
  assert.equal((ds.creator as Record<string, unknown>).name, "SWFL Data Gulf");
  assert.equal(ds.temporalCoverage, "2026-06-01"); // from minBrain.refinedAt
});
