import { test } from "bun:test";
import assert from "node:assert/strict";
import { computePersistenceNull, computeSkillScore, type ScoredCall } from "./skill-baseline.mts";

// ── helper ──────────────────────────────────────────────────────────────────────
function call(over: Partial<ScoredCall>): ScoredCall {
  return {
    slug: "s",
    family: "fam",
    as_of_date: "2026-01-01",
    predicted: "bullish",
    observed: "bullish",
    correct: true,
    source_tag: "lake_tier1",
    ...over,
  };
}

// ── computePersistenceNull ──────────────────────────────────────────────────────
test("computePersistenceNull: 3-period sequence yields 2 predictions = the prior values", () => {
  const out = computePersistenceNull([
    { date: "d1", direction: "bullish" },
    { date: "d2", direction: "bearish" },
    { date: "d3", direction: "bullish" },
  ]);
  assert.deepEqual(out, [
    { date: "d2", predicted: "bullish" },
    { date: "d3", predicted: "bearish" },
  ]);
});

test("computePersistenceNull: single element yields [], empty yields []", () => {
  assert.deepEqual(computePersistenceNull([{ date: "d1", direction: "bullish" }]), []);
  assert.deepEqual(computePersistenceNull([]), []);
});

test("computePersistenceNull: neutral observations ARE used as persistence predictions", () => {
  const out = computePersistenceNull([
    { date: "d1", direction: "neutral" },
    { date: "d2", direction: "bullish" },
  ]);
  assert.deepEqual(out, [{ date: "d2", predicted: "neutral" }]);
});

// ── computeSkillScore: core accuracy + lift ─────────────────────────────────────
test("all in-set calls correct, no neutral target: system_accuracy = 1.0 and lift = 1.0 - persistence", () => {
  // one slug, 3 dated calls; first (d1) has no prior → excluded. d2,d3 are in-set.
  const score = computeSkillScore([
    call({ as_of_date: "2026-01-01", observed: "bullish", correct: true }),
    call({ as_of_date: "2026-02-01", observed: "bullish", correct: true }),
    call({ as_of_date: "2026-03-01", observed: "bearish", correct: true }),
  ]);
  assert.equal(score.n_calls, 2);
  assert.equal(score.system_accuracy, 1.0);
  // persistence: d2 predicts d1's bullish (hit), d3 predicts d2's bullish vs bearish (miss) → 0.5
  assert.equal(score.persistence_accuracy, 0.5);
  assert.equal(score.lift, score.system_accuracy - score.persistence_accuracy);
});

test("neutral observed is excluded as a target but still serves as the prior for the next call", () => {
  // d1 bullish, d2 bullish, d3 NEUTRAL, d4 bullish — candidates d2,d3,d4; d3 dropped (neutral target).
  const score = computeSkillScore([
    call({ as_of_date: "2026-01-01", observed: "bullish" }),
    call({ as_of_date: "2026-02-01", observed: "bullish" }),
    call({ as_of_date: "2026-03-01", observed: "neutral" }),
    call({ as_of_date: "2026-04-01", observed: "bullish" }),
  ]);
  assert.equal(score.n_calls, 2); // d2 and d4 only
});

test("neutral prior makes the persistence null predict neutral, which counts as a persistence miss", () => {
  // d1 neutral, d2 bullish, d3 bullish. Scored targets: d2, d3 (d1 = first, excluded).
  //   d2: prior d1 is neutral → persistence predicts neutral vs bullish → MISS
  //   d3: prior d2 is bullish → persistence predicts bullish vs bullish → HIT
  // → persistence gets exactly 1 of 2, proving the neutral prior was not skipped.
  const score = computeSkillScore([
    call({ as_of_date: "2026-01-01", observed: "neutral", correct: true }),
    call({ as_of_date: "2026-02-01", observed: "bullish", correct: true }),
    call({ as_of_date: "2026-03-01", observed: "bullish", correct: true }),
  ]);
  assert.equal(score.n_calls, 2);
  assert.equal(score.n_persistence_correct, 1);
  assert.equal(score.persistence_accuracy, 0.5);
});

// ── the neutral-prior EDGE: WHICH WAY does it bias `lift`? ──────────────────────
// Regime mirrors the reconciled corpus: the system TRAILS persistence, and the
// neutral-prior row is a system HIT that persistence structurally cannot score.
//   slug a: d1 NEUTRAL (prior only), d2 bullish system-HIT,  d3 bullish system-MISS
//   slug b: d1 bullish,              d2 bullish system-MISS, d3 bullish system-MISS
// Dropping a's leading neutral removes EXACTLY the neutral-prior row (d2 becomes
// first-per-slug) and leaves d3's prior (d2) untouched — a clean A/B on that ONE row.
// `predicted` is inert in the scorer (persistence reads `observed`, the system reads
// `correct`) but is kept CONSISTENT with `correct` here — flywheel-backtest.mts derives
// correct = (predicted === observed), so predicted===observed with correct:false is a
// state production cannot emit. This fixture pins a contested claim; don't hand a
// skeptic an impossible row.
const WITH_NEUTRAL_PRIOR: ScoredCall[] = [
  call({
    slug: "a",
    as_of_date: "2026-01-01",
    predicted: "bullish",
    observed: "neutral",
    correct: false,
  }),
  call({
    slug: "a",
    as_of_date: "2026-02-01",
    predicted: "bullish",
    observed: "bullish",
    correct: true,
  }),
  call({
    slug: "a",
    as_of_date: "2026-03-01",
    predicted: "bearish",
    observed: "bullish",
    correct: false,
  }),
  call({
    slug: "b",
    as_of_date: "2026-01-01",
    predicted: "bullish",
    observed: "bullish",
    correct: true,
  }),
  call({
    slug: "b",
    as_of_date: "2026-02-01",
    predicted: "bearish",
    observed: "bullish",
    correct: false,
  }),
  call({
    slug: "b",
    as_of_date: "2026-03-01",
    predicted: "bearish",
    observed: "bullish",
    correct: false,
  }),
];
const WITHOUT_NEUTRAL_PRIOR: ScoredCall[] = WITH_NEUTRAL_PRIOR.filter(
  (c) => c.observed !== "neutral",
);

test("neutral-prior row biases lift UPWARD (charitable to the system), not downward", () => {
  const withRow = computeSkillScore(WITH_NEUTRAL_PRIOR);
  const withoutRow = computeSkillScore(WITHOUT_NEUTRAL_PRIOR);

  // The row is in the shared denominator, persistence is forced to miss it, the
  // system scores it at its own base rate.
  assert.equal(withRow.n_calls, withoutRow.n_calls + 1);
  assert.equal(withRow.n_persistence_correct, withoutRow.n_persistence_correct);

  // A forced miss makes the null WEAKER — i.e. EASIER to beat — so lift goes UP.
  // Measured here: -0.5 (included) vs -1.0 (excluded). The inverse assertion, which
  // is what the pre-2026-08-27 comment claimed ("harder to beat ... clean lower
  // bound"), fails on this fixture.
  assert.ok(
    withRow.lift > withoutRow.lift,
    `expected including the neutral-prior row to RAISE lift, got ${withRow.lift} vs ${withoutRow.lift}`,
  );
});

test("lift equals system_accuracy minus persistence_accuracy exactly", () => {
  const score = computeSkillScore([
    call({ as_of_date: "2026-01-01", observed: "bullish", correct: true }),
    call({ as_of_date: "2026-02-01", observed: "bearish", correct: false }),
    call({ as_of_date: "2026-03-01", observed: "bullish", correct: true }),
  ]);
  assert.equal(score.lift, score.system_accuracy - score.persistence_accuracy);
});

// ── n_families: derived from the input calls, not a separate param ───────────────
test("n_families counts distinct family strings across the input calls", () => {
  const score = computeSkillScore([
    call({ slug: "a", family: "A" }),
    call({ slug: "b", family: "A" }),
    call({ slug: "c", family: "B" }),
  ]);
  assert.equal(score.n_families, 2);
});

test("n_families reflects only the families actually present (2 of a possible 5)", () => {
  const score = computeSkillScore([
    call({ slug: "a", family: "sba" }),
    call({ slug: "b", family: "tdt" }),
  ]);
  assert.equal(score.n_families, 2);
});

// ── empty / zero-denominator: no throw ──────────────────────────────────────────
test("empty calls: every field zero, no throw", () => {
  const score = computeSkillScore([]);
  assert.equal(score.n_calls, 0);
  assert.equal(score.n_families, 0);
  assert.equal(score.system_accuracy, 0);
  assert.equal(score.lake_tier1_accuracy, 0);
  assert.equal(score.persistence_accuracy, 0);
  assert.equal(score.lift, 0);
});

test("single call per slug: no prior anywhere → n_calls 0, accuracies 0", () => {
  const score = computeSkillScore([
    call({ slug: "a", as_of_date: "2026-01-01" }),
    call({ slug: "b", as_of_date: "2026-01-01" }),
  ]);
  assert.equal(score.n_calls, 0);
  assert.equal(score.system_accuracy, 0);
});

test("n_correct and n_persistence_correct are raw integers", () => {
  const score = computeSkillScore([
    call({ as_of_date: "2026-01-01", observed: "bullish", correct: true }),
    call({ as_of_date: "2026-02-01", observed: "bullish", correct: true }),
  ]);
  assert.equal(Number.isInteger(score.n_correct), true);
  assert.equal(Number.isInteger(score.n_persistence_correct), true);
  assert.equal(score.n_correct, 1); // only d2 is in-set
});

// ── ODD provenance is NOT silent: the structural proof ──────────────────────────
test("mixed lake_tier1 + odd_extract: blended system_accuracy differs from lake_tier1_accuracy", () => {
  const score = computeSkillScore([
    // slug a — all lake_tier1, in-set d2,d3 both correct
    call({
      slug: "a",
      family: "tdt",
      as_of_date: "2026-01-01",
      source_tag: "lake_tier1",
      observed: "bullish",
      correct: true,
    }),
    call({
      slug: "a",
      family: "tdt",
      as_of_date: "2026-02-01",
      source_tag: "lake_tier1",
      observed: "bullish",
      correct: true,
    }),
    call({
      slug: "a",
      family: "tdt",
      as_of_date: "2026-03-01",
      source_tag: "lake_tier1",
      observed: "bullish",
      correct: true,
    }),
    // slug b — odd_extract, in-set d2 incorrect
    call({
      slug: "b",
      family: "leepa",
      as_of_date: "2026-01-01",
      source_tag: "odd_extract",
      observed: "bullish",
      correct: false,
    }),
    call({
      slug: "b",
      family: "leepa",
      as_of_date: "2026-02-01",
      source_tag: "odd_extract",
      observed: "bullish",
      correct: false,
    }),
  ]);
  assert.equal(score.n_calls, 3); // a:d2, a:d3, b:d2
  assert.equal(score.lake_tier1_accuracy, 1.0); // 2/2 lake_tier1 in-set correct
  assert.notEqual(score.system_accuracy, score.lake_tier1_accuracy); // blended 2/3 ≠ 1.0
  assert.ok(Math.abs(score.system_accuracy - 2 / 3) < 1e-9);
});

// ── the paired 2x2: the cells must partition, and reconcile to the marginals ─────
test("paired 2x2 cells partition the scored denominator and reconcile to both marginals", () => {
  const score = computeSkillScore(WITH_NEUTRAL_PRIOR);
  assert.equal(
    score.n_both_correct + score.n_system_only + score.n_persistence_only + score.n_neither,
    score.n_calls,
  );
  assert.equal(score.n_both_correct + score.n_system_only, score.n_correct);
  assert.equal(score.n_both_correct + score.n_persistence_only, score.n_persistence_correct);
});

test("paired 2x2 isolates the neutral-prior row as a discordant system_only cell", () => {
  // Same fixture as the bias test: the neutral-prior row is the ONE row the system
  // wins and the null structurally cannot — it lands in n_system_only.
  const withRow = computeSkillScore(WITH_NEUTRAL_PRIOR);
  const withoutRow = computeSkillScore(WITHOUT_NEUTRAL_PRIOR);
  assert.equal(withRow.n_system_only, 1);
  assert.equal(withoutRow.n_system_only, 0);
  // Only the discordant cells moved; the concordant ones are untouched.
  assert.equal(withRow.n_persistence_only, withoutRow.n_persistence_only);
  assert.equal(withRow.n_both_correct, withoutRow.n_both_correct);
});

test("empty calls: paired 2x2 cells are all zero, no throw", () => {
  const score = computeSkillScore([]);
  assert.equal(score.n_both_correct, 0);
  assert.equal(score.n_system_only, 0);
  assert.equal(score.n_persistence_only, 0);
  assert.equal(score.n_neither, 0);
});

test("n_calls_by_tag partitions the scored denominator (sums to n_calls)", () => {
  const score = computeSkillScore([
    call({ slug: "a", as_of_date: "2026-01-01", source_tag: "lake_tier1" }),
    call({ slug: "a", as_of_date: "2026-02-01", source_tag: "lake_tier1" }),
    call({ slug: "b", as_of_date: "2026-01-01", source_tag: "odd_extract" }),
    call({ slug: "b", as_of_date: "2026-02-01", source_tag: "odd_extract" }),
  ]);
  const summed = Object.values(score.n_calls_by_tag).reduce((a, b) => a + b, 0);
  assert.equal(summed, score.n_calls);
  assert.equal(score.n_calls_by_tag.lake_tier1, 1);
  assert.equal(score.n_calls_by_tag.odd_extract, 1);
});
