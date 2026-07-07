# Session Debris + Status Blind-Spot Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, keywords: migration, schema, architecture

**Goal:** Land the debris this session found (two dangling git worktrees, a false status banner), close the 5 priority-bumped checks, and fix the two structural gaps that let all of it go invisible for days — no worktree monitoring, and a `checks` table whose `updated_at` never actually updates.

**Architecture:** Phase 1 is real code with tests (extend `scripts/tripwire-scan.mjs` with a worktree-staleness check; fix `scripts/check.mjs` so `update()` actually bumps `updated_at` and `list()` surfaces age). Phase 2 is exact git/push commands, each gated on operator approval (no-autonomous-push). Phase 3 is a triage pass over the pre-existing stale/overdue checks — each is its own unscoped subsystem, so this plan schedules investigation, not blind implementation. Phase 4 is one product decision the operator makes, not code.

**Tech Stack:** Node.js (`node --test`), Bun (script execution), Supabase/PostgREST (`checks` table), GitHub Actions (workflow schedules), git worktrees.

## Global Constraints

- Never push without explicit operator confirmation (CLAUDE.md RULE — every push-shaped step in Phase 2 is a command for the OPERATOR to run, not one this plan executes autonomously).
- Stage explicit file paths only — never `git add -A` (CLAUDE.md RULE 1.5).
- SESSION_LOG.md gets an entry before every push (hook-enforced).
- No `Date.now()` inside a `Workflow` script body — not applicable here (these are plain Node/Bun scripts run directly, not Workflow scripts), so `Date.now()`/`new Date()` are fine in Phase 1 code.
- Verify with `bunx next build`, not bare `npx tsc` (feedback_verify-with-next-build-not-npx-tsc).
- `checks` credentials come from `.dlt/secrets.toml` (gitignored) via `scripts/lib/supabase-creds.mjs` — never hardcode or print them.

---

## Phase 1 — Fix the two structural gaps (code, do this now)

### Task 1: Worktree-staleness check in tripwire-scan.mjs

**Files:**
- Modify: `scripts/tripwire-scan.mjs` (add `checkWorktrees()`, call it in the run sequence)
- Test: `scripts/tripwire-scan.test.mjs` (new file — the script has no existing test file; this establishes one for its pure helpers)

**Interfaces:**
- Consumes: nothing from other tasks. Uses the existing `sh()` helper (line 44-46 of the current file) and the existing `reds`/`yellows`/`greens` arrays.
- Produces: `checkWorktrees()` (no args, pushes to the shared `reds`/`yellows`/`greens` arrays — matches every other `check*` function in this file) and a pure helper `classifyWorktree({ aheadCount, ageHours, staleHoursThreshold })` → `"green" | "yellow" | "red"`, exported for the test file.

The current file's other checks (`checkSpend`, `checkPulseDark`, etc.) are not unit-tested — they're integration-only (real `gh`/Supabase calls). This task's classification LOGIC (given ahead-count and age, what color is it) is pure and worth unit-testing in isolation; the git-shelling part stays integration-only like its siblings.

- [ ] **Step 1: Write the failing test for the pure classifier**

Create `scripts/tripwire-scan.test.mjs`:

```javascript
// Unit tests for tripwire-scan.mjs's pure worktree classifier. No git, no DB.
// Run: node --test scripts/tripwire-scan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWorktree } from "./tripwire-scan.mjs";

test("classifyWorktree — 0 commits ahead of origin/main is always green (fully landed)", () => {
  assert.equal(
    classifyWorktree({ aheadCount: 0, ageHours: 999, staleHoursThreshold: 6 }),
    "green",
  );
});

test("classifyWorktree — commits ahead + fresh (under threshold) is yellow (likely a live session)", () => {
  assert.equal(
    classifyWorktree({ aheadCount: 3, ageHours: 1, staleHoursThreshold: 6 }),
    "yellow",
  );
});

test("classifyWorktree — commits ahead + past the threshold is red (needs landing or abandoning)", () => {
  assert.equal(
    classifyWorktree({ aheadCount: 1, ageHours: 16, staleHoursThreshold: 6 }),
    "red",
  );
});

test("classifyWorktree — exactly at the threshold is red (>= not >)", () => {
  assert.equal(
    classifyWorktree({ aheadCount: 1, ageHours: 6, staleHoursThreshold: 6 }),
    "red",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tripwire-scan.test.mjs`
Expected: FAIL — `classifyWorktree` is not exported from `tripwire-scan.mjs` (doesn't exist yet).

- [ ] **Step 3: Add the pure classifier + the worktree check to tripwire-scan.mjs**

`scripts/tripwire-scan.mjs` currently ends its check-function block with `checkValveAudit()` (around line 246) followed by the `// ---------- run ----------` section (around line 248). Insert the new check BEFORE the `// ---------- run` comment:

```javascript
// ---------- check 6: dangling git worktrees ------------------------------

const WORKTREE_STALE_HOURS = 6; // a `land`ed-but-unpushed worktree past this age is a RED

// Pure — given ahead-count and age, what color is this worktree? Exported for
// the unit test; the git-shelling caller below is integration-only like its
// siblings in this file.
export function classifyWorktree({ aheadCount, ageHours, staleHoursThreshold }) {
  if (aheadCount === 0) return "green"; // fully landed — safe to `git worktree remove`
  return ageHours >= staleHoursThreshold ? "red" : "yellow";
}

function checkWorktrees() {
  let raw = "";
  try {
    raw = sh("git worktree list --porcelain");
  } catch {
    yellows.push("WORKTREES: `git worktree list` failed — could not scan");
    return;
  }
  const entries = raw.trim().split(/\n\n+/).filter(Boolean);
  let sawNonMain = false;

  for (const entry of entries) {
    const lines = entry.split("\n");
    const worktreeLine = lines.find((l) => l.startsWith("worktree "));
    if (!worktreeLine) continue;
    const dir = worktreeLine.slice("worktree ".length).trim();
    if (path.resolve(dir) === ROOT) continue; // skip the main checkout itself
    sawNonMain = true;

    const branchLine = lines.find((l) => l.startsWith("branch "));
    const branch = branchLine ? branchLine.slice("branch ".length).trim() : null;
    const detached = lines.some((l) => l === "detached");
    const branchLabel = branch ?? (detached ? "detached HEAD" : "unknown");

    let headSha = "";
    try {
      headSha = sh(`git -C "${dir}" rev-parse HEAD`).trim();
    } catch {
      yellows.push(`WORKTREE: ${dir} — could not read HEAD`);
      continue;
    }

    let aheadCount = 0;
    try {
      const ahead = sh(`git log --oneline origin/main..${headSha}`).trim();
      aheadCount = ahead ? ahead.split("\n").length : 0;
    } catch {
      yellows.push(`WORKTREE: ${dir} (${branchLabel}) — could not diff against origin/main`);
      continue;
    }

    let ageHours = 0;
    try {
      const epochSec = Number(sh(`git -C "${dir}" log -1 --format=%ct`).trim());
      ageHours = (Date.now() - epochSec * 1000) / (60 * 60 * 1000);
    } catch {
      yellows.push(`WORKTREE: ${dir} (${branchLabel}) — could not read last commit time`);
      continue;
    }

    const color = classifyWorktree({ aheadCount, ageHours, staleHoursThreshold: WORKTREE_STALE_HOURS });
    const label = `${dir} (${branchLabel}) — ${aheadCount} commit(s) ahead of origin/main, last commit ${ageHours.toFixed(1)}h ago`;
    if (color === "green") greens.push(`WORKTREE — ${label} — fully landed, safe to remove`);
    else if (color === "yellow") yellows.push(`WORKTREE ACTIVE — ${label} — likely a live session`);
    else reds.push(`WORKTREE STALE — ${label} — land it or abandon it`);
  }

  if (!sawNonMain) greens.push("WORKTREES — none besides the main checkout");
}
```

Then add the call in the run sequence (find the block starting `await checkSpend();` a few lines below where you just inserted code) and add `checkWorktrees();` alongside the other `check*()` calls:

```javascript
await checkSpend();
checkPulseDark();
checkPaidDispatches();
checkGuards();
checkValveAudit();
checkWorktrees();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tripwire-scan.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Smoke-test the integration path against real state**

Run: `node scripts/tripwire-scan.mjs`
Expected: exits 0 or 1 as before, but the printed report now includes `WORKTREE` lines — confirm it correctly reports `bp-fold` as RED (stale) if still unlanded at execution time, and `bp-pipeline-census` as YELLOW (active) if still mid-session, or GREEN for either once landed/removed.

- [ ] **Step 6: Commit**

```bash
git add scripts/tripwire-scan.mjs scripts/tripwire-scan.test.mjs
git commit -m "feat(tripwire): flag dangling git worktrees with unpushed commits

Nothing previously monitored whether a \`worktree.mjs land\`ed worktree
actually got pushed+cleaned-up afterward. bp-fold sat 16h with a
deleted branch and one orphaned commit before this caught it manually."
```

---

### Task 2: `checks` age tracking — fix the write path, then surface it on read

**Files:**
- Modify: `scripts/check.mjs` (`update()` sets `updated_at`; `list()` surfaces age + gains a `--stale` filter)
- Test: `scripts/check.test.mjs` (existing file — add tests alongside the existing pure-helper tests)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `ageDays(nowIso, sinceIso)` and `sortByStaleness(rows)`, both exported pure functions (same pattern as the file's existing `closeTier`/`buildSignalProof`/`buildManualProof`).

**Bug found while planning this:** `public.checks` (`docs/sql/20260530_checks.sql`) has NO trigger that auto-bumps `updated_at` on UPDATE (confirmed — the pattern exists for `source_connectors` and `personal_vault` in other migrations, not for `checks`). `check.mjs update()`'s PATCH body never sets `updated_at` either. So today, `updated_at == created_at` forever for every row, no matter how many times `update` touches it — including the 5 checks this session just bumped to priority 1, which still show their original creation timestamp. An age feature built on that column would silently lie ("just touched" reads as "34 days stale"). Fix the write path in the same task as the read path — shipping one without the other is worse than shipping neither.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.test.mjs` (after the existing `parseSignalFlag` tests, before end of file):

```javascript
import { ageDays, sortByStaleness } from "./check.mjs";

// --- ageDays: pure date math ---
test("ageDays — whole days between two ISO timestamps", () => {
  assert.equal(ageDays("2026-07-07T12:00:00Z", "2026-07-03T12:00:00Z"), 4);
});

test("ageDays — null sinceIso returns null (row has no timestamp)", () => {
  assert.equal(ageDays("2026-07-07T12:00:00Z", null), null);
});

test("ageDays — same instant is 0 days", () => {
  assert.equal(ageDays("2026-07-07T12:00:00Z", "2026-07-07T12:00:00Z"), 0);
});

// --- sortByStaleness: oldest-untouched-first, updated_at wins over created_at ---
test("sortByStaleness — orders oldest updated_at first", () => {
  const rows = [
    { check_key: "b", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" },
    { check_key: "a", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-05T00:00:00Z" },
  ];
  const sorted = sortByStaleness(rows);
  assert.deepEqual(sorted.map((r) => r.check_key), ["a", "b"]);
});

test("sortByStaleness — falls back to created_at when updated_at is null", () => {
  const rows = [
    { check_key: "recent", created_at: "2026-07-06T00:00:00Z", updated_at: null },
    { check_key: "old", created_at: "2026-06-01T00:00:00Z", updated_at: null },
  ];
  const sorted = sortByStaleness(rows);
  assert.deepEqual(sorted.map((r) => r.check_key), ["old", "recent"]);
});

test("sortByStaleness — does not mutate the input array", () => {
  const rows = [
    { check_key: "b", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" },
    { check_key: "a", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-05T00:00:00Z" },
  ];
  const original = [...rows];
  sortByStaleness(rows);
  assert.deepEqual(rows, original);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/check.test.mjs`
Expected: FAIL — `ageDays`/`sortByStaleness` are not exported from `check.mjs` (don't exist yet).

- [ ] **Step 3: Implement the pure helpers + wire the write-path fix + the read-path feature**

In `scripts/check.mjs`, add the two pure exports right after `fmtDate` (currently lines 77-84):

```javascript
/** Whole days between two ISO timestamps (now - since). Null `since` (a row
 *  with no timestamp at all) returns null rather than a bogus number. */
export function ageDays(nowIso, sinceIso) {
  if (!sinceIso) return null;
  const ms = new Date(nowIso).getTime() - new Date(sinceIso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Oldest-untouched-first. `updated_at` is the real "last touched" signal;
 *  fall back to `created_at` for rows where it's null. Does not mutate. */
export function sortByStaleness(rows) {
  return [...rows].sort((a, b) => {
    const aStamp = a.updated_at ?? a.created_at;
    const bStamp = b.updated_at ?? b.created_at;
    return new Date(aStamp).getTime() - new Date(bStamp).getTime();
  });
}
```

Fix the write path — in `update()` (currently around line 304-341), the `patch` object needs `updated_at` set on every real update. Find this block:

```javascript
  const patch = {};
  if (flags.detail != null) patch.detail = flags.detail;
  if (flags.due != null) patch.due_at = flags.due;
  if (flags.priority != null) patch.priority = Number(flags.priority);
  if (flags.label != null) patch.label = flags.label;
```

Replace with:

```javascript
  const patch = { updated_at: new Date().toISOString() };
  if (flags.detail != null) patch.detail = flags.detail;
  if (flags.due != null) patch.due_at = flags.due;
  if (flags.priority != null) patch.priority = Number(flags.priority);
  if (flags.label != null) patch.label = flags.label;
```

And fix the "nothing to change" guard just below it — currently:

```javascript
  if (!Object.keys(patch).length)
    fail("update: nothing to change — pass --detail / --due / --priority / --label / --signal");
```

Since `patch` now always has `updated_at`, `Object.keys(patch).length` is always ≥ 1 — change the guard to count only the meaningful fields:

```javascript
  const { updated_at: _unused, ...meaningful } = patch;
  if (!Object.keys(meaningful).length)
    fail("update: nothing to change — pass --detail / --due / --priority / --label / --signal");
```

Now the read path — replace the whole `list()` function (currently lines 144-154):

```javascript
async function list(args = []) {
  const { flags } = parseArgs(args);
  const rows = await rest("checks?state=eq.open&order=due_at.asc.nullslast&select=*");
  if (!rows.length) {
    console.log("none open ✓");
    return;
  }
  const nowIso = new Date().toISOString();
  const staleDays = flags.stale != null ? Number(flags.stale) : null;

  let out = rows;
  if (staleDays != null) {
    out = sortByStaleness(rows).filter(
      (r) => (ageDays(nowIso, r.updated_at ?? r.created_at) ?? 0) >= staleDays,
    );
  }

  for (const r of out) {
    const due = r.due_at ? ` (due ${fmtDate(r.due_at)})` : "";
    const age = ageDays(nowIso, r.updated_at ?? r.created_at);
    const ageLabel = age != null ? ` [${age}d untouched]` : "";
    console.log(`  ${r.check_key}  ·  ${r.label}${due}${ageLabel}  [${r.project}]`);
  }
  if (staleDays != null && !out.length) console.log(`none untouched ≥${staleDays}d ✓`);
}
```

Wire `args` through from `mainCli()` — find:

```javascript
      case "list":
        await list();
        break;
```

Replace with:

```javascript
      case "list":
        await list(args);
        break;
```

And update the usage string (in the `default` branch of `mainCli()`) to document the new flag — find:

```
'usage:\n  check.mjs list\n  check.mjs open ...
```

Replace `check.mjs list\n` with `check.mjs list [--stale N]  (N = min days untouched; omit to list everything)\n`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/check.test.mjs`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Smoke-test against the real table**

Run: `node scripts/check.mjs list --stale 25`
Expected: prints only checks untouched ≥25 days, each with an `[Nd untouched]` label — should include `surface_parent_links`, `aeo_rich_results_validate`, `master_freshness_drift_gap`, the `row_tier_*` trio, `master_expires_vs_cadence_policy`, and the 7 `corridor_gap_*` checks found in this session's audit. Then run `node scripts/check.mjs update api_b_open_rate_limit --priority 1` (idempotent re-bump) and confirm a following `node scripts/check.mjs list --stale 1` now includes it (proving the write-path fix actually resets its clock).

- [ ] **Step 6: Commit**

```bash
git add scripts/check.mjs scripts/check.test.mjs
git commit -m "fix(checks): update() now bumps updated_at; list gains --stale age filter

updated_at had no DB trigger and update() never set it either — every
check's age was frozen at creation forever, including this session's
own priority bumps. 34-day-stale checks were invisible to \`list\`
because nothing showed age at all."
```

---

## Phase 2 — Land the debris (operator-run commands, no code)

These are git operations gated by CLAUDE.md's no-autonomous-push rule. Each step names the exact command; none of them execute automatically as part of "running this plan" — the operator runs them (or explicitly tells the assistant to, per-command, in the live session).

### Task 3: Land bp-fold's orphaned commit

**Pre-check (repeat right before running — state may have changed):**
```bash
git -C C:/Users/ethan/dev/brain-platform fetch origin main
git -C C:/Users/ethan/dev/brain-platform merge-base --is-ancestor 79794ed3 origin/main && echo "already landed, skip" || echo "still needs landing"
```

- [ ] **Step 1: Fast-forward push the one orphaned commit**
```bash
git -C C:/Users/ethan/dev/brain-platform push origin 79794ed3:main
```
Expected: fast-forward, no conflicts (parent `02a0d26e` already on origin/main per this session's audit).

- [ ] **Step 2: Remove the now-empty worktree**
```bash
git -C C:/Users/ethan/dev/brain-platform worktree remove ../bp-fold
```
(`wt/fold` branch is already deleted — no `git branch -D` needed.)

- [ ] **Step 3: Close the tracking check**
```bash
node scripts/check.mjs close stranded_bp_fold_worktree "landed 79794ed3 via fast-forward, worktree removed" --evidence "commit 79794ed3 confirmed on origin/main via merge-base --is-ancestor"
```

### Task 4: Push this session's held commits (both repos)

- [ ] **Step 1: brain-platform**
```bash
node scripts/safe-push.mjs
```
(If blocked by the no-unapproved-push hook, the operator runs it directly — this is exactly the "operator says push, this conversation, this push" case the hook's own message describes.)

- [ ] **Step 2: swfldatagulf-ops**
```bash
cd C:/Users/ethan/dev/swfldatagulf-ops && git push origin main
```

- [ ] **Step 3: Re-run the drift check**
```bash
cd C:/Users/ethan/dev/brain-platform && git fetch origin main && git log origin/main..HEAD --oneline
```
Expected: empty (nothing local-ahead left over from this session).

### Task 5: Correct the build-queue.md reconciliation banner

Blocked mid-session by a live claim from session `3a8a305d`. Retry once free:

- [ ] **Step 1: Check the claim is released**
```bash
bun run C:/Users/ethan/dev/ws/src/cli.ts claim list --file _AUDIT_AND_ROADMAP/build-queue.md
```

- [ ] **Step 2: Apply the correction**

Replace the false "nothing is held" umbrella (lines 10-18 as of this session) with a dated correction — see the exact replacement text already drafted mid-session (in this conversation's transcript) or re-derive: the 06/21 banner described one point-in-time state, not an invariant; state plainly that `git log @{u}..HEAD` and `git worktree list` are the only ground truth and must be checked live, not inferred from this file.

- [ ] **Step 3: Commit**
```bash
git add _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(build-queue): correct the 06/21 'nothing is held' banner — it's not an invariant"
```

### Task 6: Confirm bp-pipeline-census status

- [ ] **Step 1: Check whether session 2b78034b is still active**

No command reliably detects this from outside — ask the operator directly, or check for recent commits:
```bash
cd C:/Users/ethan/dev/swfldatagulf-ops && git log -5 --oneline --since="30 minutes ago"
```
If commits are landing within the last 30 minutes, it's still live — leave `bp-pipeline-census` alone. If quiet for several hours, re-run the Task-1 worktree check (`node scripts/tripwire-scan.mjs`, once Phase 1 ships) to see if it's flipped from YELLOW to RED, then treat it like Task 3 (land or explicitly abandon — operator decides, since it touches `data_lake.*`, an ask-first surface).

---

## Phase 3 — Triage the pre-existing stale/overdue checks

These are five independent subsystems this plan does NOT pre-write code for — each needs its own read of the current implementation before a real (non-placeholder) task list can be written, per this skill's own rule against fabricating steps for code nobody's looked at yet. Once Phase 1 ships, `node scripts/check.mjs list --stale 20` surfaces the full current list live; treat what's below as the seed, not the final word.

- [ ] **`api_b_open_rate_limit`** (31d, priority 1, security) — `/api/b/*` is unauthenticated + `ACAO:*` + no rate limit. Next step: read `app/api/b/` route handlers, decide the rate-limit strategy (Vercel Firewall? in-route token bucket?), THEN write a plan for it.
- [ ] **`contacts_csv_injection_policy`** (overdue 4d) — decide + implement the CSV/formula-injection policy for contact import. Next step: read the current contacts import path, confirm whether sanitization exists at all.
- [ ] **`contacts_email_vs_public_lane`** (overdue 4d) — reconcile `email_contacts` vs `public.contacts` two-lane + dedupe vCard parsers. Next step: read both table schemas + the import paths that write to each.
- [ ] **`contacts_singleuse_replay_e2e_test`** (overdue 4d) — add a route-level single-use QR-token replay test. Next step: find the QR-token issuance/redemption route, confirm single-use is enforced server-side before writing the test.
- [ ] **`smoke_prod_runner_live_verify`** (overdue 2d) — get the self-healing deploy-bot's prod smoke runner live-verified so CI goes green on main push. Next step: read `docs/superpowers/plans/2026-07-07-self-healing-deploy-bots.md` (an untracked WIP plan another session already has open — coordinate before touching it).
- [ ] **Remaining 28-34d pile** (`surface_parent_links`, `aeo_rich_results_validate`, `master_freshness_drift_gap`, `master_expires_vs_cadence_policy`, `row_tier_t1_transitive_invalidation`, `row_tier_t2_tenancy_seam`, `row_tier_build_remaining`, 7× `corridor_gap_*`) — lower urgency than the security/overdue items above; batch these into a single future triage pass once Phase 1's `--stale` flag is live and the count is re-confirmed (some may have shipped invisibly, per this session's finding that build-queue's own "SHIPPED, verify then close" claim for `surface_parent_links` was never actually verified).

## Phase 4 — Product decision (operator, not code)

- [x] **TWICE-CORRECTED 07/07/2026.** First error: the "zero implementing commits" claim below was wrong — `docs/superpowers/plans/2026-07-05-agent-first-homepage.md` Build 1 is LIVE on `origin/main` since 07/05/2026 (`ed3c5822`, `fb1e8c48` + follow-ons); full verification in `docs/superpowers/specs/2026-07-07-homepage-current-vs-proposed.md`. Second error, compounding the first: this session then attached that correction to the wrong checks — `homepage_rebuild_live_verify` ("commercial spine Lane B", created 07/03) and `homepage_chart_experience_live_verify` ("nautical-chart data experience", created 06/28) — both unrelated, pre-existing, pre-dating this plan. The REAL check, `agent_first_homepage_live_verify` (created 07/05, direct query — invisible to a plain `checks list` scan since it's `state=done`), was **already closed by the operator on 07/05**, i.e. Build 1 isn't just built, it's built AND already live-verified. Both wrongly-touched checks reverted; corrected check-key confirmed via direct Supabase query, not a name-substring match. The operator's actual open decision: (a) nothing needed to close Build 1 — already done; (b) decide on 2 low-risk residual deltas vs. the design spec (slide-recipe chips not first-class campaigns; Mapbox IP-default proximity not Fort Myers/Lee-Collier bias); (c) separately decide whether to fund Builds 2-5 (address spine has its own open check `address_spine_live_verify`, created 07/05, zero commits; lifecycle sequences/send-hardening/voice-depth have no check opened yet at all). `homepage_rebuild_live_verify` and `homepage_chart_experience_live_verify` remain genuinely open, unrelated, uninvestigated work — separate from the agent-first pivot entirely.
- ~~the operator's own 07/05 pivot (MEMORY.md-locked), checks `homepage_rebuild_live_verify` / `homepage_chart_experience_live_verify` open, zero implementing commits since 07/04~~ — superseded by the correction above; this line is struck, not deleted, since it's the exact wrong claim this session relayed to the operator before catching it (twice).

---

## Self-review

**Spec coverage:** bp-fold (Task 3) ✓, bp-pipeline-census (Task 6) ✓, build-queue banner (Task 5) ✓, 5 priority-1 checks (Task 3 closes one; Phase 3 schedules the other 4) ✓, 28-34d stale pile (Phase 3, batched) ✓, homepage zero-commits (Phase 4) ✓, worktree monitoring gap (Task 1) ✓, `*_live_verify` done-vs-not-started ambiguity (Phase 4's re-labeling pattern is the mitigation — no code fix exists for a naming-convention problem) ✓, checks age-signal gap (Task 2) ✓.

**Placeholder scan:** Phase 1 tasks carry full code for every step. Phase 2 tasks carry exact commands. Phase 3 deliberately does NOT carry fake implementation steps — each item states its next step is investigation, which is the honest state, not a placeholder for skipped planning.

**Type consistency:** `classifyWorktree` (Task 1) and `ageDays`/`sortByStaleness` (Task 2) are independent, no shared types between them. Both follow the existing export pattern in their respective files (`closeTier`/`buildSignalProof` in check.mjs; no prior pure exports in tripwire-scan.mjs, so Task 1 establishes the pattern there).
