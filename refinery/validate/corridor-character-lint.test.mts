/**
 * Unit coverage for the corridor-character lint orchestrator + the two new
 * block-level linters (speculative + chart). These tests run independently
 * of the C1 synthesizer — they exercise the lint surface directly so a
 * regression in the lint contract surfaces here even if C1 changes.
 */

import { test } from "bun:test";
import assert from "node:assert/strict";

import {
  lintCorridorCharacterOutput,
  SPECULATIVE_DISCLAIMER,
  type CorridorCharacterOutput,
} from "./corridor-character-lint.mts";
import { lintChartBlock } from "./chart-block-lint.mts";
import { lintSpeculativeBlock } from "./speculative-block-lint.mts";
import { buildCorridorFactPack } from "../tools/build-corridor-fact-pack.mts";
import { makeNaplesFullDataInput } from "../tools/corridor-character-fixtures.mts";

const factPack = buildCorridorFactPack(makeNaplesFullDataInput());

// ── chart-block-lint ────────────────────────────────────────────────────────

test("chart-block: null is ok", () => {
  assert.deepEqual(lintChartBlock(null), { ok: true, errors: [] });
});

test("chart-block: well-formed shape passes", () => {
  const r = lintChartBlock({
    title: "x",
    columns: ["a", "b"],
    rows: [
      ["v1", 1],
      ["v2", null],
    ],
  });
  assert.equal(r.ok, true);
});

test("chart-block: missing title", () => {
  const r = lintChartBlock({ columns: ["a"], rows: [] });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /title/);
});

test("chart-block: row width mismatch", () => {
  const r = lintChartBlock({
    title: "x",
    columns: ["a", "b", "c"],
    rows: [["only-one"]],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /1 cell.*expected 3/);
});

test("chart-block: rejects non-object non-null", () => {
  const r = lintChartBlock("string-not-allowed");
  assert.equal(r.ok, false);
});

// ── speculative-block-lint ──────────────────────────────────────────────────

test("speculative-block: well-formed passes", () => {
  const block =
    "Vacancy could be tracking toward expansion. " + SPECULATIVE_DISCLAIMER;
  const r = lintSpeculativeBlock(block, factPack);
  assert.equal(r.ok, true);
});

test("speculative-block: missing disclaimer rejected", () => {
  const block = "Vacancy may be expanding.";
  const r = lintSpeculativeBlock(block, factPack);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /requires-speculative-disclaimer/);
});

test("speculative-block: anchored fact-pack number does not need a hedge", () => {
  // 5.2 is the vacancy_rate.current.value in the Naples fixture.
  const block = "Vacancy is 5.2 currently. " + SPECULATIVE_DISCLAIMER;
  const r = lintSpeculativeBlock(block, factPack);
  assert.equal(r.ok, true);
});

test("speculative-block: bare inferred number without hedge rejected", () => {
  const block = "The next reading is 9999. " + SPECULATIVE_DISCLAIMER;
  const r = lintSpeculativeBlock(block, factPack);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /requires-hedging-around-inference/);
});

test("speculative-block: [inference] marker satisfies hedging requirement", () => {
  const block =
    "The next reading is 9999 [inference]. " + SPECULATIVE_DISCLAIMER;
  const r = lintSpeculativeBlock(block, factPack);
  assert.equal(r.ok, true);
});

test("speculative-block: 'most likely' / 'tracking toward' satisfy hedging", () => {
  const block =
    "Vacancy is most likely 9999 next quarter. " + SPECULATIVE_DISCLAIMER;
  const r = lintSpeculativeBlock(block, factPack);
  assert.equal(r.ok, true);
});

// ── orchestrator ────────────────────────────────────────────────────────────

function happyOutput(): CorridorCharacterOutput {
  return {
    facts_block:
      "Vacancy is 5.2% [internal-1]. Asking rent is $32.50 NNN [web-1].",
    chart_block: null,
    speculative_block:
      "Trends could be tracking toward expansion. " + SPECULATIVE_DISCLAIMER,
    citations: {
      internal: [
        {
          ref: "internal-1",
          source_url: "https://corridor-profiles.example/x",
        },
      ],
      web: [
        {
          ref: "web-1",
          url: "https://cushwake.example/x",
          title: "x",
          cited_text: "x",
        },
      ],
    },
  };
}

test("orchestrator: well-formed output returns ok", () => {
  const r = lintCorridorCharacterOutput(happyOutput(), factPack);
  assert.equal(r.ok, true);
  assert.equal(r.flat_errors.length, 0);
});

test("orchestrator: aggregates errors across blocks with prefixes", () => {
  const bad = happyOutput();
  bad.facts_block = "Vacancy is approximately 5.2%."; // no cite, plus smoothing
  bad.speculative_block = "Speculation."; // missing disclaimer
  bad.chart_block = { title: "x", columns: [], rows: "no" } as never;
  const r = lintCorridorCharacterOutput(bad, factPack);
  assert.equal(r.ok, false);
  assert.ok(r.errors.facts.length > 0);
  assert.ok(r.errors.speculative.length > 0);
  assert.ok(r.errors.chart.length > 0);
  assert.ok(r.flat_errors.some((e) => e.startsWith("[facts] ")));
  assert.ok(r.flat_errors.some((e) => e.startsWith("[speculative] ")));
  assert.ok(r.flat_errors.some((e) => e.startsWith("[chart] ")));
});

test("orchestrator: empty facts_block rejected with clear message", () => {
  const bad = happyOutput();
  bad.facts_block = "";
  const r = lintCorridorCharacterOutput(bad, factPack);
  assert.equal(r.ok, false);
  assert.match(r.errors.facts.join(" "), /non-empty string/);
});
