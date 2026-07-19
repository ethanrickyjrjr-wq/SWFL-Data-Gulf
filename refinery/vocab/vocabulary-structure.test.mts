import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Vocabulary } from "../stages/2.5-normalize.mts";

// Structural guard on the REAL vocabulary file — kills the recurring
// "concept appended into ordered_collections" class. Four occurrences so far
// (freshness_mortgage_30yr_fixed_pct; cre_active_listings_* 2026-06-29 master
// abort; freshness_median_sale_price_*; freshness_median_asking_price_*
// 2026-07-12 pre-push block): the concepts object closes right where
// ordered_collections opens, so a session appending "at the end of concepts"
// lands one section too low. The resolver reads vocab.concepts only, so the
// misfiled concept is invisible — the slug orphans the moment a brain emits it
// in key_metrics, aborting master's rebuild.

const VOCAB_PATH = path.join(import.meta.dir, "brain-vocabulary.json");

async function loadRealVocab(): Promise<Vocabulary> {
  const raw = await readFile(VOCAB_PATH, "utf-8");
  return JSON.parse(raw) as Vocabulary;
}

test("ordered_collections holds only true collections — a concept-shaped entry means it was appended in the wrong section", async () => {
  const vocab = await loadRealVocab();
  const misfiled = Object.entries(vocab.ordered_collections).filter(
    ([, entry]) =>
      typeof entry === "object" &&
      entry !== null &&
      ("raw_slugs" in entry || "raw_slug_patterns" in entry),
  );
  assert.deepEqual(
    misfiled.map(([k]) => k),
    [],
    "concept definition(s) found inside ordered_collections — move them into concepts (the resolver never reads ordered_collections, so their slugs orphan master's rebuild)",
  );
});

// slug_index is DERIVED at load since 2026-07-19 (refinery/vocab/derive-slug-index.mts).
// The on-disk block is retired: ≥10 "fix(vocab): register X — unblocks master" commits
// in one month were hand-mirror staleness. These three tests lock the new contract.

test("brain-vocabulary.json carries NO slug_index block — it is derived from raw_slugs at load, a hand-added block is dead weight that WILL drift", async () => {
  const vocab = await loadRealVocab();
  assert.ok(
    !("slug_index" in vocab),
    "slug_index block found in brain-vocabulary.json — delete it; register slugs via concepts[].raw_slugs only (the loaders derive the index)",
  );
});

test("deriveSlugIndex over the real concepts throws no collision — every raw_slug has exactly one owner (or is registered path-ambiguous)", async () => {
  const { deriveSlugIndex, PATH_AMBIGUOUS_SLUGS } = await import("./derive-slug-index.mts");
  const vocab = await loadRealVocab();
  deriveSlugIndex(vocab.concepts, PATH_AMBIGUOUS_SLUGS); // throws on collision
});

test("closing invariant: every concept's every raw_slug resolves through the REAL resolver back to its owner — this is the exact property the hand-maintained index violated 10+ times", async () => {
  const { loadVocabulary, resolveSlug, resetVocabularyCache } =
    await import("../stages/2.5-normalize.mts");
  resetVocabularyCache();
  const vocab = await loadVocabulary(); // derived slug_index
  const failures: string[] = [];
  for (const [conceptId, concept] of Object.entries(vocab.concepts)) {
    for (const slug of concept.raw_slugs ?? []) {
      const r = resolveSlug(slug, "normalized.metric", vocab);
      if (!r) {
        failures.push(`${slug} (owner ${conceptId}) -> UNRESOLVED`);
      } else if (r.concept.id !== conceptId && r.disambiguation === null) {
        failures.push(`${slug} (owner ${conceptId}) -> resolved to ${r.concept.id}`);
      }
      // disambiguation !== null is the path-ambiguous family ("direction"):
      // both owners register the slug, path decides — either owner is correct.
    }
  }
  assert.deepEqual(failures, [], "raw_slug(s) that do not resolve to their owning concept");
});

test("every concept's id field matches its key", async () => {
  const vocab = await loadRealVocab();
  const mismatched = Object.entries(vocab.concepts).filter(([key, concept]) => concept.id !== key);
  assert.deepEqual(
    mismatched.map(([key, concept]) => `${key} (id: ${concept.id})`),
    [],
  );
});
