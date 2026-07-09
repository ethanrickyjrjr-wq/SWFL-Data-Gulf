# Answer-path coverage snapshot + red-main sentinel

**Date:** 2026-07-09
**Checks:** `answer_path_coverage_signal` (this build) · `answer_path_observability_live_verify` (opened by new-build) · `brain_geo_prepush_gate` (close as already-built — see §1)
**Operator decisions (2026-07-09):** red-main sentinel IN scope · small registry-shape consolidation first · committed snapshot artifact with `--check` (grade-coverage pattern)

## Problem

The answer path is a chain of six hand-maintained mirrors, and every drift class so far
was found by incident, not by signal:

1. `PER_PACK_REGISTRY` (`refinery/packs/index.mts`) — what builds (42 packs)
2. `BRAIN_CATALOG` (`refinery/packs/catalog.mts`) — what's published (MCP + routing allowlist)
3. `BRAIN_GEO` (`lib/zip-dossier.ts`) — what the located dossier fans out to
4. `TOPIC_TO_SLUG` (`lib/highlighter/reach.ts`) — what a question can reach
5. `CHART_FALLBACKS` (`lib/assistant/chart-for-question.ts`) — chart routing of last resort (no gate)
6. The excuse lists — `KNOWN_INCOMPLETE` (in `catalog.test.mts`), `INTENTIONALLY_UNROUTED`
   (`reach.ts`), `DOSSIER_EXCLUDED_BRAINS` (`zip-dossier.ts`)

Incident record on ONE joint (catalog ⇆ BRAIN_GEO): three prod-500s by the same mechanism
(active-listings-swfl 06/25, market-heat-swfl 06/25, communities-swfl 07/06→07/07).

## §1 Evidence correction — the geo pre-push gate ALREADY EXISTS

The originally proposed fix ("pre-push hook running geo validation when the catalog
changes") shipped 2026-06-25 as **Gate 6** in `.claude/hooks/check-prepush-gate.mjs`
(commit `e2611ee6`): fires on `catalog.mts` / `index.mts` / `zip-dossier.ts`, runs
`bun test lib/zip-dossier.test.ts -t "BRAIN_GEO"`, blocks on failure.

**The communities-swfl incident (07/06) happened with Gate 6 live.** The cataloguing
commit `6aeff4a9` touched both trigger files and the test existed with the matching name
— so the push reached origin through a path the hook does not see (operator terminal,
another machine, or a non-matching wrapper). CI then sat red for ~31 hours across 7
consecutive pushes (SESSION_LOG 2026-07-07) while parallel sessions each dismissed the
red test locally as "another session's WIP." The rollback bot (`rollback-on-red.yml`)
watches prod deploys only and is dark by default.

**Lesson that shapes this design:** local pre-push hooks are best-effort — they gate one
push path, not the branch. Prevention (Gate 6) exists; what's missing is *detection with
a deadline*: red main must file a signal within minutes, and coverage gaps must age
visibly instead of waiting for a human to trip on them.

Bookkeeping: close `brain_geo_prepush_gate` citing `e2611ee6`; Phase 3 below is its real
successor.

## Goal

One committed, deterministic `answer-path-coverage.json` built by pure imports from the
six registries, consumed by graphify (session-queryable), the ops repo (matrix page,
contract only here), and a daily cron that diffs and files a `checks` row on any new gap
— plus a red-main sentinel so a bypassed local gate can no longer buy 31 silent hours,
and verify-proof attempt records so a failed paid verify is visible.

## What we're building

### Phase 0 — registry shape consolidation (no behavior change)

- Export `CHART_FALLBACKS` at module level in `lib/assistant/chart-for-question.ts`
  (today it is function-local and unimportable).
- Move `KNOWN_INCOMPLETE` from `refinery/packs/catalog.test.mts` into
  `refinery/packs/catalog.mts` beside `BRAIN_CATALOG` (the thing it excuses); the test
  imports it from there. A test file must never be the source of truth — importing it
  drags bun:test hooks into any consumer.
- Upgrade all three excuse lists to one shared entry shape:
  `{ reason: string; since: string /* YYYY-MM-DD */ }`.
  - `KNOWN_INCOMPLETE`: `Set<string>` → `Record<string, Excuse>`
  - `INTENTIONALLY_UNROUTED`: `Record<string, string>` → `Record<string, Excuse>`
    (readers: `reach-coverage.test.ts` reason-length assertion reads `.reason`)
  - `DOSSIER_EXCLUDED_BRAINS`: `readonly string[]` → `Record<string, Excuse>`
    (readers: `validateBrainGeo`, `assembleLocationDossier` exclusion check,
    `lib/zip-dossier.test.ts`)
  - `since` for existing entries = the date the excuse actually entered (from git blame),
    not today.
- New tiny shared type module `lib/answer-path/excuse.ts` exporting the `Excuse` type,
  so the three lists share one shape without circular imports.

### Phase 1 — the committed snapshot (mirrors the grade-coverage seam exactly)

`refinery/tools/answer-path-sweep.mts` (sibling of `grade-config-sweep.mts`):

- Pure imports: the six registries + `verification/answer-proofs.jsonl` +
  `verification/answer-proof-attempts.jsonl` (Phase 4). No DB, no network, no env.
- Emits `_AUDIT_AND_ROADMAP/answer-path-coverage.json`, committed. Deterministic:
  brains sorted by id, keys sorted, NO generated timestamps (ages are computed by
  consumers from `since` / `observed_at`, so the artifact only changes when coverage
  actually changes).
- Default mode writes the file; `--check` mode rebuilds in-memory and exits 1 on any
  difference from the committed artifact (stale-artifact gate).
- Pre-push wiring: extend the existing hook (RULE C2 — extend the seam, no new gate
  class). Gate 6's touched-file list grows to the six registry files + the artifact;
  on touch it additionally runs `bun refinery/tools/answer-path-sweep.mts --check` and
  blocks on drift with the regenerate-and-commit fix message (same UX as the
  grade-coverage gate).
- CI already runs `bun test`; add a bun test that shells `--check` so red-artifact is
  also red CI (the sentinel then watches that).

Artifact contract (per-brain row; the ops matrix renders exactly this):

```json
{
  "brains": [
    {
      "id": "communities-swfl",
      "in_registry": true,
      "in_catalog": true,
      "has_geo": true,
      "geo_covers": ["12071", "12021"],
      "topic_routed": false,
      "chart_fallback": false,
      "excuses": [
        {
          "list": "INTENTIONALLY_UNROUTED",
          "reason": "community names route via the located path, not topic rules",
          "since": "2026-07-09"
        }
      ],
      "uncovered": []
    }
  ],
  "verify": [
    {
      "script": "prove-chart-conversation",
      "last_attempt": "2026-07-09T14:01:00Z",
      "last_attempt_worked": false,
      "last_success": null
    }
  ]
}
```

`uncovered` lists any joint that is neither covered nor excused — non-empty means the
test gates are being bypassed, which is exactly what the cron diff must catch.

### Phase 2 — three consumers of that one file

**(a) graphify.** `scripts/graphify-app-nodes.mjs` reads the committed artifact and
emits one node per brain with edges `in-catalog`, `has-geo`, `topic-routed`,
`chart-fallback`, `excused(reason)` into `graphify-out/graph.json` (same merge path as
today's app nodes). `graphify query "brains chat cannot reach"` becomes answerable in
any session. Rides `bun run graphify:update` / `graphify:publish` unchanged.

**(b) ops matrix — contract only.** The artifact IS the contract. `graphify-publish.mjs`
(or a 5-line sibling) copies `answer-path-coverage.json` into
`../swfldatagulf-ops/app/` next to `brain-graph.json`. The matrix page (rows = brains,
columns = joints; green covered / yellow excused with reason + age on hover / red
uncovered; plus the `verify` rows) is built in the ops repo in its own session — ops
pages do not live in brain-platform (standing rule).

**(c) daily cron.** New `.github/workflows/answer-path-coverage-daily.yml` (pattern:
`freshness-probe-daily.yml` — engine-flag guard, workflow_dispatch with dry-run, HC
heartbeat): checkout + bun install, run the sweep fresh. Two alert conditions, both from
the FRESH build (not the committed file — a gap committed inside a regenerated artifact
would diff clean and hide forever):
1. any `uncovered` entry in the fresh artifact (covers "tests bypassed" AND
   "gap shipped inside a regenerated artifact"), and
2. fresh ≠ committed (stale artifact escaped the pre-push gate).
Each fires `node scripts/check.mjs open brain-platform answer_path_gap_<brain>_<joint>
"<label>"` (condition 2 uses key `answer_path_artifact_stale`). `check.mjs` fails loud
when the key exists — dedup for free — and resolves creds from env in CI (verified; the
Supabase secrets already exist in sibling workflows).
Excuse AGES are surfaced by the ops page, not the cron (the cron alerts on new gaps,
not on old excuses getting older — no alert fatigue).

### Phase 3 — red-main sentinel (the incident-#3 fix)

`.github/workflows/red-main-sentinel.yml`:

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
```

- `conclusion == 'failure'` job → open-or-update check `ci_red_main` via `check.mjs`
  (open; if it already exists, `update --detail` with the latest failing run URL).
- `conclusion == 'success'` job → `check.mjs close ci_red_main "green again: <run url>"`
  if open (self-healing: the check's lifetime ≈ the red window).
- `workflow_dispatch` input to force either path for live-verify without waiting for a
  real red.

Verified against live GitHub docs in-session (RULE 0.4, crawl4ai,
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows):
`workflow_run` fires on another workflow's completion filtered by `workflows` name
(`ci.yml`'s `name:` is `CI`), `types: [completed]`, and `branches`; the conclusion is
gated via `github.event.workflow_run.conclusion`; the triggered workflow has secrets
access; the sentinel file must exist on the default branch (it will).

### Phase 4 — verify-proof attempt records (the paid-verify blind spot)

Today `prove-chart-conversation.mts` appends to `verification/answer-proofs.jsonl` ONLY
when a clean roll exists (`if (firstClean)`), so an all-bad paid run leaves zero trace —
the operator ran it live on 07/09, nothing landed, and nothing said so.

- New shared helper `scripts/lib/answer-proof.mts`:
  `recordAttempt({ script, worked, observed_at, summary })` appends to a NEW
  `verification/answer-proof-attempts.jsonl` — every run, pass or fail.
  The existing `answer-proofs.jsonl` stays success-only so
  `.claude/hooks/check-answer-fix-proof.mjs` parsing is untouched.
- Every `scripts/prove-*.mts` (9 scripts) calls it and ends with an unmissable final
  line: `PROOF WRITTEN → verification/answer-proofs.jsonl` or
  `NO PROOF WRITTEN — <why> (attempt recorded)`.
- The snapshot's `verify` block reads both files (last attempt, last success, per
  script). Building/testing this costs no paid API calls; paid runs remain
  operator-triggered per standing rule.

## Error handling

- Sweep: pure imports — a broken registry import fails the sweep loudly in hook, CI,
  and cron alike. No fail-open anywhere in the artifact path (it is observability, not
  a push-wedge; the only blocking surface is the existing pre-push hook's fix-message
  path, same as grade-coverage).
- Cron: files checks, never edits code, never auto-commits the artifact (a drifted
  artifact is itself the signal).
- Sentinel: notify-only; no rollback, no retries. If `check.mjs` fails (Supabase down),
  the job fails → visible in Actions + HC heartbeat misses.

## Testing

- `answer-path-sweep.test.mts`: fixture registries with a deliberate gap → named
  `uncovered` entry; excused fixture → excuse row with `since`; determinism (two runs,
  byte-identical); `--check` exits 1 on a mutated artifact.
- Phase 0 shape moves: existing gates keep passing (`catalog.test.mts`,
  `reach-coverage.test.ts`, `lib/zip-dossier.test.ts`) — they are the regression net.
- Sentinel + cron: `workflow_dispatch` dry-run paths; live-verify =
  `answer_path_observability_live_verify` closes on evidence of (1) a forced sentinel
  run filing + closing `ci_red_main`, (2) one cron run on a synthetic gap filing its
  check, (3) `graphify query` answering the reach question.
- Full: `bun test` + `bunx next build` (standing verify rule).

## Out of scope

- The ops matrix PAGE (built in swfldatagulf-ops; this spec ships its data contract).
- Single-registry refactor deriving all six joints (rejected today: big answer-path
  risk for an observability win the snapshot provides; revisit only if the snapshot
  shows chronic multi-joint drift).
- Auto-rollback on red main (sentinel is notify-only; rollback stays the dark
  self-heal build).
- Any change to what the six registries MEAN — this build observes them.

## Sequencing

Phase 3 first (smallest, highest incident-class value, zero coupling), then 0 → 1 → 2,
then 4. Each phase is one push with its own SESSION_LOG entry; Phase 2b's ops-repo page
gets its own check when the contract lands.
