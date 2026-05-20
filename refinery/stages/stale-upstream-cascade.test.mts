import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrainOutput } from "../types/brain-output.mts";
import type { BrainEdge } from "../types/pack.mts";

/**
 * Lane 2E — stale-upstream auto-caveat (DAG integrity).
 *
 * Spec: CLAUDE.md non-negotiable #5 — "When the DAG resolver builds against a
 * stale upstream, it auto-appends 'Upstream brain X was stale at build time
 * (expired YYYY-MM-DD).' to BrainOutput.caveats and propagates
 * min(self, upstream) confidence."
 *
 * Tests drive `harvestUpstreams()` + `applyStalenessCap()` — the two pieces
 * Stage 4 splits out of its previously-inline upstream-harvest loop. Each test
 * isolates by switching `process.cwd()` to a temp dir populated with synthetic
 * `brains/<id>.md` fixtures whose `refined_at` + `ttl_seconds` are crafted to
 * land on a known freshness state. After the test, cwd is restored.
 */

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Render a minimal-but-valid brain `.md` shape that `readBrainOutput()` +
 * `brainStatus()` will parse. Frontmatter carries `brain_id`, `refined_at`,
 * `ttl_seconds`; the `--- OUTPUT ---` JSON block carries `confidence` +
 * `trust_tier`. Everything else is filler the readers ignore.
 */
function renderFixtureBrain(opts: {
  id: string;
  refined_at: string;
  ttl_seconds: number;
  confidence: number;
  trust_tier: 1 | 2 | 3 | 4;
}): string {
  const out: BrainOutput = {
    brain_id: opts.id,
    version: 1,
    refined_at: opts.refined_at,
    direction: "neutral",
    magnitude: 0.5,
    drivers: [],
    overrides: [],
    conclusion: `Fixture brain ${opts.id}.`,
    key_metrics: [],
    caveats: [],
    contradicts: [],
    confidence: opts.confidence,
    joint_integrity: 1,
    confidence_dispersion: 0,
    chain_depth: 0,
    trust_tier: opts.trust_tier,
    upstream_count: 0,
    relevance: {
      decay_curve: "weeks",
      half_life_hours: 720,
      computed_at: opts.refined_at,
    },
    exogenous_signals: [],
  };
  return [
    `---`,
    `brain_id: ${opts.id}`,
    `version: 1`,
    `refined_at: ${opts.refined_at}`,
    `ttl_seconds: ${opts.ttl_seconds}`,
    `---`,
    ``,
    `# Fixture`,
    ``,
    "```reference",
    `--- OUTPUT ---`,
    JSON.stringify(out, null, 2),
    "```",
    ``,
  ].join("\n");
}

/**
 * Run a test against a set of synthetic brain fixtures. Each fixture id is
 * suffix-randomized so it cannot collide with any real brain file in `brains/`,
 * and we clean up afterwards. Files are written to the real `brains/` dir
 * because every other refinery module (vocab loader, packs config, validators)
 * resolves paths relative to `process.cwd()` — switching cwd would orphan
 * those, so the cheaper isolation is collision-proof ids + post-test rm.
 *
 * The callback receives an `id(label)` helper that returns the unique brain-id
 * for a given fixture label, so tests can reference fixtures by stable label
 * without typing the random suffix.
 */
async function withFixtureBrains(
  fixtures: Array<{
    label: string;
    refined_at: string;
    ttl_seconds: number;
    confidence: number;
    trust_tier: 1 | 2 | 3 | 4;
  }>,
  body: (id: (label: string) => string) => Promise<void>,
): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const labelToId = new Map<string, string>(
    fixtures.map((f) => [f.label, `lane2e-${f.label}-${suffix}`]),
  );
  const brainsDir = path.join(process.cwd(), "brains");
  await mkdir(brainsDir, { recursive: true });
  const writtenPaths: string[] = [];
  for (const f of fixtures) {
    const id = labelToId.get(f.label)!;
    const p = path.join(brainsDir, `${id}.md`);
    await writeFile(
      p,
      renderFixtureBrain({
        id,
        refined_at: f.refined_at,
        ttl_seconds: f.ttl_seconds,
        confidence: f.confidence,
        trust_tier: f.trust_tier,
      }),
      "utf-8",
    );
    writtenPaths.push(p);
  }
  try {
    await body((label) => {
      const id = labelToId.get(label);
      if (!id) throw new Error(`unknown fixture label: ${label}`);
      return id;
    });
  } finally {
    for (const p of writtenPaths) {
      await rm(p, { force: true });
    }
  }
}

function edges(...ids: string[]): BrainEdge[] {
  return ids.map((id) => ({ id, edge_type: "input" as const }));
}

/** A timestamp `daysAgo` days before now, ISO 8601. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// Lazy-import to make absolutely sure the test file is loadable even before
// the new exports exist — that way the failure mode is "expected ... but
// caveats array did not contain it" rather than a module-load throw at the
// top of every other test in the suite.
async function loadHarvest() {
  const mod = await import("./4-output.mts");
  return {
    harvestUpstreams: mod.harvestUpstreams,
    applyStalenessCap: mod.applyStalenessCap,
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Caveat appended when upstream stale
// ---------------------------------------------------------------------------

test("staleness cascade: appends caveat when single upstream is stale", async () => {
  // refined 60 days ago, TTL 1 day → very stale. expires_at = refined_at + 1d.
  const refined = daysAgo(60);
  const ttlSeconds = 86_400;
  const expectedExpiry = new Date(Date.parse(refined) + ttlSeconds * 1000)
    .toISOString()
    .slice(0, 10);

  await withFixtureBrains(
    [
      {
        label: "stale-up",
        refined_at: refined,
        ttl_seconds: ttlSeconds,
        confidence: 0.4,
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { harvestUpstreams } = await loadHarvest();
      const harvest = await harvestUpstreams(edges(id("stale-up")));
      assert.equal(
        harvest.stalenessCaveats.length,
        1,
        "exactly one staleness caveat expected",
      );
      assert.equal(
        harvest.stalenessCaveats[0],
        `Upstream brain '${id("stale-up")}' was stale at build time (expired ${expectedExpiry}).`,
      );
      // Sanity: the upstream still landed in the harvest (we cap confidence,
      // we don't drop the contribution).
      assert.equal(harvest.upstreams.length, 1);
      assert.equal(harvest.upstreams[0].brain_id, id("stale-up"));
    },
  );
});

// ---------------------------------------------------------------------------
// Test 2 — min(self, stale-upstream) confidence cap, no boost when fresh
// ---------------------------------------------------------------------------

test("staleness cascade: caps confidence at min stale-upstream confidence", async () => {
  await withFixtureBrains(
    [
      {
        label: "stale-up",
        refined_at: daysAgo(30),
        ttl_seconds: 86_400,
        confidence: 0.4,
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { harvestUpstreams, applyStalenessCap } = await loadHarvest();
      const harvest = await harvestUpstreams(edges(id("stale-up")));
      // Lane 1A's weighted-mean would have produced (say) 0.85; the cap
      // forces it down to the stale upstream's 0.4.
      const capped = applyStalenessCap(
        0.85,
        harvest.minStaleUpstreamConfidence,
        harvest.stalenessCaveats,
      );
      assert.equal(capped, 0.4);
    },
  );
});

test("staleness cascade: does NOT cap when upstream is fresh", async () => {
  await withFixtureBrains(
    [
      {
        label: "fresh-up",
        refined_at: new Date().toISOString(),
        ttl_seconds: 86_400,
        confidence: 0.4,
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { harvestUpstreams, applyStalenessCap } = await loadHarvest();
      const harvest = await harvestUpstreams(edges(id("fresh-up")));
      assert.equal(harvest.stalenessCaveats.length, 0);
      assert.equal(harvest.minStaleUpstreamConfidence, Infinity);
      const capped = applyStalenessCap(
        0.85,
        harvest.minStaleUpstreamConfidence,
        harvest.stalenessCaveats,
      );
      // Lane 1A's headline survives untouched — the fresh 0.4 does NOT cap.
      assert.equal(capped, 0.85);
    },
  );
});

// ---------------------------------------------------------------------------
// Test 3 — Expiration date renders correctly in caveat string
// ---------------------------------------------------------------------------

test("staleness cascade: caveat expires_at matches brainStatus output", async () => {
  const refined = daysAgo(10);
  const ttlSeconds = 86_400;
  const expectedExpiry = new Date(Date.parse(refined) + ttlSeconds * 1000)
    .toISOString()
    .slice(0, 10);

  await withFixtureBrains(
    [
      {
        label: "expiry-test",
        refined_at: refined,
        ttl_seconds: ttlSeconds,
        confidence: 0.5,
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { harvestUpstreams } = await loadHarvest();
      const { brainStatus } = await import("../lib/dag.mts");
      const status = await brainStatus(id("expiry-test"));
      assert.equal(
        status.kind,
        "stale",
        "fixture must be stale by construction",
      );
      if (status.kind !== "stale") return; // type-narrow

      const harvest = await harvestUpstreams(edges(id("expiry-test")));
      assert.equal(harvest.stalenessCaveats.length, 1);
      assert.match(
        harvest.stalenessCaveats[0],
        /\(expired \d{4}-\d{2}-\d{2}\)\.$/,
      );
      assert.ok(
        harvest.stalenessCaveats[0].includes(`(expired ${status.expires_at})`),
        `caveat "${harvest.stalenessCaveats[0]}" must quote brainStatus.expires_at "${status.expires_at}"`,
      );
      // And the date string itself must match the value we constructed above.
      assert.equal(status.expires_at, expectedExpiry);
    },
  );
});

// ---------------------------------------------------------------------------
// Test 4 — Multiple stale upstreams produce multiple caveats; cap is the min
// ---------------------------------------------------------------------------

test("staleness cascade: multiple stale upstreams produce one caveat each", async () => {
  await withFixtureBrains(
    [
      {
        label: "stale-a",
        refined_at: daysAgo(5),
        ttl_seconds: 86_400,
        confidence: 0.7,
        trust_tier: 2,
      },
      {
        label: "stale-b",
        refined_at: daysAgo(10),
        ttl_seconds: 86_400,
        confidence: 0.5,
        trust_tier: 2,
      },
      {
        label: "stale-c",
        refined_at: daysAgo(15),
        ttl_seconds: 86_400,
        confidence: 0.3,
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { harvestUpstreams, applyStalenessCap } = await loadHarvest();
      const harvest = await harvestUpstreams(
        edges(id("stale-a"), id("stale-b"), id("stale-c")),
      );
      assert.equal(harvest.stalenessCaveats.length, 3);
      // Deterministic order matches pack.input_brains order — NOT alphabetical
      // by accident, NOT sorted by confidence. This is critical for stable
      // diffs across rebuilds.
      assert.ok(harvest.stalenessCaveats[0].includes(`'${id("stale-a")}'`));
      assert.ok(harvest.stalenessCaveats[1].includes(`'${id("stale-b")}'`));
      assert.ok(harvest.stalenessCaveats[2].includes(`'${id("stale-c")}'`));

      // Cap = min(0.7, 0.5, 0.3) = 0.3. A high self-confidence is dragged to
      // the stale floor regardless of upstream count.
      const capped = applyStalenessCap(
        0.9,
        harvest.minStaleUpstreamConfidence,
        harvest.stalenessCaveats,
      );
      assert.equal(capped, 0.3);
    },
  );
});

// ---------------------------------------------------------------------------
// Test 5 — Edge case: mixed fresh + stale — cap uses ONLY the stale set
// ---------------------------------------------------------------------------

test("staleness cascade: cap is min(stale upstreams only), NOT min(all)", async () => {
  await withFixtureBrains(
    [
      {
        // Fresh, confidence 0.20 — must NOT enter the cap floor.
        label: "fresh-low",
        refined_at: new Date().toISOString(),
        ttl_seconds: 86_400,
        confidence: 0.2,
        trust_tier: 2,
      },
      {
        // Stale, confidence 0.60 — the only candidate for the cap.
        label: "stale-mid",
        refined_at: daysAgo(30),
        ttl_seconds: 86_400,
        confidence: 0.6,
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { harvestUpstreams, applyStalenessCap } = await loadHarvest();
      const harvest = await harvestUpstreams(
        edges(id("fresh-low"), id("stale-mid")),
      );
      assert.equal(harvest.stalenessCaveats.length, 1);
      assert.ok(harvest.stalenessCaveats[0].includes(`'${id("stale-mid")}'`));
      // Cap is 0.6 (the stale upstream), NOT 0.2 (the global fresh min).
      assert.equal(harvest.minStaleUpstreamConfidence, 0.6);
      const capped = applyStalenessCap(
        0.85,
        harvest.minStaleUpstreamConfidence,
        harvest.stalenessCaveats,
      );
      assert.equal(capped, 0.6);
    },
  );
});

// ---------------------------------------------------------------------------
// Edge — stale upstream where self.confidence < upstream.confidence stays low
// ---------------------------------------------------------------------------

test("staleness cascade: cap never boosts — self stays low if already below upstream", async () => {
  await withFixtureBrains(
    [
      {
        label: "stale-high",
        refined_at: daysAgo(20),
        ttl_seconds: 86_400,
        confidence: 0.5,
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { harvestUpstreams, applyStalenessCap } = await loadHarvest();
      const harvest = await harvestUpstreams(edges(id("stale-high")));
      // Self is already 0.4, stale upstream is 0.5 — min(0.4, 0.5) = 0.4.
      // The cap is unidirectional: it only DROPS self, never lifts it.
      const capped = applyStalenessCap(
        0.4,
        harvest.minStaleUpstreamConfidence,
        harvest.stalenessCaveats,
      );
      assert.equal(capped, 0.4);
    },
  );
});

// ---------------------------------------------------------------------------
// Edge — zero input_brains (leaf brain) is a no-op
// ---------------------------------------------------------------------------

test("staleness cascade: leaf brain (zero input_brains) → no caveats, no cap", async () => {
  const { harvestUpstreams, applyStalenessCap } = await loadHarvest();
  const harvest = await harvestUpstreams([]);
  assert.deepEqual(harvest.upstreams, []);
  assert.deepEqual(harvest.stalenessCaveats, []);
  assert.equal(harvest.minStaleUpstreamConfidence, Infinity);
  const capped = applyStalenessCap(
    0.75,
    harvest.minStaleUpstreamConfidence,
    harvest.stalenessCaveats,
  );
  assert.equal(capped, 0.75, "leaf brain confidence flows through unchanged");
});

// ---------------------------------------------------------------------------
// Edge — missing upstream still throws (preserves existing error path)
// ---------------------------------------------------------------------------

test("staleness cascade: missing upstream still throws (no silent emit)", async () => {
  const { harvestUpstreams } = await loadHarvest();
  const ghostId = `lane2e-ghost-${randomUUID().slice(0, 8)}`;
  await assert.rejects(
    () => harvestUpstreams(edges(ghostId)),
    new RegExp(`Stage 4: cannot harvest upstream confidence for "${ghostId}"`),
  );
});

// ---------------------------------------------------------------------------
// Integration test — full outputStage with a stale upstream produces caveat
// + capped confidence in the rendered BrainOutput.
// ---------------------------------------------------------------------------

test("staleness cascade: outputStage end-to-end emits caveat + capped confidence", async () => {
  // Stale upstream fixture
  const refined = daysAgo(30);
  const ttlSeconds = 86_400;
  const expectedExpiry = new Date(Date.parse(refined) + ttlSeconds * 1000)
    .toISOString()
    .slice(0, 10);

  await withFixtureBrains(
    [
      {
        label: "stale-up",
        refined_at: refined,
        ttl_seconds: ttlSeconds,
        confidence: 0.3, // <-- the cap floor
        trust_tier: 2,
      },
    ],
    async (id) => {
      const { outputStage } = await import("./4-output.mts");
      // Build a minimal downstream pack with one input_brain (the stale fixture)
      // and one direct source. dryRun=true means we don't write to disk; we
      // only inspect the BrainOutput result, so the file-validators still fire
      // but no .md is written.
      const stalePackId = id("stale-up");
      const downstreamId = `lane2e-downstream-${randomUUID().slice(0, 8)}`;
      const downstreamPack = makeMinimalPack({
        id: downstreamId,
        input_brains: edges(stalePackId),
      });
      const result = await outputStage([], downstreamPack, { dryRun: true });
      // Caveat present, verbatim format from non-negotiable #5.
      const expectedCaveat = `Upstream brain '${stalePackId}' was stale at build time (expired ${expectedExpiry}).`;
      assert.ok(
        result.brainOutput.caveats.includes(expectedCaveat),
        `expected staleness caveat in rendered BrainOutput.caveats, got: ${JSON.stringify(result.brainOutput.caveats)}`,
      );
      // Confidence capped at the stale floor (0.3). It MUST be at most 0.3 —
      // exact equality requires knowing Lane 1A's weighted-mean output, but
      // the cap guarantees the inequality regardless.
      assert.ok(
        result.brainOutput.confidence <= 0.3,
        `expected confidence <= 0.3 (stale-upstream cap), got ${result.brainOutput.confidence}`,
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Minimal pack factory for the integration test
// ---------------------------------------------------------------------------

function makeMinimalPack(opts: {
  id: string;
  input_brains: BrainEdge[];
}): import("../types/pack.mts").PackDefinition {
  // A tier-2 source named "fixture-src". Tier-2 average + brain-input source
  // is what the trust-tier-weighted-mean reads. citationMeta returns the
  // shape the citation table renderer expects.
  const source: import("../types/pack.mts").SourceConnector = {
    source_id: "fixture-src",
    trust_tier: 2,
    fetch: async () => [],
    citationMeta: (verified, ttl) => ({
      source: "Lane 2E fixture source",
      verified,
      expires: new Date(Date.parse(verified) + ttl * 1000)
        .toISOString()
        .slice(0, 10),
    }),
  };
  return {
    id: opts.id,
    brain_id: opts.id,
    domain: "real-estate",
    scope: "Lane 2E integration test fixture",
    ttl_seconds: 86_400,
    sources: [source],
    input_brains: opts.input_brains,
    fitScore: () => 1,
    preferences: ["Test preference."],
    activeProject: "lane-2e-test",
    prompts: { triageContext: "", synthesisContext: "" },
    skipTriageAgent: true,
    skipSynthesisAgent: true,
    outputProducer: () => ({
      conclusion: "Lane 2E integration fixture conclusion.",
      key_metrics: [],
      caveats: [],
      direction: "neutral",
      magnitude: 0.5,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    }),
  };
}
