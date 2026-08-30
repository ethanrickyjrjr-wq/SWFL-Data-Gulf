# Playbooks: one file per task type, steps copied verbatim into the todo list (NORTH STAR #3 scoped injection)

**Date:** 2026-08-30 · **Decree:** operator, "make it happen now" — the one item lifted from the
NORTH STAR #5 30-day freeze (08/19–09/18/2026), on his words.
**Research:** `_RESEARCH/agent-behavior/2026-08-30-cursor-pstack-evaluation.md` (crawl4ai of
cursor/plugins pstack v0.14.5, MIT). Verdict there: do not adopt the plugin; steal ONE shape.

## Problem

CLAUDE.md is an always-loaded wall (~600 lines + FOCUS + kickoff ≈ 40k tokens/session, measured
08/19/2026) and the rules in it compete with the work every session. NORTH STAR #3's step two —
scoped injection — exists only per-DIRECTORY (`inject-scoped-rules.mjs`: governed path × written
content, PreToolUse Edit|Write). A rule that governs a TASK TYPE regardless of file (scope before
fix, four-lane, full-scope-first, ship hygiene, outside-tool evaluation) had no scoped carrier, so
its body still lives in the wall.

## Goal

Rules arrive per task type, as an ordered checklist the model copies verbatim into its todo list
(RULE 0.8's count), so each rule body can later leave CLAUDE.md. The deletion is a SEPARATE pass
(check `claude_md_diet_step_three_delete_playbook_covered_rules`) — replacement runs first.

## What we're building

- `.claude/playbooks/<task-type>.md` × 9: investigation · data-question · bug-fix · feature ·
  ingest-pipeline · refactor · outside-tool · ship · session-pickup. Frontmatter `name` (==
  filename) + `for` (the one line the model routes on); `### ` heading; `1.`-numbered steps each
  naming the tool/command/rule that proves it; `**Rules carried:**` (the deletion map);
  `**Reply:**` shape. < 4,500 chars — a checklist, not a doc. `README.md` carries the contract.
- `.claude/hooks/lib/playbooks.mjs` — `parsePlaybook`, `buildPlaybookIndex`, `buildHookOutput`,
  `CONTRACT` (the verbatim copy-in rule, incl. `skip: <reason>` for a step not done).
- `.claude/hooks/inject-playbooks.mjs` — UserPromptSubmit; emits the STATIC index (name · for ·
  pointer) on every prompt; 1,797 chars measured at install. Registered in `.claude/settings.json`
  between inject-focus and mint-approval-on-prompt.
- `.claude/hooks/lib/playbooks.test.mjs` — 12 tests incl. a shape lint over the real directory.

**The classifier is the model.** The hook emits the same index every prompt; it never reads the
prompt. This is deliberately NOT the keyword/topic router `inject-focus.mjs` rejects (misfires on
any prompt that merely says "email"). pstack routes the same way — its skill matches the task.

## Failure modes, named before building (RULE 3.5)

- **Playbook read, bespoke plan written, named steps dropped** (pstack names this exact mode) →
  CONTRACT text: steps copied VERBATIM as the FIRST todo items, before reasoning; a skipped step
  stays listed with `skip: <reason>`. Enforcement beyond the contract is owed a future strike count.
- **Silent degradation** (inject-focus 07/25/2026 lesson) → unlistable dir emits a `PLAYBOOKS
  DEGRADED` banner; a file missing `name`/`for` is named in a `dropped (…)` line. Both tested.
- **Half-written playbook ships** → shape lint in the test over the real dir: frontmatter,
  heading, numbered steps, Rules carried, Reply, size cap, name == filename.
- **Per-prompt cost creep** → index is pointers, never pasted steps (test: steps absent from
  index); ≤ ~1.8k chars; static so resume replay reproduces it byte-for-byte.
- **Two routers fight** → this hook and inject-focus emit disjoint content; four-lane banner
  stays in inject-focus (keyed to an existing enforcement gate); data-question playbook POINTS at
  that gate rather than duplicating its classifier.
- **Habit tax on trivial prompts** (RULE 11) → CONTRACT exempts typos, a doc line, a yes/no,
  anything revertable in under a minute.
- **Rules deleted from CLAUDE.md before the carrier is proven** → deletion is a separate check,
  blocked on one session of live evidence; `Rules carried:` lines are the map.

## Out of scope

A `/playbook` slash skill (second entry to the same content — one root, the hook); a prompt-keyed
classifier; porting pstack's multi-model panels (unreachable: Agent tool = sonnet/opus/haiku/fable);
the CLAUDE.md deletion itself.

## Verification

- `node --test .claude/hooks/lib/playbooks.test.mjs` — 12/12; full hook suite 227/227 (08/30/2026).
- `echo '{"prompt":"x"}' | node .claude/hooks/inject-playbooks.mjs` → index, 1,797 chars.
- Live: the block appears under FOCUS on the next prompt of any session → closes
  `playbooks_per_task_type_live_verify`.
