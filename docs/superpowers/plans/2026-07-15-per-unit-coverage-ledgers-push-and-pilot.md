# Per-Unit Coverage Ledgers — Push Mechanism + Deliverables Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 11 files, keywords: migration, architecture

**Goal:** Make two facts push into a session automatically instead of requiring someone to
remember to go look them up: (1) a touched ingest pipeline's PULLED/AVAILABLE scope
(`cadence_registry.yaml`'s `source_scope`, already rendered at `/ops/census` but never surfaced
locally), and (2) a touched deliverable recipe's Enforced/Unenforced landmine ledger, gated so an
"Enforced" claim can never silently rot (the gate blocks a push if the claim's named test no
longer exists or no longer contains the claimed string).

**Architecture:** One new PostToolUse hook (`Edit|Write` matcher, same matcher `check-odd-surface.mjs`
and `annotate-plan.mjs` already use) reads `tool_input.file_path` and returns
`hookSpecificOutput.additionalContext` — verified live against the vendor docs
(`code.claude.com/docs/en/hooks`, "Add context for Claude": PostToolUse's `additionalContext` is
inserted "next to the tool result" and Claude reads it on the next model request). Two independent,
pure detectors feed it: a pipeline-scope reader (text-slices `cadence_registry.yaml`, mirroring
`check-prepush-gate.mjs`'s own existing non-full-parse convention for this file) and a ledger reader
(parses a unit's `.ledger.md`). A new Gate 9 in `check-prepush-gate.mjs` reuses the same ledger
parser to block an orphaned "Enforced" claim (named test file/string that no longer exists) or a
real test failure.

**Tech Stack:** Node.js (`.mjs`, hook runtime — no Bun dependency; see Task 2 note), TypeScript/`bun:test`
(recipe code + tests, unchanged), Markdown (ledger files).

## Global Constraints

- Hooks in this repo run via `node`, never `bun` (every entry in `.claude/settings.json`'s `hooks`
  block invokes `node .claude/hooks/...`). Do not introduce a `bun`-only API (e.g. `Bun.YAML.parse`)
  into a hook's own interpreter — a hook that fails to start is worse than a hook that fails open.
- Every new hook/parser must **fail open**: any internal error → silent `exit 0` / return `[]`,
  matching every existing hook in this file (`check-odd-surface.mjs`, `check-prepush-gate.mjs`).
  A broken nudge must never wedge a push or a prompt.
- Gate 9 blocks ONLY on: (a) an Enforced claim naming a test file that doesn't exist at HEAD, (b)
  an Enforced claim naming a test string no longer found in that file at HEAD, (c) a named test
  file that fails when run. It never blocks on the Unenforced list changing (spec §4, non-negotiable).
- No new npm/bun dependency. `js-yaml` is NOT installed (verified: no `"yaml"`/`"js-yaml"` entry in
  `package.json`) and this plan does not add one — see Task 2.
- Ledger content must be **grep-verified against HEAD at write time**, not transcribed from the
  spec's summary table. The spec's own table was checked in 2 of 9 places this session; both held,
  but the other 7 were NOT independently re-verified — Task 7 verifies all 12 before writing.
- `docs/standards/deliverable-playbook.md` Part 9 ("Landmines") is **NOT** migrated — see Task 8.
  On inspection all 6 current entries are cross-cutting process/infra landmines (ESLint flags,
  `mock.module` behavior, shared git index), not recipe-specific. Only Part 6 migrates. This
  corrects the spec's own §7 claim ("the relevant Part 9 items get extracted").
- Scope: this plan covers spec Rollout Steps 1 and 2 only (inject-focus/census push +
  deliverables pilot). Step 3 (48 brain packs) is explicitly out of scope per the spec's own
  Rollout order — do not start it here.

---

### Task 0: Register the build

**Files:** none (registry command only)

- [ ] **Step 1: Register**

Run: `node scripts/new-build.mjs per-unit-coverage-ledgers "Per-unit coverage ledgers — push mechanism + deliverables pilot"`

Expected: creates a spec stub under `docs/superpowers/specs/` (this plan already has its full spec
at `docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md` — link it from the
generated stub rather than duplicating) and opens `per-unit-coverage-ledgers_live_verify` in
`checks`.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/ _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "chore: register per-unit-coverage-ledgers build"
```

---

### Task 1: `ledger-parse.mjs` — pure ledger parser + orphan detection

**Files:**
- Create: `.claude/hooks/lib/ledger-parse.mjs`
- Test: `.claude/hooks/lib/ledger-parse.test.mjs`

**Interfaces:**
- Produces: `parseLedger(markdown: string): { enforced: Array<{claim: string, testFile: string, testString: string}>, unenforced: string[] }`
- Produces: `findOrphanedClaims(enforced: Array<{claim,testFile,testString}>, opts: {readFile: (path: string) => string}): Array<{claim, testFile, testString, reason: "missing-file" | "missing-string"}>`
- Consumed by: Task 4 (hook formatter), Task 5 (Gate 9)

- [ ] **Step 1: Write the failing tests**

```js
// .claude/hooks/lib/ledger-parse.test.mjs
// Run: node .claude/hooks/lib/ledger-parse.test.mjs
import assert from "node:assert";
import { parseLedger, findOrphanedClaims } from "./ledger-parse.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    pass++;
  } catch (e) {
    console.log("  FAIL  " + name + " — " + e.message);
    fail++;
  }
}

const SAMPLE = `## Enforced
- Claim: reduced_amount is the SIZE OF THE CUT, not the old price
  Test: lib/deliverable/recipes/price-reduced.test.ts > "previous price = current + cut"
- Claim: the street address never leaks
  Test: lib/deliverable/recipes/coming-soon.test.ts > "the street address never ships"

## Unenforced (prose only — no test catches this yet)
- new-listing's "no chart" framing is guidance, not test-checked
`;

check("parseLedger reads every Enforced claim + its test file + test string", () => {
  const { enforced } = parseLedger(SAMPLE);
  assert.equal(enforced.length, 2);
  assert.equal(enforced[0].claim, "reduced_amount is the SIZE OF THE CUT, not the old price");
  assert.equal(enforced[0].testFile, "lib/deliverable/recipes/price-reduced.test.ts");
  assert.equal(enforced[0].testString, "previous price = current + cut");
});

check("parseLedger reads every Unenforced bullet as plain text", () => {
  const { unenforced } = parseLedger(SAMPLE);
  assert.equal(unenforced.length, 1);
  assert.match(unenforced[0], /no chart. framing is guidance/);
});

check("parseLedger on an empty/missing Unenforced section returns []", () => {
  const { unenforced } = parseLedger("## Enforced\n- Claim: x\n  Test: a.ts > \"y\"\n");
  assert.deepEqual(unenforced, []);
});

check("findOrphanedClaims flags a test file that no longer exists", () => {
  const enforced = [{ claim: "x", testFile: "gone.test.ts", testString: "y" }];
  const orphans = findOrphanedClaims(enforced, {
    readFile: () => {
      throw new Error("ENOENT");
    },
  });
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].reason, "missing-file");
});

check("findOrphanedClaims flags a test string no longer present in the file", () => {
  const enforced = [{ claim: "x", testFile: "a.test.ts", testString: "the old string" }];
  const orphans = findOrphanedClaims(enforced, {
    readFile: () => 'test("a different string", () => {});',
  });
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].reason, "missing-string");
});

check("findOrphanedClaims passes a claim whose string is present verbatim", () => {
  const enforced = [{ claim: "x", testFile: "a.test.ts", testString: "the real string" }];
  const orphans = findOrphanedClaims(enforced, {
    readFile: () => 'test("the real string", () => {});',
  });
  assert.equal(orphans.length, 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node .claude/hooks/lib/ledger-parse.test.mjs`
Expected: `Cannot find module './ledger-parse.mjs'` (module doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```js
// .claude/hooks/lib/ledger-parse.mjs
// Pure parser for a unit's `.ledger.md` — two required sections only, per
// docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md §2.
// No fs/network here — every function takes text/callbacks so both the
// push hook (Task 4) and Gate 9 (Task 5) can unit-test their callers without
// a real filesystem or `git show`.

const ENFORCED_HDR = /^##\s*Enforced\s*$/m;
const UNENFORCED_HDR = /^##\s*Unenforced\b/m;
const CLAIM_RE = /^-\s*Claim:\s*(.+)$/;
const TEST_RE = /^\s*Test:\s*(.+?)\s*>\s*"(.+)"\s*$/;

/** Split `.ledger.md` markdown into its two sections. Never throws — a
 *  malformed file just yields empty arrays (fail open; Gate 9 treats an
 *  empty Enforced list as "nothing to check", not an error). */
export function parseLedger(markdown) {
  const text = String(markdown ?? "");
  const enforced = [];
  const unenforced = [];

  const enforcedStart = text.search(ENFORCED_HDR);
  const unenforcedStart = text.search(UNENFORCED_HDR);
  if (enforcedStart !== -1) {
    const end = unenforcedStart !== -1 ? unenforcedStart : text.length;
    const block = text.slice(enforcedStart, end).split("\n");
    let pendingClaim = null;
    for (const line of block) {
      const claimMatch = CLAIM_RE.exec(line);
      if (claimMatch) {
        pendingClaim = claimMatch[1].trim();
        continue;
      }
      const testMatch = TEST_RE.exec(line);
      if (testMatch && pendingClaim) {
        enforced.push({ claim: pendingClaim, testFile: testMatch[1].trim(), testString: testMatch[2] });
        pendingClaim = null;
      }
    }
  }

  if (unenforcedStart !== -1) {
    const block = text.slice(unenforcedStart).split("\n");
    for (const line of block) {
      const m = /^-\s*(.+)$/.exec(line);
      if (m && !/^\[none/i.test(m[1].trim())) unenforced.push(m[1].trim());
    }
  }

  return { enforced, unenforced };
}

/** Given parsed Enforced entries, return every claim whose test file or test
 *  string can't be found. `readFile(path)` throws on a missing file — the
 *  caller decides HOW to read (working tree vs `git show HEAD:`). */
export function findOrphanedClaims(enforced, { readFile }) {
  const orphans = [];
  for (const entry of enforced) {
    let content;
    try {
      content = readFile(entry.testFile);
    } catch {
      orphans.push({ ...entry, reason: "missing-file" });
      continue;
    }
    if (!String(content).includes(entry.testString)) {
      orphans.push({ ...entry, reason: "missing-string" });
    }
  }
  return orphans;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node .claude/hooks/lib/ledger-parse.test.mjs`
Expected: `6 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/lib/ledger-parse.mjs .claude/hooks/lib/ledger-parse.test.mjs
git commit -m "feat(hooks): pure ledger parser + orphaned-claim detection"
```

---

### Task 2: pipeline `source_scope` extractor — text-sliced, no new dependency

**Files:**
- Create: `.claude/hooks/lib/pipeline-scope.mjs`
- Test: `.claude/hooks/lib/pipeline-scope.test.mjs`

**Interfaces:**
- Produces: `extractSourceScope(registryYaml: string, pipelineDir: string): { confirmedTotal: {summary, source} | null, sourceCeiling: {summary, asOf, sourceUrl, sourceLabel} | null } | null` (null = pipeline dir not found in registry at all)
- Consumed by: Task 3 (hook formatter)

**Design note (why not a real YAML parse):** `ingest/tools/lib/identity-model.mts` already parses
this file with `Bun.YAML.parse` — but that's a `bun`-run module (Gate 7 shells out via
`bun ingest/tools/check-registry-identity.mts`). This hook's own interpreter is `node` (Global
Constraints). Rather than add a `bun`-only global into a `node` script, mirror
`check-prepush-gate.mjs`'s OWN existing convention for this exact file
(`unregisteredPipelineDirs`, line ~658 — a plain substring/line scan, not a full parse) and slice
just the two fields this hook needs.

- [ ] **Step 1: Write the failing tests**

```js
// .claude/hooks/lib/pipeline-scope.test.mjs
// Run: node .claude/hooks/lib/pipeline-scope.test.mjs
import assert from "node:assert";
import { extractSourceScope } from "./pipeline-scope.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    pass++;
  } catch (e) {
    console.log("  FAIL  " + name + " — " + e.message);
    fail++;
  }
}

const REGISTRY = `pipelines:
  - name: live_search_daily_mortgage
    workflow: live-search-daily.yml
    source_scope:
      confirmed_total:
        summary: "Daily 30-yr fixed mortgage rate (national), FRED MORTGAGE30US"
        source: "our ingest"
      source_ceiling:
        summary: "Same FRED release also carries MORTGAGE15US — confirmed live, zero new integration cost."
        as_of: "07/08/2026"
        source_url: "https://fred.stlouisfed.org/release?rid=190"
        source_label: "FRED — Mortgage Rates release"

  - name: fred_g17
    workflow: fred-g17.yml
    note: "no source_scope block on this one yet"
`;

check("extracts confirmed_total + source_ceiling for a real pipeline", () => {
  const scope = extractSourceScope(REGISTRY, "live_search_daily_mortgage");
  assert.equal(scope.confirmedTotal.summary, "Daily 30-yr fixed mortgage rate (national), FRED MORTGAGE30US");
  assert.equal(scope.confirmedTotal.source, "our ingest");
  assert.equal(scope.sourceCeiling.asOf, "07/08/2026");
  assert.match(scope.sourceCeiling.summary, /MORTGAGE15US/);
});

check("returns nulls (not a throw) for a registered pipeline with no source_scope block", () => {
  const scope = extractSourceScope(REGISTRY, "fred_g17");
  assert.deepEqual(scope, { confirmedTotal: null, sourceCeiling: null });
});

check("returns null (whole result) for a dir not in the registry at all", () => {
  assert.equal(extractSourceScope(REGISTRY, "not_a_real_pipeline"), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node .claude/hooks/lib/pipeline-scope.test.mjs`
Expected: `Cannot find module './pipeline-scope.mjs'`

- [ ] **Step 3: Write the implementation**

```js
// .claude/hooks/lib/pipeline-scope.mjs
// Text-sliced reader for ingest/cadence_registry.yaml's source_scope block —
// see the design note in the plan Task 2 for why this isn't a real YAML parse.

/** Slice out the `- name: <dir>` entry's raw text block (up to the next
 *  top-level `- name:` line or EOF). Returns null if the dir never appears
 *  as a `- name:` value at all. */
function sliceEntry(registryYaml, pipelineDir) {
  const lines = String(registryYaml ?? "").split("\n");
  const nameRe = new RegExp(`^\\s*-\\s*name:\\s*${pipelineDir}\\s*$`);
  const anyNameRe = /^\s*-\s*name:\s*\S+\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (nameRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (anyNameRe.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** Pull one `key: "value"` (or bare, unquoted) scalar out of an already-sliced
 *  sub-block. Multi-line/folded YAML scalars are out of scope — every
 *  source_scope field in this registry is a single-line quoted string. */
function field(block, key) {
  const re = new RegExp(`^\\s*${key}:\\s*"?([^"\\n]*?)"?\\s*$`, "m");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

/** Slice the `confirmed_total:` / `source_ceiling:` sub-blocks out of an
 *  entry block (each runs until the next same-or-lower-indent `key:` line). */
function subBlock(entryBlock, key) {
  const lines = entryBlock.split("\n");
  const hdrRe = new RegExp(`^(\\s*)${key}:\\s*$`);
  let start = -1;
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = hdrRe.exec(lines[i]);
    if (m) {
      start = i;
      indent = m[1].length;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const lineIndent = lines[i].match(/^(\s*)/)[1].length;
    const isBlank = lines[i].trim() === "";
    if (!isBlank && lineIndent <= indent) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** `null` result = pipelineDir does not exist in the registry at all (the
 *  caller's "not a registered pipeline" case). `{confirmedTotal: null,
 *  sourceCeiling: null}` = registered but source_scope not researched yet —
 *  matches /ops/census's own "N/76 confirmed-total researched" honesty gap. */
export function extractSourceScope(registryYaml, pipelineDir) {
  const entry = sliceEntry(registryYaml, pipelineDir);
  if (entry === null) return null;

  const ctBlock = subBlock(entry, "confirmed_total");
  const scBlock = subBlock(entry, "source_ceiling");

  const confirmedTotal = ctBlock
    ? { summary: field(ctBlock, "summary"), source: field(ctBlock, "source") }
    : null;
  const sourceCeiling = scBlock
    ? {
        summary: field(scBlock, "summary"),
        asOf: field(scBlock, "as_of"),
        sourceUrl: field(scBlock, "source_url"),
        sourceLabel: field(scBlock, "source_label"),
      }
    : null;

  return { confirmedTotal, sourceCeiling };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node .claude/hooks/lib/pipeline-scope.test.mjs`
Expected: `3 passed, 0 failed`

- [ ] **Step 5: Verify against the REAL registry, not just the fixture**

`field()`'s regex assumes a single-line quoted YAML scalar — true of every `source_scope` entry
this session sampled, but check at least one with an unusually long summary (`lee_permits`, whose
spec-quoted text runs to "9,386 unincorporated-Lee permits... a ZoningCases layer — none ingested")
alongside `fred_g17`, not just one short entry — a folded/multi-line scalar would silently return
`null` for that field (fail-open, not a crash, but worth confirming isn't happening today):

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { extractSourceScope } from './.claude/hooks/lib/pipeline-scope.mjs';
const yaml = readFileSync('ingest/cadence_registry.yaml', 'utf8');
console.log('fred_g17:', JSON.stringify(extractSourceScope(yaml, 'fred_g17'), null, 2));
console.log('lee_permits:', JSON.stringify(extractSourceScope(yaml, 'lee_permits'), null, 2));
"
```
Expected: real, non-null `confirmed_total`/`source_ceiling` text for both — `lee_permits`'s
`source_ceiling.summary` in particular should come back as one full sentence, not `null` or a
truncated fragment. If it comes back `null`, the registry's YAML for that entry uses a multi-line
scalar the current `field()` regex doesn't handle — extend `field()` to also match a YAML block
scalar (`summary: >` / `summary: |` followed by indented continuation lines) before proceeding.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/lib/pipeline-scope.mjs .claude/hooks/lib/pipeline-scope.test.mjs
git commit -m "feat(hooks): text-sliced cadence_registry source_scope reader"
```

---

### Task 3: `push-touched-unit-coverage.mjs` — pipeline detector (ships Step 1 standalone)

**Files:**
- 🔴 Create: `.claude/hooks/push-touched-unit-coverage.mjs`
- 🔴 Test: `.claude/hooks/push-touched-unit-coverage.test.mjs`
- Modify: `.claude/settings.json`

**Interfaces:**
- Consumes: `extractSourceScope` (Task 2)
- Produces: `matchPipelineDir(filePath): string | null`, `formatPipelineScope(dir, scope): string`,
  `buildAdditionalContext(payload, {registryYaml}): string | null` — `null` means "stay silent",
  matching `onOddSurface`'s silent-unless-matched contract in `check-odd-surface.mjs`.

This task ships **spec Rollout Step 1** end to end — the direct fix for the operator's live
complaint ("I keep finding out what we could have got after checking and rechecking"), with no
ledger machinery at all.

- [ ] **Step 1: Write the failing tests**

```js
// .claude/hooks/push-touched-unit-coverage.test.mjs
// Run: node .claude/hooks/push-touched-unit-coverage.test.mjs
import assert from "node:assert";
import {
  matchPipelineDir,
  formatPipelineScope,
  buildAdditionalContext,
} from "./push-touched-unit-coverage.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    pass++;
  } catch (e) {
    console.log("  FAIL  " + name + " — " + e.message);
    fail++;
  }
}

check("matchPipelineDir extracts the dir from a pipeline.py path", () => {
  assert.equal(matchPipelineDir("ingest/pipelines/fred_g17/pipeline.py"), "fred_g17");
});

check("matchPipelineDir extracts the dir from a nested resources.py path", () => {
  assert.equal(matchPipelineDir("ingest/pipelines/fred_g17/resources.py"), "fred_g17");
});

check("matchPipelineDir returns null for a file outside ingest/pipelines/", () => {
  assert.equal(matchPipelineDir("lib/deliverable/recipes/price-reduced.ts"), null);
});

check("formatPipelineScope renders PULLED + AVAILABLE when both are researched", () => {
  const text = formatPipelineScope("fred_g17", {
    confirmedTotal: { summary: "Daily G17 series", source: "our ingest" },
    sourceCeiling: { summary: "Also has the monthly release", asOf: "07/08/2026", sourceUrl: null, sourceLabel: "FRED G17" },
  });
  assert.match(text, /PULLED: Daily G17 series/);
  assert.match(text, /AVAILABLE: Also has the monthly release/);
  assert.match(text, /07\/08\/2026/);
});

check("formatPipelineScope says so explicitly when source_scope isn't researched yet", () => {
  const text = formatPipelineScope("some_pipeline", { confirmedTotal: null, sourceCeiling: null });
  assert.match(text, /not yet researched/i);
});

check("buildAdditionalContext is null for a non-pipeline file (stay silent)", () => {
  const payload = { tool_input: { file_path: "lib/foo.ts" } };
  assert.equal(buildAdditionalContext(payload, { registryYaml: "pipelines:\n" }), null);
});

check("buildAdditionalContext pushes scope text for a registered pipeline touch", () => {
  const registryYaml = `pipelines:
  - name: fred_g17
    source_scope:
      confirmed_total:
        summary: "Daily G17 series"
        source: "our ingest"
`;
  const payload = { tool_input: { file_path: "ingest/pipelines/fred_g17/pipeline.py" } };
  const ctx = buildAdditionalContext(payload, { registryYaml });
  assert.match(ctx, /fred_g17/);
  assert.match(ctx, /PULLED: Daily G17 series/);
});

check("buildAdditionalContext is null for a pipeline dir not in the registry at all", () => {
  const payload = { tool_input: { file_path: "ingest/pipelines/not_registered/pipeline.py" } };
  const ctx = buildAdditionalContext(payload, { registryYaml: "pipelines:\n  - name: fred_g17\n" });
  assert.equal(ctx, null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node .claude/hooks/push-touched-unit-coverage.test.mjs`
Expected: `Cannot find module './push-touched-unit-coverage.mjs'`

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// push-touched-unit-coverage.mjs — PostToolUse hook (matcher: Edit|Write).
//
// WHY THIS HOOK AND NOT inject-focus.mjs: the original spec proposed extending
// inject-focus.mjs (a UserPromptSubmit hook). Verified live against
// code.claude.com/docs/en/hooks before building: UserPromptSubmit's own stdin
// contract carries no touched-file list, and inject-focus.mjs's header
// explicitly rejects content-based routing ("a topic router misfires
// constantly"). PostToolUse DOES carry tool_input.file_path (same field
// check-odd-surface.mjs and annotate-plan.mjs already key on) and its
// additionalContext is documented to land "next to the tool result" — the
// exact push-not-pull behavior the spec wants. This is a corrected mechanism,
// same intent as the spec's §5/§8.
//
// Two independent detectors, silent unless matched (mirrors onOddSurface's
// contract in check-odd-surface.mjs): a pipeline touch pushes cadence_registry
// source_scope (spec Rollout Step 1); a ledger-unit touch pushes its
// Enforced/Unenforced summary (spec Rollout Step 2, added in Task 4).
//
// Fail-OPEN: any internal error → silent exit 0. A broken nudge must never
// interfere with a legitimate edit.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSourceScope } from "./lib/pipeline-scope.mjs";

const PIPELINE_RE = /^ingest\/pipelines\/([^/]+)\//;

/** dir name if `filePath` is under ingest/pipelines/<dir>/, else null. */
export function matchPipelineDir(filePath) {
  const m = PIPELINE_RE.exec(String(filePath ?? "").replace(/\\/g, "/"));
  return m ? m[1] : null;
}

export function formatPipelineScope(dir, scope) {
  if (!scope.confirmedTotal && !scope.sourceCeiling) {
    return `[pipeline scope] ${dir} — source_scope not yet researched (see /ops/census).`;
  }
  const lines = [`[pipeline scope] ${dir}`];
  if (scope.confirmedTotal) {
    lines.push(
      `  PULLED: ${scope.confirmedTotal.summary}${scope.confirmedTotal.source ? ` (${scope.confirmedTotal.source})` : ""}`,
    );
  }
  if (scope.sourceCeiling) {
    const cite = [scope.sourceCeiling.sourceLabel, scope.sourceCeiling.asOf ? `as of ${scope.sourceCeiling.asOf}` : null]
      .filter(Boolean)
      .join(", ");
    lines.push(`  AVAILABLE: ${scope.sourceCeiling.summary}${cite ? ` (${cite})` : ""}`);
  } else {
    lines.push(`  AVAILABLE: not yet researched.`);
  }
  return lines.join("\n");
}

/** The whole detect-and-format pipeline. `null` = stay silent (no match, or
 *  matched a dir the registry doesn't know at all). Injectable `registryYaml`
 *  for testing; the real hook reads the file. */
export function buildAdditionalContext(payload, { registryYaml }) {
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== "string") return null;

  const dir = matchPipelineDir(filePath);
  if (dir) {
    const scope = extractSourceScope(registryYaml, dir);
    if (scope === null) return null; // dir not registered at all — stay silent
    return formatPipelineScope(dir, scope);
  }

  return null; // no detector matched (ledger detector added in Task 4)
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(raw || "{}");
      const root = process.cwd();
      const registryPath = resolve(root, "ingest", "cadence_registry.yaml");
      const registryYaml = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : "";
      const additionalContext = buildAdditionalContext(payload, { registryYaml });
      if (additionalContext) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
          }),
        );
      }
    } catch {
      // fail-open: never wedge on an internal error
    }
    process.exit(0);
  });
  process.stdin.on("error", () => process.exit(0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node .claude/hooks/push-touched-unit-coverage.test.mjs`
Expected: `8 passed, 0 failed`

- [ ] **Step 5: Wire into `.claude/settings.json`**

Add a new group under the existing `PostToolUse` array (do not touch the two existing `Edit|Write`
entries — `check-odd-surface.mjs` and `annotate-plan.mjs` — append a sibling):

```json
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/push-touched-unit-coverage.mjs"
          }
        ]
      }
```

- [ ] **Step 6: Manual smoke test — real stdin, real registry**

Run:
```bash
node -e "
const p = JSON.stringify({ tool_input: { file_path: 'ingest/pipelines/fred_g17/pipeline.py' } });
process.stdout.write(p);
" | node .claude/hooks/push-touched-unit-coverage.mjs
```
Expected: JSON on stdout with `hookSpecificOutput.additionalContext` containing `fred_g17` and
either a `PULLED:` line or `not yet researched`. Then confirm silence for an unrelated file:
```bash
node -e "process.stdout.write(JSON.stringify({tool_input:{file_path:'lib/foo.ts'}}))" | node .claude/hooks/push-touched-unit-coverage.mjs
```
Expected: no stdout at all.

- [ ] **Step 7: Commit**

```bash
git add .claude/hooks/push-touched-unit-coverage.mjs .claude/hooks/push-touched-unit-coverage.test.mjs .claude/settings.json
git commit -m "feat(hooks): push a touched pipeline's cadence_registry scope inline (Rollout Step 1)"
```

**This is a safe stopping point.** Step 1 of the spec's rollout is fully shipped here — the
remaining tasks are the deliverables pilot (spec Rollout Step 2) and can land in a separate
session/PR if desired.

---

### Task 4: extend the hook — ledger-unit detector + cold-start nudge

**Files:**
- 🔴 Modify: `.claude/hooks/push-touched-unit-coverage.mjs`
- 🔴 Modify: `.claude/hooks/push-touched-unit-coverage.test.mjs`

**Interfaces:**
- Consumes: `parseLedger` (Task 1)
- Produces: `matchRecipeUnit(filePath): string | null`, `formatLedgerSummary(name, {enforced, unenforced}): string`, `coldStartNudge(name, ledgerPath): string`

- [ ] **Step 1: Write the failing tests (append to existing test file)**

```js
// append to .claude/hooks/push-touched-unit-coverage.test.mjs, above the
// final console.log/process.exit lines — update the import lines too:
//   import { readFileSync } from "node:fs";
//   import path from "node:path";
//   import { matchPipelineDir, formatPipelineScope, buildAdditionalContext,
//            matchRecipeUnit, formatLedgerSummary, coldStartNudge, RECIPE_KEYS } from "./push-touched-unit-coverage.mjs";

check("matchRecipeUnit extracts the recipe key from its source file", () => {
  assert.equal(matchRecipeUnit("lib/deliverable/recipes/price-reduced.ts"), "price-reduced");
});

check("matchRecipeUnit extracts the recipe key when its OWN ledger file is touched", () => {
  assert.equal(matchRecipeUnit("lib/deliverable/recipes/price-reduced.ledger.md"), "price-reduced");
});

check("matchRecipeUnit returns null for shared.ts (not a recipe key itself)", () => {
  assert.equal(matchRecipeUnit("lib/deliverable/recipes/shared.ts"), null);
});

check("matchRecipeUnit returns null for an unrelated file", () => {
  assert.equal(matchRecipeUnit("lib/foo.ts"), null);
});

check("formatLedgerSummary renders the Enforced summary + full Unenforced list", () => {
  const text = formatLedgerSummary("price-reduced", {
    enforced: [{ claim: "cut is from the most recent price", testFile: "x.test.ts", testString: "y" }],
    unenforced: ["something still running on hope"],
  });
  assert.match(text, /Enforced \(1\)/);
  assert.match(text, /cut is from the most recent price/);
  assert.match(text, /Unenforced/);
  assert.match(text, /something still running on hope/);
});

check("formatLedgerSummary says so when Unenforced is empty (fully protected)", () => {
  const text = formatLedgerSummary("coming-soon", { enforced: [{ claim: "x", testFile: "a", testString: "b" }], unenforced: [] });
  assert.match(text, /no unenforced claims/i);
});

check("coldStartNudge names the unit and the would-be ledger path", () => {
  const text = coldStartNudge("just-sold", "lib/deliverable/recipes/just-sold.ledger.md");
  assert.match(text, /No coverage ledger yet for `just-sold`/);
  assert.match(text, /lib\/deliverable\/recipes\/just-sold\.ledger\.md/);
});

check("buildAdditionalContext pushes the ledger summary when a ledger file exists", () => {
  const payload = { tool_input: { file_path: "lib/deliverable/recipes/price-reduced.ts" } };
  const ledgerMd = `## Enforced\n- Claim: cut is from the most recent price\n  Test: lib/deliverable/recipes/price-reduced.test.ts > "previous price = current + cut"\n\n## Unenforced\n`;
  const ctx = buildAdditionalContext(payload, { registryYaml: "", ledgerExists: true, readLedger: () => ledgerMd });
  assert.match(ctx, /Enforced \(1\)/);
});

check("buildAdditionalContext pushes the cold-start nudge when no ledger exists yet", () => {
  const payload = { tool_input: { file_path: "lib/deliverable/recipes/just-sold.ts" } };
  const ctx = buildAdditionalContext(payload, { registryYaml: "", ledgerExists: false, readLedger: () => "" });
  assert.match(ctx, /No coverage ledger yet/);
});

// DRIFT GUARD (Gate-5 mirror pattern — catalog.test.mts mirrors PER_PACK_REGISTRY the same
// way): RECIPE_KEYS is hardcoded here because this hook runs under plain `node`, which cannot
// import a .ts module — but that makes it copy #2 of lib/deliverable/recipes.ts's RECIPE_KEYS,
// the exact shared-concept-drift shape this whole mechanism exists to catch. Read recipes.ts as
// TEXT (same non-parse convention as pipeline-scope.mjs) and assert equality every run.
check("RECIPE_KEYS mirrors lib/deliverable/recipes.ts's RECIPE_KEYS, minus the 2 social keys", () => {
  const recipesSrc = readFileSync(path.resolve(process.cwd(), "lib/deliverable/recipes.ts"), "utf8");
  const m = /export const RECIPE_KEYS = \[([\s\S]*?)\] as const;/.exec(recipesSrc);
  assert.ok(m, "RECIPE_KEYS array literal not found in recipes.ts — has it moved or been renamed?");
  const allKeys = [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]);
  const nonSocial = allKeys.filter((k) => k !== "social-pack" && k !== "social-cut");
  assert.deepEqual([...RECIPE_KEYS].sort(), nonSocial.sort());
});
```

- [ ] **Step 2: Run to verify the new checks fail**

Run: `node .claude/hooks/push-touched-unit-coverage.test.mjs`
Expected: failures (functions not exported yet) — the earlier Task 3 checks still pass.

- [ ] **Step 3: Extend the implementation**

```js
// add near the top, alongside the existing PIPELINE_RE:
import { parseLedger } from "./lib/ledger-parse.mjs";

// Hardcoded because this hook runs under plain `node` (can't import a .ts
// module) — kept honest by the drift-guard test in Step 1, which reads
// lib/deliverable/recipes.ts as text and asserts these match exactly.
export const RECIPE_KEYS = [
  "new-listing", "coming-soon", "market-comps", "under-contract", "just-sold",
  "open-house", "price-reduced", "agent-brand-intro", "agent-launch",
  "sphere-weekly", "review-reply", "market-pulse",
];
const RECIPE_FILE_RE = /^lib\/deliverable\/recipes\/([a-z-]+)\.(?:ts|ledger\.md)$/;

/** Recipe key if `filePath` is that recipe's own source or its own ledger —
 *  NOT shared.ts/index.ts/*.test.ts (those aren't a single unit's identity). */
export function matchRecipeUnit(filePath) {
  const m = RECIPE_FILE_RE.exec(String(filePath ?? "").replace(/\\/g, "/"));
  if (!m) return null;
  return RECIPE_KEYS.includes(m[1]) ? m[1] : null;
}

export function formatLedgerSummary(name, { enforced, unenforced }) {
  const lines = [`[ledger] ${name} — Enforced (${enforced.length})`];
  for (const e of enforced) lines.push(`  - ${e.claim}`);
  if (unenforced.length === 0) {
    lines.push(`  Unenforced: none — no unenforced claims on record.`);
  } else {
    lines.push(`  Unenforced (${unenforced.length}):`);
    for (const u of unenforced) lines.push(`  - ${u}`);
  }
  return lines.join("\n");
}

export function coldStartNudge(name, ledgerPath) {
  return `No coverage ledger yet for \`${name}\`. If you learn something surprising here, it goes in \`${ledgerPath}\`.`;
}
```

Replace the existing `buildAdditionalContext` with:

```js
export function buildAdditionalContext(payload, { registryYaml, ledgerExists, readLedger }) {
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== "string") return null;

  const dir = matchPipelineDir(filePath);
  if (dir) {
    const scope = extractSourceScope(registryYaml, dir);
    if (scope === null) return null;
    return formatPipelineScope(dir, scope);
  }

  const recipe = matchRecipeUnit(filePath);
  if (recipe) {
    const ledgerPath = `lib/deliverable/recipes/${recipe}.ledger.md`;
    if (!ledgerExists) return coldStartNudge(recipe, ledgerPath);
    return formatLedgerSummary(recipe, parseLedger(readLedger()));
  }

  return null;
}
```

Update `main()`'s call site to supply the two new options:

```js
      const recipe = matchRecipeUnit(payload?.tool_input?.file_path);
      let ledgerExists = false;
      let ledgerText = "";
      if (recipe) {
        const ledgerPath = resolve(root, "lib", "deliverable", "recipes", `${recipe}.ledger.md`);
        ledgerExists = existsSync(ledgerPath);
        if (ledgerExists) ledgerText = readFileSync(ledgerPath, "utf8");
      }
      const additionalContext = buildAdditionalContext(payload, {
        registryYaml,
        ledgerExists,
        readLedger: () => ledgerText,
      });
```

- [ ] **Step 4: Run to verify all pass**

Run: `node .claude/hooks/push-touched-unit-coverage.test.mjs`
Expected: `17 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/push-touched-unit-coverage.mjs .claude/hooks/push-touched-unit-coverage.test.mjs
git commit -m "feat(hooks): push a touched recipe's ledger summary (or cold-start nudge) inline"
```

---

### Task 5: Gate 9 — ledger enforcement in `check-prepush-gate.mjs`

**Files:**
- Modify: `.claude/hooks/check-prepush-gate.mjs`

**Interfaces:**
- Consumes: `parseLedger`, `findOrphanedClaims` (Task 1)

`check-prepush-gate.mjs` itself has no exports and no companion test file today (verified — every
one of its 8 existing gates is integration-only, proven by incident, not by unit test). Gate 9
follows that same convention for its own wiring; the logic it depends on (`ledger-parse.mjs`) is
already unit-tested in Task 1, matching the file's own precedent of importing a tested pure module
(`resolvePushCwd` from `push-context.mjs`) rather than inlining untestable logic.

- [ ] **Step 1: Add the import**

At the top of `.claude/hooks/check-prepush-gate.mjs`, alongside the existing `resolvePushCwd` import:

```js
import { parseLedger, findOrphanedClaims } from "./lib/ledger-parse.mjs";
```

- [ ] **Step 2: Add Gate 9, after Gate 8 and before Gate 3's advisory block**

```js
  // ---- Gate 9: ledger enforcement (per-unit coverage ledgers) --------------
  // An "Enforced" claim in a *.ledger.md names a real test. If that test file
  // or test string no longer exists, the ledger is reading as safety that
  // isn't there — worse than no ledger (spec
  // docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md §4).
  // Fires when a push touches: the ledger file itself, the recipe's SOURCE
  // (.ts), OR the recipe's TEST file (.test.ts) — the last one is the gate's
  // own central case (a renamed/deleted test string, which is exactly what
  // orphans a claim) and is easy to miss because the spec's own §4 wording
  // ("the unit's own source") reads as source-only. Verified against a direct
  // trace: a push editing ONLY price-reduced.test.ts (renaming the string an
  // Enforced claim names) must still trigger this gate.
  const ledgerTouched = changed.filter(
    (f) => /^lib\/deliverable\/recipes\/[a-z-]+\.ledger\.md$/.test(f),
  );
  const ledgerForTouchedUnit = changed
    .map((f) => {
      const m = /^lib\/deliverable\/recipes\/([a-z-]+)\.(?:ts|test\.ts)$/.exec(f);
      return m ? `lib/deliverable/recipes/${m[1]}.ledger.md` : null;
    })
    .filter(Boolean);
  const allTouchedLedgers = [...new Set([...ledgerTouched, ...ledgerForTouchedUnit])];

  if (allTouchedLedgers.length > 0) {
    const orphanReport = [];
    const testFilesToRun = new Set();
    for (const ledgerFile of allTouchedLedgers) {
      let ledgerSrc;
      try {
        ledgerSrc = sh(`git show HEAD:${ledgerFile}`);
      } catch {
        continue; // ledger file doesn't exist at HEAD (not yet authored) — nothing to check
      }
      const { enforced } = parseLedger(ledgerSrc);
      const orphans = findOrphanedClaims(enforced, {
        readFile: (f) => sh(`git show HEAD:${f}`),
      });
      for (const o of orphans) orphanReport.push({ ledgerFile, ...o });
      for (const e of enforced) testFilesToRun.add(e.testFile);
    }

    if (orphanReport.length > 0) {
      block(
        "LEDGER — an Enforced claim's test no longer exists",
        orphanReport
          .map(
            (o) =>
              `  ${o.ledgerFile}\n    Claim: ${o.claim}\n    ${o.reason === "missing-file" ? `Test file gone: ${o.testFile}` : `Test string no longer found in ${o.testFile}: "${o.testString}"`}`,
          )
          .join("\n\n") +
          `\n\nFix: either the code/test regressed (restore it) or the ledger is stale (correct or\n` +
          `remove the claim, and move it to Unenforced if it's no longer test-backed), then retry.`,
      );
    }

    const testFailures = [];
    for (const testFile of testFilesToRun) {
      const res = run(`bun test ${testFile}`);
      if (res.ran && res.code !== 0 && !isPackTestEnvFailure(res.out)) {
        testFailures.push({ file: testFile, out: res.out });
      }
    }
    if (testFailures.length > 0) {
      block(
        "LEDGER — a test an Enforced claim depends on is failing",
        testFailures.map((t) => `  • ${t.file}\n${truncate(t.out, 800)}`).join("\n\n") +
          `\n\nFix the test or the code it protects, then retry.`,
      );
    }
  }
```

This block is inserted as its own top-level section inside the handler, in the same position Gates
1-8 already occupy (after Gate 8's `scope` check, before Gate 3's advisory-only block — the file's
existing gates are not in strict numeric order top-to-bottom; match by the surrounding comment
banners, not by line number).

- [ ] **Step 3: Manual smoke test — orphan detection**

After Task 7 has authored at least one real ledger (e.g. `price-reduced.ledger.md`), verify Gate 9
end to end:
1. Touch `lib/deliverable/recipes/price-reduced.ts` (any no-op whitespace edit) and commit.
2. Attempt `node scripts/safe-push.mjs` (or dry-run the gate directly by piping a synthetic
   `PreToolUse` payload for a `git push` command to `check-prepush-gate.mjs` — see existing gates'
   own manual-smoke convention, no automated harness exists for this file).
3. Expected: push succeeds (claim intact).
4. Rename the test string inside `price-reduced.test.ts` (e.g. append a character) without
   updating the ledger, commit, retry push.
5. Expected: **PUSH BLOCKED — LEDGER — an Enforced claim's test no longer exists**, naming the
   exact claim and file. Revert the rename.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/check-prepush-gate.mjs
git commit -m "feat(hooks): Gate 9 — block a push that orphans a ledger's Enforced claim"
```

---

### Task 6: close the market-pulse 8-row cap gap (the spec's one confirmed gap)

**Files:**
- Modify: `lib/deliverable/recipes/market-pulse.test.ts`

The spec's §3 pilot table flags this as the ONE confirmed gap to close (not just document). Verified
this session: `CHART_MAX_ROWS = 8` is real (`market-pulse.ts:149`) and used inside `momChartSpec`
(`market-pulse.ts:341`, delegating the actual row-slicing to the shared `bindRankedDeltaSpec` /
`rankedDeltaSvg`), but the only existing test at that boundary
(`market-pulse.test.ts:208-212`, "a TRUNCATED set says so") feeds an ALREADY-truncated count
(`chartTitleFor("Naples", 8, 12, 12)`) into the title formatter directly — it never proves that
`momChartSpec`, given 12 REAL `ZipMove` rows, actually returns only 8 items end-to-end.

- [ ] **Step 1: Write the failing test**

Add to `lib/deliverable/recipes/market-pulse.test.ts`, in the `describe` block containing the
existing "every plotted bar traces to a held row" test (uses the same `OUTPUT`/`TABLE`/`momChartSpec`
fixtures already in that file — do not redefine them). Confirm `ZipMove` and `BrainOutputDetailTable`
are already imported at the top of this file (both are used by the existing fixtures above this
test) before pasting — if either import is missing, the file won't compile and Step 2 will fail on
a TypeScript error, not a real assertion failure.

```ts
  test("given MORE than 8 real ZIP moves, momChartSpec's own items are capped at 8 — not just the title", () => {
    // Build 12 synthetic moves reusing the fixture's shape/columns; only the
    // COUNT matters here, not realism of the values (title-truncation is
    // already covered by the "top 8 of 12" test above).
    const twelveMoves: ZipMove[] = Array.from({ length: 12 }, (_, i) => ({
      zip: `3390${i}`,
      value: 300000 + i,
      delta: -0.1,
      period: "2026-04-30",
    }));
    const projectedTable: BrainOutputDetailTable = {
      ...TABLE,
      rows: twelveMoves.map((m) => ({ key: m.zip, cells: TABLE.rows[0]?.cells ?? {} })),
    };
    const spec = momChartSpec(OUTPUT, projectedTable, twelveMoves, "Naples");
    const items = spec?.options?.items as Array<unknown>;
    expect(items.length).toBe(8);
  });
```

- [ ] **Step 2: Run to verify it fails (or passes — confirm which)**

Run: `bun test lib/deliverable/recipes/market-pulse.test.ts -t "capped at 8"`

If `bindRankedDeltaSpec`/`rankedDeltaSvg` already truncates correctly, this PASSES immediately —
that's a valid, useful outcome (the mechanism was already correct, just unproven; the ledger can now
honestly say "Enforced"). If it FAILS, proceed to Step 3.

- [ ] **Step 3 (only if Step 2 failed): find and fix the truncation gap**

Read `lib/deliverable/recipes/ranked-delta-bind.ts`'s `bindRankedDeltaSpec` — confirm whether it
slices `options.items` to `MAX_ROWS` (referenced in `market-pulse.ts`'s own comment, line 49:
"MAX_ROWS in ranked-delta-bind.ts; rankedDeltaSvg slices to 8"). If the slice exists only inside
`rankedDeltaSvg` (the PNG renderer) and NOT on `spec.options.items` itself, add the same
`.slice(0, MAX_ROWS)` to wherever `options.items` is assembled in `bindRankedDeltaSpec`, so the data
structure Claude/tests see matches what actually renders. Re-run Step 2's test until it passes.

- [ ] **Step 4: Run the full market-pulse suite**

Run: `bun test lib/deliverable/recipes/market-pulse.test.ts`
Expected: all tests pass, including the pre-existing ones (no regression).

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/recipes/market-pulse.test.ts lib/deliverable/recipes/ranked-delta-bind.ts
git commit -m "test(market-pulse): prove the 8-row cap end-to-end, not just the title string"
```

---

### Task 7: author the 12 recipe ledger files (grep-verify each claim at HEAD first)

**Files:**
- Create: `lib/deliverable/recipes/{new-listing,coming-soon,market-comps,under-contract,just-sold,open-house,price-reduced,agent-brand-intro,agent-launch,sphere-weekly,review-reply,market-pulse}.ledger.md` (12 files)

**Do not transcribe the spec's §3 table verbatim.** This session spot-checked 2 of its 9 "Enforced"
rows (both held) and independently re-verified the market-pulse row (it was right — "Unconfirmed" —
and Task 6 just closed it). The other 7 were NOT re-verified this session. For **every** file below,
Step 1 is mandatory before Step 2.

- [ ] **Step 1 (repeat per recipe): grep the real test string at HEAD**

```bash
git show HEAD:lib/deliverable/recipes/<name>.test.ts | grep -n 'test("' 
```
Confirm the exact quoted string this session (or the spec) claims exists. If it doesn't match
verbatim, use the REAL string from the grep output, not the spec's paraphrase — Gate 9 (Task 5)
will block on any mismatch the moment this file is committed, so a wrong transcription here is a
self-inflicted push failure, not a later bug.

- [ ] **Step 2 (repeat per recipe): write the ledger file**

Two sections only (per spec §2 — deliverable recipes are NOT ingest pipelines, no third section).
Content sourced from this session's verified greps + `docs/standards/deliverable-playbook.md` Part 6
(the real per-recipe landmine table, richer than the spec's own summary — read at plan-write time,
quoted below per recipe).

`lib/deliverable/recipes/new-listing.ledger.md`:
```markdown
## Enforced
- [none confirmed this pilot — new-listing's chart policy ("none", the visual is the photo) is
  framing guidance per the playbook, not a currently test-checked claim. Verify against
  `new-listing.test.ts` before promoting.]

## Unenforced
- "It's the reference, no chart" is a framing rule (Playbook Part 6), not a failure mode with a
  test — irreducible per the spec's own pilot table (§3).
```

`lib/deliverable/recipes/coming-soon.ledger.md` (verify the exact string via Step 1, then use it):
```markdown
## Enforced
- Claim: the street address never leaks (hero/alt/subject/CTA/narrator)
  Test: lib/deliverable/recipes/coming-soon.test.ts > "<paste the exact grep-verified test string>"

## Unenforced
- [none found this pilot]
```

`lib/deliverable/recipes/market-comps.ledger.md`:
```markdown
## Enforced
- Claim: the vacant lot never reaches the chart, the table, or the math (comp must have beds AND sqft)
  Test: lib/deliverable/recipes/market-comps.test.ts > "<paste the exact grep-verified test string>"

## Unenforced
- market-comps is deliberately given NO community facts (its location ban is absolute, not
  fact-gated) — open design question tracked separately, check `market_comps_community_deliberately_unwired`.
```

`lib/deliverable/recipes/under-contract.ledger.md`:
```markdown
## Enforced
- Claim: no days-to-contract fabrication (leads with time ON market, not time-to-contract)
  Test: lib/deliverable/recipes/under-contract.test.ts > "<paste the exact grep-verified test string>"

## Unenforced
- `inventedAttributes`'s word-guard can be legitimized by a community NAME containing a water word
  (e.g. "Heritage Bay") once the neighborhood-stats settled sentence is in the narrator's source
  text — tracked, open: check `community_name_water_word_legitimizes_invented_attribute`.
```

`lib/deliverable/recipes/just-sold.ledger.md`:
```markdown
## Enforced
- Claim: an ask price is never mislabeled as a close (`closeFrom` refuses a last-list price)
  Test: lib/deliverable/recipes/just-sold.test.ts > "<paste the exact grep-verified test string>"

## Unenforced
- [none found this pilot]
```

`lib/deliverable/recipes/open-house.ledger.md`:
```markdown
## Enforced
- Claim: date/time are never defaulted (two open slots, never a placeholder date)
  Test: lib/deliverable/recipes/open-house.test.ts > "<paste the exact grep-verified test string>"

## Unenforced
- [none found this pilot]
```

`lib/deliverable/recipes/price-reduced.ledger.md` (this session's own verified strings):
```markdown
## Enforced
- Claim: previous price = current price + the cut (reduced_amount is the SIZE OF THE CUT, not the old price)
  Test: lib/deliverable/recipes/price-reduced.test.ts > "previous price = current + cut"
- Claim: reduced_amount is NOT the old price itself
  Test: lib/deliverable/recipes/price-reduced.test.ts > "it is NOT the reduced_amount itself (the lie this recipe exists to not tell)"

## Unenforced
- [none found this pilot]
```

`lib/deliverable/recipes/agent-brand-intro.ledger.md`:
```markdown
## Enforced
- Claim: the anchor listing's city can never hijack the farm area
  Test: lib/deliverable/recipes/agent-brand-intro.test.ts > "<paste the exact grep-verified test string>"

## Unenforced
- [none found this pilot]
```

`lib/deliverable/recipes/agent-launch.ledger.md` (this session's own verified string):
```markdown
## Enforced
- Claim: exactly one hard number, and no chart, ever
  Test: lib/deliverable/recipes/agent-launch.test.ts > "buildAgentLaunch: NO chart, ever"

## Unenforced
- [none found this pilot]
```

`lib/deliverable/recipes/sphere-weekly.ledger.md`:
```markdown
## Enforced
- Claim: the headline is a lane-3 fact (a named web source), never our own figure — or an open slot
  Test: lib/deliverable/recipes/sphere-weekly.test.ts > "<paste the exact grep-verified test string>"

## Unenforced
- [none found this pilot]
```

`lib/deliverable/recipes/review-reply.ledger.md`:
```markdown
## Enforced
- [none confirmed this pilot — review-reply is genuinely about numbers and charts by design
  (Playbook Part 6), which is a framing choice, not a currently test-checked failure mode. Verify
  against `review-reply.test.ts` before promoting.]

## Unenforced
- "Genuinely about numbers, so it charts" is framing guidance, not a failure mode — irreducible
  per the spec's own pilot table (§3).
```

`lib/deliverable/recipes/market-pulse.ledger.md` (post-Task 6):
```markdown
## Enforced
- Claim: binds month-over-month, not year-over-year (the shared chart producer would otherwise bind
  the first delta column sharing a stem)
  Test: lib/deliverable/recipes/market-pulse.test.ts > "<paste the exact grep-verified MoM-binding test string>"
- Claim: the ranked frame draws at most 8 rows — a 10+-ZIP place cannot show every bar
  Test: lib/deliverable/recipes/market-pulse.test.ts > "given MORE than 8 real ZIP moves, momChartSpec's own items are capped at 8 — not just the title"

## Unenforced
- [none found this pilot — the row-cap gap flagged in the spec's Open Risks was closed in this
  same build, Task 6]
```

- [ ] **Step 3: Confirm every pasted test string against HEAD one more time**

```bash
for f in new-listing coming-soon market-comps under-contract just-sold open-house price-reduced agent-brand-intro agent-launch sphere-weekly review-reply market-pulse; do
  echo "== $f =="
  grep -o 'Test: .*' "lib/deliverable/recipes/$f.ledger.md" | sed 's/.*> "//;s/"$//' | while read -r s; do
    grep -qF "$s" "lib/deliverable/recipes/$f.test.ts" && echo "  OK: $s" || echo "  MISSING: $s"
  done
done
```
Expected: every line prints `OK:` — any `MISSING:` line must be fixed (either the string is wrong,
or the claim doesn't actually hold and belongs in Unenforced instead) before committing.

- [ ] **Step 4: Commit**

```bash
git add lib/deliverable/recipes/*.ledger.md
git commit -m "docs(deliverable): author the 12 recipe coverage ledgers (Enforced/Unenforced pilot)"
```

---

### Task 8: playbook migration — Part 6 extracted, Part 9 stays (corrected)

**Files:**
- Modify: `docs/standards/deliverable-playbook.md`

Per the Global Constraints correction: Part 9's 6 current landmines (`fillNarrative` skip behavior,
`lotSize` units, the three-render-engine canvas lie, ESLint `--max-warnings=0`, `mock.module`
whole-module replacement, shared git index) are all cross-cutting process/infra facts, not
recipe-specific — none of them name a single recipe. Only Part 6 (the twelve-recipe table) migrates.

- [ ] **Step 1: Replace Part 6's body with a pointer**

In `docs/standards/deliverable-playbook.md`, replace the content between `## Part 6 — The twelve
recipes` and the next `---` (currently the full table + skeleton/social notes, lines ~169-214) with:

```markdown
## Part 6 — The twelve recipes

Per-recipe landmines now live at `lib/deliverable/recipes/<name>.ledger.md` — one file per recipe,
gated (Gate 9, `check-prepush-gate.mjs`) so an "Enforced" claim can never silently orphan from the
test that backs it. This section used to hold that table directly; see
`docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md` for why it moved.

**All twelve are still registered in `lib/deliverable/recipes.ts`** — that registry stays the
authority on skeleton · prose · subject spine · chart policy; the ledgers document what's PROVEN
about each, not what each IS.

**Skeletons:** *"it probably already exists, load it"* is **NOT universally true** — and believing
it is harmful. Every listing seed is **address-forward** (hero label literally "Price and
address"), so `coming-soon` loading one leaves an open slot **inviting the user to paste back the
address the recipe exists to suppress.** A coded grid in your own file is legitimate
(`buildListingFlyer` is one).

**Social** (`social-pack`, `social-cut`) is **NOT `RecipeBuilder`-shaped** and is deliberately
unregistered — no ledger for these two; they're out of this pilot's scope (spec §2). Two live
systems; neither touches the dispatch table; and **the social path has NO no-invention gate at
all** (check `social_path_has_no_no_invention_gate`).

---
```

- [ ] **Step 2: Leave Part 9 untouched** (no diff — this step exists to record the decision, not to
  edit anything)

- [ ] **Step 3: Commit**

```bash
git add docs/standards/deliverable-playbook.md
git commit -m "docs(playbook): extract Part 6's per-recipe table into the 12 ledger files"
```

---

### Task 9: close the live-verify check

**Files:** none (verification only)

- [ ] **Step 1: Run the full relevant suite**

Run: `bun test lib/deliverable/recipes/ .claude/hooks/lib/`
Expected: all green, including Task 6's new market-pulse test.

- [ ] **Step 2: Run every new hook's own test file directly**

```bash
node .claude/hooks/lib/ledger-parse.test.mjs
node .claude/hooks/lib/pipeline-scope.test.mjs
node .claude/hooks/push-touched-unit-coverage.test.mjs
```
Expected: all report `0 failed`.

- [ ] **Step 3: Verify with `bunx next build`** (per this repo's own verification standard — not
  `npx tsc`)

Run: `bunx next build`
Expected: exit 0, no new type errors.

- [ ] **Step 4: Live smoke — touch each surface once more, by hand**

Re-run Task 3 Step 6 and Task 5 Step 3's manual smokes one final time against the finished state
(ledgers now exist, Gate 9 is live) to confirm nothing drifted across Tasks 6-8.

- [ ] **Step 5: Close the check + update SESSION_LOG + push**

```bash
node scripts/check.mjs close per-unit-coverage-ledgers_live_verify
```
Append a `SESSION_LOG.md` entry (RULE 0 — top of file, not appended below) describing what shipped,
then `node scripts/safe-push.mjs`.

---

## Self-Review Notes (writing-plans skill requirement)

**Spec coverage:** §1-2 (registries stay authoritative, ledger format) → Task 7. §3 (pilot
evidence + the one confirmed gap) → Tasks 6-7. §4 (gate) → Task 5. §5/§8 (push mechanism) → Tasks
3-4, with the hook-choice CORRECTED (PostToolUse, not inject-focus.mjs — see Global Constraints and
Task 3's design note) after live-verifying the vendor docs. §6 (freshness/advisory diff) —
**deliberately NOT built**: the spec marks this optional ("if it proves too weak in practice,
revisit") and it isn't load-bearing for the gate or the push mechanism; can be a fast follow-up,
not blocking this plan. §7 (single-root migration) → Task 8, corrected re: Part 9. §9 (case study)
→ superseded by Task 7's grep-first discipline; the spec's own §9 example (community-lookup.ts) is
now stale (shipped since the spec was written — see chat summary) and is not treated as
still-open anywhere in this plan.

**Type/interface consistency:** `parseLedger`'s `{enforced, unenforced}` shape is identical across
Task 1 (definition), Task 4 (hook formatter), and Task 5 (gate) — verified no drift between the
three call sites above.

**Out of scope, confirmed:** Step 3 (48 brain packs) — not started anywhere in this plan, per the
spec's own Rollout order.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 3, Task 4 | `.claude/hooks/push-touched-unit-coverage.mjs`, `.claude/hooks/push-touched-unit-coverage.test.mjs` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
