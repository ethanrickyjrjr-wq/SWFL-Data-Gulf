# scripts/ — operational tooling (loads when you edit or run from here)

114 files; most are one-off build/dev utilities. The tools below are the session loop — canonical
usage lives HERE (root CLAUDE.md keeps the rules, this file keeps the mechanics).

## Session loop

- `node scripts/check.mjs list [--stale N] [--class defect|verify|idea|task|untriaged]` ·
  `open <project> <key> "<label>" [--class …] [--detail "…"] [--due YYYY-MM-DD]` ·
  `close <key> [note] [--evidence "…"]` — the obligations ledger (Supabase `public.checks`).
  A check WITH a `--signal` closes only when the CLI re-runs it live; without one it needs `--evidence`.
- `node scripts/check-sweep.mjs [--dry-run] [--class verify] [--project ingest]` — the ACTING half:
  walks OPEN signal-bearing checks, runs each signal live, and CLOSES the passers with a
  trigger-validated signal proof (`resolved_by='check-sweep'`). Its mirror,
  `node scripts/reverify-signals.mjs`, walks CLOSED ones and REOPENS regressions. Neither costs LLM
  tokens. A sweep can only close what a signal proves — so the real work is ATTACHING signals
  (`check.mjs update <key> --signal '<json>'`), and a loose `contains` that also matches a fallback
  body closes a broken thing. Always `--dry-run` a newly-backfilled batch first.
- `node scripts/safe-push.mjs` — the ONLY push path. Landmines: it rebases and can carry
  foreign parallel-session commits — check `git log origin/main..HEAD` first and ASK before bundling;
  it also flattens `--no-ff` merges.
- `node scripts/doc-ratchet.mjs [status|record|check]` — **the "are we actually improving?" ledger.**
  Opposite polarity to `doc-reachability --check`, which only catches regressions and is happy with a
  repo that rots in place. `check` EXITS 1 when the orphan count has not fallen in 7 days —
  **stagnation is the failure state.** Runs daily in CI via `.github/workflows/doc-ratchet-daily.yml`
  (zero vendor cost — no LLM, no API key). Ledger: `docs/standards/doc-ratchet-ledger.json`, one row
  per calendar day, re-recording a day overwrites so a chatty session cannot fake progress.
- `node scripts/doc-burndown-delete.mjs [--apply]` — deletes ONLY markdown that is orphaned AND sits
  in a self-declared-dead directory (`docs/_archive/superseded/`, `docs/_FINISHED/`,
  `_ASSISTANT/investigations/`). **DRY RUN by default.** Refuses to touch non-markdown — those dirs
  also hold `.py`/`.html`/`.json` that are NOT orphans. `docs/_archive/parked/` is deliberately
  excluded: parked is deferred, not dead. After `--apply`, LOWER `ORPHAN_BASELINE` in the same commit.
- `node scripts/doc-index.mjs` — regenerates `.claude/skills/what-do-we-have/INDEX.md`, the map of
  ALL 1,534 docs (path + title + one-line hook) that the `what-do-we-have` skill greps. **This is the
  ONLY place `_RESEARCH/` is visible to a repo-wide search** — that directory is gitignored, so `Grep`
  cannot see its 80 files and "I searched and found nothing" is NOT evidence of absence. Skill body
  loads on demand (Anthropic's progressive disclosure), so it costs nothing until needed. **Run after
  adding or moving docs. Never hand-edit INDEX.md.**
- `node scripts/doc-reachability.mjs [--orphans] [--json] [--check]` — **run this before ever saying
  a doc/linking/indexing job is "done."** Answers "is every path noticeable to Claude when it needs
  it" as a number over all tracked text files: reachable by FULL PATH (strong), by NAME ONLY (weak,
  a basename match leads nowhere), or ORPHANED (zero mentions — invisible, nothing will ever lead an
  agent there). Measured 08/05/2026: **729 / 495 / 229 of 1,453 docs — 15.8% invisible**, including 4
  of our own `.claude/agents` definitions. `--check` is a RATCHET against the committed baseline and
  exits 1 on regression; the baseline may only ever be LOWERED. Burndown: check
  `doc_orphans_229_invisible`. Born from calling an 8-file pass "done" against a 1,453-file repo.
- `node scripts/new-build.mjs <slug> "<label>"` — registers a build: spec stub in
  `docs/superpowers/specs/` + the `<slug>_live_verify` check in one step. slug = short kebab-case id
  (lowercase letters, numbers, hyphens); label = human-readable name.

## GHA rebuild dispatch — mechanics (the DECISION is locked in root RULE 1)

Preferred form (07/12/2026, closes `tripwire_dispatch_acceptance_ergonomics`):

```
OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs <brain-id> --reason "<decree>"
```

— fires the targeted dispatch AND auto-appends the `accepted_dispatch_runs` entry in
`verification/tripwire-accepted.json` (commit that file same session). A raw `gh workflow run`
stays RED on the hourly tripwire until hand-accepted — the wrapper is the recognition channel; the
bypass arm is untouched. Raw equivalent:

```
gh workflow run daily-rebuild.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f pack_id=<brain-id> -f force=true
```

Why a leaf dispatch can never refresh master (CORRECTED 07/14/2026 — this previously, wrongly, said
"+ master too"): verified against `refinery/lib/dag.mts`'s `resolveBuildOrder(targetId, PACKS)` — it
walks `targetId`'s own `input_brains` (its upstreams), never its downstream consumers. Master is a
CONSUMER of a leaf, not an input to it, so master is never in the build order for a leaf-targeted
dispatch.

To fold a freshly-rebuilt leaf INTO master's dossier, dispatch `pack_id=master` with **no**
`--force`. This is cheap, not the 32-Sonnet-call cascade: `resolveBuildOrder("master", …)` walks the
full closure but every TTL-fresh upstream is skipped (no force = no rebuild), while master itself
still re-synthesizes because of the upstream-aware freshness trigger in
`refinery/lib/resilient-build.mts`'s `masterIsStaleVsUpstreams()` — it forces a master re-synthesis
whenever ANY upstream's `refined_at` is newer than master's own, even inside master's 7-day TTL. The
daily cron without `--force` is fine either way — it skips fresh brains and runs this same trigger
on every tick.

## Worktrees (RULE 1.5)

- `node scripts/worktree.mjs new <label>` → `../bp-<label>`, branch `wt/<label>` — auto-restores the
  graphify snapshot so the worktree starts warm.
- `node scripts/worktree.mjs land <label>` → rebases, prints finish commands (never auto-pushes).
- Finish: `git push origin HEAD:main`, then `node scripts/worktree.mjs cleanup <label>`.
- Worktree branches are local and self-deleting: never `git push origin wt/*`, never a PR.

## graphify

- `node scripts/graphify-app-nodes.mjs` — app-plane refresh (~1s).
- `bun run graphify:update` — full rebuild · `bun run graphify:publish` — ops /graph page.
- Snapshot: `bun scripts/graphify-snapshot.mjs save` / `bun run graphify:snapshot-restore` — ~16:1
  compressed shared cache in `~/.cache/graphify-brain-platform/` (outside git); `graphify:update` /
  `graphify:publish` auto-save it, `worktree.mjs new` auto-restores it.
