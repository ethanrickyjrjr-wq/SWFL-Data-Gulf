# Agent guard hooks — proof-of-red push gate · claim-read Stop hook · area fence

**Date:** 2026-08-18 (pieces 3 + 4 of the plan approved in the "THIS IS ALL A FUCKING LIE"
session — piece 1 = cell-policy registry (shipped, spec `2026-08-18-cell-policy-registry-design.md`),
piece 2 = context diet (shipped), piece 5 = recipes-as-config brainstorm (separate doc).)
**Check:** `agent_guard_hooks_live_verify`

## Problem

Operator, 08/18/2026, verbatim: "PLEASE GO THROUGH ALL CONVOS AND RULES AND BRING ME A PLAN FOR
MORE HOOKS AND SEPERATING AREAS OF WORK AND WHAT CLAUDE READS WHEN I SEND A MESSAGE, STAYING
FOCUSED DURING TASKS." And the meta-gripe: "we need to fix claude internally. We can't have rules
that load every time that claude doesn't read or are for different sections. We don't listen to a
god damn word i say."

Three honor-system rules with no mechanism behind them:

1. **TDD's proof-of-red** (RULE 3.5: "the failing test named for its failure mode first, then
   green") — nothing verifies a new test was ever seen RED. A test born green proves nothing;
   the cell-policy fleet test only earned trust by stashing the chrome edit and watching 2 fail.
2. **THE BAR** (RULE 0.5, sharpened 08/12/2026: "before any sentence asserting how OUR system
   behaves, the file that owns that behavior must have been opened") — the strike
   `claimed-our-behavior-without-opening-the-file` has 3 entries; the open-house "HOA figures
   below" claim this same day was made off a stale comment, not the code.
3. **Area conventions** (FOCUS: "when editing one of these, read its CLAUDE.md" — 8 area docs)
   — only lib/email has an enforced read-first gate (the playbook hook, 08/05/2026). The other
   seven areas are wishes.

## What we're building

### 1. `check-proof-of-red-on-push.mjs` (PreToolUse · Bash, the push family)

Trigger: a push whose commits ahead of upstream **ADD a new test file** (`.test.*` / `.spec.*` /
`__tests__/`). Require: this session's transcript family (parent + recent sibling transcripts —
subagent-driven TDD runs its tests in subagent transcripts) shows that test file's basename in a
tool result **together with a red marker** (`N fail` with N≥1, `not ok`, `✗`/`✖`, `AssertionError`,
pytest `FAILED`). Block otherwise. Escape: `ALLOW_NO_RED_PROOF=1` — for tests genuinely proven red
in a prior session; hoisted from the push command prefix (the 5f628bbc lesson: a PreToolUse hook
never sees a session's env prefix unless it parses the command string).

### 2. `check-claim-read.mjs` (Stop)

At turn end, scan the FINAL assistant message for repo code paths
(`lib/… app/… refinery/… scripts/… ingest/…` with a code extension) named inside a sentence that
asserts behavior (claim verbs: reads/renders/sweeps/gates/returns/…) and is not hedged
("I have not read", "will/next/plan/TODO"). Every such file must have been **opened in this
session** — a Read/Edit/Write or a Serena symbol read, credited across the whole transcript.
A named-but-never-opened file blocks the stop (exit 2) with the list; `stop_hook_active` prevents
loops. Session-wide credit is a deliberate softening of THE BAR's per-turn wording — RULE 11: a
per-turn recap that re-blocks on files read three turns ago is a gate that gets ignored.

### 3. `check-area-fence.mjs` (PreToolUse · Edit|Write)

The registry: 8 areas → their CLAUDE.md (ingest/, refinery/packs/, lib/email/, lib/assistant/,
lib/social/, lib/deliverable/, app/api/, scripts/). Editing CODE under an area requires that
area's CLAUDE.md Read in this session's transcript family. Docs/config/tests exempt (same line
the playbook hook draws). Fires at most once per area per session — the moment the Read exists,
it is satisfied. Escape: `ALLOW_AREA_EDIT_WITHOUT_CLAUDE_MD=1`. Generalizes
`check-playbook-read-before-email-edit.mjs` (which stays — the playbook is a different, deeper
doc for a higher-risk area); shares one evidence root (`read-evidence.mjs`) with it.

**Transcript family** (new, `read-evidence.mjs`): a subagent's hook payload points at the
subagent's own transcript, which never contains the controller's reads — that is open check
`playbook_hook_blind_to_subagents`. Evidence is therefore searched in the payload transcript
FIRST, then in sibling `*.jsonl` transcripts (same directory tree, mtime within 8h, capped).
Over-credit from a parallel same-repo session having read the same area doc is accepted as the
cheaper error than blocking every delegated build. The playbook hook is repointed at the same
helper, closing that check.

## Failure modes → guards (RULE 3.5)

- **Hook bug wedges every push/edit/turn** → every parse/IO/git failure path exits 0 (fail open),
  same as Gates 15–18 and the four-lane gate.
- **Escape unreachable from a session** (the 5f628bbc defect) → escapes are hoisted from the push
  command string, not read from env alone; the Stop hook (no command to prefix) honors
  `stop_hook_active` and fires at most once.
- **Windows silent no-op** (the ce163255 defect) → `pathToFileURL` main-guard on every hook; pure
  helpers exported and unit-tested; `hook-registration.test.mjs` fails CI if any hook is wired to
  nothing.
- **Per-edit habit tax gets the gate ignored** (RULE 11) → area fence + playbook hook satisfy
  once per session; proof-of-red fires only on pushes ADDING test files; claim-read fires only on
  final messages naming code paths in claim sentences.
- **"0 fail" reads as red** → the red marker requires a count ≥1 (`[1-9]\d* fail`), and the
  matchers are unit-tested against real bun/node:test/pytest output shapes both directions.
- **Subagent TDD leaves red proof in a child transcript** → family scan (above).
- **A grep of the file passes as "opened"** → claim-read credits Read/Edit/Write/Serena symbol
  reads only — the same evidence standard as the playbook hook.
- **Area doc missing on disk** → fence exits 0 for that area (never demand an unreadable doc).
- **Cross-repo push trips brain-platform-specific logic** → proof-of-red derives everything from
  the pushed repo's own git state (`resolvePushCwd`), and a repo with no new test files passes
  untouched.

## Evidence bar (before commit)

- Each hook's pure helpers: node:test suites red-first, then green.
- `node --test .claude/hooks/*.test.mjs` fully green (includes hook-registration).
- `node --check` on every new/edited hook.
- Registration in `.claude/settings.json` in the same commit.
