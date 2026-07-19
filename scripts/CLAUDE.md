# scripts/ — operational tooling (loads when you edit or run from here)

114 files; most are one-off build/dev utilities. The tools below are the session loop — canonical
usage lives HERE (root CLAUDE.md keeps the rules, this file keeps the mechanics).

## Session loop

- `node scripts/check.mjs list [--stale N] [--class defect|verify|idea|task|untriaged]` ·
  `open <project> <key> "<label>" [--class …] [--detail "…"] [--due YYYY-MM-DD]` ·
  `close <key> [note] [--evidence "…"]` — the obligations ledger (Supabase `public.checks`).
  A check WITH a `--signal` closes only when the CLI re-runs it live; without one it needs `--evidence`.
- `node scripts/safe-push.mjs` — the ONLY push path. Landmines: it rebases and can carry
  foreign parallel-session commits — check `git log origin/main..HEAD` first and ASK before bundling;
  it also flattens `--no-ff` merges.
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
