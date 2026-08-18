// node:test, NOT bun:test — `bun test` does not discover dot-directories, and
// `node --test` cannot load the `bun:` URL scheme (ERR_UNSUPPORTED_ESM_URL_SCHEME).
// Every hook-lib test in this directory is node:test for that reason.
//   node --test .claude/hooks/lib/cron-failclosed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  METERED_SECRETS,
  conditionsIn,
  cronViolation,
  cronViolations,
  hasSchedule,
  isFailClosed,
  meteredSecretsUsed,
} from "./cron-failclosed.mjs";

// ── The polarity bug itself, verbatim from the incident ──────────────────────────

test("!= 'false' is FAIL-OPEN — the exact 08/04/2026 condition", () => {
  assert.equal(
    isFailClosed(
      "${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}",
    ),
    false,
  );
});

test("== 'true' is FAIL-CLOSED", () => {
  assert.equal(isFailClosed("${{ vars.ENGINE_ENABLED == 'true' }}"), true);
});

test("an unset var must not run it: != and == are opposite defaults", () => {
  assert.equal(isFailClosed("vars.X != 'false'"), false);
  assert.equal(isFailClosed("vars.X == 'true'"), true);
});

test("a condition with NO variable test is not fail-closed", () => {
  assert.equal(isFailClosed("${{ github.event_name == 'workflow_dispatch' }}"), false);
  assert.equal(isFailClosed("${{ always() }}"), false);
  assert.equal(isFailClosed(""), false);
  assert.equal(isFailClosed(null), false);
});

test("ONE fail-open comparison poisons an otherwise-equality condition", () => {
  assert.equal(isFailClosed("vars.A == 'true' && vars.B != 'false'"), false);
});

test("multiple equality comparisons stay fail-closed", () => {
  assert.equal(isFailClosed("vars.A == 'true' && vars.B == 'yes'"), true);
});

// ── Schedule detection ──────────────────────────────────────────────────────────

test("hasSchedule finds a cron entry", () => {
  assert.equal(hasSchedule('on:\n  schedule:\n    - cron: "30 9 * * *"\n'), true);
});

test("hasSchedule ignores the word schedule with no cron entry", () => {
  assert.equal(hasSchedule("on:\n  workflow_dispatch:\n# schedule: someday\n"), false);
  assert.equal(hasSchedule(""), false);
});

// ── Metered-secret detection ────────────────────────────────────────────────────

test("PHOTOS_API counts as metered — the key the old money guard missed", () => {
  assert.deepEqual(meteredSecretsUsed("env:\n  X: ${{ secrets.PHOTOS_API }}\n"), ["PHOTOS_API"]);
});

test("free/infra keys are NOT metered", () => {
  const text =
    "env:\n  A: ${{ secrets.SUPABASE_URL }}\n  B: ${{ secrets.CENSUS_API_KEY }}\n" +
    "  C: ${{ secrets.FRED_API_KEY }}\n  D: ${{ secrets.GITHUB_TOKEN }}\n" +
    "  E: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}\n";
  assert.deepEqual(meteredSecretsUsed(text), []);
});

test("the metered list is non-empty and includes both spend classes", () => {
  assert.ok(METERED_SECRETS.includes("ANTHROPIC_API_KEY"));
  assert.ok(METERED_SECRETS.includes("PHOTOS_API"));
});

// ── conditionsIn ────────────────────────────────────────────────────────────────

test("conditionsIn collects each if: and strips trailing comments", () => {
  const text = "jobs:\n  a:\n    if: ${{ vars.X == 'true' }}   # gated\n  b:\n    if: always()\n";
  assert.deepEqual(conditionsIn(text), ["${{ vars.X == 'true' }}", "always()"]);
});

test("conditionsIn returns empty for a file with no if:", () => {
  assert.deepEqual(conditionsIn("jobs:\n  a:\n    runs-on: ubuntu-latest\n"), []);
});

// ── The verdict ─────────────────────────────────────────────────────────────────

test("scheduled + metered + fail-open => VIOLATION", () => {
  const text =
    'on:\n  schedule:\n    - cron: "30 9 * * *"\njobs:\n  ingest:\n' +
    "    if: ${{ vars.ENGINE_ENABLED != 'false' }}\n" +
    "    env:\n      PHOTOS_API: ${{ secrets.PHOTOS_API }}\n";
  const v = cronViolation("wf.yml", text);
  assert.ok(v, "expected a violation");
  assert.deepEqual(v.metered, ["PHOTOS_API"]);
  assert.match(v.reason, /FAIL-OPEN/);
});

test("scheduled + metered + fail-closed => no violation", () => {
  const text =
    'on:\n  schedule:\n    - cron: "30 9 * * *"\njobs:\n  ingest:\n' +
    "    if: ${{ vars.ENGINE_ENABLED == 'true' }}\n" +
    "    env:\n      PHOTOS_API: ${{ secrets.PHOTOS_API }}\n";
  assert.equal(cronViolation("wf.yml", text), null);
});

test("scheduled + metered + NO condition at all => VIOLATION naming that", () => {
  const text =
    'on:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  ingest:\n' +
    "    env:\n      K: ${{ secrets.ANTHROPIC_API_KEY }}\n";
  const v = cronViolation("wf.yml", text);
  assert.ok(v);
  assert.match(v.reason, /NO `if:` condition/);
});

// SCOPE GUARDS — these must NOT fire, or the gate becomes noise and gets ignored.
test("a metered workflow with NO schedule is out of scope (a human dispatched it)", () => {
  const text =
    "on:\n  workflow_dispatch:\njobs:\n  a:\n    env:\n      K: ${{ secrets.PHOTOS_API }}\n";
  assert.equal(cronViolation("wf.yml", text), null);
});

test("a scheduled workflow with NO metered secret is out of scope", () => {
  const text =
    'on:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  a:\n' +
    "    env:\n      K: ${{ secrets.SUPABASE_URL }}\n";
  assert.equal(cronViolation("wf.yml", text), null);
});

test("cronViolations aggregates and tolerates junk entries", () => {
  const bad =
    'on:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  a:\n' +
    "    if: ${{ vars.X != 'false' }}\n    env:\n      K: ${{ secrets.PHOTOS_API }}\n";
  const out = cronViolations([{ path: "bad.yml", text: bad }, { path: "empty.yml", text: "" }, {}]);
  assert.equal(out.length, 1);
  assert.equal(out[0].path, "bad.yml");
});

// ── POSITIVE CONTROLS against the REAL files ────────────────────────────────────
// A gate proven only against strings it was written next to proves nothing. These
// read the actual workflows on disk.

// REGRESSION GUARD, not a positive control. This started life as "the real
// neighborhood-amenities-daily.yml is caught" and went red the moment that file was
// repaired — a control pinned to a file staying broken is worthless the day you fix
// it. What actually needs defending forever is the repaired state: that workflow
// spends SteadyAPI quota on a daily cron, so it must stay FAIL-CLOSED, and it must
// not hang off the shared ENGINE_ENABLED switch that ~86 other workflows share
// (flipping that for an unrelated reason would silently restart the drain).
test("REGRESSION: the real neighborhood-amenities cron stays fail-closed on its OWN flag", () => {
  const p = ".github/workflows/neighborhood-amenities-daily.yml";
  const text = readFileSync(p, "utf8");
  // fixture assumption — if this breaks, this test is testing nothing
  assert.ok(meteredSecretsUsed(text).includes("PHOTOS_API"), "assumption: still spends quota");

  // The workflow has TWO legal states, and this test went red on 08/18/2026 by pinning
  // one of them — the same trap its header describes, pointed the other way. On
  // 08/12/2026 the cron was commented OUT at source (drain off; re-enabling is
  // deliberately two steps, gated on amenities_area_name_is_road_corridor_not_community).
  // Unscheduled is the SAFEST state and must not fail this gate. What is defended
  // forever, in both states: if a schedule ever returns, it must be fail-closed; and the
  // dedicated-flag gate must never be swapped for the shared engine switch.
  if (hasSchedule(text)) {
    assert.equal(cronViolation(p, text), null, "must be fail-closed");
  }
  const conditions = conditionsIn(text);
  assert.ok(
    conditions.some((c) => /AMENITIES_DRAIN_ENABLED\s*==\s*'true'/.test(c)),
    "must gate on its own dedicated flag, not the shared engine switch",
  );
  assert.ok(
    !conditions.some((c) => /ENGINE_ENABLED/.test(c)),
    "must NOT be re-attached to ENGINE_ENABLED — that is how the drain restarts by accident",
  );
});

// The incident's original shape is preserved as an inline fixture instead, so the
// gate keeps being tested against it after the real file was repaired.
test("POSITIVE CONTROL: the incident's original workflow shape is caught", () => {
  const original =
    'name: neighborhood-amenities-daily\non:\n  schedule:\n    - cron: "30 9 * * *"\n' +
    "  workflow_dispatch:\njobs:\n  ingest:\n" +
    "    if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}\n" +
    "    env:\n      PHOTOS_API: ${{ secrets.PHOTOS_API }}\n";
  const v = cronViolation(".github/workflows/neighborhood-amenities-daily.yml", original);
  assert.ok(v, "the shape that caused this gate must be caught by it");
  assert.ok(v.metered.includes("PHOTOS_API"));
  assert.match(v.reason, /FAIL-OPEN/);
});

test("NEGATIVE CONTROL: a scheduled non-metered workflow on disk is not caught", () => {
  const p = ".github/workflows/neighborhood-stats-annual.yml";
  const text = readFileSync(p, "utf8");
  // Only meaningful if that file really is scheduled and really has no metered key.
  assert.equal(hasSchedule(text), true, "fixture assumption: this workflow is scheduled");
  assert.deepEqual(meteredSecretsUsed(text), [], "fixture assumption: no metered secret");
  assert.equal(cronViolation(p, text), null);
});
