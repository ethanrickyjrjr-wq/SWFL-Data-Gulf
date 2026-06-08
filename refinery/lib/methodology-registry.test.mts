import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { resolveMethod, methodHrefForSlug, METHODOLOGY_LITERALS } from "./methodology-registry.mts";

describe("methodology-registry", () => {
  test("a registered literal slug resolves to its entry", () => {
    const e = resolveMethod("trailing_12mo_collections_usd");
    assert.ok(e, "expected an entry");
    assert.equal(e.sourceTable, "fl_dor_tdt_collections");
    assert.equal(e.brain, "tourism-tdt");
    assert.ok(e.formula.length > 0);
  });

  test("a per-county pattern slug resolves and is county-specific", () => {
    const lee = resolveMethod("lee_trailing_12mo_collections_usd");
    assert.ok(lee);
    assert.match(lee.label, /Lee County/);
    const collier = resolveMethod("collier_latest_monthly_collections_usd");
    assert.ok(collier);
    assert.match(collier.label, /Collier County/);
  });

  test("literals take precedence over patterns (returned verbatim)", () => {
    const e = resolveMethod("latest_monthly_collections_usd");
    assert.equal(e, METHODOLOGY_LITERALS["latest_monthly_collections_usd"]);
  });

  test("an unregistered slug resolves to null (incl. the leak canary)", () => {
    assert.equal(resolveMethod("cap_rate_median"), null);
    assert.equal(resolveMethod("totally_made_up_slug"), null);
  });

  test("methodHrefForSlug gates: URL for documented, undefined otherwise", () => {
    assert.equal(methodHrefForSlug("post_ian_recovery_ratio"), "/r/method/post_ian_recovery_ratio");
    assert.equal(methodHrefForSlug("cap_rate_median"), undefined);
  });
});
