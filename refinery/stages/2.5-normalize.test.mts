import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStage,
  resolveSlug,
  loadVocabulary,
  resetVocabularyCache,
  type Vocabulary,
  type NormalizedTag,
} from "./2.5-normalize.mts";
import type { TriagedFragment } from "../types/fragment.mts";
import type { PackDefinition } from "../types/pack.mts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeFragment<N>(
  fragment_id: string,
  topic: string,
  normalized: N,
): TriagedFragment<N> {
  return {
    fragment_id,
    source_id: "test_source",
    source_trust_tier: 2,
    fetched_at: "2026-05-16T00:00:00.000Z",
    raw: {},
    normalized,
    classification: {
      topic,
      subtopic_key: fragment_id,
      decision_relevance_reason: "test",
    },
    scoring: {
      pack_fit: 1,
      content_score: 1,
      type_multiplier: 1,
      composite: 2,
    },
  };
}

function makePack(id: string): PackDefinition {
  return {
    id,
    brain_id: id,
    domain: "real-estate",
    scope: "test",
    ttl_seconds: 86_400,
    sources: [],
    input_brains: [],
    fitScore: () => 1,
    preferences: [],
    activeProject: "test",
    prompts: { triageContext: "", synthesisContext: "" },
  };
}

// ---------------------------------------------------------------------------
// loadVocabulary — sanity check the real JSON parses with the expected shape
// ---------------------------------------------------------------------------

test("loadVocabulary: real brain-vocabulary.json parses with expected shape", async () => {
  resetVocabularyCache();
  const vocab = await loadVocabulary();
  assert.equal(vocab.meta.schema_version, "1.0.0");
  assert.ok(
    vocab.concepts["cre_cap_rate_median"],
    "cre_cap_rate_median present",
  );
  assert.ok(
    vocab.concepts["sba_chargeoff_rate_sector_44"],
    "NAICS 44 concept present",
  );
  assert.ok(
    vocab.concepts["sba_chargeoff_rate_sector_45"],
    "NAICS 45 concept present",
  );
  assert.notEqual(
    vocab.concepts["sba_chargeoff_rate_sector_44"].id,
    vocab.concepts["sba_chargeoff_rate_sector_45"].id,
    "44 and 45 are distinct concepts",
  );
  assert.equal(
    vocab.slug_index["cap_rate_median"],
    "cre_cap_rate_median",
    "slug_index maps cap_rate_median to canonical id",
  );
});

// ---------------------------------------------------------------------------
// resolveSlug — unambiguous + ambiguous resolution
// ---------------------------------------------------------------------------

test("resolveSlug: unambiguous slug resolves via slug_index", async () => {
  const vocab = await loadVocabulary();
  const r = resolveSlug("cap_rate_median", "classification.topic", vocab);
  assert.ok(r, "resolution returned");
  assert.equal(r!.concept.id, "cre_cap_rate_median");
  assert.equal(r!.disambiguation, null);
});

test("resolveSlug: NAICS 44 and 45 do not collide", async () => {
  const vocab = await loadVocabulary();
  const r44 = resolveSlug("sector_44_chargeoff_rate", "n.metric", vocab);
  const r45 = resolveSlug("sector_45_chargeoff_rate", "n.metric", vocab);
  assert.equal(r44?.concept.id, "sba_chargeoff_rate_sector_44");
  assert.equal(r45?.concept.id, "sba_chargeoff_rate_sector_45");
  assert.equal(r44?.concept.naics_code, 44);
  assert.equal(r45?.concept.naics_code, 45);
});

test("resolveSlug: direction at BrainOutput.direction → sentiment", async () => {
  const vocab = await loadVocabulary();
  const r = resolveSlug("direction", "BrainOutput.direction", vocab);
  assert.equal(r?.concept.id, "qual_sentiment_direction");
  assert.equal(r?.disambiguation, "sentiment");
});

test("resolveSlug: direction at BrainOutputMetric.direction → trajectory", async () => {
  const vocab = await loadVocabulary();
  const r = resolveSlug("direction", "BrainOutputMetric.direction", vocab);
  assert.equal(r?.concept.id, "qual_metric_trajectory");
  assert.equal(r?.disambiguation, "trajectory");
});

test("resolveSlug: direction nested in key_metrics[] → trajectory (heuristic)", async () => {
  const vocab = await loadVocabulary();
  const r = resolveSlug(
    "direction",
    "normalized.key_metrics[0].direction",
    vocab,
  );
  assert.equal(r?.concept.id, "qual_metric_trajectory");
  assert.equal(r?.disambiguation, "trajectory");
});

test("resolveSlug: unknown slug returns null", async () => {
  const vocab = await loadVocabulary();
  const r = resolveSlug("not_a_real_slug", "normalized.foo", vocab);
  assert.equal(r, null);
});

test("resolveSlug: _direction_ambiguous marker is not a concept", async () => {
  const vocab = await loadVocabulary();
  // Sanity — the marker exists in slug_index but is not a string entry
  assert.equal(typeof vocab.slug_index["_direction_ambiguous"], "object");
});

// ---------------------------------------------------------------------------
// normalizeStage — end-to-end fragment normalization
// ---------------------------------------------------------------------------

test("normalizeStage: classification.topic metric:cap_rate_median → tagged", async () => {
  const pack = makePack("cre-swfl");
  const frag = makeFragment("frag1", "metric:cap_rate_median", { value: 6.4 });
  const result = await normalizeStage([frag], pack);
  assert.equal(result.orphans.length, 0, "no orphans");
  assert.equal(result.normalized.length, 1);
  const tags = result.normalized[0].concept_tags;
  assert.equal(tags.length, 1);
  assert.equal(tags[0].concept_id, "cre_cap_rate_median");
  assert.equal(tags[0].raw_slug, "cap_rate_median");
  assert.equal(tags[0].path, "classification.topic");
  assert.equal(tags[0].category, "real-estate");
});

test("normalizeStage: BrainOutputMetric-shaped normalized → metric slug + direction trajectory", async () => {
  const pack = makePack("cre-swfl");
  const frag = makeFragment("frag2", "anything", {
    key_metrics: [
      {
        metric: "cap_rate",
        value: 7.1,
        direction: "falling",
        label: "Cap rate",
      },
    ],
  });
  const result = await normalizeStage([frag], pack);
  assert.equal(result.orphans.length, 0);
  const tags = result.normalized[0].concept_tags;
  const metricTag = tags.find((t: NormalizedTag) => t.raw_slug === "cap_rate");
  const directionTag = tags.find(
    (t: NormalizedTag) => t.raw_slug === "direction",
  );
  assert.ok(metricTag, "cap_rate tagged");
  assert.equal(metricTag!.concept_id, "cre_cap_rate");
  assert.ok(directionTag, "direction tagged");
  assert.equal(directionTag!.concept_id, "qual_metric_trajectory");
  assert.equal(directionTag!.disambiguation, "trajectory");
});

test("normalizeStage: normalized payload with raw slug as key → tagged", async () => {
  const pack = makePack("macro-swfl");
  const frag = makeFragment("frag3", "macro/snapshot", {
    sofr_rate: 5.31,
    fl_unemployment: 3.1,
  });
  const result = await normalizeStage([frag], pack);
  assert.equal(result.orphans.length, 0);
  const conceptIds = result.normalized[0].concept_tags
    .map((t) => t.concept_id)
    .sort();
  assert.deepEqual(conceptIds, ["macro_fl_unemployment", "macro_sofr_rate"]);
});

test("normalizeStage: orphan slug throws in strict mode (default)", async () => {
  const pack = makePack("bad-pack");
  const frag = makeFragment("frag4", "metric:totally_fake_slug", {});
  await assert.rejects(
    () => normalizeStage([frag], pack),
    /Orphan Concept error/,
    "strict mode throws",
  );
});

test("normalizeStage: orphan slug returned (not thrown) when strict=false", async () => {
  const pack = makePack("bad-pack");
  const frag = makeFragment("frag5", "metric:totally_fake_slug", {});
  const result = await normalizeStage([frag], pack, { strict: false });
  assert.equal(result.orphans.length, 1);
  assert.equal(result.orphans[0].raw_slug, "totally_fake_slug");
  assert.equal(result.orphans[0].fragment_id, "frag5");
  assert.match(result.orphans[0].context, /no concept in.*registers it/);
  // fragment still passes through, just with no concept_tags from the orphan claim
  assert.equal(result.normalized.length, 1);
  assert.equal(result.normalized[0].concept_tags.length, 0);
});

test("normalizeStage: NAICS 44/45 distinct slugs survive collision", async () => {
  const pack = makePack("sector-credit-swfl");
  const f44 = makeFragment("f44", "metric:sector_44_chargeoff_rate", {
    metric: "sector_44_chargeoff_rate",
    value: 18.8,
  });
  const f45 = makeFragment("f45", "metric:sector_45_chargeoff_rate", {
    metric: "sector_45_chargeoff_rate",
    value: 44.4,
  });
  const result = await normalizeStage([f44, f45], pack);
  assert.equal(result.orphans.length, 0);
  const c44 = result.normalized[0].concept_tags[0];
  const c45 = result.normalized[1].concept_tags[0];
  assert.equal(c44.concept_id, "sba_chargeoff_rate_sector_44");
  assert.equal(c45.concept_id, "sba_chargeoff_rate_sector_45");
  assert.notEqual(c44.concept_id, c45.concept_id, "no collision");
});

test("normalizeStage: de-duplicates identical (path, slug) claims", async () => {
  const pack = makePack("cre-swfl");
  // Topic + a `metric` key naming the same slug at the same effective path
  // would otherwise double-count. Test the (path, slug) tuple de-dupe.
  const frag = makeFragment("frag-dedupe", "metric:cap_rate_median", {
    cap_rate_median: 6.4, // tagged at normalized.cap_rate_median
  });
  const result = await normalizeStage([frag], pack);
  assert.equal(result.orphans.length, 0);
  // Two distinct claim paths → two tags (classification.topic + normalized.cap_rate_median)
  assert.equal(result.normalized[0].concept_tags.length, 2);
  const paths = result.normalized[0].concept_tags.map((t) => t.path).sort();
  assert.deepEqual(paths, [
    "classification.topic",
    "normalized.cap_rate_median",
  ]);
});

test("normalizeStage: mixed valid + orphan in non-strict reports both correctly", async () => {
  const pack = makePack("mixed");
  const good = makeFragment("good", "metric:sofr_rate", { sofr_rate: 5.31 });
  const bad = makeFragment("bad", "metric:invented_metric", {});
  const result = await normalizeStage([good, bad], pack, { strict: false });
  assert.equal(result.orphans.length, 1);
  assert.equal(result.orphans[0].fragment_id, "bad");
  assert.equal(result.normalized.length, 2);
  // The good fragment has its tags
  assert.ok(
    result.normalized[0].concept_tags.find(
      (t) => t.concept_id === "macro_sofr_rate",
    ),
  );
});

test("normalizeStage: vocab can be injected (no fs read)", async () => {
  const pack = makePack("inject");
  const injected: Vocabulary = {
    meta: {
      schema_version: "test-0",
      created_at: "2026-05-16",
      description: "test",
    },
    concepts: {
      test_metric: {
        id: "test_metric",
        prefLabel: "Test Metric",
        raw_slugs: ["test_metric"],
        category: "test",
        status: "active",
      },
    },
    ordered_collections: {},
    slug_index: { test_metric: "test_metric" },
  };
  const frag = makeFragment("f", "metric:test_metric", { test_metric: 1 });
  const result = await normalizeStage([frag], pack, { vocab: injected });
  assert.equal(result.orphans.length, 0);
  assert.equal(result.normalized[0].concept_tags.length, 2);
  assert.equal(result.normalized[0].concept_tags[0].concept_id, "test_metric");
});
