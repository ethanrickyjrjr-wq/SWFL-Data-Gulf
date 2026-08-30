# Playbook read gate: first code write of a session requires a real Read of a task playbook (the playbookWasRead shape for .claude/playbooks/)

**Date:** 2026-08-30 · **Decree:** operator, "get on it" (after the playbooks landed the same day).
**Sibling spec:** `2026-08-30-playbooks-per-task-type-design.md`.

## Problem

The task playbooks are the carrier that lets rule bodies leave CLAUDE.md. The second-order
audit's inversion on that change: a rule in CLAUDE.md is loaded whether or not it is read; a
rule moved into a playbook fires only if the model opens the file. Deleting bodies before a
read gate exists converts hard rules into voluntary ones under a green suite. The repo already
knows the shape — `check-playbook-read-before-email-edit.mjs:playbookWasRead` and
`check-area-fence.mjs:familyShowsRead` block a write on transcript evidence of a real Read.

## What we're building

- `.claude/hooks/check-playbook-read-before-write.mjs` (PreToolUse Edit|Write AND Bash — registered
  in both matcher blocks): blocks a write to CODE until the session family shows a `Read` of a
  `.claude/playbooks/<name>.md` that EXISTS on disk (README excluded). Bash writes are seen through
  `bashWriteTargets` (`> f`, `>> f`, `tee`, `sed -i`); `ingest/cadence_registry.yaml` is governed by
  name despite the yaml exemption. Evidence via `read-evidence.mjs`
  (`familyShowsRead`, strictly-vertical family — controller's read counts for subagents, peers
  never). Exempt paths = `check-area-fence.mjs:isExemptPath` (docs, config, tests) — one root.
- `check-playbook-read-before-write.test.mjs` — 15 tests: regex on both path shapes, README and
  the email playbook rejected, governed vs exempt paths, Read counts / Grep + narration do not,
  a Read of a NON-EXISTENT playbook does not, every real playbook on disk does, Bash write-target
  extraction, `decide()` pass/block/fail-open.
- Escape: `ALLOW_WRITE_WITHOUT_PLAYBOOK=1` (same shape as the email gate; the human-only
  approval-token upgrade is the operator's call — the token mechanism is agent-untouchable).

**The honest ceiling:** transcript evidence proves *a* playbook was opened before the first code
write, not the *right* one. Task → playbook matching stays the model's job. What the gate removes
is the zero-read session.

## Failure modes, named before building (RULE 3.5)

- **Habit tax (RULE 11)** → one Read per session satisfies it forever; docs/config/tests/playbooks
  exempt, so editing CLAUDE.md or a playbook never blocks.
- **Wedging a session on a hook bug** → every failure path exits 0; `decide()` fails open on an
  evidence throw (tested).
- **Skimming counts as reading** → only a `Read` tool_use with the path on the same transcript
  line; Grep/Glob/narration rejected (tested).
- **Subagent blindness** → family evidence, same root as the two sibling gates.
- **Unregistered gate vanishes silently** → `hook-registration.test.mjs` enumerates `check-*`.
- **Windows argv/import.meta.url mismatch** → `pathToFileURL` guard.

## Step three — the CLAUDE.md cut (same session)

With the gate live, the deletion pass ran: every rule with a `Rules carried:` carrier collapsed
to a one-line pointer naming its playbook(s). Bodies kept for the three rules with no carrier
(0.5b, 0.6, 3 C1). RULE 0, THE GOAL, the factory pointers, the reference index and the
vendor-merged graphify section untouched. Measured: 341 → 190 lines, 23,191 → 14,013 chars.

## Verification

- `node --test .claude/hooks/check-playbook-read-before-write.test.mjs` — 15/15; full hook suite
  245/245. Second-order audit on the cut: 9 findings, 6 fixed same session (spec of each in
  SESSION_LOG 08/30/2026), the subagent-read direction documented as ceiling.
- Driven live, seven probes: fake-playbook read → 2 · no read → 2 · real read → 0 · registry yaml
  no read → 2 · Bash heredoc no read → 2 · Bash non-code → 0 · Bash heredoc real read → 0.
- Live-verify (`playbook_read_gate_live_verify`): the block message observed in a real session
  that attempted a code write before opening a playbook.
