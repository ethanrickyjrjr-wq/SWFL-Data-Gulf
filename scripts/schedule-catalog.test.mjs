// Run: node scripts/schedule-catalog.test.mjs
// Tests the pure functions of the derived schedule view (spec 2026-07-20),
// plus a live repo sweep: every ACTIVE-cron workflow + vercel cron must be
// registered in ingest/cadence_registry.yaml. The sweep is acceptance
// criterion 1 made permanent.
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  cronLines,
  vercelCronRefs,
  jobsEntries,
  buildCatalog,
  gate10Snippet,
} from "./schedule-catalog.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

check("cronLines: quoted + unquoted extracted, commented-out excluded", () => {
  const yml = [
    "on:",
    "  schedule:",
    '    - cron: "23 4 * * *"',
    "    - cron: 0 11 * * 1",
    '    # - cron: "5 5 * * *"',
    "name: x",
  ].join("\n");
  assert.deepStrictEqual(cronLines(yml), ["23 4 * * *", "0 11 * * 1"]);
});

check("cronLines: no schedule → []", () => {
  assert.deepStrictEqual(cronLines("on:\n  workflow_dispatch:\n"), []);
});

check("vercelCronRefs: parses crons array; bad JSON → []", () => {
  const good = JSON.stringify({ crons: [{ path: "/api/mls/sync", schedule: "0 11 * * *" }] });
  assert.deepStrictEqual(vercelCronRefs(good), [
    { ref: "vercel.json#/api/mls/sync", cron: "0 11 * * *" },
  ]);
  assert.deepStrictEqual(vercelCronRefs("{nope"), []);
});

check("jobsEntries: fixed-shape parse, stops at next top-level key", () => {
  const reg = [
    "pipelines:",
    "  - name: some-ingest",
    "jobs:",
    "  - name: daily-rebuild",
    "    workflow: daily-rebuild.yml",
    "    purpose: Daily rebuild.",
    "  - name: mls-sync",
    "    workflow: vercel.json#/api/mls/sync",
    "    purpose: MLS sync.",
    "    scheduler: vercel",
    "zzz_after:",
    "  - name: not-a-job",
  ].join("\n");
  const jobs = jobsEntries(reg);
  assert.strictEqual(jobs.length, 2);
  assert.strictEqual(jobs[0].workflow, "daily-rebuild.yml");
  assert.strictEqual(jobs[1].scheduler, "vercel");
});

check("buildCatalog: unregistered detection + jobs metadata attach", () => {
  const registryText = [
    "pipelines:",
    "  - name: redfin",
    "    workflow: redfin-monthly.yml",
    "jobs:",
    "  - name: daily-rebuild",
    "    workflow: daily-rebuild.yml",
    "    purpose: Daily rebuild.",
  ].join("\n");
  const workflows = [
    { file: "redfin-monthly.yml", text: '    - cron: "0 6 1 * *"' },
    { file: "daily-rebuild.yml", text: '    - cron: "0 5 * * *"' },
    { file: "rogue.yml", text: '    - cron: "0 0 * * *"' },
    { file: "dispatch-only.yml", text: "on:\n  workflow_dispatch:\n" },
  ];
  const vercelJsonText = JSON.stringify({
    crons: [{ path: "/api/unseen", schedule: "1 1 * * *" }],
  });
  const { rows, unregistered } = buildCatalog({ registryText, workflows, vercelJsonText });
  assert.deepStrictEqual(unregistered, ["rogue.yml", "vercel.json#/api/unseen"]);
  assert.strictEqual(rows.length, 4); // 3 cron workflows + 1 vercel; dispatch-only excluded
  const rebuild = rows.find((r) => r.ref === "daily-rebuild.yml");
  assert.strictEqual(rebuild.purpose, "Daily rebuild.");
  assert.strictEqual(rebuild.status, "live");
});

check("gate10Snippet: gha + vercel shapes", () => {
  assert.strictEqual(
    gate10Snippet("foo-bar.yml"),
    "  - name: foo-bar\n    workflow: foo-bar.yml\n    purpose: <one line — what this job does>",
  );
  assert.ok(gate10Snippet("vercel.json#/api/x/y").includes("scheduler: vercel"));
  assert.ok(gate10Snippet("vercel.json#/api/x/y").includes("name: api-x-y"));
});

check("REPO SWEEP: zero unregistered scheduled surfaces (acceptance 1)", () => {
  const root = process.cwd();
  const registryText = readFileSync(path.join(root, "ingest/cadence_registry.yaml"), "utf8");
  const wfDir = path.join(root, ".github", "workflows");
  const workflows = readdirSync(wfDir)
    .filter((f) => f.endsWith(".yml"))
    .map((file) => ({ file, text: readFileSync(path.join(wfDir, file), "utf8") }));
  const vercelJsonText = readFileSync(path.join(root, "vercel.json"), "utf8");
  const { unregistered } = buildCatalog({ registryText, workflows, vercelJsonText });
  assert.deepStrictEqual(unregistered, []);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
