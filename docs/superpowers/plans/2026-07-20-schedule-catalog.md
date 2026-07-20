# Schedule Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 8 files, keywords: architecture

**Goal:** ONE catalog of everything that runs on a schedule — `jobs:` section in
`ingest/cadence_registry.yaml`, Gate 10 pre-push membership enforcement, and a derived
schedule view (`node scripts/schedule-catalog.mjs`).

**Architecture:** Authored membership (name/workflow/purpose, ~3 lines per entry) lives in the
existing cadence registry as a new top-level `jobs:` section; cron expressions are never
authored — a dependency-free script reads them live from `.github/workflows/*.yml` and
`vercel.json`. A new Gate 10 in the existing pre-push hook blocks any unregistered scheduled
surface with a paste-ready fix in the error text.

**Tech Stack:** plain Node .mjs (no new dependencies — package.json untouched), Python
(pytest, existing spine-test file), YAML (hand-authored section only).

**Spec:** `docs/superpowers/specs/2026-07-20-schedule-catalog-design.md` (operator-approved
07/20; Task 1 lands two factual corrections found during planning).

## Global Constraints

- **No new dependencies.** package.json is NOT touched (no yaml lib — Gate 1 lockfile risk,
  and the hook must import the parser under plain node). Parse with regex/line logic only.
- **No cron strings in the registry, ever.** Schedules are derived from workflow files +
  `vercel.json` at read time.
- **`jobs:` entry shape (fixed):** required `name`, `workflow`, `purpose`; optional
  `status:` (`disabled` | `parked`, default live) and `scheduler:` (`gha` | `vercel`,
  default gha). Workflow key is a `.yml` basename or `vercel.json#<path>`.
- **One entry per thing:** anything already under `pipelines:`/`not_yet_running:` gets NO
  `jobs:` entry (the 3 API-disabled workflows are already registered there — verified 07/20).
- **Fail-open hook discipline:** the new gate must never wedge a push on its own bug
  (mirror `unregisteredPipelineDirs` / `ingestHardeningGate` in the same file). Override
  env var: `ALLOW_UNREGISTERED_CRON=1`.
- **Active crons only for enforcement:** a `cron:` line only counts when it matches
  `^\s*-\s*cron:` (commented-out crons in parked workflows do not trigger the gate).
- **Commits:** explicit paths only (never `git add -A`). **NO PUSH in any task** — the
  operator approves the push at the end (per-push approval, never carried).
- **Bash tool syntax** for all commands below (POSIX; never PowerShell here-strings).

---

### Task 1: Spec corrections (gate number + disabled-trio + acceptance wording)

Planning probes found three factual errors in the approved spec. Fix them before code so
the spec stays the source of truth.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-schedule-catalog-design.md`

**Interfaces:**
- Consumes: nothing.
- Produces: corrected spec that Tasks 2–5 implement verbatim.

- [ ] **Step 1: Renumber Gate 6 → Gate 10.**

The hook `.claude/hooks/check-prepush-gate.mjs` already numbers gates 1–9 (Gate 6 =
BRAIN_GEO). Replace every `Gate 6` / `GATE 6` in the spec (title line, section heading
`### 2. Gate 6 —`, error-snippet example, acceptance item 2) with `Gate 10` / `GATE 10`.

- [ ] **Step 2: Correct the disabled-trio backfill claim.**

Replace the sentence
`Backfill in the same commit: all 24 unregistered GHA cron workflows + 2 Vercel crons + 3 disabled workflows (\`status: disabled\`).`
with:
`Backfill in the same commit: all 24 unregistered GHA cron workflows + 2 Vercel crons. (The 3 API-disabled workflows — corridor-pulse-weekly, dbpr-sirs-monthly, ingest-crexi-listings — already have pipelines:/not_yet_running: entries, verified 07/20; membership is satisfied and they get NO duplicate jobs: entries. Tripwire remains the live-state authority.)`
Also update the Claude-routines sentence to record the planning-time result:
`claude#<routine-name>` entries are `(checked via CronList 07/20 — none exist; the paused pulse schedules are GHA workflows already covered)`.

- [ ] **Step 3: Make acceptance count-agnostic.**

`grep -l "cron:"` (the source of "95") also counts commented-out crons. Replace acceptance
item 1 with:
`\`node scripts/schedule-catalog.mjs --check\` exits 0: every workflow with an ACTIVE \`- cron:\` line and every vercel.json cron is registered; zero unregistered.`

- [ ] **Step 4: Commit.**

```bash
git add docs/superpowers/specs/2026-07-20-schedule-catalog-design.md
git commit -m "docs(spec): schedule-catalog corrections — Gate 10, disabled-trio already registered, count-agnostic acceptance" -- docs/superpowers/specs/2026-07-20-schedule-catalog-design.md
```

---

### Task 2: `jobs:` section backfill + spine-test validation

**Files:**
- Modify: `ingest/cadence_registry.yaml` (append at end of file, after the `coverage_exempt:` block)
- Modify: `ingest/tests/test_cadence_registry_spine.py` (append new tests at end)

**Interfaces:**
- Consumes: nothing new. Existing consumers (`ingest/scripts/check_freshness.py`,
  `ingest/tools/lib/identity-model.mts` `loadRegistry`, spine test) select named top-level
  keys and ignore `jobs:` — verified 07/20 (`loadRegistry` returns only
  pipelines/not_yet_running/coverage_exempt; spine test uses `REG.get(...)`).
- Produces: `jobs:` — a top-level list of `{name, workflow, purpose, status?, scheduler?}`
  dicts that Task 3's `jobsEntries()` parses and Gate 10's membership text-check reads.

- [ ] **Step 1: Write the failing spine tests.**

Append to `ingest/tests/test_cadence_registry_spine.py` (self-contained — do not reuse the
file's private helpers):

```python
# ---------------------------------------------------------------------------
# jobs: — the schedule catalog (spec 2026-07-20-schedule-catalog-design.md).
# Non-ingest scheduled jobs: membership only (name/workflow/purpose), no cron
# strings (derived by scripts/schedule-catalog.mjs), no freshness fields.
# ---------------------------------------------------------------------------
_JOBS_WF_DIR = Path(__file__).resolve().parents[2] / ".github" / "workflows"


def _jobs():
    return [e for e in (REG.get("jobs") or []) if isinstance(e, dict)]


def test_jobs_section_exists_and_is_well_formed():
    jobs = _jobs()
    assert jobs, "top-level `jobs:` list is missing (schedule catalog)"
    names = [j.get("name") for j in jobs]
    assert len(names) == len(set(names)), f"duplicate jobs names: {names}"
    for j in jobs:
        assert j.get("name"), f"jobs entry needs name: {j!r}"
        assert j.get("workflow"), f"{j.get('name')}: jobs entry needs workflow:"
        assert j.get("purpose"), f"{j.get('name')}: jobs entry needs purpose:"
        wf = str(j["workflow"])
        assert wf.endswith(".yml") or wf.startswith("vercel.json#"), (
            f"{j['name']}: workflow must be a .yml basename or vercel.json#<path>: {wf}"
        )
        if j.get("status") is not None:
            assert j["status"] in ("disabled", "parked"), f"{j['name']}: bad status"
        if j.get("scheduler") is not None:
            assert j["scheduler"] in ("gha", "vercel"), f"{j['name']}: bad scheduler"
        forbidden = {"cron", "cadence_days", "lane", "freshness_sla"} & set(j)
        assert not forbidden, f"{j['name']}: derived/ingest fields forbidden in jobs: {forbidden}"


def test_jobs_workflows_exist_and_are_not_double_registered():
    already = set()
    for section in ("pipelines", "not_yet_running"):
        for e in REG.get(section) or []:
            if isinstance(e, dict) and e.get("workflow"):
                already.add(e["workflow"])
    for j in _jobs():
        wf = str(j["workflow"])
        if wf.startswith("vercel.json#"):
            continue
        assert (_JOBS_WF_DIR / wf).exists(), f"{j['name']}: .github/workflows/{wf} missing"
        assert wf not in already, (
            f"{j['name']}: {wf} already under pipelines:/not_yet_running: — one entry per thing"
        )
```

(If the file does not already import `Path`, add `from pathlib import Path` to its imports.)

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `python -m pytest ingest/tests/test_cadence_registry_spine.py -k jobs -v`
(if pytest is not on PATH, use the ingest venv's python per `ingest/CLAUDE.md` conventions).
Expected: both new tests FAIL with "top-level `jobs:` list is missing".

- [ ] **Step 3: Append the `jobs:` section to `ingest/cadence_registry.yaml`.**

Append at end of file. Purposes below were written from each workflow's own `name:` field
(probed 07/20) — before committing, open any workflow whose purpose you can't confirm from
its `name:` and steps, and correct the line.

```yaml

# ─────────────────────────────────────────────────────────────────────────────
# jobs: — the schedule catalog for NON-INGEST scheduled jobs (spec
# docs/superpowers/specs/2026-07-20-schedule-catalog-design.md).
# Membership only: name + workflow + one-line purpose (+ optional status/
# scheduler). NO cron strings — schedules are derived live by
# scripts/schedule-catalog.mjs from the workflow files + vercel.json. NO
# freshness/lane fields — ingest SOURCES stay under pipelines:/not_yet_running:
# (one entry per thing). Gate 10 (.claude/hooks/check-prepush-gate.mjs) blocks
# any push that ships a scheduled workflow with no entry in this file.
# ─────────────────────────────────────────────────────────────────────────────
jobs:
  - name: daily-rebuild
    workflow: daily-rebuild.yml
    purpose: Daily Brain Rebuild — refinery DAG rebuild of stale brains.
  - name: chief-of-staff-nightly
    workflow: chief-of-staff-nightly.yml
    purpose: Nightly chief-of-staff triage run.
  - name: email-scheduler
    workflow: email-scheduler.yml
    purpose: Sends due scheduled emails.
  - name: social-scheduler
    workflow: social-scheduler.yml
    purpose: Publishes due scheduled social posts.
  - name: tripwire-hourly
    workflow: tripwire-hourly.yml
    purpose: Hourly tripwire scan — spend, dispatches, guard-file state.
  - name: narrative-bake
    workflow: narrative-bake.yml
    purpose: Bakes narrative surfaces behind the no-invention validator.
  - name: freshness-probe-daily
    workflow: freshness-probe-daily.yml
    purpose: Daily freshness probe over this registry's pipelines entries.
  - name: watch-scan-daily
    workflow: watch-scan-daily.yml
    purpose: Property Watch scan (daily).
  - name: watch-digest-daily
    workflow: watch-digest-daily.yml
    purpose: Property Watch digest send (daily).
  - name: outreach-drip
    workflow: outreach-drip.yml
    purpose: Outreach drip cadence.
  - name: outreach-demo
    workflow: outreach-demo.yml
    purpose: Outreach demo-account cadence (fictional demo account only).
  - name: airtable-checks-sync
    workflow: airtable-checks-sync.yml
    purpose: Syncs the checks ledger to Airtable.
  - name: build-example-deliverables
    workflow: build-example-deliverables.yml
    purpose: Rebuilds the example deliverables set.
  - name: data-readiness-cron
    workflow: data-readiness-cron.yml
    purpose: Daily data-readiness verification.
  - name: data-targets-daily
    workflow: data-targets-daily.yml
    purpose: Daily data-targets refresh.
  - name: gate-a-parity
    workflow: gate-a-parity.yml
    purpose: GATE A DB parity — zhvi/zori view vs pack (scheduled CI check).
  - name: graphify-republish
    workflow: graphify-republish.yml
    purpose: Republishes the graphify code graph.
  - name: home-values-investor-monthly
    workflow: home-values-investor-monthly.yml
    purpose: Home-Values + Investor Composite monthly build (ingest-flavored; promotion to pipelines with freshness fields tracked in checks).
  - name: lifecycle-nudges-daily
    workflow: lifecycle-nudges-daily.yml
    purpose: Daily lifecycle-arc nudges.
  - name: notion-sync-weekly
    workflow: notion-sync-weekly.yml
    purpose: Weekly Notion sync.
  - name: reverify-signals-daily
    workflow: reverify-signals-daily.yml
    purpose: Re-verifies closed-check signals (daily).
  - name: social-engagement-poll
    workflow: social-engagement-poll.yml
    purpose: Polls social engagement metrics.
  - name: social-pulse-scan
    workflow: social-pulse-scan.yml
    purpose: Social pulse scan.
  - name: weekly-read
    workflow: weekly-read.yml
    purpose: Market-area alerts weekly cadence.
  - name: mls-sync
    workflow: vercel.json#/api/mls/sync
    purpose: Daily MLS listing sync endpoint.
    scheduler: vercel
  - name: nightly-chain-dispatch
    workflow: vercel.json#/api/cron/nightly-chain-dispatch
    purpose: Vercel cron that dispatches the GHA nightly chain.
    scheduler: vercel
```

- [ ] **Step 4: Run the new tests to verify they pass, then the FULL spine suite + both
  registry consumers.**

```bash
python -m pytest ingest/tests/test_cadence_registry_spine.py -v
bun ingest/tools/check-registry-identity.mts --static
```

Expected: all spine tests PASS (pre-existing ones prove `jobs:` broke nothing);
identity tool prints `registry-identity: OK [static] — …` (its `loadRegistry` reads only
pipelines/not_yet_running/coverage_exempt, so `jobs:` is invisible to it).

- [ ] **Step 5: Commit.**

```bash
git add ingest/cadence_registry.yaml ingest/tests/test_cadence_registry_spine.py
git commit -m "feat(schedule-catalog): jobs: section — 24 GHA jobs + 2 Vercel crons registered, spine-validated" -- ingest/cadence_registry.yaml ingest/tests/test_cadence_registry_spine.py
```

Note: this push will itself trip Gate 7 (registry touched) — Step 4's identity run is the
local proof it passes.

---

### Task 3: `scripts/schedule-catalog.mjs` — derived schedule view + tests

**Files:**
- Create: `scripts/schedule-catalog.mjs`
- Create: `scripts/schedule-catalog.test.mjs`

**Interfaces:**
- Consumes: `ingest/cadence_registry.yaml` (text), `.github/workflows/*.yml` (text),
  `vercel.json` (JSON).
- Produces (exports, imported nowhere yet but mirrored inline by Gate 10 in Task 4):
  `cronLines(yamlText) → string[]` · `vercelCronRefs(jsonText) → {ref, cron}[]` ·
  `jobsEntries(registryText) → {name, workflow, purpose?, status?, scheduler?}[]` ·
  `buildCatalog({registryText, workflows: {file, text}[], vercelJsonText}) → {rows, unregistered}` ·
  `gate10Snippet(ref) → string`.
  CLI: `node scripts/schedule-catalog.mjs` (JSON to stdout) · `--check` (exit 1 + snippets
  when anything is unregistered).

- [ ] **Step 1: Write the failing test file.**

Create `scripts/schedule-catalog.test.mjs` (node:assert self-runner — same style as
`.claude/hooks/push-context.test.mjs`; no bun/vitest):

```js
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
```

- [ ] **Step 2: Run to verify it fails.**

Run: `node scripts/schedule-catalog.test.mjs`
Expected: FAIL — `Cannot find module './schedule-catalog.mjs'`.

- [ ] **Step 3: Write the implementation.**

Create `scripts/schedule-catalog.mjs`:

```js
#!/usr/bin/env node
// Schedule catalog — ONE derived view of everything that runs on a schedule
// (spec docs/superpowers/specs/2026-07-20-schedule-catalog-design.md).
// Authored membership lives in ingest/cadence_registry.yaml (pipelines:/
// not_yet_running:/jobs:); cron expressions are NEVER authored there — this
// script reads them live from .github/workflows/*.yml and vercel.json, so the
// reported schedule cannot drift from what is actually configured.
//
//   node scripts/schedule-catalog.mjs           # full catalog JSON to stdout
//   node scripts/schedule-catalog.mjs --check   # exit 1 + fix snippets if anything is unregistered
//
// Dependency-free on purpose: Gate 10 in .claude/hooks/check-prepush-gate.mjs
// mirrors the cron-detection + snippet logic inline (hooks read committed
// state via `git show HEAD:`, this script reads the working tree — the test
// file pins both shapes).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Active `- cron:` expressions in a workflow YAML (commented-out lines excluded). */
export function cronLines(workflowYaml) {
  const out = [];
  for (const line of String(workflowYaml).split(/\r?\n/)) {
    const m = /^\s*-\s*cron:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** vercel.json crons as registry refs: { ref: "vercel.json#<path>", cron }. */
export function vercelCronRefs(vercelJsonText) {
  try {
    const crons = JSON.parse(vercelJsonText)?.crons ?? [];
    return crons
      .filter((c) => c?.path && c?.schedule)
      .map((c) => ({ ref: `vercel.json#${c.path}`, cron: c.schedule }));
  } catch {
    return [];
  }
}

/**
 * Line-oriented parse of the registry's `jobs:` section. The shape is fixed
 * (2-space list items, 4-space fields — spec 2026-07-20), which is what lets
 * this stay dependency-free; full YAML validation lives in
 * ingest/tests/test_cadence_registry_spine.py.
 */
export function jobsEntries(registryText) {
  const lines = String(registryText).split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start === -1) return [];
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^[a-z_]+:/.test(l)) break; // next top-level key
    let m = /^  - name:\s*(\S+)/.exec(l);
    if (m) {
      entries.push({ name: m[1] });
      continue;
    }
    m = /^    (workflow|purpose|status|scheduler):\s*(.+?)\s*$/.exec(l);
    if (m && entries.length > 0) entries[entries.length - 1][m[1]] = m[2];
  }
  return entries;
}

/**
 * Merge authored membership with live schedules. Membership is text-presence
 * of the ref anywhere in the registry (same contract as the hook's
 * unregisteredPipelineDirs), so pipelines:/not_yet_running: entries count.
 */
export function buildCatalog({ registryText, workflows, vercelJsonText }) {
  const rows = [];
  const unregistered = [];
  for (const wf of workflows) {
    const crons = cronLines(wf.text);
    if (crons.length === 0) continue; // dispatch-/CI-only — not a scheduled surface
    const registered = String(registryText).includes(wf.file);
    if (!registered) unregistered.push(wf.file);
    rows.push({ ref: wf.file, scheduler: "gha", cron: crons, registered });
  }
  for (const v of vercelCronRefs(vercelJsonText)) {
    const registered = String(registryText).includes(v.ref);
    if (!registered) unregistered.push(v.ref);
    rows.push({ ref: v.ref, scheduler: "vercel", cron: [v.cron], registered });
  }
  const byRef = new Map(jobsEntries(registryText).map((j) => [j.workflow, j]));
  for (const r of rows) {
    const j = byRef.get(r.ref);
    if (j) {
      r.name = j.name;
      if (j.purpose) r.purpose = j.purpose;
      r.status = j.status ?? "live";
    }
  }
  return { rows, unregistered };
}

/** Paste-ready jobs: entry for an unregistered ref (also mirrored in Gate 10). */
export function gate10Snippet(ref) {
  const isVercel = ref.startsWith("vercel.json#");
  const name = isVercel
    ? ref
        .slice("vercel.json#".length)
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : ref.replace(/\.yml$/, "");
  return (
    `  - name: ${name}\n` +
    `    workflow: ${ref}\n` +
    `    purpose: <one line — what this job does>` +
    (isVercel ? `\n    scheduler: vercel` : ``)
  );
}

// ---- CLI --------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const registryText = readFileSync(path.join(root, "ingest", "cadence_registry.yaml"), "utf8");
  const wfDir = path.join(root, ".github", "workflows");
  const workflows = readdirSync(wfDir)
    .filter((f) => f.endsWith(".yml"))
    .map((file) => ({ file, text: readFileSync(path.join(wfDir, file), "utf8") }));
  let vercelJsonText = "{}";
  try {
    vercelJsonText = readFileSync(path.join(root, "vercel.json"), "utf8");
  } catch {
    // no vercel.json — GHA-only catalog
  }
  const catalog = buildCatalog({ registryText, workflows, vercelJsonText });
  if (process.argv.includes("--check")) {
    if (catalog.unregistered.length > 0) {
      console.error(`schedule-catalog: ${catalog.unregistered.length} unregistered scheduled surface(s):\n`);
      for (const ref of catalog.unregistered) {
        console.error(`  - ${ref}\n${gate10Snippet(ref)}\n`);
      }
      process.exit(1);
    }
    console.log(
      `schedule-catalog: OK — ${catalog.rows.length} scheduled surfaces, all registered.`,
    );
    process.exit(0);
  }
  console.log(JSON.stringify(catalog, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass.**

```bash
node scripts/schedule-catalog.test.mjs
node scripts/schedule-catalog.mjs --check
```

Expected: `7 passed, 0 failed` (repo sweep passes because Task 2 backfilled) and
`schedule-catalog: OK — <N> scheduled surfaces, all registered.`

- [ ] **Step 5: Commit.**

```bash
git add scripts/schedule-catalog.mjs scripts/schedule-catalog.test.mjs
git commit -m "feat(schedule-catalog): derived schedule view — live crons merged with registry membership" -- scripts/schedule-catalog.mjs scripts/schedule-catalog.test.mjs
```

---

### Task 4: Gate 10 in the pre-push hook + live-fire verification

**Files:**
- Modify: `.claude/hooks/check-prepush-gate.mjs` (header comment roster ~line 27; new gate
  call after the Gate 7 block ~line 325; two new functions at end of file)

**Interfaces:**
- Consumes: `changed` (the hook's existing base..HEAD file list), `sh()`, `block()` — all
  already in the file. Reads committed state via `git show HEAD:` only.
- Produces: Gate 10 — blocks a push shipping an active-cron workflow or vercel cron with no
  registry mention; prints paste-ready `jobs:` snippets; `ALLOW_UNREGISTERED_CRON=1` escape.

- [ ] **Step 1: Add the roster line to the header comment.**

After the Gate 7 header lines (`//   7. REGISTRY IDENTITY — …`), add:

```js
//  10. SCHEDULE CATALOG — an ACTIVE-cron workflow (or vercel.json cron) with no
//                  cadence_registry.yaml entry. ONE catalog of everything
//                  scheduled (spec 2026-07-20); the error prints a paste-ready
//                  jobs: snippet so the fix never requires reading the registry.
```

- [ ] **Step 2: Add the gate call.**

Immediately after the Gate 7 `if (identityTouched) { … }` block closes (before the Gate 8
comment), insert:

```js
  // ---- Gate 10: schedule-catalog membership (spec 2026-07-20) ---------------
  // ONE catalog: every scheduled surface (active-cron GHA workflow, vercel.json
  // cron) is registered in ingest/cadence_registry.yaml — pipelines:/
  // not_yet_running:/jobs: all count (text-presence, same contract as
  // unregisteredPipelineDirs). Both sides read HEAD, so registering in the SAME
  // commit passes. scripts/schedule-catalog.mjs is the working-tree twin
  // (full-repo sweep + JSON view); its test file pins both shapes.
  scheduleCatalogGate(changed);
```

- [ ] **Step 3: Add the two functions at end of file.**

```js
// Gate 10 body. Only touched files are checked (the full-repo sweep lives in
// scripts/schedule-catalog.test.mjs "REPO SWEEP"). Commented-out crons do not
// count — a parked workflow with its cron commented is dispatch-only. Fails
// OPEN on any internal error; block() exits, so the catch never swallows it.
function scheduleCatalogGate(changed) {
  try {
    if (process.env.ALLOW_UNREGISTERED_CRON === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_UNREGISTERED_CRON=1 — pushing an\n` +
          `unregistered scheduled workflow anyway (logged).\n`,
      );
      return;
    }
    let registry;
    try {
      registry = sh("git show HEAD:ingest/cadence_registry.yaml");
    } catch {
      return; // no registry at HEAD — fail open
    }
    const missing = [];
    for (const f of changed) {
      const wf = /^\.github\/workflows\/([^/]+\.yml)$/.exec(f);
      if (wf) {
        let src;
        try {
          src = sh(`git show HEAD:${f}`);
        } catch {
          continue; // deleted at HEAD — nothing scheduled to register
        }
        if (!/^\s*-\s*cron:/m.test(src)) continue; // no ACTIVE cron
        if (!registry.includes(wf[1])) missing.push(wf[1]);
      }
      if (f === "vercel.json") {
        let vercel;
        try {
          vercel = JSON.parse(sh("git show HEAD:vercel.json"));
        } catch {
          continue; // gone/unparseable at HEAD — fail open for this file
        }
        for (const c of vercel?.crons ?? []) {
          if (!c?.path) continue;
          const ref = `vercel.json#${c.path}`;
          if (!registry.includes(ref)) missing.push(ref);
        }
      }
    }
    if (missing.length === 0) return;
    block(
      "SCHEDULE CATALOG — a scheduled workflow has no cadence_registry entry (Gate 10)",
      `ONE catalog: everything that runs on a schedule is registered in\n` +
        `ingest/cadence_registry.yaml (spec 2026-07-20-schedule-catalog-design.md).\n` +
        `These scheduled surfaces are about to ship unregistered:\n\n` +
        missing.map((ref) => `  - ${ref}`).join("\n") +
        `\n\nFix: paste this under \`jobs:\` at the BOTTOM of ingest/cadence_registry.yaml,\n` +
        `fill the purpose line from the workflow's own \`name:\` field, commit it in\n` +
        `THIS push, then retry:\n\n` +
        missing.map((ref) => gate10SnippetInline(ref)).join("\n") +
        `\n\n(An ingest SOURCE belongs under pipelines:/not_yet_running: instead — register\n` +
        `it there with lane/cadence so the freshness probe covers it.)\n` +
        `Operator escape for a legitimate one-off: ALLOW_UNREGISTERED_CRON=1.`,
    );
  } catch {
    // never wedge a push on a guard bug — fail open
  }
}

// Inline twin of scripts/schedule-catalog.mjs gate10Snippet (hooks stay
// self-contained; the script's test file pins this exact shape).
function gate10SnippetInline(ref) {
  const isVercel = ref.startsWith("vercel.json#");
  const name = isVercel
    ? ref
        .slice("vercel.json#".length)
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : ref.replace(/\.yml$/, "");
  return (
    `  - name: ${name}\n` +
    `    workflow: ${ref}\n` +
    `    purpose: <one line — what this job does>` +
    (isVercel ? `\n    scheduler: vercel` : ``)
  );
}
```

- [ ] **Step 4: Live-fire the gate (block case, then pass case). No push involved.**

The hook reads stdin JSON and inspects base..HEAD, so exercise it with a scratch commit:

```bash
printf 'name: zz gate10 test\non:\n  schedule:\n    - cron: "0 0 1 1 *"\njobs:\n  noop:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "true"\n' > .github/workflows/zz-gate10-test.yml
git add .github/workflows/zz-gate10-test.yml
git commit -m "test: gate10 scratch (will be reset)" -- .github/workflows/zz-gate10-test.yml
echo '{"tool_input":{"command":"git push"}}' | node .claude/hooks/check-prepush-gate.mjs; echo "exit=$?"
```

Expected: `PUSH BLOCKED — SCHEDULE CATALOG …` including the snippet
`- name: zz-gate10-test`, `exit=2`.

Pass case — append the printed snippet (with a real purpose line) to the registry, amend,
re-run:

```bash
printf '  - name: zz-gate10-test\n    workflow: zz-gate10-test.yml\n    purpose: Gate 10 live-fire scratch.\n' >> ingest/cadence_registry.yaml
git add ingest/cadence_registry.yaml
git commit --amend --no-edit -- .github/workflows/zz-gate10-test.yml ingest/cadence_registry.yaml
echo '{"tool_input":{"command":"git push"}}' | node .claude/hooks/check-prepush-gate.mjs; echo "exit=$?"
```

Expected: no SCHEDULE CATALOG block, `exit=0` (other gates may print advisory notes).
CAUTION — amend safety: this amends the scratch commit created seconds earlier; first
verify `git log --oneline -1` still shows `test: gate10 scratch` (parallel sessions share
this checkout — if the top commit is not the scratch commit, STOP and remove the scratch
files with a new commit instead).

- [ ] **Step 5: Remove the scratch commit, verify clean.**

```bash
git log --oneline -1   # MUST show "test: gate10 scratch" — if not, STOP (parallel session landed a commit)
git reset --hard HEAD~1
git status --short     # expect: clean (plus any pre-existing untracked files)
node scripts/schedule-catalog.mjs --check   # expect: OK
```

- [ ] **Step 6: Commit the hook change.**

```bash
git add .claude/hooks/check-prepush-gate.mjs
git commit -m "feat(schedule-catalog): Gate 10 — unregistered scheduled workflow blocks push with paste-ready fix" -- .claude/hooks/check-prepush-gate.mjs
```

---

### Task 5: Reference line, checks, SESSION_LOG — then STOP for operator push approval

**Files:**
- Modify: `CLAUDE.md` (Reference index table)
- Modify: `SESSION_LOG.md` (new top entry)

**Interfaces:**
- Consumes: everything above, complete and locally green.
- Produces: the discoverability line + the two deferral checks + the pre-push log entry.
  NO PUSH — ends by showing the operator the commit list and asking.

- [ ] **Step 1: Add one line to the CLAUDE.md Reference index table** (after the
  "Cadence registry" row):

```markdown
| Schedule catalog (what runs when) | `ingest/cadence_registry.yaml` `jobs:` section + `node scripts/schedule-catalog.mjs` (Gate 10 enforces membership) |
```

- [ ] **Step 2: Open the two deferral checks (RULE 2.4 — no silent deferrals).**

```bash
node scripts/check.mjs open brain-platform schedule_catalog_ops_page "Ops site page renders the derived schedule catalog JSON (deferred at build; spec 2026-07-20)"
node scripts/check.mjs open brain-platform home_values_investor_registry_promotion "home-values-investor-monthly sits in jobs: — promote to pipelines: with lane/cadence so the freshness probe covers it"
```

(If `brain-platform` is not the project token existing checks use, run
`node scripts/check.mjs list` first and match theirs.)

- [ ] **Step 3: Final acceptance sweep (all four spec criteria).**

```bash
node scripts/schedule-catalog.mjs --check                      # criterion 1: OK, zero unregistered
node scripts/schedule-catalog.test.mjs                          # pins criterion 1 permanently
python -m pytest ingest/tests/test_cadence_registry_spine.py -v # criterion 3: registry consumers green
bun ingest/tools/check-registry-identity.mts --static           # criterion 3: Gate 7 tool green
```

Criterion 2 (block + pass live-fire) was proven in Task 4 Step 4. Criterion 4 (clean tree
silent) is Task 4 Step 5's final hook run on an untouched tree — re-run if in doubt:
`echo '{"tool_input":{"command":"git push"}}' | node .claude/hooks/check-prepush-gate.mjs`
→ exit 0, no SCHEDULE CATALOG output. `bunx next build` is NOT run: no app/ or lib/ code
is touched by this build (yaml + python test + scripts + hook + docs only).

- [ ] **Step 4: SESSION_LOG entry (top of file) + commit docs.**

```markdown
## 2026-07-20 (Fable 5 · main) — Schedule catalog: ONE catalog of everything scheduled

Operator: "one catalog would be nice." jobs: section added to ingest/cadence_registry.yaml
(24 GHA jobs + 2 Vercel crons backfilled; 3 API-disabled workflows already registered under
pipelines:/not_yet_running:); Gate 10 in check-prepush-gate.mjs blocks any unregistered
active-cron workflow with a paste-ready fix in the error; scripts/schedule-catalog.mjs
derives live schedules (no cron strings authored). Verified: spine pytest green, identity
--static OK, gate live-fired both ways (block exit=2 with snippet / registered exit=0),
--check reports zero unregistered. Deferred with checks: ops page render, home-values
pipelines: promotion. Spec: docs/superpowers/specs/2026-07-20-schedule-catalog-design.md.
```

```bash
git add CLAUDE.md SESSION_LOG.md
git commit -m "docs(schedule-catalog): reference-index line + SESSION_LOG entry" -- CLAUDE.md SESSION_LOG.md
```

- [ ] **Step 5: STOP — show the operator the result and ASK about the push.**

Show `git log --oneline origin/main..HEAD`. Do NOT push, do NOT run safe-push — pushing
requires the operator's explicit yes for THIS push (approval is per-push, never carried).
After an approved push lands and the sweep re-runs green on main, close the build check:
`node scripts/check.mjs close schedule_catalog_live_verify`.
