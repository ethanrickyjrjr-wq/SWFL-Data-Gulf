# Self-Healing Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 9 files, keywords: migration, refactor, architecture

**Goal:** Unblind the silently-down cron incident logger, add an external dead-man's-switch (Healthchecks.io), and enable Dependabot security updates.

**Architecture:** The incident logger (`log-cron-incident.yml` / `.mjs`) is GH013-rejected because it commits the failure ledger to protected `main` as `github-actions[bot]`. We move incident state OFF `main` — into the GitHub Issue + Project #3 feed (already built, currently unreachable because the rejected push throws first) plus a `public.checks` row. We add a one-secret Healthchecks.io ping to the actively-scheduled daily workflows to catch "the schedule never fired," and flip on Dependabot. No code is pushed to `main` from any cron listener ever again.

**Tech Stack:** GitHub Actions (YAML), Node ESM (`.mjs`), `gh` CLI, Supabase PostgREST (via `scripts/check.mjs`), Healthchecks.io (curl ping), Dependabot.

**Context:** A probe-first audit (RULE 0.5) this session overturned the parent Issue-04 spec: daily-rebuild's bypass is already fixed (`REBUILD_PAT`), retry/diagnosis already exist and run (`heal-cron-failure.yml`), and the freshness-probe red is a *working* SLA alarm (never retry it). The genuine gaps are: the incident logger is blind (GH013, ledger silent since 2026-06-22, five freshness-probe failures uncaptured), no external dead-man's-switch exists, and Dependabot is off. Design spec: `docs/superpowers/specs/2026-06-28-self-healing-automation-design.md`. Build slug/check: `self-healing-automation` / `self_healing_automation_live_verify` (open).

## Global Constraints

- **Never push to `main` from an automated cron listener.** Incident state lives in Issues / Project #3 / `public.checks` only.
- **Never wrap `freshness-probe-daily` in retry** — its red is a working SLA alarm.
- **Secrets discipline (pre-push Gate 3):** `gh secret set <NAME>` is step 1; wiring it into workflow `env:`/steps is step 2 — same PR. Keys are in gh repo secrets; don't ask.
- **Stage explicit paths only** (RULE 1.5) — the working tree has unrelated parallel-session changes; never `git add -A`.
- **Action versions in this repo are live:** `actions/checkout@v6`, `actions/setup-node@v5`, `actions/setup-python@v6`, `oven-sh/setup-bun@v2` (bun 1.3.14). Match existing usage; do not invent versions.
- **`docs/cron-rebuild-failures.md` stays readable** — `scripts/session-kickoff.mjs` imports `chronicFlappers` from `ledger-flap.mjs` and greps it. Do NOT delete `ledger-flap.mjs` or the ledger file; only stop the logger from writing to them.
- **Repo is PUBLIC** (`ethanrickyjrjr-wq/SWFL-Data-Gulf`); local dir is `brain-platform`. Actions minutes are free.
- **No push without explicit operator confirmation** (commit locally; stop, show log, ask).

## File Structure

- `scripts/lib/supabase-creds.mjs` — **new.** Pure `resolveSupabaseCreds({ tomlText, env })` → `{url,key}|null`. Lets `check.mjs` work in CI (env) and locally (`.dlt/secrets.toml`).
- `scripts/lib/supabase-creds.test.mjs` — **new.** node:test unit tests for the resolver.
- `scripts/check.mjs` — **modify** `creds()` (lines 49-64) to delegate to the resolver (adds env fallback; no behaviour change locally).
- `.github/scripts/log-cron-incident.mjs` — **modify.** Remove both `gitCommitAndPush` calls + `insertRow` + the markdown-row construction + the `flipMostRecentOpenRow`/`START` import; open/close a `cron_incident_<slug>` check; keep the issue/Project feed.
- `.github/scripts/log-cron-incident.dryrun.test.mjs` — **new.** Subprocess dry-run assertions for both modes.
- `.github/workflows/log-cron-incident.yml` — **modify.** Drop `contents: write`; plain checkout (no token/persist); add `SUPABASE_URL`+`SUPABASE_SERVICE_KEY` env to both jobs.
- `docs/cron-rebuild-failures.md` — **modify.** Add "auto-capture moved" header note.
- `.github/workflows/<active-daily>.yml` (daily-rebuild, freshness-probe-daily, + other active dailies) — **modify.** Add a final `if: success()` Healthchecks.io ping step.
- `.github/dependabot.yml` — **new.** Weekly grouped version-updates (github-actions + pip + npm).

---

### Task 1: Make `check.mjs` credentials work in CI (env fallback)

**Files:**
- Create: `scripts/lib/supabase-creds.mjs`
- Create: `scripts/lib/supabase-creds.test.mjs`
- Modify: `scripts/check.mjs:26-64` (extract `tomlStr` use + `creds()`)

**Interfaces:**
- Produces: `resolveSupabaseCreds({ tomlText, env }) → { url, key } | null` — used by `check.mjs` now and available to the logger. `tomlText` may be `""` (no secrets.toml in CI); `env` is `process.env`. TOML keys win over env; both accept the `BRAINS_`-prefixed variant.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/supabase-creds.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseCreds } from "./supabase-creds.mjs";

test("prefers TOML over env", () => {
  const r = resolveSupabaseCreds({
    tomlText: 'SUPABASE_URL = "https://toml.example/"\nSUPABASE_SERVICE_KEY = "tomlkey"',
    env: { SUPABASE_URL: "https://env.example", SUPABASE_SERVICE_KEY: "envkey" },
  });
  assert.deepEqual(r, { url: "https://toml.example", key: "tomlkey" }); // trailing slash trimmed
});

test("falls back to env when TOML absent (CI)", () => {
  const r = resolveSupabaseCreds({
    tomlText: "",
    env: { SUPABASE_URL: "https://env.example", SUPABASE_SERVICE_KEY: "envkey" },
  });
  assert.deepEqual(r, { url: "https://env.example", key: "envkey" });
});

test("accepts BRAINS_-prefixed env names", () => {
  const r = resolveSupabaseCreds({
    tomlText: "",
    env: { BRAINS_SUPABASE_URL: "https://b.example", BRAINS_SUPABASE_SERVICE_KEY: "bkey" },
  });
  assert.deepEqual(r, { url: "https://b.example", key: "bkey" });
});

test("returns null when neither present", () => {
  assert.equal(resolveSupabaseCreds({ tomlText: "", env: {} }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/supabase-creds.test.mjs`
Expected: FAIL — `Cannot find module './supabase-creds.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/supabase-creds.mjs
// Pure Supabase-credential resolver shared by scripts/check.mjs (and any CI
// caller). TOML (local .dlt/secrets.toml) wins; env vars are the CI fallback.
function tomlStr(toml, key) {
  for (const line of toml.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`));
    if (m) return m[1];
  }
  return null;
}

export function resolveSupabaseCreds({ tomlText = "", env = {} }) {
  const url =
    tomlStr(tomlText, "SUPABASE_URL") ??
    tomlStr(tomlText, "BRAINS_SUPABASE_URL") ??
    env.SUPABASE_URL ??
    env.BRAINS_SUPABASE_URL;
  const key =
    tomlStr(tomlText, "SUPABASE_SERVICE_KEY") ??
    tomlStr(tomlText, "BRAINS_SUPABASE_SERVICE_KEY") ??
    env.SUPABASE_SERVICE_KEY ??
    env.BRAINS_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/supabase-creds.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor `check.mjs` to use the resolver**

Replace `check.mjs` lines 26-33 (`tomlStr`) — delete the local `tomlStr` — and lines 49-64 (`creds()`) with:

```js
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
// ...
function creds() {
  let tomlText = "";
  try {
    tomlText = readFileSync(SECRETS_PATH, "utf8");
  } catch {
    // No local secrets file (e.g. CI) — fall through to env vars.
  }
  const c = resolveSupabaseCreds({ tomlText, env: process.env });
  if (!c) fail("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in secrets or env");
  return c;
}
```

- [ ] **Step 6: Verify check.mjs still works locally**

Run: `node scripts/check.mjs list`
Expected: prints the open checks (unchanged behaviour; reads `.dlt/secrets.toml`).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/supabase-creds.mjs scripts/lib/supabase-creds.test.mjs scripts/check.mjs
git commit -m "feat(check): resolve Supabase creds from env when secrets.toml absent (CI support)"
```

---

### Task 2: Logger `recordFailure` — open a check, stop pushing to main

**Files:**
- 🔴 Modify: `.github/scripts/log-cron-incident.mjs` (`recordFailure`, imports, helpers)
- 🔴 Create: `.github/scripts/log-cron-incident.dryrun.test.mjs` (record-failure case)

**Interfaces:**
- Consumes: `classify` (from `classify-cron-failure.mjs`), `deriveWorkflowName`/`fetchLogTail` (from `lib/cron-run.mjs`), `node scripts/check.mjs open ...` (Task 1 env support).
- Produces: `cronIncidentCheckKey(workflowName) → "cron_incident_<underscored-slug>"` (inline in the logger); the dry-run prints `would open check <key>`.

- [ ] **Step 1: Write the failing test**

```js
// .github/scripts/log-cron-incident.dryrun.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runDryRun(mode, workflowRun) {
  const dir = mkdtempSync(join(tmpdir(), "cron-evt-"));
  const evt = join(dir, "event.json");
  writeFileSync(evt, JSON.stringify({ workflow_run: workflowRun }));
  return execFileSync(
    "node",
    ["log-cron-incident.mjs", `--mode=${mode}`, "--dry-run"],
    { cwd: new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      env: { ...process.env, GITHUB_EVENT_PATH: evt }, encoding: "utf8" },
  );
}

test("record-failure dry-run opens a check and never pushes to main", () => {
  const out = runDryRun("record-failure", {
    id: 123, html_url: "https://x/runs/123", conclusion: "failure",
    event: "schedule", head_branch: "main", name: "Pipeline freshness probe (daily)",
    path: ".github/workflows/freshness-probe-daily.yml",
  });
  assert.match(out, /would open check cron_incident_freshness_probe_daily/);
  assert.doesNotMatch(out, /git push|insert row/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .github/scripts/log-cron-incident.dryrun.test.mjs`
Expected: FAIL — output still says "would insert row" / no "would open check".

- [ ] **Step 3: Edit the imports + add the key helper**

In `.github/scripts/log-cron-incident.mjs`: remove `unlinkSync`? (keep — still used by issue helpers). Remove the import `import { flipMostRecentOpenRow, START } from "./lib/ledger-flap.mjs";`. Remove the `LEDGER_PATH` const and `SYMPTOM_RX` const. Add near the top, after `INCIDENT_TAG`:

```js
const CHECK_PROJECT = "brain-platform";
const checkKey = cronIncidentCheckKey(workflowName);
function cronIncidentCheckKey(name) {
  return `cron_incident_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
}
```

- [ ] **Step 4: Rewrite `recordFailure`**

Replace the whole `recordFailure()` body with:

```js
function recordFailure() {
  if (conclusion !== "failure") return log(`skip: conclusion is ${conclusion}`);
  if (headBranch && headBranch !== "main")
    return log(`skip: head_branch is ${headBranch}, not main`);

  const logTail = fetchLogTail(runId);
  const cls = classify(logTail);
  let suggestedAction = cls.suggestedAction;
  if (cls.klass === "MISSING_DEP" && isLocalModule(cls.signal)) {
    suggestedAction = `\`${cls.signal}\` matches a local module in this repo — this is an import-path bug, NOT a missing PyPI package. Do not add it to requirements.txt; fix the import.`;
  }
  const detail = `${cls.klass}${cls.signal ? ` — ${cls.signal}` : ""} · ${runUrl}`;

  if (dryRun) {
    log(`DRY-RUN: would open check ${checkKey} (detail: ${detail})`);
    if (issueNumber) log(`DRY-RUN: would comment on issue #${issueNumber}`);
    log(`DRY-RUN: would open discrete issue "${INCIDENT_TAG} ${cls.klass} · ${workflowDisplayName} — ${today}"`);
    return;
  }

  openIncidentCheck(detail);
  if (issueNumber) {
    try { postComment(buildFailureBody(logTail)); }
    catch (e) { log(`WARN: postComment failed (non-fatal): ${e.message}`); }
  }
  try { openIncidentIssue(logTail, cls, suggestedAction); }
  catch (e) { log(`WARN: openIncidentIssue failed (non-fatal): ${e.message}`); }
}
```

- [ ] **Step 5: Add the check open/close helpers + delete dead code**

Delete `insertRow`, `extractSymptom`, `escapeCell`, and `gitCommitAndPush`. Add:

```js
// ---------- public.checks (off-main incident state) ----------
function openIncidentCheck(detail) {
  // Idempotent: a flapper failing repeatedly keeps ONE open check. check.mjs
  // `open` exits non-zero if the key already exists — swallow that case.
  try {
    sh(`node scripts/check.mjs open ${CHECK_PROJECT} ${checkKey} "cron failure: ${workflowName}" --detail "${detail.replace(/"/g, "'")}"`);
    log(`opened check ${checkKey}`);
  } catch {
    log(`check ${checkKey} already open (ok)`);
  }
}
function closeIncidentCheck() {
  try {
    sh(`node scripts/check.mjs close ${checkKey} "next scheduled run succeeded ${runUrl}"`);
    log(`closed check ${checkKey}`);
  } catch (e) {
    log(`could not close check ${checkKey} (non-fatal): ${e.message}`);
  }
}
```

- [ ] **Step 6: Run the dry-run test**

Run: `node --test .github/scripts/log-cron-incident.dryrun.test.mjs`
Expected: PASS (record-failure case).

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/log-cron-incident.mjs .github/scripts/log-cron-incident.dryrun.test.mjs
git commit -m "feat(cron-logger): record failures via public.checks + issues, stop pushing ledger to main"
```

---

### Task 3: Logger `maybeResolve` — close the check, stop pushing to main

**Files:**
- 🔴 Modify: `.github/scripts/log-cron-incident.mjs` (`maybeResolve`)
- 🔴 Modify: `.github/scripts/log-cron-incident.dryrun.test.mjs` (add maybe-resolve case)

**Interfaces:**
- Consumes: `closeIncidentCheck`/`closeIncidentIssue` (Task 2), `cronIncidentCheckKey` (Task 2).

- [ ] **Step 1: Add the failing test case**

Append to `.github/scripts/log-cron-incident.dryrun.test.mjs`:

```js
test("maybe-resolve dry-run closes the check and never pushes to main", () => {
  const out = runDryRun("maybe-resolve", {
    id: 124, html_url: "https://x/runs/124", conclusion: "success",
    event: "schedule", head_branch: "main", name: "Pipeline freshness probe (daily)",
    path: ".github/workflows/freshness-probe-daily.yml",
  });
  assert.match(out, /would close check cron_incident_freshness_probe_daily/);
  assert.doesNotMatch(out, /git push|flip|OPEN row/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .github/scripts/log-cron-incident.dryrun.test.mjs`
Expected: FAIL — maybe-resolve still references the ledger / no "would close check".

- [ ] **Step 3: Rewrite `maybeResolve`**

Replace the whole `maybeResolve()` body with:

```js
function maybeResolve() {
  if (conclusion !== "success") return log(`skip: conclusion is ${conclusion}`);
  if (triggerEvent !== "schedule") return log(`skip: trigger is ${triggerEvent}, not schedule`);

  if (dryRun) {
    log(`DRY-RUN: would close check ${checkKey}`);
    if (issueNumber) log(`DRY-RUN: would comment ✅ on issue #${issueNumber}`);
    log(`DRY-RUN: would close open incident issue tagged ${INCIDENT_TAG}`);
    return;
  }

  closeIncidentCheck();
  if (issueNumber)
    postComment(`✅ **${workflowName}** auto-resolved — ${today}\n\nNext scheduled run succeeded: ${runUrl}`);
  closeIncidentIssue();
}
```

Note: `check.mjs close` is idempotent-safe — closing an already-closed/absent key just patches 0 rows and `closeIncidentCheck` swallows the resulting non-zero. Remove the now-unused `readFileSync`/`writeFileSync`/`unlinkSync` imports ONLY if no remaining function uses them (the issue helpers use `writeFileSync`/`unlinkSync` for temp files — keep those; `readFileSync` of the event payload at the top still uses it — keep).

- [ ] **Step 4: Run the dry-run test**

Run: `node --test .github/scripts/log-cron-incident.dryrun.test.mjs`
Expected: PASS (both cases).

- [ ] **Step 5: Confirm no remaining main-push / ledger write**

Run: `grep -nE "gitCommitAndPush|insertRow|flipMostRecentOpenRow|git push|LEDGER_PATH" .github/scripts/log-cron-incident.mjs`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/log-cron-incident.mjs .github/scripts/log-cron-incident.dryrun.test.mjs
git commit -m "feat(cron-logger): auto-resolve closes the check + issue, no ledger write"
```

---

### Task 4: Workflow permissions + Supabase env + ledger header note

**Files:**
- Modify: `.github/workflows/log-cron-incident.yml`
- Modify: `docs/cron-rebuild-failures.md` (header, above the table)

- [ ] **Step 1: Edit `log-cron-incident.yml` permissions**

Change the `permissions:` block from:
```yaml
permissions:
  contents: write # commit ledger edits
  issues: write
  actions: read
  repository-projects: write
```
to:
```yaml
permissions:
  contents: read # checkout only — incident state lives in issues/checks, never a main push
  issues: write
  actions: read
  repository-projects: write
```

- [ ] **Step 2: Make both jobs' checkouts plain + add Supabase env**

In BOTH `record_failure` and `maybe_auto_resolve`, change the checkout to a plain `- uses: actions/checkout@v6` (remove `with: ref/token/fetch-depth`). In the `Record failure` and `Maybe auto-resolve` steps, add to `env:`:
```yaml
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```
(Keep `GH_TOKEN` and `CRON_INCIDENT_ISSUE_NUMBER`.)

- [ ] **Step 3: Add the "auto-capture moved" note to the ledger**

Insert immediately after the intro paragraph (before `Status key:`) in `docs/cron-rebuild-failures.md`:

```markdown
> **2026-06-28 — auto-capture moved off `main`.** New incidents are recorded as GitHub Issues
> (label `cron-failure`, Ops Incidents Project #3) and `public.checks` rows (`cron_incident_*`),
> not as rows here — the old auto-commit was GH013-rejected by the `main` ruleset. Rows below are
> historical or hand-added; `scripts/session-kickoff.mjs` still reads them for chronic-flapper stats.
> Add manual triage rows as before.
```

- [ ] **Step 4: Validate the YAML + assertions**

Run: `grep -q "contents: read" .github/workflows/log-cron-incident.yml && grep -q "SUPABASE_SERVICE_KEY" .github/workflows/log-cron-incident.yml && ! grep -q "contents: write" .github/workflows/log-cron-incident.yml && echo ok`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/log-cron-incident.yml docs/cron-rebuild-failures.md
git commit -m "chore(cron-logger): drop contents:write, add Supabase env, note ledger migration"
```

---

### Task 5: Healthchecks.io dead-man's-switch — secret + the two certain dailies

**Files:**
- Modify: `.github/workflows/daily-rebuild.yml`, `.github/workflows/freshness-probe-daily.yml`

**Operator prerequisite (manual, cannot be automated):**
1. Create a free Healthchecks.io Hobbyist account; create/confirm a Project; copy its **Ping Key** (Project Settings → Ping Key).
2. Configure the project's email (or Slack) notification channel.
3. Set the secret: `gh secret set HEALTHCHECKS_PING_KEY -R ethanrickyjrjr-wq/SWFL-Data-Gulf` (paste the Ping Key). Confirm: `gh secret list -R ethanrickyjrjr-wq/SWFL-Data-Gulf | grep HEALTHCHECKS`.

- [ ] **Step 1: Add the ping step to `daily-rebuild.yml`**

As the LAST step of the `rebuild` job, append:

```yaml
      - name: Ping Healthchecks.io (success heartbeat)
        if: success()
        run: |
          curl -fsS -m 10 --retry 3 \
            "https://hc-ping.com/${{ secrets.HEALTHCHECKS_PING_KEY }}/daily-rebuild?create=1" || true
```

- [ ] **Step 2: Add the ping step to `freshness-probe-daily.yml`**

As the LAST step of the `probe` job, append the same step with slug `freshness-probe-daily`.

- [ ] **Step 3: Verify the pings land (live)**

After the secret is set + these are committed/pushed: `gh workflow run "Pipeline freshness probe (daily)" -R ethanrickyjrjr-wq/SWFL-Data-Gulf` (and daily-rebuild), then confirm in the Healthchecks.io UI that both checks exist (auto-provisioned) and went green. The ping URL is masked in the run log.

- [ ] **Step 4: Configure each check's schedule + grace in the HC UI**

Set each check to "Cron" schedule matching the workflow (`0 6 * * *` daily-rebuild, `0 14 * * *` freshness-probe), grace ~3h (GitHub delays our scheduled runs 1–2.5h), timezone UTC.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/daily-rebuild.yml .github/workflows/freshness-probe-daily.yml
git commit -m "feat(cron): Healthchecks.io heartbeat on daily-rebuild + freshness-probe"
```

---

### Task 6: Healthchecks.io — extend to the remaining ACTIVE dailies

**Files:**
- Modify: each actively-scheduled daily workflow (confirm schedule is uncommented before adding).

- [ ] **Step 1: Enumerate actively-scheduled dailies**

Run: `grep -rL "# *- cron" .github/workflows | xargs grep -lE "cron: \"0 [0-9]+ \* \* \*\"" 2>/dev/null` — then for each candidate confirm the `schedule:` block is NOT commented out (city-pulse-daily IS paused — skip it and any other `# schedule` ones). Target set among: `active-listings-daily`, `listing-lifecycle-daily`, `live-search-daily`, `data-targets-daily`, `data-readiness-cron`, `project-feed-change-detection-daily`, `deliverables-retention-sweep-daily`, `daily-email-digest`, `email-scheduler`. Record the confirmed-active list before editing.

- [ ] **Step 2: Add the same ping step to each confirmed-active daily**

For each, append as the final job step (slug = the workflow filename minus `.yml`):

```yaml
      - name: Ping Healthchecks.io (success heartbeat)
        if: success()
        run: |
          curl -fsS -m 10 --retry 3 \
            "https://hc-ping.com/${{ secrets.HEALTHCHECKS_PING_KEY }}/<slug>?create=1" || true
```

- [ ] **Step 3: Confirm the count stays under the free-tier cap**

Count the slugs added (Tasks 5+6). Must be ≤ ~20 (Healthchecks Hobbyist). If the active set + the 2 from Task 5 exceeds it, keep only the load-bearing dailies and `log()` which were dropped (no silent truncation).

- [ ] **Step 4: Verify + configure grace per check**

Manual-dispatch one or two, confirm auto-provisioned green in HC, set each to Cron mode + ~3h grace.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/<each-edited>.yml
git commit -m "feat(cron): Healthchecks.io heartbeat on remaining active daily pipelines"
```

---

### Task 7: Enable Dependabot security updates + version-update policy

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Enable the repo toggles (operator-confirmed; outward-facing)**

```bash
gh api -X PUT repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/vulnerability-alerts
gh api -X PUT repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/automated-security-fixes
```

- [ ] **Step 2: Verify the toggle**

Run: `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/automated-security-fixes`
Expected: `{"enabled":true,"paused":false}`.

- [ ] **Step 3: Add `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      actions:
        patterns: ["*"]
    open-pull-requests-limit: 5
  - package-ecosystem: "pip"
    directory: "/ingest"
    schedule:
      interval: "weekly"
    groups:
      pip:
        patterns: ["*"]
    open-pull-requests-limit: 3
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      npm:
        patterns: ["*"]
    open-pull-requests-limit: 3
```

- [ ] **Step 4: Validate the YAML**

Run: `test -f .github/dependabot.yml && echo exists`
Expected: `exists`. (Dependabot validates server-side on push; check the repo Insights → Dependency graph → Dependabot tab after push.)

- [ ] **Step 5: Commit**

```bash
git add .github/dependabot.yml
git commit -m "chore(deps): enable Dependabot weekly grouped version updates"
```

---

## Push, verify, close (after all tasks)

- [ ] Append a SESSION_LOG.md entry (what changed, what's next, per RULE 0). Sync `_AUDIT_AND_ROADMAP/build-queue.md`.
- [ ] Push as operator-confirmed via `node scripts/safe-push.mjs` (Gate 3 will check `HEALTHCHECKS_PING_KEY` is set since workflow env references it). Stage explicit paths only.
- [ ] **Live verify (DoD):** manually dispatch a workflow that will fail (or wait for a real failure) → confirm a `[cron-failure:<slug>]` issue opens + Project #3 card + `cron_incident_<slug>` check opens (`node scripts/check.mjs list`), and the `log-cron-incident` run is GREEN (no GH013). Then a successful scheduled run → issue + check auto-close.
- [ ] **Live verify dead-man:** confirm both Task-5 checks went green in Healthchecks.io after a real/dispatched run.
- [ ] **Live verify Dependabot:** `automated-security-fixes` → `enabled:true`; Dependabot tab shows the config.
- [ ] Close the check on live proof: `node scripts/check.mjs close self_healing_automation_live_verify "logger unblinded + HC heartbeats green + Dependabot on — <run links>"`.

## Verification summary

- Unit: `node --test scripts/lib/supabase-creds.test.mjs` (4) + `node --test .github/scripts/log-cron-incident.dryrun.test.mjs` (2) green.
- Grep: no `gitCommitAndPush|git push|insertRow|flipMostRecentOpenRow|contents: write` in the logger/workflow.
- Live: forced failure → issue + check open, logger run green; success → auto-close; HC checks green; Dependabot `enabled:true`.

## Out of scope (tracked separately)
- **Item 4** — minute-0 cron offset sweep (~75 files): its own spec `2026-06-28-cron-minute-offset-sweep-design.md` + `new-build.mjs cron-minute-offset-sweep "..."`.
- **Stale source** — `freshness-probe-daily` is red because a real SLA source breached `error_after_days`; identify + refresh it (`python -m ingest.scripts.check_freshness` with `.dlt/secrets.toml`). Data work, not this build.

## Self-review
- **Spec coverage:** Item 1 → Tasks 1-4; Item 2 → Tasks 5-6; Item 3 → Task 7; Item 4 + stale-source explicitly out of scope. ✓
- **Placeholders:** none — every code/test step carries real content; the only deferred decision (which dailies are active) is an explicit enumerate-then-edit step with a hard cap guard. ✓
- **Type/name consistency:** `resolveSupabaseCreds`, `cronIncidentCheckKey`, `openIncidentCheck`/`closeIncidentCheck`, `checkKey`, slug = workflow-filename-stem used consistently across tasks. ✓

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `.github/scripts/log-cron-incident.mjs`, `.github/scripts/log-cron-incident.dryrun.test.mjs` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
