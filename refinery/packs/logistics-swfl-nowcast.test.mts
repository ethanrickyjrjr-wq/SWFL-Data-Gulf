import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

process.env["REFINERY_SOURCE"] = "fixture";

const {
  logisticsSwflNowcast,
  nextConsecutiveBreachDays,
  classifyShockState,
  decideBaselineValidityFlag,
} = await import("./logistics-swfl-nowcast.mts");

const {
  fdotFreightSegmentsSource,
  tonsFromAadt,
  AVG_PAYLOAD_TONS_PER_TRUCK,
  BASELINE_COEFFICIENT_OF_VARIATION,
} = await import("../sources/fdot-freight-source.mts");

import type { ShockLogRow } from "../sources/fdot-freight-source.mts";
import type { BrainOutput } from "../types/brain-output.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { BrainEdge, PackDefinition } from "../types/pack.mts";

// =========================================================================
// 1. Pure formula unit test — tonsFromAadt is the locked AADT→tons math.
// =========================================================================

test("tonsFromAadt: locked formula matches the blueprint-pinned worked example", () => {
  // AADT=24000, tfctr=0.043, shape_length_m=6300, payload=16
  // tons = 24000 × 0.043 × 16 × 365 × (6300 / 1609.344)
  // miles = 6300 / 1609.344 = 3.9145...
  // = 24000 × 0.043 × 16 × 365 × 3.9145...
  const result = tonsFromAadt({
    aadt: 24000,
    tfctr: 0.043,
    shape_length_m: 6300,
    payload: 16,
  });
  const expected = 24000 * 0.043 * 16 * 365 * (6300 / 1609.344);
  assert.equal(result, expected);
});

test("tonsFromAadt: default payload uses AVG_PAYLOAD_TONS_PER_TRUCK = 16.0", () => {
  assert.equal(AVG_PAYLOAD_TONS_PER_TRUCK, 16.0);
  const explicit = tonsFromAadt({
    aadt: 10000,
    tfctr: 0.05,
    shape_length_m: 5000,
    payload: 16,
  });
  const implicit = tonsFromAadt({
    aadt: 10000,
    tfctr: 0.05,
    shape_length_m: 5000,
  });
  assert.equal(explicit, implicit);
});

// =========================================================================
// 2. State-machine pure helpers (consecutive-day counter + classifier).
// =========================================================================

function shockEntry(
  refined_at: string,
  deviation_z: number,
  flag?: "valid" | "stale-structural",
): ShockLogRow {
  return {
    kind: "fdot-freight-shock-log",
    refined_at,
    deviation_z,
    shock_state: Math.abs(deviation_z) > 3 ? "anomaly" : "normal",
    baseline_validity_flag: flag,
  };
}

test("nextConsecutiveBreachDays: |z|<=3 returns 0 regardless of history", () => {
  const history = [
    shockEntry("2026-05-15T12:00:00Z", -4.0),
    shockEntry("2026-05-16T12:00:00Z", -4.0),
  ];
  assert.equal(nextConsecutiveBreachDays(-2.5, history), 0);
});

test("nextConsecutiveBreachDays: |z|>3 with empty history → 1", () => {
  assert.equal(nextConsecutiveBreachDays(-4.0, []), 1);
});

test("nextConsecutiveBreachDays: |z|>3 with 2 matching-sign prior breaches → 3", () => {
  const history = [
    shockEntry("2026-05-15T12:00:00Z", -4.0),
    shockEntry("2026-05-16T12:00:00Z", -3.8),
  ];
  assert.equal(nextConsecutiveBreachDays(-4.2, history), 3);
});

test("nextConsecutiveBreachDays: sign flip resets to 1", () => {
  const history = [
    shockEntry("2026-05-15T12:00:00Z", -4.0),
    shockEntry("2026-05-16T12:00:00Z", -4.0),
  ];
  assert.equal(nextConsecutiveBreachDays(4.5, history), 1);
});

test("nextConsecutiveBreachDays: in-band gap in history breaks the streak", () => {
  const history = [
    shockEntry("2026-05-15T12:00:00Z", -4.0),
    shockEntry("2026-05-16T12:00:00Z", -1.0), // in-band — breaks the streak
    shockEntry("2026-05-17T12:00:00Z", -4.0),
  ];
  // Current breach + 1 prior (most-recent) breach with matching sign before
  // walking back further to the in-band entry which terminates the walk.
  assert.equal(nextConsecutiveBreachDays(-4.1, history), 2);
});

test("classifyShockState: thresholds at 3 and 30", () => {
  assert.equal(classifyShockState(0), "normal");
  assert.equal(classifyShockState(2), "normal");
  assert.equal(classifyShockState(3), "anomaly");
  assert.equal(classifyShockState(29), "anomaly");
  assert.equal(classifyShockState(30), "structural_break");
  assert.equal(classifyShockState(90), "structural_break");
});

test("decideBaselineValidityFlag: < 90 consecutive days + no prior stale → valid", () => {
  assert.equal(decideBaselineValidityFlag(89, []), "valid");
});

test("decideBaselineValidityFlag: 90 consecutive days → stale-structural (first flip)", () => {
  assert.equal(decideBaselineValidityFlag(90, []), "stale-structural");
});

test("decideBaselineValidityFlag: prior stale-structural is sticky regardless of current count", () => {
  const history = [
    shockEntry("2026-05-15T12:00:00Z", -4.0, "stale-structural"),
  ];
  assert.equal(decideBaselineValidityFlag(2, history), "stale-structural");
});

// =========================================================================
// 3. Pack-level metadata invariants.
// =========================================================================

test("logisticsSwflNowcast pack: stable id, brain_id, domain, ttl", () => {
  assert.equal(logisticsSwflNowcast.id, "logistics-swfl-nowcast");
  assert.equal(logisticsSwflNowcast.brain_id, "logistics-swfl-nowcast");
  assert.equal(logisticsSwflNowcast.domain, "logistics");
  assert.equal(logisticsSwflNowcast.ttl_seconds, 86400);
});

test("logisticsSwflNowcast pack: thin-pipe upstream is logistics-swfl", () => {
  assert.deepEqual(logisticsSwflNowcast.input_brains, [
    { id: "logistics-swfl", edge_type: "input" },
  ]);
});

test("logisticsSwflNowcast pack: 2 sources wired (fdot freight + brain input)", () => {
  assert.equal(logisticsSwflNowcast.sources.length, 2);
  const sourceIds = logisticsSwflNowcast.sources.map((s) => s.source_id);
  assert.ok(sourceIds.includes("fdot_freight_swfl"));
  assert.ok(sourceIds.includes("brain-input:logistics-swfl"));
});

test("logisticsSwflNowcast pack: deterministic (skipTriageAgent + skipSynthesisAgent)", () => {
  assert.equal(logisticsSwflNowcast.skipTriageAgent, true);
  assert.equal(logisticsSwflNowcast.skipSynthesisAgent, true);
});

// =========================================================================
// 4. Scenario tests — drive the pack end-to-end against each fixture
// scenario and verify shock_state / baseline_validity_flag.
// =========================================================================

/**
 * Wraps the BrainInput source's filesystem dependency for these tests.
 * The pack's brain-input source reads brains/logistics-swfl.md off disk; we
 * synthesize a minimal one for the test, then clean up.
 */
async function withSyntheticBaseline(body: () => Promise<void>): Promise<void> {
  const brainsDir = path.join(process.cwd(), "brains");
  await mkdir(brainsDir, { recursive: true });
  const p = path.join(brainsDir, "logistics-swfl.md");
  const output: BrainOutput = {
    brain_id: "logistics-swfl",
    version: 1,
    refined_at: new Date().toISOString(),
    direction: "neutral",
    magnitude: 0.5,
    drivers: [],
    overrides: [],
    conclusion: "Synthetic baseline for nowcast tests.",
    key_metrics: [
      {
        // Calibrated so the fixture "nominal" scenario sums to ~baseline
        // (z ~= 0). Fixture closure scenarios cut I-75 AADT to ~30% which
        // drops the corpus to ~600M tons → z ~= -6.1 → breach triggers.
        // See blueprint §4: baseline_mu = value × 1000.
        metric: "inbound_freight_tons_swfl",
        value: 1539664,
        direction: "stable",
        label: "test",
        variable_type: "extensive",
        units: "thousand tons/year",
        source: {
          url: "test://baseline",
          fetched_at: new Date().toISOString(),
          tier: 1,
          citation: "Test baseline",
        },
      },
    ],
    caveats: [],
    contradicts: [],
    confidence: 0.85,
    joint_integrity: 1,
    confidence_dispersion: 0,
    chain_depth: 0,
    trust_tier: 1,
    upstream_count: 0,
    relevance: {
      decay_curve: "months",
      half_life_hours: 8760,
      computed_at: new Date().toISOString(),
    },
    exogenous_signals: [],
  };
  // The TTL on the brain frontmatter must be long enough that the brain
  // reads as "fresh" — 30 days for the FAF5 baseline matches logistics-swfl.
  const ttlSeconds = 2_592_000;
  const md = [
    `---`,
    `brain_id: logistics-swfl`,
    `version: 1`,
    `refined_at: ${output.refined_at}`,
    `ttl_seconds: ${ttlSeconds}`,
    `---`,
    ``,
    `# Synthetic baseline`,
    ``,
    "```reference",
    `--- OUTPUT ---`,
    JSON.stringify(output, null, 2),
    "```",
    ``,
  ].join("\n");
  // Preserve any real logistics-swfl.md that lives in brains/ — restore on
  // cleanup so tests do not clobber the developer's working tree.
  let prior: string | null = null;
  try {
    prior = await readFile(p, "utf-8");
  } catch {
    prior = null;
  }
  await writeFile(p, md, "utf-8");
  try {
    await body();
  } finally {
    if (prior !== null) {
      await writeFile(p, prior, "utf-8");
    } else {
      await rm(p, { force: true });
    }
  }
}

async function runScenario(
  scenario: string,
): Promise<
  ReturnType<NonNullable<typeof logisticsSwflNowcast.outputProducer>>
> {
  const prev = process.env["REFINERY_FIXTURE_SCENARIO"];
  process.env["REFINERY_FIXTURE_SCENARIO"] = scenario;
  try {
    const fragments: RawFragment[] = [
      ...(await fdotFreightSegmentsSource.fetch()),
      ...(await logisticsSwflNowcast.sources[1].fetch()),
    ];
    logisticsSwflNowcast.corpusSummary!(fragments);
    return logisticsSwflNowcast.outputProducer!({
      pack: logisticsSwflNowcast,
      version: 1,
      refined_at: new Date().toISOString(),
      citations: [],
      facts: [],
      recentNote: "",
    } as unknown as Parameters<
      NonNullable<typeof logisticsSwflNowcast.outputProducer>
    >[0]);
  } finally {
    if (prev === undefined) delete process.env["REFINERY_FIXTURE_SCENARIO"];
    else process.env["REFINERY_FIXTURE_SCENARIO"] = prev;
  }
}

test("scenario nominal → shock_state=normal, baseline_validity_flag=valid, no stale caveat", async () => {
  await withSyntheticBaseline(async () => {
    const result = await runScenario("nominal");
    const shockMetric = result.key_metrics.find(
      (m) => m.metric === "shock_state",
    );
    const flagMetric = result.key_metrics.find(
      (m) => m.metric === "baseline_validity_flag",
    );
    assert.ok(shockMetric, "shock_state metric must be present");
    assert.ok(flagMetric, "baseline_validity_flag metric must be present");
    assert.equal(shockMetric!.value, "normal");
    assert.equal(flagMetric!.value, "valid");
    // No verbatim stale-structural caveat should fire.
    assert.ok(
      !result.caveats.some((c) => c.includes("stale-structural")),
      "nominal scenario must not emit a stale-structural caveat",
    );
  });
});

test("scenario i75_closure_acute → shock_state=anomaly (3 consecutive days)", async () => {
  await withSyntheticBaseline(async () => {
    const result = await runScenario("i75_closure_acute");
    const shockMetric = result.key_metrics.find(
      (m) => m.metric === "shock_state",
    );
    const flagMetric = result.key_metrics.find(
      (m) => m.metric === "baseline_validity_flag",
    );
    const consecMetric = result.key_metrics.find(
      (m) => m.metric === "consecutive_breach_days",
    );
    assert.equal(shockMetric!.value, "anomaly");
    assert.equal(flagMetric!.value, "valid");
    assert.equal(consecMetric!.value, 3);
  });
});

test("scenario i75_closure_sustained_30d → shock_state=structural_break", async () => {
  await withSyntheticBaseline(async () => {
    const result = await runScenario("i75_closure_sustained_30d");
    const shockMetric = result.key_metrics.find(
      (m) => m.metric === "shock_state",
    );
    const flagMetric = result.key_metrics.find(
      (m) => m.metric === "baseline_validity_flag",
    );
    const consecMetric = result.key_metrics.find(
      (m) => m.metric === "consecutive_breach_days",
    );
    assert.equal(shockMetric!.value, "structural_break");
    assert.equal(flagMetric!.value, "valid");
    assert.equal(consecMetric!.value, 30);
  });
});

test("scenario i75_closure_sustained_90d → baseline_validity_flag flips to stale-structural + verbatim caveat", async () => {
  await withSyntheticBaseline(async () => {
    const result = await runScenario("i75_closure_sustained_90d");
    const shockMetric = result.key_metrics.find(
      (m) => m.metric === "shock_state",
    );
    const flagMetric = result.key_metrics.find(
      (m) => m.metric === "baseline_validity_flag",
    );
    const consecMetric = result.key_metrics.find(
      (m) => m.metric === "consecutive_breach_days",
    );
    assert.equal(shockMetric!.value, "structural_break");
    assert.equal(flagMetric!.value, "stale-structural");
    assert.equal(consecMetric!.value, 90);
    const verbatimSnippet =
      "Baseline validity flag flipped to stale-structural";
    assert.ok(
      result.caveats.some((c) => c.includes(verbatimSnippet)),
      `expected verbatim stale-structural caveat, got:\n${result.caveats.join("\n")}`,
    );
  });
});

test("baseline_sigma = baseline_mu × 0.10 (FHWA FAF5 §3.2)", () => {
  assert.equal(BASELINE_COEFFICIENT_OF_VARIATION, 0.1);
});

// =========================================================================
// 5. Integration test — Lane 2E stale-upstream cascade end-to-end.
// =========================================================================

test("Lane 2E integration: stale logistics-swfl upstream triggers caveat + capped confidence in nowcast", async () => {
  // Build a synthetic stale logistics-swfl brain that this pack consumes,
  // then drive outputStage end-to-end with dryRun=true so no .md is written
  // but the BrainOutput is still inspectable.
  const refined = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const ttlSeconds = 86_400; // 1d TTL → 29 days stale
  const expectedExpiry = new Date(Date.parse(refined) + ttlSeconds * 1000)
    .toISOString()
    .slice(0, 10);

  // Use a unique brain id (with random suffix) to avoid colliding with the
  // real logistics-swfl brain that may exist on disk. We need to inject a
  // pack that consumes THIS unique upstream id rather than re-using the
  // production pack. The cleanest way to drive Lane 2E is to bypass the
  // pack and call outputStage directly with a minimal one-input pack.

  const suffix = randomUUID().slice(0, 8);
  const staleId = `lane2e-logistics-stale-${suffix}`;
  const brainsDir = path.join(process.cwd(), "brains");
  await mkdir(brainsDir, { recursive: true });
  const staleFile = path.join(brainsDir, `${staleId}.md`);

  const staleOutput: BrainOutput = {
    brain_id: staleId,
    version: 1,
    refined_at: refined,
    direction: "neutral",
    magnitude: 0.5,
    drivers: [],
    overrides: [],
    conclusion: "Stale logistics baseline for Lane 2E integration test.",
    key_metrics: [],
    caveats: [],
    contradicts: [],
    confidence: 0.3,
    joint_integrity: 1,
    confidence_dispersion: 0,
    chain_depth: 0,
    trust_tier: 2,
    upstream_count: 0,
    relevance: {
      decay_curve: "weeks",
      half_life_hours: 720,
      computed_at: refined,
    },
    exogenous_signals: [],
  };

  await writeFile(
    staleFile,
    [
      `---`,
      `brain_id: ${staleId}`,
      `version: 1`,
      `refined_at: ${refined}`,
      `ttl_seconds: ${ttlSeconds}`,
      `---`,
      ``,
      "```reference",
      `--- OUTPUT ---`,
      JSON.stringify(staleOutput, null, 2),
      "```",
      ``,
    ].join("\n"),
    "utf-8",
  );

  try {
    const { outputStage } = await import("../stages/4-output.mts");
    const { makeBrainInputSource } =
      await import("../sources/brain-input-source.mts");

    const edges: BrainEdge[] = [{ id: staleId, edge_type: "input" }];
    const minimalSource = {
      source_id: "lane2e-fixture-direct",
      trust_tier: 2 as const,
      fetch: async () => [],
      citationMeta: (verified: string, ttl: number) => ({
        source: "Lane 2E fixture direct",
        verified,
        expires: new Date(Date.parse(verified) + ttl * 1000)
          .toISOString()
          .slice(0, 10),
      }),
    };

    const downstreamId = `lane2e-nowcast-downstream-${suffix}`;
    const downstreamPack: PackDefinition = {
      id: downstreamId,
      brain_id: downstreamId,
      domain: "logistics",
      scope: "Lane 2E integration test pack for nowcast staleness cascade",
      ttl_seconds: 86_400,
      sources: [minimalSource, makeBrainInputSource(staleId)],
      input_brains: edges,
      fitScore: () => 1,
      preferences: ["Lane 2E test preference."],
      activeProject: "lane-2e-nowcast-test",
      prompts: { triageContext: "", synthesisContext: "" },
      skipTriageAgent: true,
      skipSynthesisAgent: true,
      outputProducer: () => ({
        conclusion: "Lane 2E nowcast-style integration fixture.",
        key_metrics: [],
        caveats: [],
        direction: "neutral",
        magnitude: 0.5,
        drivers: [staleId],
        overrides: [],
        contradicts: [],
        exogenous_signals: [],
      }),
    };

    const result = await outputStage([], downstreamPack, { dryRun: true });
    const expectedCaveat = `Upstream brain '${staleId}' was stale at build time (expired ${expectedExpiry}).`;
    assert.ok(
      result.brainOutput.caveats.includes(expectedCaveat),
      `expected verbatim staleness caveat in BrainOutput.caveats, got:\n${result.brainOutput.caveats.join("\n")}`,
    );
    assert.ok(
      result.brainOutput.confidence <= 0.3,
      `expected confidence <= 0.3 (stale upstream cap), got ${result.brainOutput.confidence}`,
    );
  } finally {
    await rm(staleFile, { force: true });
  }
});
