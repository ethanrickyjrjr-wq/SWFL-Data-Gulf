---
name: checks-burndown
description: Use when the checks ledger has to come DOWN — burning down open obligations in public.checks, running a triage/fix fan-out over many checks, or answering "why does this number only go up". Covers scope selection, the 4-phase fan-out, and the close discipline. Not for opening a single check (that's `node scripts/check.mjs open`).
---

# Burning down the checks ledger

## Read this before you touch anything

The ledger is **not** a rotting backlog and the count is **not** a discipline problem.
It grows monotonically **by construction**, and you need to know why or you will
"fix" it by closing things, which is strictly worse than leaving them open.

`checks` had an automatic OPENER (`scripts/reverify-signals.mjs` reopens closed checks
whose signal regressed) and, until 07/22/2026, **no automatic closer**. `runSignal` fired
only inside `check.mjs close`, one key at a time, typed by a human. `scripts/check-sweep.mjs`
is the missing half — it walks OPEN checks that carry a signal, runs each live, and closes
the passers with a server-validated proof record.

So: **the count is a function of how many checks are machine-verifiable, not how hard
anyone worked.** Anything you close by hand today comes back as a new manual check
tomorrow unless that *class* of check gets a machine verifier.

> Do not start by closing things. Start by making things closeable.

## The hard rules (violating any of these makes the work negative-value)

- **Never mass-close.** A closed check claims work is done. Closing rows you did not
  verify converts a visible backlog into an invisible lie.
- **`public.checks` is prod evidence, not dev attestation.** A code fix is not live until
  the thing that serves it rebuilds. Verify served bytes, not the diff.
- **Every close names what proved it** — a URL, a query, a run.
- **A check you cannot verify gets a signal or a `--due`, not a close.**
- **A failed verify is a new defect, never a close.**
- **Ask before any bulk disposition.** Core-vs-parked is Ricky's call.
- The fan-out **proposes**; a human closes. Never let subagents run `check.mjs close`.

## Step 1 — measure, don't assume

```bash
node scripts/check.mjs list                 # human view, printed at SessionStart too
node scripts/check-sweep.mjs --dry-run      # "N checks are NOW CLOSEABLE", writes nothing
```

For a fan-out you want machine-readable scope. There is no `--json` flag; dump it
directly (real column is `due_at`, **not** `due` — that 400s):

```
state=eq.open&select=id,check_key,project,label,detail,class,priority,due_at,signal,created_at
```

## Step 2 — pick scope honestly, and say what you excluded

Classes are not interchangeable:

- `defect` — a live problem. In scope for a fix pass.
- `verify` — built, awaiting live-verify. In scope; these are definitionally machine-verifiable.
- `untriaged` — **invisible to any class-based sweep** and it inflates every count. Either
  triage first or include it, otherwise you have read the ledger partially by construction.
- `task` — a to-do, not a broken thing. Different debt, burns down separately.
- `ceiling_*` keys (from `scripts/ceilings-to-checks.mjs`) — data we censused but never
  pulled. Burns down by pulling the data or by Ricky declining. Not a fix-pass target.
- `idea` — an idea is not an obligation. Bank to `_AUDIT_AND_ROADMAP/build-queue.md` and
  `--drop` (records abandonment, never a "done" claim). **Ricky's call, ask first.**

**No silent caps.** If you bound the run (top-N, no-retry, sampling), `log()` exactly what
was dropped. A silent truncation reads as "covered everything" when it didn't.

## Step 3 — the fan-out (4 phases, and two of them are not optional)

Use the `Workflow` tool, not inline agents — the orchestration must survive a context ceiling.

1. **Triage** (read-only, batch ~6 checks/agent). Per check: `ALREADY_FIXED` (file:line or
   served bytes) / `STILL_BROKEN` (concrete fix plan + area tag) / `NOT_CLOSEABLE` (why).
   An honest NOT_CLOSEABLE is a correct, valuable output.
2. **Fix** — only `STILL_BROKEN` with a concrete plan. **`isolation: 'worktree'` is
   mandatory**; parallel agents writing the same repo collide. Have the agent return the
   full `git diff` as its result and apply diffs yourself — landing N worktrees is the
   hard part, and it keeps you in control of what touches `main`.
3. **Adversarially refute** — a SEPARATE agent per claimed fix, prompted to *refute*, with
   a distinct lens each (correctness / regression / evidence-quality). Majority refute =
   the fix does not land. **Without this the fan-out just produces confident wrong answers
   at scale.** Not cost-trimmable.
4. **Close** — only after verification, one at a time, each naming its proof.

`args` may arrive as a JSON-encoded **string**. Coerce it
(`typeof args === 'string' ? JSON.parse(args) : args`) and throw on missing fields —
otherwise destructuring silently yields `undefined`, the batch count computes to `NaN`,
and the workflow "succeeds" having run **zero agents**.

Seed any `sa0718_*` slice with `_RESEARCH/audits/2026-07-18-fanout-fix-log.md`. It is a
validated key (spot-checked 7/7 fixed-claims and 6/6 flagged-claims true) — do not
re-derive it, but still confirm each claim against its cited file:line, because the log
says what *was fixed* and the repo says what *is*.

## Step 4 — prefer a signal over a close

A manual close discharges one row once. A signal discharges it **forever, for free** —
and `reverify-signals.mjs` reopens it if it regresses. Where a claim is mechanically
checkable, attach a signal instead of closing.

Before attaching one, read `.claude/skills/check-signal/SKILL.md`. A too-loose signal
that wrongly closes a check **never self-heals** — reverify only reopens on signal FAIL,
so a false pass returns `ok:true` forever.

## Known structural gaps (don't rediscover these)

The four enabled signal types (`http_ok`, `http_body`, `db_row_exists`, `db_fresh`) cannot
express: column-to-column comparison · absence / "count is zero" · before-after state ·
rendering consistency. `workflow_success` is recognized-but-unimplemented
(`scripts/lib/check-signals.mjs` returns `ok:false` unconditionally).

Cheapest unblocks, in order: enable `workflow_success` · materialize a compared column as
a generated column or view · add a `not_contains` / `row_count_is` type.

Also unaudited, tracked, nobody has looked: **the closed checks carrying no proof at all**,
closed before the proof trigger existed. Unverified "done" claims. Separate job.

## Report it the way he asked

Structure the result around **2 worked examples per category — the defect, the fix, and
the proof** — not around a headline count. The word that defines the job is FIXED, not
closed. A smaller number with nothing fixed is the exact lie the ledger exists to prevent.
