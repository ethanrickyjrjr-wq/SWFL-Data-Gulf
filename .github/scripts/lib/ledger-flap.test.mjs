// Unit tests for the cron-ledger flap helpers.
// Run: node --test .github/scripts/lib/ledger-flap.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { flipMostRecentOpenRow, chronicFlappers, START, END } from "./ledger-flap.mjs";

function ledger(rows) {
  return [
    "# Ledger",
    "",
    START,
    "",
    "| Date | Workflow | Symptom | Root Cause | Status | Fix |",
    "| ---- | -------- | ------- | ---------- | ------ | --- |",
    ...rows,
    "",
    END,
    "",
  ].join("\n");
}

const openUntriaged = (name, date = "2026-06-10") =>
  `| ${date} | \`${name}\` | Traceback | _auto-captured; pending triage_ | OPEN | [run](x) |`;
const openDiagnosed = (name, date = "2026-06-10") =>
  `| ${date} | \`${name}\` | Traceback | FLAKE — vendor 429 | OPEN | [run](x) |`;
const resolvedSelfHealed = (name, date = "2026-06-01") =>
  `| ${date} | \`${name}\` | Traceback | _auto-captured; pending triage_ | RESOLVED (auto — self-healed, untriaged) | [run](x) |`;
const resolvedAutoUntriaged = (name, date = "2026-06-01") =>
  `| ${date} | \`${name}\` | Traceback | _auto-captured; pending triage_ | RESOLVED (auto) | [run](x) |`;

test("flip relabels an UNTRIAGED open row as self-healed", () => {
  const out = flipMostRecentOpenRow(
    ledger([openUntriaged("freshness-probe-daily")]),
    "freshness-probe-daily",
  );
  assert.match(out, /RESOLVED \(auto — self-healed, untriaged\)/);
  assert.doesNotMatch(out, /\|\s+OPEN\s+\|/);
});

test("flip uses plain RESOLVED (auto) for a DIAGNOSED open row", () => {
  const out = flipMostRecentOpenRow(
    ledger([openDiagnosed("collier-permits-monthly")]),
    "collier-permits-monthly",
  );
  assert.match(out, /\| RESOLVED \(auto\) \|/);
  assert.doesNotMatch(out, /self-healed/);
});

test("flip targets the MOST RECENT open row (top-first), leaving older ones", () => {
  const out = flipMostRecentOpenRow(
    ledger([openUntriaged("x", "2026-06-10"), openUntriaged("x", "2026-06-01")]),
    "x",
  );
  const xLines = out.split("\n").filter((l) => l.includes("`x`"));
  assert.match(xLines[0], /RESOLVED \(auto — self-healed/); // newest flipped
  assert.match(xLines[1], /\|\s+OPEN\s+\|/); // older untouched
});

test("flip returns null when there is no OPEN row for the workflow", () => {
  assert.equal(flipMostRecentOpenRow(ledger([resolvedAutoUntriaged("x")]), "x"), null);
  assert.equal(flipMostRecentOpenRow(ledger([openUntriaged("other")]), "x"), null);
});

test("chronicFlappers counts untriaged self-heals (old + new labels) at/above threshold", () => {
  const out = chronicFlappers(
    ledger([
      resolvedSelfHealed("freshness-probe-daily", "2026-06-06"),
      resolvedAutoUntriaged("freshness-probe-daily", "2026-06-05"), // old label still counts
      resolvedSelfHealed("freshness-probe-daily", "2026-06-02"),
      resolvedSelfHealed("daily-rebuild", "2026-06-01"), // only 1 — below threshold
    ]),
    { threshold: 3 },
  );
  assert.deepEqual(out, [{ workflow: "freshness-probe-daily", count: 3 }]);
});

test("chronicFlappers ignores diagnosed resolves and OPEN rows", () => {
  const out = chronicFlappers(
    ledger([
      `| 2026-06-06 | \`x\` | t | FLAKE — vendor 429 | RESOLVED (auto) | [run](x) |`,
      `| 2026-06-05 | \`x\` | t | FLAKE — vendor 429 | RESOLVED (auto) | [run](x) |`,
      `| 2026-06-04 | \`x\` | t | FLAKE — vendor 429 | RESOLVED (auto) | [run](x) |`,
      openUntriaged("x", "2026-06-03"), // OPEN, not a self-heal
    ]),
    { threshold: 3 },
  );
  assert.deepEqual(out, []);
});

test("chronicFlappers returns [] on a ledger with no sentinel block", () => {
  assert.deepEqual(chronicFlappers("no sentinels here", { threshold: 3 }), []);
});
