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

test("every slug_index target resolves to a real concept — a dangling target is a latent Orphan Concept abort", async () => {
  const vocab = await loadRealVocab();
  const dangling = Object.entries(vocab.slug_index).filter(
    ([, target]) => typeof target === "string" && !(target in vocab.concepts),
  );
  assert.deepEqual(
    dangling.map(([slug, target]) => `${slug} -> ${target}`),
    [],
    "slug_index target(s) missing from concepts",
  );
});

test("every concept's id field matches its key", async () => {
  const vocab = await loadRealVocab();
  const mismatched = Object.entries(vocab.concepts).filter(([key, concept]) => concept.id !== key);
  assert.deepEqual(
    mismatched.map(([key, concept]) => `${key} (id: ${concept.id})`),
    [],
  );
});
