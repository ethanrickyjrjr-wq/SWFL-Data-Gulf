# DAY-0 CLAUDE SETUP — the runbook for an empty folder

**Written 07/30/2026. This is the PLAN, not the setup. Nothing has been created or copied.**

Companion to `docs/carve-out/EMAIL-BUILDER-CARVE-OUT.md` (the product half: what code moves) and
`docs/standards/new-project-playbook.md` (the principles half: why each guard exists). **This file
is the execution half** — ordered steps you run in an empty folder, each with the command and the
proof it worked.

**Why it is separate:** the carve-out doc is read to decide what to build; this is read while
typing. Cross-linked both ways so neither orphans.

## The one rule this runbook is built on

Every step has a **PROVE IT** line. A step without proof is the failure this whole document exists
to prevent — a hook that exists, is documented, is believed to work, and has never executed once.
That happened here twice with the same file. **Do not mark a step done on "I created the file."**

---

## PART 1 — THE VENDOR CONTRACT, RE-VERIFIED 07/30/2026

Crawl4ai'd live from `https://code.claude.com/docs/en/hooks` this session, because the whole plan
rests on it. **The playbook's copy was crawled 07/25/2026 — five days old — and is already wrong in
two places.** Treat everything below as dated fact, and re-verify before you build, not after.

### Corrections to the playbook's hook contract

**1. "Only three events reach Claude" is incomplete, and it matters.**
Playbook §7.1 says only `SessionStart`, `UserPromptSubmit`, and `UserPromptExpansion` write into
Claude's context. That is true **of raw stdout** and it is the wrong conclusion to design around.
The docs also document `hookSpecificOutput.additionalContext` — a JSON field, returned on exit 0,
that "passes a string from your hook into Claude's context window," wrapped in a system reminder and
inserted at the point the hook fired. **This works on any event.** So a `PostToolUse` hook can put
text in front of Claude. Do not design the new repo around a wall that isn't there — that is the
playbook's own "we can't versus we haven't" failure.

**2. There are five handler types now, not one.** `command`, `http`, `mcp_tool`, `prompt`, and
`agent`. The playbook only knows command hooks. We will still use command hooks — Rule 11, our
volume — but know the surface exists before someone "discovers" it as a novelty later.

### The landmines, verbatim

**The resume replay trap — the one nobody would find until it burned them.** Verbatim: "For
mid-session events like `PostToolUse` or `UserPromptSubmit`, when you resume with `--continue` or
`--resume`, Claude Code replays the saved text rather than re-running the hook for past turns, so
values like timestamps or commit SHAs become stale." And: "`SessionStart` hooks run again on resume
with `source` set to `"resume"` … so they can refresh their context."
**Design consequence:** anything that goes stale — open-obligation counts, last-shipped line, commit
SHAs, freshness dates — belongs on `SessionStart`, never on a mid-session injector. A
`UserPromptSubmit` hook should carry only text that is true forever.

**The prompt-injection self-own.** Verbatim: instructions should be written "as factual statements
rather than imperative system instructions"; phrasing like "The deployment target is production"
reads as project information, whereas "Text framed as out-of-band system commands can trigger
Claude's prompt-injection defenses, which causes Claude to surface the text to you instead of
treating it as context."
**Design consequence:** this repo's `inject-focus.mjs` FOCUS block is written imperatively — "Never
invent a number," "Honor them before answering." **We have not observed it failing here; this is a
documented hazard, not a measured one.** Write the new repo's equivalent as statements of fact about
the project and keep the imperative voice for `CLAUDE.md`.

**Exit codes — unchanged in substance, one behavior flip.**
- **Exit 0** = success; stdout parsed for JSON output fields. JSON is processed **only** on exit 0.
- **Exit 2** = blocking error; stdout and its JSON are ignored, stderr is fed to Claude as the error.
- **Any other code, including 1, is NON-BLOCKING — execution continues.** Verbatim: "Claude Code
  treats exit code 1 as a non-blocking error and proceeds with the action, even though 1 is the
  conventional Unix failure code. If your hook is meant to enforce a policy, use `exit 2`." The lone
  exception is `WorktreeCreate`, where any non-zero aborts.
- **NEW since the playbook:** a hook that exits 2 while printing JSON that fails schema validation
  **still blocks** — Claude Code uses stderr as the reason. "Before v2.1.214, Claude Code treated
  that combination as a non-blocking error and the action proceeded." Pin that version.
- **NEW:** non-blocking errors now surface in the transcript as a `<hook name> hook error` notice
  plus the first line of stderr, instead of debug-log only. Silent no-ops are slightly less silent
  than they were.

**You still cannot block at `SessionStart`.** For `SessionStart`, `Setup`, and `SubagentStart`,
exit-2 stderr renders as a hook-error notice, **Claude doesn't see it**, and the session proceeds.

**`SessionEnd` hooks share a 1.5-second budget** across all of them (raised to match a longer
configured `timeout`, up to 60s). Anything heavy on `SessionEnd` gets killed silently. Default
`command` timeout elsewhere is 600s; `UserPromptSubmit` lowers it to 30s.

**Matchers are silently ignored** on `UserPromptSubmit`, `Stop`, `PostToolBatch`, and several
others. Use the `if` field (permission-rule syntax, e.g. `"Bash(git *)"`, `"Edit(*.ts)"`) to narrow
tool events instead.

**Windows, and this is our platform.** `shell` accepts `"bash"` or `"powershell"`, defaulting to
bash or to PowerShell when Git Bash isn't installed. **Exec form** runs when `args` is set (no
shell, each element one argument verbatim); **shell form** when `args` is omitted. On Windows, exec
form needs a real executable — `.cmd`/`.bat` shims in `node_modules/.bin` cannot be spawned. The
portable pattern the docs name explicitly is `"command": "node"` with the script path in `args`.
**Our existing hooks use shell form `node .claude/hooks/x.mjs`, which is fine and portable.** Test
hooks on the OS they will run on; this repo once shipped a hook that was a silent no-op from a
Windows argv guard.

---

## PART 2 — WHAT EXISTS HERE TODAY, VERIFIED

Counted this session, so the copy list is real rather than remembered:

- **32 hook files** in `.claude/hooks/`, plus 4 shared helpers and their tests in
  `.claude/hooks/lib/` (`ledger-parse`, `pipeline-scope`, `scratchpad-parse`, `secret-wiring`).
- **Two settings files:** `.claude/settings.json` and `.claude/settings.local.json`.
- **Registered:** 1 `UserPromptSubmit` injector · 6 `SessionStart` printers · ~12 `PreToolUse`
  gates · 3 `PostToolUse` · 1 `Stop` · 1 `SessionEnd`.
- **The meta-guard exists and is genuinely wired.** `hook-registration.test.mjs` asserts every
  `check-*.mjs` basename appears in a hook command string in a settings file, with a `PARKED` map
  requiring a written reason, checked in both directions (a PARKED entry that IS registered, or that
  names a missing file, fails as stale). Its own header records why it exists: the four-lane gate
  shipped, was "fixed" by a commit whose subject reads "the four-lane gate never ran," was documented
  as a forcing function, and was registered in zero settings files the entire time.
- **The CI glob reaches `lib/`.** `.github/workflows/ci.yml:68` runs
  `node --test .github/scripts/*.test.mjs scripts/lib/*.test.mjs .claude/hooks/*.test.mjs .claude/hooks/lib/*.test.mjs`,
  with a comment recording that `lib/` was NOT covered until 07/22/2026 because the glob stopped one
  level short. **Verified fixed here.** Do not inherit the broken version.

**One real gap to fix in the new repo, found by running the audit rather than reading about it.**
The meta-guard filters on `f.startsWith("check-")`. So it audits gates and **not** printers or
anything else — `print-*.mjs`, `inject-*.mjs`, and `push-context.mjs` are outside its coverage. A
session-start printer registered nowhere would be invisible to the very test built to catch exactly
that. `check-build-context.mjs` is correctly declared PARKED with a reason; `push-context.mjs` is
simply out of scope. **In the new repo, widen the filter to every `.mjs` that isn't a test.**

---

## PART 3 — THE RUNBOOK, IN ORDER

Order matters: each step verifies the next. Do not reorder, and do not batch.

### STEP 0 — The meta-guard, before anything else

Copy `hook-registration.test.mjs` and adapt it, **widening the filter from `check-*` to every
non-test `.mjs`**. Wire the CI job in the same commit, with a glob that reaches every test
directory including `lib/`.

- **Do:** copy the test, widen the filter, add the CI workflow with the full glob.
- **PROVE IT:** add a throwaway `check-nothing.mjs` that is registered nowhere and confirm CI goes
  **red**. Delete it. A green test on an empty hooks directory proves nothing — this is the
  "prove it on a real positive" rule, and it is not optional. When this project finally wrote this
  test, it immediately found a second live instance.

**Nothing below is trustworthy until this step is red-then-green.**

### STEP 1 — CLAUDE.md, written as facts

Project conventions, stack, the non-negotiables. Per the vendor's own guidance, **factual
statements, not imperatives** — "This repo uses bun test," not "You must always run bun test."

- **Do:** write `CLAUDE.md`. Keep it short; it decays across compaction and is not a mechanism.
- **PROVE IT:** start a fresh session and confirm the content is present without asking for it.

### STEP 2 — SessionStart injection

The single highest-leverage mechanism available. Print, in order: last N session-log entries · open
obligations · unresolved scratchpad items. **Everything time-sensitive lives here**, because
`SessionStart` re-runs on resume and mid-session injectors replay stale text.

- **Do:** one printer per concern, each failing soft (missing file → print nothing, exit 0).
- **PROVE IT:** `/clear` and confirm the banner appears. Then **delete the source file and confirm
  the hook exits 0 printing nothing** rather than erroring. Fail-soft on absence, fail-loud on
  corruption.

### STEP 3 — The append-only session log and its push gate

Newest-first, never rewritten; corrections go on top.

- **Do:** `SESSION_LOG.md` plus a `PreToolUse` hook on git-push that **exits 2** when no commit
  ahead of upstream touched it.
- **PROVE IT:** attempt a push with no log entry and confirm it is **blocked**. If it proceeds, the
  hook is exiting 1 — the single most common way a policy hook becomes a no-op.

### STEP 4 — The obligation ledger, WITH a closer

Owner, key, label, class. **The closer ships in the same commit as the opener.** A ledger with an
opener and no closer only grows, and a ledger that only grows gets abandoned — this project reached
722 open with 8 carrying a signal before anyone noticed the asymmetry was structural.

- **Do:** open verb, close verb, list verb, and an automated sweeper that re-runs stored signals.
- **PROVE IT:** open an obligation whose signal already passes, run the sweeper, confirm it closes
  **without a human decision**. Signals must be discriminating — a loose "contains" check that
  closes a broken thing is worse than leaving it open.

### STEP 5 — The scratchpad and its gate

Every gripe lands **before** you answer.

- **Do:** `SCRATCHPAD.md`, printed at session start (step 2) and gated on push.
- **PROVE IT:** the printer shows an item written by a prior session. The A/B test is already run
  here: the log had a hook and a gate and got touched a dozen times a day; the scratchpad had a rule
  and sat 68 lines uncommitted, unreadable by the next session.

### STEP 6 — The rules injector, on UserPromptSubmit

The 10–12 rules that actually get violated, re-injected every prompt because `CLAUDE.md` decays.

- **Do:** one `UserPromptSubmit` hook. **Written as factual statements** (see the injection hazard
  above). **Timeout here defaults to 30s, not 600s.** Time-varying values do **not** go here — they
  replay stale on resume.
- **PROVE IT:** **break the source file and confirm the hook fails loud.** This repo's injector held
  a `DEFAULT_RULES` constant of 7 rules while the live file carried 12; a missing file silently
  substituted the 7 and rules 8–12 vanished from every prompt with no error. **Never let a rule
  loader fail open.**

### STEP 7 — The secrets and access floor

Installed last here and paid for first.

- **Do:** ignored env files only, never a tracked file and never in chat. Check the database network
  allowlist **before the first deploy** — the vendor default is an empty allowlist meaning all IPs
  may connect. REVOKE unused write grants rather than adding more policies. Write down which
  surfaces are intentionally public.
- **PROVE IT:** a **real unprivileged request against production** that returns nothing. Counting
  policies is not auditing them — `USING(true)` is a policy, passes every "has RLS?" check, and this
  platform shipped one that exposed 58 rows across 3 users. For a product whose entire input is other
  people's files, this is the highest-severity check in the runbook.

### STEP 8 — The account-surface checklist

- **Do:** write down, on day one, where the quota/billing/usage page is for every vendor, and which
  numbers there are **rates** versus **cumulative totals**.
- **PROVE IT:** open each one once and record the URL. Precedent: a confirmed database error code
  was diagnosed as a wedged cache when the real cause was an egress overage at 311% of plan — the
  billing surface was never checked at all. Separately, a cumulative counter was read as a rate for
  three days running, so a correct fix looked like a failure and got re-fixed.

### STEP 9 — Freshness detectors on outputs, never statuses

- **Do:** monitor the max timestamp in the destination, not the workflow's reported status.
- **PROVE IT:** stop a producer and confirm the detector goes red. Status surfaces lie: a parent
  workflow disabled at the API left every child reporting "active," and data froze for three days.

### STEP 10 — The 13 product guards

From the carve-out plan's guard list, each with its named test. Tenancy first.

- **PROVE IT:** each guard proven on a real positive, not a green unit test.

---

## PART 4 — WHAT NOT TO DO

- **Do not copy all 32 hooks.** Most encode SWFL-specific obligations — paid dispatch, brain
  rebuilds, ODD surfaces, the four-lane data gate. Take the guard **set** per the steps above, not
  the directory. A copied hook nobody understands is an unverified guard with a comment.
- **Do not write a rule where a hook belongs.** When you catch a recurring failure, write the hook.
  If you can't, write the rule **and** open the obligation to build the hook.
- **Do not use `exit 1` for policy.** It is a silent no-op.
- **Do not put time-varying text on a mid-session injector.** It replays stale on resume.
- **Do not put anything heavy on `SessionEnd`.** 1.5-second shared budget.
- **Do not trust this file's version numbers.** `v2.1.214`, `v2.1.199`, and the contract above are
  facts as of 07/30/2026. Re-crawl before you build. The playbook was five days old and already
  wrong twice — that is the measured decay rate on this surface.
