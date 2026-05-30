import { test } from "bun:test";
import assert from "node:assert/strict";
import { FIXTURE_SENTINELS, hasFixtureSentinel } from "./fixture-sentinels.mts";

test("hasFixtureSentinel detects the fixture-mode caveats", () => {
  assert.equal(
    hasFixtureSentinel(
      "Fixture mode: only Lee County is populated — switch to REFINERY_SOURCE=live.",
    ),
    true,
  );
  assert.equal(
    hasFixtureSentinel("FAF5 flows in this build are synthetic fixture data."),
    true,
  );
  // case-insensitive
  assert.equal(hasFixtureSentinel("FIXTURE MODE: only Lee"), true);
});

test("hasFixtureSentinel is false on clean caveats + the honest backstop line", () => {
  assert.equal(
    hasFixtureSentinel("FRED can revise recent observations."),
    false,
  );
  assert.equal(
    hasFixtureSentinel(
      "One or more underlying datasets were running on cached sample data at build time.",
    ),
    false,
  );
});

test("FIXTURE_SENTINELS are non-global so .test() stays stateless across calls", () => {
  for (const re of FIXTURE_SENTINELS) {
    assert.equal(re.global, false);
    const s = "synthetic fixture data";
    // repeated calls must return the same result (no lastIndex drift)
    assert.equal(re.test(s), re.test(s));
  }
});
