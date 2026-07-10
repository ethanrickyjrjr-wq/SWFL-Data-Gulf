# Chief-of-Staff Nightly Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 7 tasks, 9 files, keywords: architecture

**Goal:** A nightly GHA job that reconciles the last 48h of git history against the open checks ledger and posts a propose-only "Morning brief" GitHub issue, surfaced in the session kickoff block.

**Architecture:** Deterministic collector ($0) builds `evidence.json` → bounded `claude-code-action@v1` agent (Sonnet 4.6, read-only tools, ≤30 turns) drafts `chief-of-staff-brief.md` → deterministic lint validates (SHA-in-pack, ≤15 candidates, sections) and posts the issue via `gh`. Kickoff prints the newest brief's close candidates. Spec: `docs/superpowers/specs/2026-07-10-chief-of-staff-nightly-design.md`.

**Tech Stack:** Node .mjs scripts (ESM, zero new deps), bun test, GitHub Actions, `anthropics/claude-code-action@v1`, Supabase REST (existing `scripts/lib/supabase-creds.mjs`).

## Global Constraints

- Model: `claude-sonnet-4-6` (operator decision 07/10/2026). Never `master --force` anything; this build touches no brains.
- The bot NEVER closes checks, pushes, or writes anything except the brief file and the issue. Permissions: `contents: read`, `issues: write` only.
- Every close candidate must cite ≥1 SHA present in the evidence pack. Max 15 candidates. Confidence tiers HIGH|MEDIUM only.
- Kill switch: repo variable `CHIEF_OF_STAFF_ENABLED != 'false'` gates the job (convention of `CRON_HEAL_ENABLED`).
- Dates render MM/DD/YYYY. Kickoff integration is best-effort — any failure degrades silently (`session-kickoff.mjs` convention: never block session start).
- All new scripts are plain Node ESM run with `node`; tests run with `bun test`.
- Commit per task with explicit paths (`git add <paths>`, never `-A`). Do NOT push — operator pushes after review (SESSION_LOG entry required in the push).

## File Structure

- `scripts/chief-of-staff-lib.mjs` — pure functions only (no I/O): git-log parsing, staleness, never-started heuristic, evidence-pack assembly, brief lint, kickoff-line extraction, repo-slug parsing. Everything unit-testable lives here.
- `scripts/chief-of-staff.test.mjs` — bun tests for the lib.
- `scripts/chief-of-staff-collect.mjs` — thin CLI: runs git, queries Supabase checks, writes `evidence.json`.
- `scripts/chief-of-staff-lint.mjs` — thin CLI: validates brief against evidence, exit 0/1.
- `.github/workflows/chief-of-staff-nightly.yml` — the cron.
- Modify `.github/workflows/log-cron-incident.yml` — add to watched list.
- Modify `scripts/session-kickoff.mjs` — morning-brief block.
- Modify `.gitignore` — ignore `evidence.json` + `chief-of-staff-brief.md` (local dispatch testing must never commit them).

---

### Task 1: Lib — evidence-pack pure functions

**Files:**
- 🔴 Create: `scripts/chief-of-staff-lib.mjs`
- 🔴 Test: `scripts/chief-of-staff.test.mjs`

**Interfaces:**
- Produces: `parseGitLogNameOnly(text) -> [{sha, subject, files: string[]}]`
- Produces: `staleChecks(rows, {minDays=14, now}) -> [{check_key, label, days_untouched}]` sorted oldest-first (rows are Supabase `checks` rows with `check_key`, `label`, `updated_at`)
- Produces: `neverStartedLiveVerifies(rows, fullLogText) -> [{check_key, label}]`
- Produces: `buildEvidencePack({commits, checks, fullLogText, now}) -> pack` where pack = `{generated_at, window_hours: 48, commits, checks: [{check_key,label,project,detail,due_at,days_untouched}], live_verify_never_started, stale}`

- [ ] **Step 1: Write the failing tests**

```js
// scripts/chief-of-staff.test.mjs
import { describe, expect, test } from "bun:test";
import {
  parseGitLogNameOnly,
  staleChecks,
  neverStartedLiveVerifies,
  buildEvidencePack,
} from "./chief-of-staff-lib.mjs";

const LOG = [
  "aaaa111\tfeat(zip-events): market-area alert event",
  "lib/email/zip-events/types.ts",
  "lib/email/zip-events/market-areas.ts",
  "",
  "bbbb222\tdocs(spec): send-window guidance",
  "docs/superpowers/specs/2026-07-10-send-window-guidance-design.md",
].join("\n");

const NOW = new Date("2026-07-10T12:00:00Z");

const rows = [
  {
    check_key: "market_area_alerts_live_verify",
    label: "Market area alerts live-verify",
    project: "email",
    detail: null,
    due_at: null,
    updated_at: "2026-07-09T12:00:00Z",
  },
  {
    check_key: "phantom_build_live_verify",
    label: "Phantom build live-verify",
    project: "email",
    detail: null,
    due_at: null,
    updated_at: "2026-06-01T12:00:00Z",
  },
  {
    check_key: "old_manual_check",
    label: "Old manual",
    project: "ops",
    detail: "d",
    due_at: "2026-07-01",
    updated_at: "2026-06-20T12:00:00Z",
  },
];

describe("parseGitLogNameOnly", () => {
  test("parses sha, subject, files per commit", () => {
    const commits = parseGitLogNameOnly(LOG);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      sha: "aaaa111",
      subject: "feat(zip-events): market-area alert event",
      files: ["lib/email/zip-events/types.ts", "lib/email/zip-events/market-areas.ts"],
    });
    expect(commits[1].files).toHaveLength(1);
  });
  test("empty input -> empty array", () => {
    expect(parseGitLogNameOnly("")).toEqual([]);
  });
});

describe("staleChecks", () => {
  test("returns >=14d untouched, oldest first", () => {
    const stale = staleChecks(rows, { minDays: 14, now: NOW });
    expect(stale.map((s) => s.check_key)).toEqual(["phantom_build_live_verify", "old_manual_check"]);
    expect(stale[0].days_untouched).toBe(39);
  });
});

describe("neverStartedLiveVerifies", () => {
  test("live_verify with no slug mention in history = never started", () => {
    // full-history log mentions market-area (hyphen form) but never phantom_build
    const full = "aaaa111 feat(zip-events): market-area-alerts event types\ncccc333 chore: misc";
    const out = neverStartedLiveVerifies(rows, full);
    expect(out.map((o) => o.check_key)).toEqual(["phantom_build_live_verify"]);
  });
  test("matches underscore and hyphen slug variants case-insensitively", () => {
    const full = "dddd444 feat: PHANTOM-BUILD scaffolding";
    const out = neverStartedLiveVerifies(rows, full);
    expect(out.map((o) => o.check_key)).toEqual(["market_area_alerts_live_verify"]);
  });
});

describe("buildEvidencePack", () => {
  test("assembles all sections with window_hours 48", () => {
    const pack = buildEvidencePack({
      commits: parseGitLogNameOnly(LOG),
      checks: rows,
      fullLogText: "x",
      now: NOW,
    });
    expect(pack.window_hours).toBe(48);
    expect(pack.commits).toHaveLength(2);
    expect(pack.checks).toHaveLength(3);
    expect(pack.checks[0].days_untouched).toBe(1);
    expect(pack.live_verify_never_started.length).toBeGreaterThan(0);
    expect(pack.stale[0].check_key).toBe("phantom_build_live_verify");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/chief-of-staff.test.mjs`
Expected: FAIL — cannot resolve `./chief-of-staff-lib.mjs`

- [ ] **Step 3: Write the implementation**

```js
// scripts/chief-of-staff-lib.mjs
// Pure functions for the chief-of-staff nightly cron. NO I/O here — the
// collect/lint CLIs own filesystem, git, and network. Spec:
// docs/superpowers/specs/2026-07-10-chief-of-staff-nightly-design.md

const DAY_MS = 86_400_000;

/** Parse `git log --pretty=format:%H%x09%s --name-only` output. */
export function parseGitLogNameOnly(text) {
  const commits = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^([0-9a-f]{7,40})\t(.*)$/);
    if (m) {
      cur = { sha: m[1], subject: m[2], files: [] };
      commits.push(cur);
    } else if (cur) {
      cur.files.push(line.trim());
    }
  }
  return commits;
}

function daysUntouched(row, now) {
  const t = Date.parse(row.updated_at ?? "");
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

/** Open checks untouched >= minDays, oldest first. */
export function staleChecks(rows, { minDays = 14, now = new Date() } = {}) {
  return rows
    .map((r) => ({ check_key: r.check_key, label: r.label, days_untouched: daysUntouched(r, now) }))
    .filter((r) => r.days_untouched != null && r.days_untouched >= minDays)
    .sort((a, b) => b.days_untouched - a.days_untouched);
}

/** live_verify checks whose slug (underscore or hyphen form) never appears in full history. */
export function neverStartedLiveVerifies(rows, fullLogText) {
  const hay = String(fullLogText).toLowerCase();
  return rows
    .filter((r) => r.check_key.endsWith("_live_verify"))
    .filter((r) => {
      const slug = r.check_key.replace(/_live_verify$/, "").toLowerCase();
      return !hay.includes(slug) && !hay.includes(slug.replace(/_/g, "-"));
    })
    .map((r) => ({ check_key: r.check_key, label: r.label }));
}

export function buildEvidencePack({ commits, checks, fullLogText, now = new Date() }) {
  return {
    generated_at: now.toISOString(),
    window_hours: 48,
    commits,
    checks: checks.map((r) => ({
      check_key: r.check_key,
      label: r.label,
      project: r.project ?? null,
      detail: r.detail ?? null,
      due_at: r.due_at ?? null,
      days_untouched: daysUntouched(r, now),
    })),
    live_verify_never_started: neverStartedLiveVerifies(checks, fullLogText),
    stale: staleChecks(checks, { now }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/chief-of-staff.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/chief-of-staff-lib.mjs scripts/chief-of-staff.test.mjs
git commit -m "feat(chief-of-staff): evidence-pack pure functions (parse/stale/never-started/pack)"
```

---

### Task 2: Lib — brief lint + kickoff/slug helpers

**Files:**
- 🔴 Modify: `scripts/chief-of-staff-lib.mjs` (append)
- 🔴 Test: `scripts/chief-of-staff.test.mjs` (append)

**Interfaces:**
- Produces: `lintBrief(briefText, pack) -> {ok: boolean, errors: string[]}`
- Produces: `briefKickoffLines(briefText, {max=5}) -> string[]` (candidate lines from the Close-candidates section)
- Produces: `repoSlugFromRemoteUrl(url) -> "owner/repo" | null`

Brief format the lint enforces (the agent prompt in Task 5 mandates the same format):

```
## Close candidates
- <check_key> — <sha>[, <sha>…] — <one-line why> — HIGH|MEDIUM

## Never started
…

## Stale top 3
…

## No evidence
<N> open checks had no matching work in the window.
```

- [ ] **Step 1: Write the failing tests (append to scripts/chief-of-staff.test.mjs)**

```js
import { lintBrief, briefKickoffLines, repoSlugFromRemoteUrl } from "./chief-of-staff-lib.mjs";

const PACK = {
  commits: [
    { sha: "aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1", subject: "s", files: [] },
    { sha: "bbbb222bbbb222bbbb222bbbb222bbbb222bbbb2", subject: "t", files: [] },
  ],
};

const GOOD = [
  "## Close candidates",
  "- market_area_alerts_live_verify — aaaa111 — types+fixture committed — HIGH",
  "- old_manual_check — bbbb222 — docs landed — MEDIUM",
  "",
  "## Never started",
  "- phantom_build_live_verify",
  "",
  "## Stale top 3",
  "- phantom_build_live_verify (39d)",
  "",
  "## No evidence",
  "197 open checks had no matching work in the window.",
].join("\n");

describe("lintBrief", () => {
  test("accepts a well-formed brief", () => {
    expect(lintBrief(GOOD, PACK)).toEqual({ ok: true, errors: [] });
  });
  test("rejects SHA not in the evidence pack", () => {
    const bad = GOOD.replace("aaaa111", "deadbee");
    const r = lintBrief(bad, PACK);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("deadbee");
  });
  test("rejects a candidate line without HIGH/MEDIUM tier", () => {
    const bad = GOOD.replace(" — HIGH", "");
    expect(lintBrief(bad, PACK).ok).toBe(false);
  });
  test("rejects >15 candidates", () => {
    const many = Array.from(
      { length: 16 },
      (_, i) => `- k${i} — aaaa111 — why — HIGH`,
    ).join("\n");
    const bad = GOOD.replace(/- market.*MEDIUM/s, many);
    const r = lintBrief(bad, PACK);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("15");
  });
  test("rejects a brief missing a required section", () => {
    const bad = GOOD.replace("## No evidence", "## Whatever");
    expect(lintBrief(bad, PACK).ok).toBe(false);
  });
  test("accepts an empty candidates section (0 candidates is success)", () => {
    const empty = GOOD.replace(/- market.*MEDIUM/s, "(none)");
    expect(lintBrief(empty, PACK).ok).toBe(true);
  });
});

describe("briefKickoffLines", () => {
  test("returns up to max candidate lines", () => {
    expect(briefKickoffLines(GOOD, { max: 1 })).toEqual([
      "- market_area_alerts_live_verify — aaaa111 — types+fixture committed — HIGH",
    ]);
  });
  test("no section -> empty array", () => {
    expect(briefKickoffLines("hello", { max: 5 })).toEqual([]);
  });
});

describe("repoSlugFromRemoteUrl", () => {
  test("https form", () => {
    expect(repoSlugFromRemoteUrl("https://github.com/owner/repo.git")).toBe("owner/repo");
  });
  test("ssh form", () => {
    expect(repoSlugFromRemoteUrl("git@github.com:owner/repo.git")).toBe("owner/repo");
  });
  test("garbage -> null", () => {
    expect(repoSlugFromRemoteUrl("not a url")).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bun test scripts/chief-of-staff.test.mjs`
Expected: FAIL — `lintBrief` not exported

- [ ] **Step 3: Implement (append to scripts/chief-of-staff-lib.mjs)**

```js
const REQUIRED_SECTIONS = ["## Close candidates", "## Never started", "## Stale top 3", "## No evidence"];
const CANDIDATE_RE = /^- (\S+) — ([0-9a-f]{7,40}(?:, ?[0-9a-f]{7,40})*) — .+ — (HIGH|MEDIUM)$/;
const MAX_CANDIDATES = 15;

function candidateSection(briefText) {
  const m = String(briefText).match(/## Close candidates\n([\s\S]*?)(?:\n## |$)/);
  return m ? m[1].trim() : null;
}

/** Validate a drafted brief against the evidence pack. Deterministic, $0. */
export function lintBrief(briefText, pack) {
  const errors = [];
  for (const s of REQUIRED_SECTIONS) {
    if (!String(briefText).includes(s)) errors.push(`missing section: ${s}`);
  }
  const section = candidateSection(briefText);
  if (section != null) {
    const lines = section.split("\n").filter((l) => l.startsWith("- "));
    if (lines.length > MAX_CANDIDATES) errors.push(`too many candidates: ${lines.length} > ${MAX_CANDIDATES}`);
    for (const line of lines) {
      const m = line.match(CANDIDATE_RE);
      if (!m) {
        errors.push(`malformed candidate line: ${line}`);
        continue;
      }
      for (const sha of m[2].split(",").map((s) => s.trim())) {
        if (!pack.commits.some((c) => c.sha.startsWith(sha))) {
          errors.push(`cited SHA not in evidence pack: ${sha}`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Top candidate lines for the session kickoff block. */
export function briefKickoffLines(briefText, { max = 5 } = {}) {
  const section = candidateSection(briefText);
  if (!section) return [];
  return section.split("\n").filter((l) => CANDIDATE_RE.test(l)).slice(0, max);
}

/** "owner/repo" from a git remote URL (https or ssh), else null. */
export function repoSlugFromRemoteUrl(url) {
  const m = String(url).match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/chief-of-staff.test.mjs`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/chief-of-staff-lib.mjs scripts/chief-of-staff.test.mjs
git commit -m "feat(chief-of-staff): brief lint, kickoff-line extraction, repo-slug helper"
```

---

### Task 3: Collect + lint CLIs

**Files:**
- Create: `scripts/chief-of-staff-collect.mjs`
- Create: `scripts/chief-of-staff-lint.mjs`
- Modify: `.gitignore` (append two lines)

**Interfaces:**
- Consumes: `buildEvidencePack`, `parseGitLogNameOnly`, `lintBrief` from `scripts/chief-of-staff-lib.mjs`; `resolveSupabaseCreds` from `scripts/lib/supabase-creds.mjs` (existing — signature `resolveSupabaseCreds({tomlText, env}) -> {url, key} | null`).
- Produces: `node scripts/chief-of-staff-collect.mjs --out evidence.json` (exit 1 with message on missing creds/git failure); `node scripts/chief-of-staff-lint.mjs --brief <file> --evidence <file>` (exit 0 pass / 1 fail, errors on stderr).

- [ ] **Step 1: Write chief-of-staff-collect.mjs**

```js
#!/usr/bin/env node
// Deterministic evidence collector for the chief-of-staff nightly cron. $0 — no LLM.
// Usage: node scripts/chief-of-staff-collect.mjs --out evidence.json
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { parseGitLogNameOnly, buildEvidencePack } from "./chief-of-staff-lib.mjs";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "evidence.json";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  const secretsPath = resolve(process.cwd(), ".dlt/secrets.toml");
  const creds = resolveSupabaseCreds({
    tomlText: existsSync(secretsPath) ? readFileSync(secretsPath, "utf8") : "",
    env: process.env,
  });
  if (!creds) {
    console.error("collect: no Supabase creds (secrets.toml or env)");
    process.exit(1);
  }

  const res = await fetch(
    `${creds.url}/rest/v1/checks?state=eq.open&order=due_at.asc.nullslast&select=check_key,label,project,detail,due_at,updated_at`,
    { headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` } },
  );
  if (!res.ok) {
    console.error(`collect: checks query failed HTTP ${res.status}`);
    process.exit(1);
  }
  const checks = await res.json();

  const commits = parseGitLogNameOnly(
    git(["log", "--since=48 hours ago", "--pretty=format:%H\t%s", "--name-only"]),
  );
  const fullLogText = git(["log", "--pretty=format:%h %s"]);

  const pack = buildEvidencePack({ commits, checks, fullLogText });
  writeFileSync(OUT, JSON.stringify(pack, null, 2));
  console.log(
    `collect: ${pack.commits.length} commits (48h) · ${pack.checks.length} open checks · ` +
      `${pack.live_verify_never_started.length} never-started · ${pack.stale.length} stale -> ${OUT}`,
  );
}

main().catch((e) => {
  console.error(`collect: ${e.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Write chief-of-staff-lint.mjs**

```js
#!/usr/bin/env node
// Deterministic brief validator. Exit 0 = safe to post; exit 1 = do NOT post.
// Usage: node scripts/chief-of-staff-lint.mjs --brief chief-of-staff-brief.md --evidence evidence.json
import { readFileSync } from "node:fs";
import { lintBrief } from "./chief-of-staff-lib.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : dflt;
}

const brief = readFileSync(arg("--brief", "chief-of-staff-brief.md"), "utf8");
const pack = JSON.parse(readFileSync(arg("--evidence", "evidence.json"), "utf8"));

const { ok, errors } = lintBrief(brief, pack);
if (!ok) {
  console.error("lint: brief REJECTED — nothing will post");
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}
console.log("lint: brief OK");
```

- [ ] **Step 3: Append to .gitignore**

```
# chief-of-staff nightly working files (CI workspace + local dispatch testing)
evidence.json
chief-of-staff-brief.md
```

- [ ] **Step 4: Smoke-test both CLIs locally**

Run: `node scripts/chief-of-staff-collect.mjs --out evidence.json`
Expected: `collect: N commits (48h) · ~200 open checks · … -> evidence.json` (uses local `.dlt/secrets.toml`)

Run (build a passing fixture brief from real evidence, then lint):
```bash
node -e "
const p=require('fs').readFileSync('evidence.json','utf8');const pack=JSON.parse(p);
const sha=(pack.commits[0]?.sha??'').slice(0,7);
const cand=sha?'- some_check — '+sha+' — smoke — HIGH':'(none)';
require('fs').writeFileSync('chief-of-staff-brief.md',['## Close candidates',cand,'','## Never started','(none)','','## Stale top 3','(none)','','## No evidence','0 open checks had no matching work in the window.'].join('\n'));
"
node scripts/chief-of-staff-lint.mjs --brief chief-of-staff-brief.md --evidence evidence.json
```
Expected: `lint: brief OK` · then corrupt it and confirm rejection:
```bash
node -e "const f='chief-of-staff-brief.md';const s=require('fs').readFileSync(f,'utf8');require('fs').writeFileSync(f,s.replace('## No evidence','## Nope'))"
node scripts/chief-of-staff-lint.mjs --brief chief-of-staff-brief.md --evidence evidence.json; echo "exit=$?"
```
Expected: `lint: brief REJECTED …` and `exit=1`

- [ ] **Step 5: Commit**

```bash
git add scripts/chief-of-staff-collect.mjs scripts/chief-of-staff-lint.mjs .gitignore
git commit -m "feat(chief-of-staff): collect + lint CLIs (deterministic ends of the pipeline)"
```

---

### Task 4: Kickoff integration

**Files:**
- Modify: `scripts/session-kickoff.mjs`
- 🔴 Test: `scripts/chief-of-staff.test.mjs` (helpers already tested in Task 2; this task adds no new pure logic)

**Interfaces:**
- Consumes: `briefKickoffLines`, `repoSlugFromRemoteUrl` from `scripts/chief-of-staff-lib.mjs`.

- [ ] **Step 1: Add the fetch helper and imports to session-kickoff.mjs**

Add to the imports at the top (after the `writeTodayMd` import):

```js
import { execFileSync } from "node:child_process";
import { briefKickoffLines, repoSlugFromRemoteUrl } from "./chief-of-staff-lib.mjs";
```

Add this function next to `getOpenChecks` (around line 71):

```js
// Newest open morning-brief issue -> top close-candidate lines. Best-effort:
// public-repo unauthenticated REST; ANY failure returns "" (never block start).
async function morningBriefBlock() {
  try {
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8",
    }).trim();
    const slug = repoSlugFromRemoteUrl(remote);
    if (!slug) return "";
    const res = await fetch(
      `https://api.github.com/repos/${slug}/issues?labels=morning-brief&state=open&per_page=1`,
      { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return "";
    const [issue] = await res.json();
    if (!issue?.body) return "";
    const lines = briefKickoffLines(issue.body, { max: 5 });
    if (!lines.length) return "";
    return (
      `Morning brief: ${issue.title} (#${issue.number}) — close candidates:\n` +
      lines.map((l) => `    ${l}`).join("\n") +
      `\n    ^ verify then \`node scripts/check.mjs close <key> --evidence "<sha>"\`\n`
    );
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: Wire it into main()'s output**

In `main()`, after the `clutterLine` assignment (line ~158), add:

```js
  const briefBlock = await morningBriefBlock();
```

In the `process.stdout.write` template (line ~192), insert `briefBlock +` on its own line directly after `flappersLine +`.

- [ ] **Step 3: Verify manually**

Run: `node scripts/session-kickoff.mjs`
Expected: the normal KICKOFF block prints; the Morning-brief block is absent (no `morning-brief` issue exists yet) and nothing errors. Then confirm the failure path: temporarily disconnect (or trust the 4s timeout) — output must still print.

- [ ] **Step 4: Commit**

```bash
git add scripts/session-kickoff.mjs
git commit -m "feat(chief-of-staff): kickoff block prints newest morning-brief close candidates"
```

---

### Task 5: Workflow + incident-logger watch

**Files:**
- Create: `.github/workflows/chief-of-staff-nightly.yml`
- Modify: `.github/workflows/log-cron-incident.yml` (add one line to the `workflows:` list)

**Interfaces:**
- Consumes: `chief-of-staff-collect.mjs`, `chief-of-staff-lint.mjs` CLIs (Task 3); repo secrets `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (all already exist — verified in workflow greps 07/10/2026).

- [ ] **Step 1: Write the workflow**

```yaml
name: Chief of staff nightly

# Reconciles the last 48h of git history against the open checks ledger and
# posts a propose-only "Morning brief" issue. NEVER closes checks or touches
# code — permissions are contents:read + issues:write only.
# Spec: docs/superpowers/specs/2026-07-10-chief-of-staff-nightly-design.md
# Kill switch (repo Settings -> Variables): CHIEF_OF_STAFF_ENABLED = "false"

on:
  schedule:
    - cron: "47 8 * * *" # 08:47 UTC = 4:47 AM ET; off-hour minute (GH :00 congestion)
  workflow_dispatch: {}

permissions:
  contents: read
  issues: write

concurrency:
  group: chief-of-staff-nightly
  cancel-in-progress: false

jobs:
  brief:
    if: vars.CHIEF_OF_STAFF_ENABLED != 'false'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # full history: never-started heuristic + agent git log/show

      - uses: actions/setup-node@v5
        with:
          node-version: "20"

      - name: Collect evidence (deterministic, $0)
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: node scripts/chief-of-staff-collect.mjs --out evidence.json

      - name: Reconcile (Sonnet 4.6, judgment only)
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: |
            --max-turns 30
            --model claude-sonnet-4-6
            --allowedTools "Read,Grep,Glob,Write,Bash(git log:*),Bash(git show:*),Bash(git diff:*)"
          prompt: |
            You are the nightly chief of staff for this repo. Read ./evidence.json —
            it holds the last 48h of commits (sha, subject, files), every open check
            (key, label, project, detail, days_untouched), live_verify checks that
            look never-started, and the stale list.

            Your ONLY job: judge which open checks the last 48h of commits actually
            completed, then write the file ./chief-of-staff-brief.md. You may run
            git log / git show / git diff or read files to confirm a match. You must
            NOT close checks, edit any other file, or push anything.

            Write ./chief-of-staff-brief.md with EXACTLY these four sections:

            ## Close candidates
            - <check_key> — <sha7>[, <sha7>…] — <one-line why> — HIGH|MEDIUM

            ## Never started
            - <check_key> — <one line>   (from live_verify_never_started; verify before listing)

            ## Stale top 3
            - <check_key> (<N>d) — <label>

            ## No evidence
            <N> open checks had no matching work in the window.

            Hard rules:
            - Every candidate cites at least one SHA that appears in evidence.json.
              A deterministic lint rejects the brief otherwise — nothing posts.
            - Max 15 candidates, ranked most-confident first.
            - HIGH = commit message names the check's work AND touched files match.
              MEDIUM = files match but the message is ambiguous. Anything weaker is
              NOT a candidate — it belongs in the No-evidence count.
            - An empty candidates list is a good outcome. Write "(none)" under the
              section header and fill the other sections. Never pad.
            - Sections with no items get "(none)". Plain text, no tables.

      - name: Lint brief (deterministic gate)
        run: node scripts/chief-of-staff-lint.mjs --brief chief-of-staff-brief.md --evidence evidence.json

      - name: Post brief + supersede previous
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          gh label create morning-brief --color 0E8A16 \
            --description "Nightly chief-of-staff brief (propose-only)" 2>/dev/null || true
          PREV=$(gh issue list --label morning-brief --state open --json number --jq '.[].number')
          DATE=$(date -u +%m/%d/%Y)
          gh issue create --title "Morning brief — $DATE" \
            --label morning-brief --body-file chief-of-staff-brief.md
          for n in $PREV; do
            gh issue close "$n" --comment "Superseded by today's brief."
          done
```

- [ ] **Step 2: Add to the incident logger's watch list**

In `.github/workflows/log-cron-incident.yml`, add to the `on.workflow_run.workflows:` list (alphabetical-ish placement near the top is fine):

```yaml
      - "Chief of staff nightly"
```

- [ ] **Step 3: Validate YAML locally**

Run: `node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('.github/workflows/chief-of-staff-nightly.yml','utf8'));console.log('yaml ok')"` (js-yaml is already in node_modules; if not, `bunx yaml-lint` or rely on `gh workflow list` post-push)
Expected: `yaml ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/chief-of-staff-nightly.yml .github/workflows/log-cron-incident.yml
git commit -m "feat(chief-of-staff): nightly workflow (collect -> Sonnet 4.6 reconcile -> lint -> post) + incident-logger watch"
```

---

### Task 6: Live verify (operator-gated)

**Files:** none (operational task)

- [ ] **Step 1: Operator pushes** (SESSION_LOG entry + `node scripts/safe-push.mjs` — operator confirms push per repo rule; the spec commit from earlier rides along)

- [ ] **Step 2: Two manual dispatch runs**

Run: `gh workflow run chief-of-staff-nightly.yml` (twice, a few minutes apart)
Expected: both runs green; each posts a `morning-brief` issue; the second closes the first. Operator reads both briefs and grades precision.

- [ ] **Step 3: Confirm kickoff renders it**

Start a new session (or run `node scripts/session-kickoff.mjs`) and confirm the Morning-brief block prints the open issue's top candidates.

- [ ] **Step 4: Week-one grading, then close the check**

Each morning: close correct proposals via `node scripts/check.mjs close <key> --evidence "<sha>"`, note false positives. After the first SCHEDULED (not dispatched) run posts a brief AND kickoff renders it:

Run: `node scripts/check.mjs close chief_of_staff_nightly_live_verify --evidence "scheduled run <run-url> + kickoff render"`

If precision is below ~4/5 in week one, tighten the prompt's HIGH/MEDIUM definitions before anything else.

---

### Task 7 (BLOCKED — do not start until batch-narrative-bake lands `wrapBatchesSurface`): spec-estate batch audit

**Files:**
- Create: `scripts/audit-spec-estate.mts`

**Interfaces:**
- Consumes: `getAnthropic()` from `refinery/agents/anthropic.mts` — per the batch-narrative-bake spec, after that build lands, `client.messages.batches.*` is routed through `wrapBatchesSurface` (spend-guarded submit, per-result usage metering). **Pre-step: verify this is true in the code as landed** (`grep -n "wrapBatchesSurface" refinery/agents/anthropic.mts`); if absent or shaped differently, STOP and re-plan this task — do not add a parallel metering path.
- Produces: `_ASSISTANT/spec-estate-audit.json` + `_ASSISTANT/spec-estate-audit.md` (proposed `git mv` commands; script moves NOTHING).

- [ ] **Step 1: Verify the seam** (`grep` above; also re-verify model id `claude-haiku-4-5` against live docs per Vendor First)

- [ ] **Step 2: Write scripts/audit-spec-estate.mts**

```ts
#!/usr/bin/env bun
// One-time spec-estate audit. Operator-run: bun scripts/audit-spec-estate.mts [--dry-run]
// Classifies every non-archived spec/plan via ONE Haiku Batches job (50% rates),
// metered through the wrapBatchesSurface seam (getAnthropic). Proposes git mv
// commands into the existing _archive/ dirs; MOVES NOTHING.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { getAnthropic } from "../refinery/agents/anthropic.mts";

const DIRS = ["docs/superpowers/specs", "docs/superpowers/plans"];
const MODEL = "claude-haiku-4-5";
const DRY = process.argv.includes("--dry-run");

type Doc = { dir: string; file: string; text: string };
const docs: Doc[] = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((file) => ({ dir, file, text: readFileSync(join(dir, file), "utf8").slice(0, 24_000) })),
);
console.log(`audit: ${docs.length} docs`);
if (DRY) process.exit(0);

const client = getAnthropic();
const idMap = new Map<string, Doc>();
const requests = docs.map((d, i) => {
  const custom_id = `doc-${i}`; // ^[a-zA-Z0-9_-]{1,64}$ — paths need this map, not encoding
  idMap.set(custom_id, d);
  return {
    custom_id,
    params: {
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user" as const,
          content:
            `Classify this project doc as exactly one of LIVE | SHIPPED | SUPERSEDED-BY-<filename> | DEAD.\n` +
            `LIVE = describes work still in progress or not yet built. SHIPPED = the build it describes is done.\n` +
            `SUPERSEDED = a later doc replaced it (name the file if the text says so). DEAD = abandoned/irrelevant.\n` +
            `Reply as: <CLASS> — <one-line justification quoting the doc>\n\n` +
            `FILE: ${d.dir}/${d.file}\n\n${d.text}`,
        },
      ],
    },
  };
});

const batch = await client.messages.batches.create({ requests });
console.log(`audit: batch ${batch.id} submitted (${requests.length} requests)`);

let status = batch.processing_status;
while (status !== "ended") {
  await new Promise((r) => setTimeout(r, 60_000));
  status = (await client.messages.batches.retrieve(batch.id)).processing_status;
  console.log(`audit: ${status}`);
}

const rows: { path: string; klass: string; note: string }[] = [];
for await (const result of client.messages.batches.results(batch.id)) {
  const d = idMap.get(result.custom_id);
  if (!d) continue;
  if (result.result.type !== "succeeded") {
    rows.push({ path: `${d.dir}/${d.file}`, klass: "ERROR", note: result.result.type });
    continue;
  }
  const text =
    result.result.message.content.find((b: { type: string }) => b.type === "text")?.text ?? "";
  const m = text.match(/^(LIVE|SHIPPED|SUPERSEDED-BY-\S+|DEAD)\s*—\s*(.*)$/m);
  rows.push({
    path: `${d.dir}/${d.file}`,
    klass: m?.[1] ?? "UNPARSED",
    note: (m?.[2] ?? text).slice(0, 200),
  });
}

mkdirSync("_ASSISTANT", { recursive: true });
writeFileSync("_ASSISTANT/spec-estate-audit.json", JSON.stringify(rows, null, 2));
const movable = rows.filter((r) => r.klass === "SHIPPED" || r.klass === "DEAD" || r.klass.startsWith("SUPERSEDED"));
writeFileSync(
  "_ASSISTANT/spec-estate-audit.md",
  [
    `# Spec-estate audit — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `${rows.length} docs · ${movable.length} archive candidates. REVIEW BEFORE RUNNING ANY MOVE.`,
    ``,
    ...movable.map(
      (r) => `- [ ] \`git mv ${r.path} ${r.path.replace(/\/([^/]+)$/, "/_archive/$1")}\` — ${r.klass}: ${r.note}`,
    ),
  ].join("\n"),
);
console.log(`audit: wrote _ASSISTANT/spec-estate-audit.{json,md} — ${movable.length} candidates`);
```

- [ ] **Step 3: Dry-run** — `bun scripts/audit-spec-estate.mts --dry-run` → `audit: ~317 docs`, exits before submitting.

- [ ] **Step 4: Live run (operator present — first live run of a new paid surface gets a heads-up per spend philosophy)**, review `_ASSISTANT/spec-estate-audit.md`, operator applies the moves they agree with, commits.

- [ ] **Step 5: Commit the script**

```bash
git add scripts/audit-spec-estate.mts
git commit -m "feat(chief-of-staff): one-time spec-estate batch audit (Haiku, metered seam, propose-only)"
```

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 4 | `scripts/chief-of-staff-lib.mjs`, `scripts/chief-of-staff.test.mjs` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
