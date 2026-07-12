// Unit tests for the watch-manifest parser + selectors. Pure: no fs, no gh, no network.
// Run: node --test scripts/lib/watch-manifest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkflow,
  buildManifest,
  assertManifestSane,
  loggerWatchNames,
  healWatchNames,
  rewriteWorkflowList,
  zombieCrons,
  darkDrift,
  autoRetryAllowed,
} from "./watch-manifest.mjs";

// Verbatim shapes from the real repo (07/11/2026).
const SCHEDULED_PAID = `name: City pulse daily
on:
  schedule:
    - cron: "0 9 * * *"
jobs:
  ingest:
    timeout-minutes: 30
    steps:
      - name: Run
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: python -m ingest.pipelines.city_pulse.pipeline
`;

// corridor-pulse-weekly.yml: cron COMMENTED OUT (paused 07/05/2026), key still named.
const COMMENTED_CRON = `name: Corridor pulse weekly
on:
  # schedule:
    # - cron: "0 10 * * 0"
  workflow_dispatch:
jobs:
  ingest:
    timeout-minutes: 90
    steps:
      - env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: python -m ingest.pipelines.city_pulse_corridors.pipeline
`;

// tripwire-hourly.yml:9 — the comment NAMES the token to say it is NOT used.
// A bare /ANTHROPIC_API_KEY/ substring test (the live bug in tripwire-scan.mjs:54)
// marks this workflow paid. It is not. weekly-read.yml:8 has the same shape.
const NOT_PAID_BUT_NAMES_THE_KEY = `name: Tripwire hourly

# No ANTHROPIC_API_KEY here — the scan spends nothing, by design.
on:
  schedule:
    - cron: "17 * * * *"
concurrency:
  group: tripwire-hourly
  cancel-in-progress: false
jobs:
  scan:
    timeout-minutes: 5
    steps:
      - run: node scripts/tripwire-scan.mjs
`;

test("parseWorkflow — a live cron is `scheduled`, and the max job timeout is captured", () => {
  const e = parseWorkflow("city-pulse-daily.yml", SCHEDULED_PAID);
  assert.equal(e.name, "City pulse daily");
  assert.equal(e.file, "city-pulse-daily.yml");
  assert.equal(e.scheduled, true);
  assert.equal(e.timeout_minutes, 30);
  assert.equal(e.cancel_in_progress, false);
  assert.equal(e.paid, true);
  assert.equal(e.should_be_dark, false);
  assert.equal(e.disabled, null);
});

test("parseWorkflow — a COMMENTED-OUT cron is NOT scheduled (corridor-pulse)", () => {
  const e = parseWorkflow("corridor-pulse-weekly.yml", COMMENTED_CRON);
  assert.equal(e.scheduled, false, "a `# - cron:` line never fires and must not count");
  assert.equal(e.should_be_dark, true, "corridor-pulse is the one declared-dark workflow");
});

test("parseWorkflow — `paid` requires the secrets context, not a bare substring", () => {
  const e = parseWorkflow("tripwire-hourly.yml", NOT_PAID_BUT_NAMES_THE_KEY);
  assert.equal(
    e.paid,
    false,
    "tripwire-hourly names ANTHROPIC_API_KEY only in a comment saying it does NOT use it",
  );
  assert.equal(e.scheduled, true);
  assert.equal(e.timeout_minutes, 5);
});

test("buildManifest — sorted by file; `disabled` comes from observed API state", () => {
  const m = buildManifest(
    [
      { file: "tripwire-hourly.yml", text: NOT_PAID_BUT_NAMES_THE_KEY },
      { file: "city-pulse-daily.yml", text: SCHEDULED_PAID },
    ],
    { ".github/workflows/city-pulse-daily.yml": "active" },
  );
  assert.deepEqual(
    m.map((e) => e.file),
    ["city-pulse-daily.yml", "tripwire-hourly.yml"],
    "stable sort by file — the committed JSON must be byte-reproducible",
  );
  assert.equal(m[0].disabled, false);
  assert.equal(m[1].disabled, null, "no observed state -> null, never a guessed false");
});

test("buildManifest — a plain rebuild PRESERVES prior observed `disabled` (never silently wipes it)", () => {
  const m = buildManifest([{ file: "dbpr-sirs-monthly.yml", text: SCHEDULED_PAID }], undefined, {
    "dbpr-sirs-monthly.yml": true,
  });
  assert.equal(m[0].disabled, true);
});

test("buildManifest — `disabled` is true for ANY non-active state (incl. disabled_inactivity)", () => {
  const m = buildManifest([{ file: "rsw-airport-monthly.yml", text: SCHEDULED_PAID }], {
    ".github/workflows/rsw-airport-monthly.yml": "disabled_inactivity",
  });
  assert.equal(m[0].disabled, true);
});

test("assertManifestSane — a scheduled workflow with no `name:` is a hard error", () => {
  const problems = assertManifestSane([
    { name: null, file: "x.yml", scheduled: true, timeout_minutes: 5 },
  ]);
  assert.ok(
    problems.some((p) => /x\.yml/.test(p) && /name/.test(p)),
    "workflow_run.workflows: is name-keyed — an unnamed workflow cannot be watched",
  );
});

test("assertManifestSane — duplicate workflow names are a hard error (unresolvable in workflow_run)", () => {
  const problems = assertManifestSane([
    { name: "Dup", file: "a.yml", scheduled: true, timeout_minutes: 5 },
    { name: "Dup", file: "b.yml", scheduled: true, timeout_minutes: 5 },
  ]);
  assert.ok(problems.some((p) => /duplicate/i.test(p) && /a\.yml/.test(p) && /b\.yml/.test(p)));
});

test("assertManifestSane — a scheduled workflow with no timeout-minutes is a hard error", () => {
  const problems = assertManifestSane([
    { name: "N", file: "n.yml", scheduled: true, timeout_minutes: null },
  ]);
  assert.ok(
    problems.some((p) => /n\.yml/.test(p) && /timeout-minutes/.test(p)),
    "without a ceiling, classifyTermination cannot detect a TIMEOUT kill",
  );
});

const FLEET = [
  { name: "City pulse daily", file: "city-pulse-daily.yml", scheduled: true },
  { name: "Daily Brain Rebuild", file: "daily-rebuild.yml", scheduled: true },
  { name: "Chief of staff nightly", file: "chief-of-staff-nightly.yml", scheduled: true },
  { name: "Tripwire hourly", file: "tripwire-hourly.yml", scheduled: true },
  { name: "CI", file: "ci.yml", scheduled: false },
];

test("loggerWatchNames — every scheduled workflow except the watch-exempt ones", () => {
  assert.deepEqual(loggerWatchNames(FLEET), [
    "Chief of staff nightly",
    "City pulse daily",
    "Daily Brain Rebuild",
  ]);
});

test("healWatchNames — logger's set minus BOTH intentional exclusions (kept in lockstep with trigger-list-drift.test.mjs)", () => {
  assert.deepEqual(healWatchNames(FLEET), ["City pulse daily"]);
});

test("rewriteWorkflowList — replaces the list in place, preserving indent, emitting ONLY item lines", () => {
  const yaml = [
    "on:",
    "  workflow_run:",
    "    workflows:",
    '      - "Old A"',
    '      - "Old B"',
    "    types: [completed]",
    "",
  ].join("\n");
  const out = rewriteWorkflowList(yaml, ["New A", "New B", "New C"]);
  assert.equal(
    out,
    [
      "on:",
      "  workflow_run:",
      "    workflows:",
      '      - "New A"',
      '      - "New B"',
      '      - "New C"',
      "    types: [completed]",
      "",
    ].join("\n"),
  );
});

test("rewriteWorkflowList — a name containing a double quote is refused, not silently emitted", () => {
  const yaml = ["    workflows:", '      - "A"', "    types: [completed]"].join("\n");
  assert.throws(() => rewriteWorkflowList(yaml, ['bad " name']), /double quote/i);
});

test("zombieCrons — API-disabled while an uncommented cron still sits in source", () => {
  const entries = [
    // The real 4: disabled at the API, cron LIVE in source. `gh workflow enable`
    // resumes them instantly. Phase 2 structurally cannot see this class.
    { file: "dbpr-sirs-monthly.yml", scheduled: true, disabled: true, should_be_dark: false },
    // corridor-pulse: disabled AND cron commented — deliberate, belt+suspenders. Not a zombie.
    { file: "corridor-pulse-weekly.yml", scheduled: false, disabled: true, should_be_dark: true },
    { file: "city-pulse-daily.yml", scheduled: true, disabled: false, should_be_dark: false },
    { file: "unknown-state.yml", scheduled: true, disabled: null, should_be_dark: false },
  ];
  assert.deepEqual(
    zombieCrons(entries).map((e) => e.file),
    ["dbpr-sirs-monthly.yml"],
  );
});

test("darkDrift — a workflow we declared dark that is ENABLED at the API", () => {
  const entries = [
    { file: "corridor-pulse-weekly.yml", should_be_dark: true, disabled: false },
    { file: "city-pulse-daily.yml", should_be_dark: false, disabled: false },
  ];
  assert.deepEqual(
    darkDrift(entries).map((e) => e.file),
    ["corridor-pulse-weekly.yml"],
  );
});

test("autoRetryAllowed — MONEY GUARD: never auto-retry a paid workflow", () => {
  assert.equal(autoRetryAllowed({ file: "narrative-bake.yml", paid: true }), false);
  assert.equal(autoRetryAllowed({ file: "faf5-annual.yml", paid: false }), true);
});

test("autoRetryAllowed — never auto-retry a send-side-effect workflow (double-send)", () => {
  assert.equal(autoRetryAllowed({ file: "daily-email-digest.yml", paid: false }), false);
  assert.equal(autoRetryAllowed({ file: "email-scheduler.yml", paid: false }), false);
});

test("autoRetryAllowed — an unknown workflow (no manifest entry) is never retried", () => {
  assert.equal(autoRetryAllowed(null), false);
  assert.equal(autoRetryAllowed(undefined), false);
});
