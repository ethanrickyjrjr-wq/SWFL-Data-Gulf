# Lane 12 — Hooks + scripts + CI/GHA + tracker drift + BUILD HEALTH

**Health: mostly-ok.** The core build-health checks pass: `bun refinery/tools/check-vocab-coverage.mts --all` is clean (30 brains, every emitted slug resolves), `bun test refinery/lib/corridor-aliases.test.mts` is 7/7, and `node --test .github/scripts/*.test.mjs` is 25/25 including the cron-failure classifier + trigger-list-drift guard. The hooks (session-log push gate, prepush gate, no-branch-create, project-path, ODD) are well-engineered, fail-open on internal error, and match-both `git push` and `safe-push`. But there are real holes: the **incident logger/healer watch only 24 of 50 scheduled production crons (52% uncovered)** and the drift test gives false confidence because it only enforces logger==healer parity, never coverage; **`safe-push.mjs` flattens `--no-ff` merge commits** (memory-confirmed, still unfixed); **`daily-email-digest.yml` pushes with `git push || true` and no rebase** so log commits silently drop; the **`check-build-context` SessionStart gate has been failing on every session for 12 days** (dead gate); local `npm run lint` is unusable (112 errors from gitignored worktree/vendor dirs not in the eslint ignore list); and a live-DB vitest in the `bun test` path connection-times-out locally.

---

## [high] Incident logger + healer cover only half the scheduled crons — 26 of 50 fail silently

**Location:** `.github/workflows/log-cron-incident.yml:16-42`, `.github/workflows/heal-cron-failure.yml:20-45`, drift guard `.github/scripts/trigger-list-drift.test.mjs`

**Detail:** There are 50 scheduled (`cron:`) production workflows in `.github/workflows/`. The incident-logger `workflow_run.workflows` list watches only 25 entries (24 + Daily Brain Rebuild); the healer watches 24. A machine diff (scheduled-set minus watched-set) shows **26 scheduled crons have NO incident capture and NO auto-heal**, including data-bearing and revenue-path ones:

```
BLS OEWS SWFL annual, Collier parcels annual, Daily Email Digest, Data Targets (daily),
DBPR Press Releases weekly, DBPR Public Notices weekly, DBPR SIRS monthly, FDLE crime quarterly,
FGCU RERI monthly, FL DBPR contractor licenses monthly, FL DOR sales tax monthly, FL DOR TDT monthly,
FRED ALFRED LAUS monthly, Home-Values + Investor Composite monthly, ingest-crexi-listings,
ingest-lee-associates-swfl, ingest-local-cre-context, ingest-mhs-permits-swfl, marketbeat-pdf-ingest,
NOAA GHCN rainfall monthly, notion-sync-weekly, Redfin Collier market monthly, SWFL Inc. economic dev weekly,
SWFL search demand monthly, ZHVI SWFL Tier 1 fetch monthly, ZHVI SWFL Tier 2 load monthly
```

When any of these fail, nothing is appended to `docs/cron-rebuild-failures.md`, no issue comment lands, and no L0 retry fires — the failure is invisible until someone notices stale data. `Daily Email Digest` is especially notable: it is a live Mon–Fri send path; a silent send failure is undetected. The `trigger-list-drift.test.mjs` guard asserts only `heal == logger \ {Daily Brain Rebuild}` — it confirms the two lists agree with each other but **never checks the lists against the actual set of scheduled workflows on disk**, so this 52% gap passes CI green with full confidence.

**Fix:** (1) Reconcile both `workflow_run.workflows` lists with the full scheduled-cron set (add the 26). The newer `ZHVI`/`ingest-*`/`FRED ALFRED`/etc. crons were added without being wired into the incident system. (2) Strengthen `trigger-list-drift.test.mjs` to also enumerate every workflow file that has a `schedule:` block and assert each appears in the logger list (minus an explicit, documented allowlist of non-criticals). That converts the real future-drift mode (new cron, not watched) into a CI failure.

**Model:** opus — judgment call on which crons are critical-enough to watch + a cross-file coverage assertion touching the incident-system invariant.

---

## [high] safe-push.mjs flattens `--no-ff` merge commits (rebase unpacks merges, re-triggers resolved conflicts, drops merge-only SESSION_LOG)

**Location:** `scripts/safe-push.mjs:30-44` (`git rebase origin/main`)

**Detail:** `safe-push.mjs` runs a plain `git rebase origin/main` on every push. A plain rebase replays each commit individually and **unpacks `--no-ff` merge commits**: a merge commit on the local branch is flattened, its already-resolved conflicts re-surface, and a SESSION_LOG entry that existed only on the merge commit is dropped (which then also trips the session-log push gate). This is a memory-documented incident (`reference_safe-push-flattens-merge-commits.md`: hit merging `source-links-methodology`, `a243fa2`, 2026-06-08) and the script still has no guard. The mandated push path (`node scripts/safe-push.mjs`) is therefore unsafe for the one case where a local merge commit exists.

**Fix:** Detect a local merge commit before rebasing (`git rev-list --merges origin/main..HEAD`) and either (a) use `git rebase --rebase-merges origin/main` to preserve merge topology, or (b) when origin/main has not advanced, fast-forward push directly (`git push origin HEAD:main`) — pre-push hooks still fire. Add a one-line warning when a merge commit is detected so the operator can choose. Web-verify the exact `--rebase-merges` behavior against current git docs before adopting.

**Model:** opus — git topology + invariant interaction (push gate, conflict re-trigger); requires judgment, not a mechanical edit.

**web_question:** Does `git rebase --rebase-merges <upstream>` preserve `--no-ff` merge commits without re-triggering already-resolved conflicts in current git (2.4x+), and what are its known failure modes vs a plain rebase?

---

## [high] daily-email-digest.yml: `git push || true` with no rebase — log commits silently dropped, failures masked green

**Location:** `.github/workflows/daily-email-digest.yml:50-57`

**Detail:** The "Commit email log" step is:
```
git add docs/email-marketing/email-logs/ || true
git diff --staged --quiet || git commit -m "log(email): digest $(date -u +%Y-%m-%d)"
git push || true
```
There is no `git fetch` / `git rebase` and the push is wrapped in `|| true`. This cron runs `0 10 * * 1-5`, after the daily-rebuild commit (`0 6`) and amid other committing workflows — so origin/main has almost certainly advanced and this push is a non-fast-forward reject. The `|| true` swallows the rejection, the step concludes green, and **the email send log is never persisted** (it lives only in the orphaned local commit on the runner, which is discarded). The two other git-committing workflows (`daily-rebuild.yml`, `home-values-investor-monthly.yml`) both use a proper `fetch → rebase --autostash → push` retry loop; this one regressed to the naive form. Result: the digest-send audit trail is unreliable exactly when you'd want it (after a busy commit day).

**Fix:** Replace lines 52-57 with the same `for attempt in 1 2 3; do git fetch origin; git rebase --autostash origin/main; git push && break; ... done` loop used in `daily-rebuild.yml:143-162`. Do NOT mask the final failure with `|| true` — let a persistent push failure surface (and, once the coverage gap above is fixed, get logged as an incident).

**Model:** sonnet — well-specified mechanical port of an existing, proven retry loop into one file.

---

## [medium] check-build-context SessionStart gate has failed on every session for 12 days — dead gate / alarm fatigue

**Location:** `.claude/hooks/check-build-context.mjs:24-34`, wired SessionStart in `.claude/settings.json`

**Detail:** The hook `exit(2)`s when `.claude/build-context.md` is missing or older than `MAX_AGE_HOURS = 4`. The file's mtime is **2026-06-01** — 12 days old as of this audit — so the gate has been firing its `BUILD-CONTEXT GATE FAILED` banner on every single session start for ~12 days and is being uniformly ignored. A gate that fails 100% of the time provides zero signal and trains the operator/agent to ignore SessionStart stderr (which also carries the legitimate session-log + kickoff output). Either the build-context discipline was abandoned (then the hook should be removed) or it's a real requirement that nobody honors (then it needs to actually block, which a SessionStart hook's exit-2 does not — it only prints). Right now it's neither — pure noise.

**Fix:** Decide the intent. If build-context-per-session is dead practice, remove the hook from `settings.json` SessionStart and delete `check-build-context.mjs`. If it's still wanted, move enforcement to a PreToolUse(Edit|Write) gate (where exit-2 actually blocks) and/or auto-stamp a fresh template at session start instead of failing. Do not leave a permanently-red SessionStart gate.

**Model:** opus — this is a workflow-policy decision (is the discipline alive?), not a mechanical fix.

---

## [medium] Local `npm run lint` is unusable: 112 errors, all from gitignored `.claude/worktrees/.next/` + vendored `awesome-claude-code-toolkit/` not in the eslint ignore set

**Location:** `eslint.config.mjs:18-31` (globalIgnores), CI `.github/workflows/ci.yml:28` (`bunx eslint .`)

**Detail:** `npm run lint` (= `eslint`) exits 1 with **112 errors + 65 warnings** locally. Every error maps to a path that is NOT app source:
- `.claude/worktrees/agent-*/.next/dev/server/edge/chunks/*.js` (Turbopack build artifacts inside a parallel-agent worktree) — 51× `no-assign-module-variable`, the `require()`-import and `@ts-ignore` errors.
- `awesome-claude-code-toolkit/hooks/scripts/*.js` (a vendored third-party research clone) — the rest.

The eslint flat-config `globalIgnores` lists `.next/**`, `out/**`, `build/**`, `app/_design/**`, `docs/design-reference/**`, `ops/**` — but **NOT `.claude/worktrees/**` or `awesome-claude-code-toolkit/**`**, both of which are in `.gitignore` (lines 58, 81). ESLint flat config does NOT auto-read `.gitignore`, so it walks those dirs. CI passes only because a clean GHA checkout doesn't materialize the gitignored worktree/toolkit dirs — so the failure is local-only and invisible to CI. Net effect: the developer-facing lint command is broken, which also undermines any "lint clean before push" habit and the prepush gate's credibility.

**Fix:** Add `".claude/**"` and `"awesome-claude-code-toolkit/**"` to the `globalIgnores([...])` array in `eslint.config.mjs`. (`.claude/worktrees/**` minimally; the whole `.claude/**` is safer since hooks/scripts there are `.mjs` linted elsewhere.) Re-run `eslint` to confirm 0 errors locally.

**Model:** sonnet — a two-line ignore-list addition with a clear, verifiable success condition.

---

## [medium] Live-DB vitest runs inside `bun test` and connection-times-out locally (direct :5432 is firewalled from dev machines)

**Location:** `refinery/packs/zhvi-zip-latest-gate-a-parity.test.mts:320-328`

**Detail:** This is a `vitest` file (imports from `"vitest"`) but matches `*.test.mts`, so the mandated pre-push `bun test` runner collects it. Its `runnable` gate (`Boolean(uri && py)`, line 322) reads DB creds from `.dlt/secrets.toml`, which EXISTS locally — so `runnable` is true and `fetchRawRows(uri!, py!, ...)` at line 327 executes at collection time, connecting to the direct `db.*.supabase.co:5432` port. Per repo memory that port is firewalled from dev machines, so it raises `psycopg.errors.ConnectionTimeout` as an unhandled error and the local `bun test` run never prints a clean summary (it hangs/errors mid-suite). In CI the creds file is absent → `runnable=false` → `describe.skip`, so CI is fine — but the local pre-push `bun test` signal is polluted: a real new failure could hide behind this timeout noise. (Separately, full `bun test` also carries the known `BRAIN_CATALOG: home-values-swfl in PER_PACK_REGISTRY but not catalog.mts` failure — a pack-registry/catalog drift outside this lane, flagged for the packs lane.)

**Fix:** Gate the live-DB harness on reachability, not just creds presence — e.g. require an explicit opt-in env (`RUN_GATE_A_LIVE=1`) or probe the pooler host (the reachable Supavisor endpoint) instead of direct `:5432`, and skip otherwise. Better: route the harness through the us-east-1 pooler URI the rest of the repo uses for dev DB access, so it actually runs locally instead of timing out.

**Model:** opus — touches the test-vs-DB-access seam and the dev-firewall reality; needs judgment on the right gating signal.

---

## [low] BRAIN_CATALOG catalog-drift failure also breaks the local `bun test` summary (cross-lane, surfaced here)

**Location:** `refinery/packs/catalog.test.mts:19`, `refinery/packs/catalog.mts`

**Detail:** `bun test` reports `(fail) BRAIN_CATALOG: every PER_PACK_REGISTRY id exists in catalog` — `home-values-swfl` is registered in `PER_PACK_REGISTRY` but missing from `BRAIN_CATALOG`. This is real registry/catalog drift (the home-values brain was added to the registry without a catalog entry) and it is a hard CI-failing test (not creds-gated), so it would fail `bun test` in CI too. SESSION_LOG already notes it as "pre-existing & NOT from this work." Flagging it here because it directly degrades this lane's build-health signal; the fix belongs to the packs/brains lane.

**Fix:** Add a `BRAIN_CATALOG` entry for `home-values-swfl` (mirror an adjacent ZHVI/value brain). Verify with `bun test refinery/packs/catalog.test.mts`.

**Model:** sonnet — single missing-entry add with a clear test to confirm.

---

## [low] Stray empty `.audit-scan.mjs` at repo root + duplicate email-funnel plan (folder vs single-file) — uncommitted tracker drift

**Location:** repo root `/.audit-scan.mjs` (0 bytes, untracked); `docs/superpowers/plans/2026-06-13-email-funnel-the-rest.md` (untracked) vs `docs/superpowers/plans/2026-06-13-email-funnel-the-rest/` (staged-deleted folder)

**Detail:** Two minor drift artifacts in the working tree. (1) `.audit-scan.mjs` is an empty file at repo root — a stray from a prior session; if accidentally `git add`-ed it ships noise (and the "stage only files you created/intentionally modified" rule exists precisely to catch this). (2) The git status shows the `2026-06-13-email-funnel-the-rest/` task FOLDER staged for deletion while a single `2026-06-13-email-funnel-the-rest.md` reappears untracked — i.e. an in-flight reversal of commit `17d9a67` (which foldered the plan). build-queue line for "Email funnel the rest" still points at the FOLDER path (`…/2026-06-13-email-funnel-the-rest/`). Whichever form wins, the build-queue path reference and the on-disk form must agree, and the loser must be fully removed so there aren't two copies of the same plan drifting independently — exactly the plan-doc-drift failure mode RULE 2 warns about.

**Fix:** Delete `.audit-scan.mjs`. Resolve the plan to ONE form (folder or single file), update the build-queue path reference to match in the same commit, and remove the other copy.

**Model:** sonnet — mechanical cleanup + one path-reference reconciliation.

---

## Open questions

- Is the build-context-per-session discipline still a live requirement, or abandoned? (Determines whether to fix or delete `check-build-context.mjs`.)
- Is the folder vs single-file form the intended final shape for the `2026-06-13-email-funnel-the-rest` plan? (In-progress reversal of `17d9a67`.)
- For the 26 unwatched crons: which are critical enough to warrant incident-logging + auto-heal vs. intentionally excluded (e.g. notion-sync, data-targets)? Needs an explicit allowlist so the strengthened drift test doesn't over-fire.
