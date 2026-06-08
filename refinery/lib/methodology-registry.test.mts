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

  test("CRE corridor-median literal carries an equation + a slug-keyed held base", () => {
    const e = resolveMethod("asking_rent_psf_median");
    assert.ok(e, "expected an entry");
    assert.match(e.equation ?? "", /base/);
    const held = e.components?.find((c) => c.role === "have");
    assert.equal(held?.heldFrom, "asking_rent_psf_median");
    assert.ok(
      e.components?.some((c) => c.role === "need"),
      "expected at least one need component",
    );
  });

  test("per-submarket family resolves via pattern with a slug-keyed held component", () => {
    const e = resolveMethod("asking_rent_nnn_marketbeat_marco_island");
    assert.ok(e, "expected a pattern entry for the submarket slug");
    assert.equal(e.label, "Marco Island asking rent (NNN)");
    assert.equal(
      e.components?.find((c) => c.role === "have")?.heldFrom,
      "asking_rent_nnn_marketbeat_marco_island",
    );
    const vac = resolveMethod("vacancy_rate_marketbeat_fort_myers");
    assert.ok(vac);
    assert.match(vac.equation ?? "", /vacant GLA/);
  });

  test("aggregate marketbeat slugs (_swfl, _area) fall through to null, not the submarket pattern", () => {
    assert.equal(resolveMethod("asking_rent_nnn_marketbeat_swfl"), null);
    assert.equal(resolveMethod("vacancy_rate_marketbeat_naples_area"), null);
  });

  test("cap_rate_median stays UNregistered (display-leak canary)", () => {
    assert.equal(resolveMethod("cap_rate_median"), null);
    assert.equal(methodHrefForSlug("cap_rate_median"), undefined);
  });
});
