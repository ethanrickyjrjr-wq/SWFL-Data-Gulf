/**
 * Polarity-VALUE lock — properties-lee-value + properties-collier-value.
 *
 * WHY THIS EXISTS (the cre-swfl polarity-flip class, May 17 2026):
 * The leaf packs' fixtures are homogeneously bullish, and the pack `direction`
 * is driven ONLY by the homes-sold / sales-velocity z-score — `months_of_supply`
 * is emitted as a hardcoded `direction: "stable"` level metric, so the pack
 * never applies its polarity. That means a SILENT inversion of a metric's
 * polarity in brain-vocabulary.json (e.g. months_of_supply flipped from
 * `lower_is_bullish` → `higher_is_bullish`) would grade a glutted, buyer-favorable
 * market as bullish — and NO existing test would catch it:
 *   • the pack round-trip tests assert direction off the z-score, not MOS;
 *   • grade-config-polarity.test.mts R4 only checks "declared + in-enum +
 *     slug-sourced", never the actual VALUE — a flip to the other valid token
 *     still passes R4.
 *
 * This file pins the exact polarity of every directional real-estate slug the
 * two property brains emit. A flip turns one of these RED. It asserts against
 * the RAW slug the pack emits (resolveGradeConfig resolves it through
 * slug_index exactly as the grader does), so it guards the real wire, not just
 * the canonical concept id.
 *
 * It ALSO pins the opposite-polarity pairing that was the literal cre-swfl trap:
 * within the single "real-estate" category, velocity (higher_is_bullish) and
 * months-of-supply (lower_is_bullish) point OPPOSITE ways. Any category-level
 * polarity default (the failure mode R4 guards) would grade one of them
 * backward; this asserts the two never collapse to the same token.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { resolveGradeConfig, type DirectionPolarity } from "./loader.mts";

// Raw slug (as emitted by the pack key_metrics) → its LOCKED polarity.
// Higher-is-bullish: more transaction velocity = stronger market.
// Lower-is-bullish:  less inventory relative to sales pace = tighter, seller-favorable.
const LOCKED: Array<[string, DirectionPolarity, string]> = [
  // Lee parcel-grain velocity — the slug that DRIVES the Lee brain direction.
  [
    "sales_velocity_zscore",
    "higher_is_bullish",
    "Lee LeePA sales-velocity z (brain-direction driver)",
  ],
  // Lee market-grain velocity (Redfin) — level metric, same polarity.
  ["lee_homes_sold_zscore", "higher_is_bullish", "Lee Redfin homes-sold z"],
  // Collier market-grain velocity (Redfin) — DRIVES the Collier brain direction.
  [
    "collier_homes_sold_zscore",
    "higher_is_bullish",
    "Collier Redfin homes-sold z (brain-direction driver)",
  ],
  // Months of supply — OPPOSITE polarity. Lower = tighter = bullish.
  ["lee_months_of_supply", "lower_is_bullish", "Lee months of supply"],
  [
    "collier_months_of_supply",
    "lower_is_bullish",
    "Collier months of supply (parity grade block added 2026-06-13)",
  ],
];

for (const [slug, expected, label] of LOCKED) {
  test(`polarity lock: ${slug} === ${expected} (${label})`, () => {
    const cfg = resolveGradeConfig(slug);
    // Must be gradeable — an ungradeable slug silently grades nothing, which is
    // how the Collier MOS gap hid before the parity grade block landed.
    assert.equal(
      cfg.gradeable,
      true,
      `${slug} must be gradeable so the grader actually applies a polarity (got reason: ${cfg.reason ?? "—"})`,
    );
    // The exact polarity value — a flip to the other valid token turns this red.
    assert.equal(
      cfg.direction_polarity,
      expected,
      `${slug} polarity flipped — expected ${expected}. A silent inversion here grades a ${
        expected === "lower_is_bullish" ? "glutted, buyer-favorable" : "cooling"
      } market backward (the cre-swfl polarity-flip class).`,
    );
    // Provenance must be the slug's own grade block — never an inherited default.
    assert.equal(
      cfg.source.polarity,
      "slug",
      `${slug} polarity must come from its own grade block, never a category default`,
    );
  });
}

// The opposite-polarity pairing — the literal cre-swfl trap (two metrics in one
// category pointing opposite ways). If a future refactor ever introduces a
// category polarity default, these would collapse to the same token; assert
// they stay opposite for BOTH counties.
test("polarity lock: velocity and months-of-supply are OPPOSITE within real-estate (Lee)", () => {
  const velocity = resolveGradeConfig("sales_velocity_zscore").direction_polarity;
  const mos = resolveGradeConfig("lee_months_of_supply").direction_polarity;
  assert.equal(velocity, "higher_is_bullish");
  assert.equal(mos, "lower_is_bullish");
  assert.notEqual(velocity, mos, "Lee velocity and MOS must have opposite polarity");
});

test("polarity lock: velocity and months-of-supply are OPPOSITE within real-estate (Collier)", () => {
  const velocity = resolveGradeConfig("collier_homes_sold_zscore").direction_polarity;
  const mos = resolveGradeConfig("collier_months_of_supply").direction_polarity;
  assert.equal(velocity, "higher_is_bullish");
  assert.equal(mos, "lower_is_bullish");
  assert.notEqual(velocity, mos, "Collier velocity and MOS must have opposite polarity");
});
