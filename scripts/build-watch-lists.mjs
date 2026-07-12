#!/usr/bin/env node
// build-watch-lists.mjs — codegen the watch manifest + the two watcher YAML lists.
//
//   node scripts/build-watch-lists.mjs                     # --check (default): exit 1 on drift
//   node scripts/build-watch-lists.mjs --write             # rewrite .github/_watch-manifest.json
//   node scripts/build-watch-lists.mjs --write --with-state  # ... and refresh `disabled` from `gh api`
//   node scripts/build-watch-lists.mjs --write --write-watchers  # ... and regenerate both watcher YAMLs
//
// `on.workflow_run.workflows:` has NO glob support (live-verified 07/11/2026,
// 08g Fact 3) — the explicit name list is the only mechanism, so it is generated
// and drift-tested instead of hand-kept. 29 of 82 scheduled workflows were watched
// before this landed.
//
// The manifest carries NO timestamp on purpose: a `generated_at` field would make
// the drift test fail on every regeneration.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import {
  MANIFEST_PATH,
  buildManifest,
  assertManifestSane,
  loggerWatchNames,
  healWatchNames,
  rewriteWorkflowList,
  zombieCrons,
} from "./lib/watch-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const WF_DIR = path.join(ROOT, ".github", "workflows");
const MANIFEST = path.join(ROOT, MANIFEST_PATH);
const WATCHERS = [
  { file: path.join(WF_DIR, "log-cron-incident.yml"), names: loggerWatchNames },
  { file: path.join(WF_DIR, "heal-cron-failure.yml"), names: healWatchNames },
];

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const withState = argv.includes("--with-state");
const writeWatchers = argv.includes("--write-watchers");

function readWorkflows() {
  return readdirSync(WF_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((file) => ({ file, text: readFileSync(path.join(WF_DIR, file), "utf8") }));
}

function priorDisabled() {
  if (!existsSync(MANIFEST)) return {};
  const out = {};
  for (const e of JSON.parse(readFileSync(MANIFEST, "utf8"))) out[e.file] = e.disabled ?? null;
  return out;
}

// gh api returns { workflows: [{ path, state }] }. state ∈ active | disabled_manually | disabled_inactivity.
// Verified live 07/11/2026: 6 non-active, 4 of which still carry an uncommented cron.
function fetchStates() {
  const raw = execSync(
    'gh api "repos/:owner/:repo/actions/workflows?per_page=100" --paginate --jq ".workflows[] | [.path, .state] | @tsv"',
    { encoding: "utf8", env: process.env },
  );
  const out = {};
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    const [p, state] = line.split("\t");
    out[p] = state;
  }
  return out;
}

const files = readWorkflows();
const states = withState ? fetchStates() : {};
const manifest = buildManifest(files, states, priorDisabled());

const problems = assertManifestSane(manifest);
if (problems.length) {
  console.error("build-watch-lists: manifest is NOT sane —");
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

const json = JSON.stringify(manifest, null, 2) + "\n";
const logNames = loggerWatchNames(manifest);
const healNames = healWatchNames(manifest);

if (write) {
  writeFileSync(MANIFEST, json, "utf8");
  console.log(
    `wrote ${MANIFEST_PATH} — ${manifest.length} workflows, ${manifest.filter((e) => e.scheduled).length} scheduled, ${manifest.filter((e) => e.paid).length} paid`,
  );
  if (writeWatchers) {
    for (const w of WATCHERS) {
      const before = readFileSync(w.file, "utf8");
      const after = rewriteWorkflowList(before, w.names(manifest));
      if (before !== after) {
        writeFileSync(w.file, after, "utf8");
        console.log(
          `rewrote ${path.relative(ROOT, w.file)} -> ${w.names(manifest).length} watched`,
        );
      }
    }
  }
  const zombies = zombieCrons(manifest);
  for (const z of zombies) {
    console.log(
      `ZOMBIE_CRON — ${z.file} is disabled at the GitHub API but its cron is LIVE in source. ` +
        `A \`gh workflow enable\` resumes it instantly; the registry still expects fresh rows.`,
    );
  }
  process.exit(0);
}

// --check
const drift = [];
if (!existsSync(MANIFEST)) drift.push(`${MANIFEST_PATH} does not exist — run --write`);
else if (readFileSync(MANIFEST, "utf8") !== json)
  drift.push(`${MANIFEST_PATH} is stale — regenerate: node scripts/build-watch-lists.mjs --write`);

for (const w of WATCHERS) {
  const text = readFileSync(w.file, "utf8");
  if (text !== rewriteWorkflowList(text, w.names(manifest))) {
    drift.push(
      `${path.relative(ROOT, w.file)} \`workflows:\` list is stale — regenerate: node scripts/build-watch-lists.mjs --write --write-watchers`,
    );
  }
}

if (drift.length) {
  console.error("WATCH-LIST DRIFT:");
  for (const d of drift) console.error(`  • ${d}`);
  process.exit(1);
}
console.log(
  `watch lists in sync — ${manifest.length} workflows, ${logNames.length} watched by the logger, ${healNames.length} by the healer`,
);
