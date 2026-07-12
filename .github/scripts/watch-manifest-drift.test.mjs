// Drift guard for the generated watch manifest + the two watcher `workflows:` lists.
//
// `on.workflow_run.workflows:` has NO glob support (live-verified 07/11/2026 —
// 08g Fact 3), so the watched set is an explicit name list that MUST be codegen'd.
// Before this landed, the logger watched 29 of 82 scheduled workflows and the
// healer 27 — a ~65% blind spot that nothing could see.
//
// This test fails the moment a scheduled workflow is added, renamed, paused, or
// has its cron commented out without regenerating. Fix: `node scripts/build-watch-lists.mjs --write --write-watchers`
//
// Run: node --test .github/scripts/watch-manifest-drift.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifest,
  loggerWatchNames,
  healWatchNames,
} from "../../scripts/lib/watch-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WF_DIR = resolve(ROOT, ".github/workflows");
const REGEN = "node scripts/build-watch-lists.mjs --write --write-watchers";

const files = readdirSync(WF_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((file) => ({ file, text: readFileSync(resolve(WF_DIR, file), "utf8") }));

const committed = JSON.parse(readFileSync(resolve(ROOT, ".github/_watch-manifest.json"), "utf8"));
const prior = Object.fromEntries(committed.map((e) => [e.file, e.disabled ?? null]));
const fresh = buildManifest(files, {}, prior); // no network: `disabled` carried from the committed file

// Same parser as .github/scripts/trigger-list-drift.test.mjs:27 — kept in lockstep on purpose.
function extractWorkflowList(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*workflows:\s*$/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*"(.+)"\s*$/);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

test("guard against a false pass — the workflow dir actually parsed", () => {
  assert.ok(files.length > 50, `only ${files.length} workflow files found — parser/path broken`);
  assert.ok(
    fresh.filter((e) => e.scheduled).length > 60,
    "fewer than 60 scheduled workflows parsed — the cron rule is broken",
  );
});

test(".github/_watch-manifest.json is up to date with .github/workflows/", () => {
  assert.deepEqual(fresh, committed, `watch manifest is stale. Regenerate: ${REGEN}`);
});

test("log-cron-incident.yml watches EVERY scheduled workflow (minus the watch-exempt set)", () => {
  const actual = extractWorkflowList(
    readFileSync(resolve(WF_DIR, "log-cron-incident.yml"), "utf8"),
  );
  assert.deepEqual(
    [...actual].sort(),
    loggerWatchNames(fresh),
    `logger trigger list drifted from the scheduled fleet. Regenerate: ${REGEN}`,
  );
});

test("heal-cron-failure.yml watches the logger's set minus Daily Brain Rebuild", () => {
  const actual = extractWorkflowList(
    readFileSync(resolve(WF_DIR, "heal-cron-failure.yml"), "utf8"),
  );
  assert.deepEqual(
    [...actual].sort(),
    healWatchNames(fresh),
    `healer trigger list drifted from the scheduled fleet. Regenerate: ${REGEN}`,
  );
});
