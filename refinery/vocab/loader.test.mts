import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  loadVocabularySync,
  resetVocabularyCacheSync,
  resolveConceptSlugs,
} from "./loader.mts";

test("loadVocabularySync: returns parsed brain-vocabulary.json with the known schema_version", () => {
  resetVocabularyCacheSync();
  const vocab = loadVocabularySync();
  assert.equal(typeof vocab.meta.schema_version, "string");
  assert.ok(vocab.concepts["env_lee_ve_zone_coverage_pct"]);
  assert.ok(vocab.slug_index["lee_county_ve_zone_pct_area_weighted"]);
});

test("loadVocabularySync: caches across calls (same object reference)", () => {
  resetVocabularyCacheSync();
  const a = loadVocabularySync();
  const b = loadVocabularySync();
  assert.equal(a, b);
});

test("resolveConceptSlugs: inverts slug_index for the flood-veto pair", () => {
  const slugs = resolveConceptSlugs([
    "env_lee_ve_zone_coverage_pct",
    "env_collier_ve_zone_coverage_pct",
  ]);
  assert.equal(slugs.size, 2);
  assert.ok(slugs.has("lee_county_ve_zone_pct_area_weighted"));
  assert.ok(slugs.has("collier_county_ve_zone_pct_area_weighted"));
});

test("resolveConceptSlugs: a single concept ID resolves to all its raw_slugs", () => {
  // sba_overall_survival_rate registers one raw_slug today; resolver still has
  // to iterate raw_slugs[] without assuming length 1, so the union is correct
  // as more aliases are added.
  const slugs = resolveConceptSlugs(["sba_overall_survival_rate"]);
  assert.ok(slugs.has("overall_survival_rate"));
});

test("resolveConceptSlugs: throws with a fixable message on an unknown concept id", () => {
  assert.throws(
    () =>
      resolveConceptSlugs([
        "env_lee_ve_zone_coverage_pct",
        "totally_made_up_concept",
      ]),
    /totally_made_up_concept/,
  );
});

test("resolveConceptSlugs: empty input returns an empty set, does not throw", () => {
  const slugs = resolveConceptSlugs([]);
  assert.equal(slugs.size, 0);
});
