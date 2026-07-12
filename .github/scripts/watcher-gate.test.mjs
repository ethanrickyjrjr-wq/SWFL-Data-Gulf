// The watcher `if:` gates must admit cancelled/timed_out scheduled runs for CLASSIFICATION.
//
// Why: a `timeout-minutes` kill surfaces as conclusion `cancelled` (corridor-pulse runs
// 27903898570 / 28321195281 / 28739416924 — three scheduled 45-minute kills, full paid API
// spend, zero rows kept, ZERO incidents opened). A gate of `conclusion == 'failure'` alone
// is structurally blind to the entire class.
//
// Run: node --test .github/scripts/watcher-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WF = (n) => resolve(dirname(fileURLToPath(import.meta.url)), "../workflows", n);

for (const file of ["log-cron-incident.yml", "heal-cron-failure.yml"]) {
  const text = readFileSync(WF(file), "utf8");

  test(`${file} admits cancelled runs`, () => {
    assert.match(
      text,
      /conclusion == 'cancelled'/,
      `${file} still drops cancelled runs on the floor`,
    );
  });

  test(`${file} admits timed_out runs`, () => {
    assert.match(
      text,
      /conclusion == 'timed_out'/,
      `${file} still drops timed_out runs on the floor`,
    );
  });

  test(`${file} scopes the cancelled path to scheduled runs`, () => {
    assert.match(
      text,
      /workflow_run\.event == 'schedule'/,
      `${file} must not raise an incident for a human cancelling a dispatch (3 of leepa's 4 cancels)`,
    );
  });

  test(`${file} still admits failures (no regression)`, () => {
    assert.match(text, /conclusion == 'failure'/);
  });
}
