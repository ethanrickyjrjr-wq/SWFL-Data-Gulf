---
name: ship
for: commit, push, PR, land, "push them", or any request to get work onto main
---
### Ship

**You own the evidence in the push, not the push itself** — approval is per-push and never carried (memory: push-approval-is-per-push).

1. Is this the just-push list (docs, CLAUDE.md, SESSION_LOG, hooks, memory, typos, small tooling) or the ASK-FIRST list (pack `--- OUTPUT ---` / key_metrics, `data_lake.*` writes, >5-file refactors, live `/api/b/*` or MCP, anything not revertable in <5 min)? Say which (RULE 1).
2. Stage explicit paths only — never `git add -A`; commit only files you own (RULE 1.5). Never pipe `git commit` through tail/grep; verify at `git log`.
3. Multi-line commit message: Bash tool → `git commit -F <file>` or repeated `-m`; PowerShell tool → here-string. Never cross them (global rule 7).
4. SESSION_LOG.md: new top-of-file entry (what changed, what's next, PR link) in the SAME push; only work visible in `git log` / `git diff` (RULE 0).
5. Checks: `node scripts/check.mjs close <key> --evidence "..."` for what this push proves; `open` for every parked finding with what blocks it (RULE 2 §3/§4). A session opening more than it closes says so.
6. Sync `_AUDIT_AND_ROADMAP/build-queue.md`. Scratchpad items resolved → move to RESOLVED with a date.
7. `node scripts/safe-push.mjs` — never `--no-verify`, never force-push main. It carries foreign commits: ASK before bundling another session's work; parallel sessions → worktree via `scripts/worktree.mjs`, never push `wt/*`.
8. The hook's block message carries its own fix; a flaky test is suspected flake first — loop it locally before blaming the diff.
9. A push is not live: brain rebuild via `OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs <brain-id> --reason "<decree>"` (never `master --force`; fold a fresh leaf into master = `pack_id=master` with NO `--force`); deploys land on Vercel. Say what still has to run.

**Rules carried:** RULE 0 · RULE 1 (just-push vs ask-first, migrations, GHA targeting) · RULE 1.5 · RULE 2 §2/§3/§4 · global rule 7 · push-hygiene memories.

**Reply:** the just-push / ask-first classification, the commit hash from `git log`, the SESSION_LOG entry, checks closed/opened by key, what runs next before it is live.
