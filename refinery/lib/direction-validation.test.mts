/**
 * Red-first tests for direction-validation. Each test is named after the FAILURE
 * MODE it exists to stop (RULE 3.5 — the failure-modes section of
 * docs/superpowers/specs/2026-08-11-direction-validation-design.md), not after the
 * function it calls.
 *
 * Real `fitLine()` throughout — a hand-built Fit object would let the polarity and
 * established/null tests pass against a shape that the real fitter never emits.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { fitLine } from "../../lib/charts/fit-line";
import type { ResolvedGradeConfig } from "../vocab/loader.mts";
import { validateDirection, pointsAsOf } from "./direction-validation.mts";

function cfg(over: Partial<ResolvedGradeConfig>): ResolvedGradeConfig {
  return {
    slug: "test_slug",
    concept_id: "test.concept",
    gradeable: true,
    window_days: 30,
    epsilon: 0,
    epsilon_mode: "absolute",
    grade_basis: "delta",
    direction_polarity: "higher_is_bullish",
    source: { window: "slug", epsilon: "slug", polarity: "slug" },
    ...over,
  };
}

/** n monthly points starting 2025-01-01, y = start + i*step. */
function series(n: number, start: number, step: number): Array<{ when: Date; y: number }> {
  return Array.from({ length: n }, (_, i) => ({
    when: new Date(Date.UTC(2025, i, 1)),
    y: start + i * step,
  }));
}

// ── FAILURE MODE: polarity inversion ────────────────────────────────────────────
// A falling unemployment rate is BULLISH. Reading the raw slope sign would call it
// bearish and mark every correct authored call a disagreement.

test("polarity inversion — falling slope AGREES with a bullish call when lower_is_bullish", () => {
  const fit = fitLine(series(24, 8, -0.1));
  assert.ok(fit, "precondition: a clean falling series must fit");
  assert.equal(fit.established, true, "precondition: this slope must be established");

  const verdict = validateDirection(
    "bullish",
    fit,
    cfg({ direction_polarity: "lower_is_bullish" }),
  );

  assert.equal(verdict, "agree");
});

test("polarity inversion — the SAME falling slope DISAGREES with a bullish call when higher_is_bullish", () => {
  const fit = fitLine(series(24, 8, -0.1));
  assert.ok(fit);

  const verdict = validateDirection(
    "bullish",
    fit,
    cfg({ direction_polarity: "higher_is_bullish" }),
  );

  assert.equal(verdict, "disagree");
});

test("a rising slope AGREES with a bullish call when higher_is_bullish", () => {
  const fit = fitLine(series(24, 100, 5));
  assert.ok(fit);

  assert.equal(validateDirection("bullish", fit, cfg({})), "agree");
});

test("a rising slope DISAGREES with a bearish call when higher_is_bullish", () => {
  const fit = fitLine(series(24, 100, 5));
  assert.ok(fit);

  assert.equal(validateDirection("bearish", fit, cfg({})), "disagree");
});

// ── FAILURE MODE: established=false conflated with null ─────────────────────────
// fit-line.ts:120-126 — "'established: false' reads as 'we checked, there is no
// trend' when the truth is 'we could not fit this at all'". These are different
// answers and must never collapse into one verdict.

test("established=false is NO_DIRECTION — we checked and there is no readable trend", () => {
  // Flat with alternating noise: a real fit whose CI straddles zero.
  const flat = Array.from({ length: 24 }, (_, i) => ({
    when: new Date(Date.UTC(2025, i, 1)),
    y: 100 + (i % 2 === 0 ? 1 : -1),
  }));
  const fit = fitLine(flat);
  assert.ok(fit, "precondition: this series must still FIT");
  assert.equal(fit.established, false, "precondition: its CI must straddle zero");

  assert.equal(validateDirection("bullish", fit, cfg({})), "no_direction");
});

test("a null fit is UNVALIDATED, never NO_DIRECTION — we could not check at all", () => {
  // Under MIN_FIT_POINTS (12): fitLine returns null.
  const fit = fitLine(series(5, 100, 5));
  assert.equal(fit, null, "precondition: under 12 points fitLine must return null");

  assert.equal(validateDirection("bullish", fit, cfg({})), "unvalidated");
});

// ── FAILURE MODE: a failed series read reported as a passed validation ──────────

test("a failed series read yields UNVALIDATED and never AGREE", () => {
  // A read failure reaches the validator as an empty series -> null fit.
  const fit = fitLine([]);
  assert.equal(fit, null);

  const verdict = validateDirection("bullish", fit, cfg({}));

  assert.notEqual(verdict, "agree");
  assert.equal(verdict, "unvalidated");
});

// ── FAILURE MODE: look-ahead ───────────────────────────────────────────────────
// Fitting on observations dated AFTER the call peeks at the future and makes every
// validation fraudulent. Same honesty rule as flywheel-backtest.mts:18.

test("look-ahead — pointsAsOf DROPS observations dated after the as-of instant", () => {
  const obs = [
    { observed_at: "2026-01-15T00:00:00Z", value: 1 },
    { observed_at: "2026-02-15T00:00:00Z", value: 2 },
    { observed_at: "2026-06-15T00:00:00Z", value: 999 }, // the future
  ];

  const pts = pointsAsOf(obs, "2026-03-01T00:00:00Z");

  assert.equal(pts.length, 2);
  assert.ok(!pts.some((p) => p.y === 999), "a post-as-of observation leaked into the fit");
});

test("look-ahead — an observation exactly AT the as-of instant is KEPT", () => {
  const obs = [{ observed_at: "2026-03-01T00:00:00Z", value: 7 }];

  const pts = pointsAsOf(obs, "2026-03-01T00:00:00Z");

  assert.equal(pts.length, 1, "the boundary observation was knowable and must be kept");
  assert.equal(pts[0].y, 7);
});

test("look-ahead — an unparseable or non-finite observation is dropped, not NaN-poisoned", () => {
  const obs = [
    { observed_at: "not-a-date", value: 5 },
    { observed_at: "2026-01-15T00:00:00Z", value: Number.NaN },
    { observed_at: "2026-02-15T00:00:00Z", value: 3 },
  ];

  const pts = pointsAsOf(obs, "2026-03-01T00:00:00Z");

  assert.equal(pts.length, 1);
  assert.equal(pts[0].y, 3);
});

// ── FAILURE MODE: no_direction still scored as a directional call ───────────────
// The crawled standard (§4.1) says a forecast must be allowed to return NO
// DIRECTION. If the row stays `gradeable`, we score a call we explicitly declined
// to make — and §6 already accepted that the gradeable count falls.

import { applyDirectionValidation, readVerdict } from "./direction-validation.mts";

function row(over: Record<string, unknown> = {}) {
  return {
    grade_status: "gradeable" as const,
    predicted_direction: "bullish" as const,
    metadata: { version: 3 } as Record<string, unknown>,
    ...over,
  };
}

test("no_direction DOWNGRADES the row to ungradeable", () => {
  const out = applyDirectionValidation(row(), "no_direction");

  assert.equal(out.grade_status, "ungradeable");
});

test("disagree KEEPS the row gradeable — the authored call still stands and is still scored", () => {
  const out = applyDirectionValidation(row(), "disagree");

  assert.equal(out.grade_status, "gradeable");
});

test("unvalidated KEEPS the row gradeable — we could not check, which is not evidence against it", () => {
  const out = applyDirectionValidation(row(), "unvalidated");

  assert.equal(out.grade_status, "gradeable");
});

test("the verdict is RECORDED on every row, including agree", () => {
  assert.equal(readVerdict(applyDirectionValidation(row(), "agree").metadata), "agree");
  assert.equal(readVerdict(applyDirectionValidation(row(), "disagree").metadata), "disagree");
  assert.equal(
    readVerdict(applyDirectionValidation(row(), "no_direction").metadata),
    "no_direction",
  );
});

test("an already-ungradeable row is NOT promoted by an agreeing fit", () => {
  const out = applyDirectionValidation(row({ grade_status: "ungradeable" }), "agree");

  assert.equal(out.grade_status, "ungradeable");
});

// ── FAILURE MODE: the 40 already-logged rows read as validated ──────────────────

test("a row logged BEFORE this shipped reads as unvalidated, never as a passed check", () => {
  assert.equal(readVerdict({ version: 3 }), "unvalidated");
  assert.equal(readVerdict(null), "unvalidated");
  assert.equal(readVerdict(undefined), "unvalidated");
});

// ── FAILURE MODE: duplicate observations inflate n and fake significance ────────
// metric-observations-log.mts:11-13 — master's re-surfaced copy of a leaf slug
// COEXISTS with the leaf's own row at the same observed_at. Feeding both to the
// fitter doubles n, shrinks the confidence interval, and can flip `established`
// from false to true — manufacturing a trend that isn't there.

test("duplicate observations at the same instant collapse to ONE fitted point", () => {
  const obs = [
    { observed_at: "2026-01-15T00:00:00Z", value: 10 },
    { observed_at: "2026-01-15T00:00:00Z", value: 10 }, // master's re-surfaced copy
    { observed_at: "2026-02-15T00:00:00Z", value: 11 },
  ];

  const pts = pointsAsOf(obs, "2026-03-01T00:00:00Z");

  assert.equal(pts.length, 2, "the duplicate instant was counted twice");
});
