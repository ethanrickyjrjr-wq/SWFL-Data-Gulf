/**
 * R4 lock — per-slug polarity, never inherited.
 *
 * `resolveGradeConfig` (refinery/vocab/loader.mts) resolves `direction_polarity`
 * from the concept's own `grade` block ONLY — never from a category/value_type
 * default (unlike window_days and epsilon, which DO inherit). A slug with no
 * declared polarity is ungradeable. This is a correctness constraint, not a
 * style choice: within one category, survival-rate (higher = bullish) and
 * charge-off (higher = bearish) have OPPOSITE polarity, so any category default
 * would silently grade one of them backward — the cre-swfl polarity-flip class.
 *
 * This test pins that invariant so a future refactor (e.g. adding a
 * CATEGORY_POLARITY map next to CATEGORY_WINDOW_DAYS) cannot regress it without
 * turning this test red. It also forward-guards any multi-metric vote built on
 * top of resolveGradeConfig: every voting metric must carry its own polarity.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { loadVocabulary } from "../stages/2.5-normalize.mts";
import {
  classifyPolarity,
  gateVector,
  resolveGradeConfig,
} from "./loader.mts";

test("R4: every gradeable slug declares its own polarity — none inherited", async () => {
  const vocab = await loadVocabulary();
  const offenders: string[] = [];

  for (const conceptId of Object.keys(vocab.concepts)) {
    const cfg = resolveGradeConfig(conceptId);
    if (!cfg.gradeable) continue; // ungradeable slugs can't grade anything backward
    // A gradeable slug MUST have resolved polarity from the slug itself.
    // source.polarity === "slug" is the only honest provenance; "none" polarity
    // can never be gradeable, so either of these failing means a default crept in.
    if (cfg.source.polarity !== "slug" || cfg.direction_polarity === "none") {
      offenders.push(
        `${conceptId} (polaritySource=${cfg.source.polarity}, polarity=${cfg.direction_polarity})`,
      );
    }
  }

  assert.equal(
    offenders.length,
    0,
    `gradeable slugs with inherited/absent polarity (a category default has crept in):\n  ${offenders.join("\n  ")}`,
  );
});

// 1a — polarity gate is enum-membership, not just `=== "none"`. An out-of-enum
// token ("neutral", "higher_is_bearish") is intent-to-grade with a garbage
// value; it must be rejected at the runtime grading source, not silently pass
// as "declared" and reach gradeable:true.
test("classifyPolarity: three-state lattice over the raw token", () => {
  assert.equal(classifyPolarity("higher_is_bullish"), "valid_directional");
  assert.equal(classifyPolarity("lower_is_bullish"), "valid_directional");
  assert.equal(classifyPolarity("none"), "none");
  assert.equal(classifyPolarity(null), "none");
  assert.equal(classifyPolarity(undefined), "none");
  assert.equal(classifyPolarity("neutral"), "invalid");
  assert.equal(classifyPolarity("higher_is_bearish"), "invalid");
});

test("1a: an out-of-enum polarity is ungradeable with the invalid reason", () => {
  // licenses_cbc_share_swfl carries direction_polarity "neutral" (∉ enum).
  // Before the tighten it passed the `=== "none"` check and could reach
  // gradeable:true; now it must be ungradeable for the invalid-token reason.
  const cfg = resolveGradeConfig("licenses_cbc_share_swfl");
  assert.equal(cfg.gradeable, false);
  assert.match(cfg.reason ?? "", /invalid direction_polarity/);
  assert.equal(cfg.direction_polarity, "none"); // not surfaced as a real polarity
  assert.equal(cfg.source.polarity, null); // no honest slug provenance for a garbage token
});

// 1b — gateVector evaluates every gate independently (no short-circuit) and the
// §3 drift pin: all-green gateVector ⇔ resolveGradeConfig.gradeable, for EVERY
// concept. A regression in either function turns this red.
test("1b drift pin: gateVector all-green ⇔ resolveGradeConfig.gradeable", async () => {
  const vocab = await loadVocabulary();
  const mismatches: string[] = [];

  for (const conceptId of Object.keys(vocab.concepts)) {
    const gv = gateVector(conceptId);
    const allGreen =
      gv.registered &&
      gv.polarity_state === "valid_directional" &&
      gv.window_ok &&
      gv.numeric_ok;
    const { gradeable } = resolveGradeConfig(conceptId);
    if (allGreen !== gradeable) {
      mismatches.push(
        `${conceptId} (gateVector all-green=${allGreen}, resolveGradeConfig.gradeable=${gradeable})`,
      );
    }
  }

  assert.equal(
    mismatches.length,
    0,
    `gateVector / resolveGradeConfig disagree on gradeability:\n  ${mismatches.join("\n  ")}`,
  );
});

test("1b: an out-of-enum polarity surfaces as polarity_state 'invalid'", () => {
  const gv = gateVector("licenses_cbc_share_swfl");
  assert.equal(gv.registered, true);
  assert.equal(gv.polarity_state, "invalid");
  assert.equal(gv.raw_polarity, "neutral");
});
