# _ASSISTANT/ Folder — Handoff

**Status:** Spec + plan written. Ready to build. Nothing coded yet.

## What we're building

Session-start brief + spec cleanup system. Three scripts, one hook extension.

## Files written this session

- Spec: `docs/superpowers/specs/2026-06-27-assistant-folder-design.md`
- Plan: `docs/superpowers/plans/2026-06-27-assistant-folder.md`

## Build order (6 tasks, all in the plan)

1. **Task 1** — create `_ASSISTANT/` folder, `_archive/` dirs, update `.gitignore`
2. **Task 2** — `scripts/assistant-lib.mjs` + `scripts/assistant-lib.test.mjs` (pure helpers, TDD)
3. **Task 3** — `scripts/assistant-first-run.mjs` (one-time scan + archive dead specs/handoffs)
4. **Task 4** — `scripts/assistant-weekly.mjs` (incremental cleanup + writes `_ASSISTANT/TODAY.md`)
5. **Task 5** — `scripts/new-build.mjs` (creates spec stub + opens check in one command)
6. **Task 6** — extend `scripts/session-kickoff.mjs` (adds spec clutter line + TODAY.md to KICKOFF block)

## To execute

Open fresh session, say:

> Execute the plan at `docs/superpowers/plans/2026-06-27-assistant-folder.md` using superpowers:subagent-driven-development
