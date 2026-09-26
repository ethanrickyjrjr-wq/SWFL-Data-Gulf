# 2026-09-26 pipeline plans — how this wave runs and how to pick it up

Operator's ask (09/26/2026): one Opus per pipeline, a complete plan each, double-checked, checks and balances
that are not 500 GitHub issues, what belongs on the Fedora/Spectre box, no API-credit talk, and Opus keeps
watching when the main session runs out of usage.

## What runs

- `00-BRIEF.md` — the contract every agent reads first. 13 required sections. Compute lanes D / M / C / L.
- `00-FAMILIES.md` — 19 families covering all 112 registry rows (76 pipelines + 4 not_yet_running + 32 jobs)
  exactly once, plus the cross-cutting fleet family.
- The Workflow (Claude Code, background, every agent `model: opus`, `effort: high`):
  - Plan: one Opus per family writes `NN-<family>.md`.
  - Verify: a second Opus re-runs every command, fixes the file in place, appends section 13, grades it.
    REWRITE-NEEDED dispatches a third Opus plus one re-verify.
  - Fleet: family 19 reads all 18 files' sections 8/9/10 and writes the one checks-and-balances design,
    the box move list, the lane setup, and the consolidated ASK-FIRST list.
  - Watch: a completeness critic (up to two repair rounds), then the Opus watcher writes `00-INDEX.md` and
    `STATUS.md`, prepends the SESSION_LOG entry, commits the explicit paths, and runs safe-push.
- Run id: `wf_58e90cd5-d11`. Script:
  `C:\Users\ethan\.claude\projects\C--Users-ethan-dev-brain-platform\52b6900d-eb62-40f1-acb8-e8f526384763\workflows\scripts\pipeline-plans-2026-09-26-wf_58e90cd5-d11.js`
  Transcripts + `journal.jsonl`:
  `C:\Users\ethan\.claude\projects\C--Users-ethan-dev-brain-platform\52b6900d-eb62-40f1-acb8-e8f526384763\subagents\workflows\wf_58e90cd5-d11`

## Watching it

`/workflows` in the launching session shows live progress. From any session: `ls docs/audit/2026-09-26-pipeline-plans/`
— a family is planned when its `NN-*.md` exists, verified when the file ends with `## 13. Second-Opus verification`,
and the wave is finished when `00-INDEX.md` and `STATUS.md` exist and `git log -1` shows the watcher's commit.

## Picking it up in a new session (Opus)

1. If the launching session is still alive, it can resume with
   `Workflow({scriptPath: <script above>, resumeFromRunId: "wf_58e90cd5-d11"})` — finished agents return cached.
2. If it is dead: read `journal.jsonl` in the transcript dir to see which families returned. For each family
   without a verified file, dispatch ONE Opus agent with the plan prompt (in the script) and ONE with the verify
   prompt. Then the fleet prompt, then the watcher prompt. The prompts are in the script file; the brief is the
   contract.
3. When `STATUS.md` exists, the work is its checkbox list: take the next unchecked DO item, prove it with its
   proof command, tick it, commit. ASK-FIRST items wait for the operator's word.

## What is out of scope for this wave

No code fixes, no workflow dispatches, no data_lake writes, no GitHub issues, no Anthropic API credit. The plans
are the deliverable; execution starts from `STATUS.md` in the next session.
