# NORTH STAR — the standing plan. CONTINUE IT. Do not re-diagnose.

RULE (born 08/19/2026, operator: "BUT IT'S ALWAYS A DIFFERENT ANSWER FROM YOU"): a session
asked "what should we do" or "why does X suck" answers by executing the next unfinished line
BELOW — never with a fresh diagnosis, a new plan, or a new system. This list changes only on
operator words. It stays at 5 items or fewer and under 60 lines total — if adding a line,
delete one. Deletion beats addition.

## The 5 standing priorities

1. ONE EMAIL PIPE — recipes-as-config. Seam LIVE on main, 2 of 7 migrated byte-identical
   (handoff: docs/handoff/2026-08-19-recipes-as-config-seam-and-wave.md). The remaining 3
   were MEASURED out of scope — do not force, do not re-derive. Next: (a) operator prod
   verify below → close recipes_as_config_live_verify; (b) every NEW recipe is authored
   config-first. The fence stands: never add a feature to a legacy hand-coded builder.
2. HAND RICKY HIS PUNCH LIST — TODAY.md (08/19) carries 40 "live-verify" mentions; finished
   builds sit parked for weeks because the 2-minute operator check is buried in a 30k-token
   brief. Every session surfaces the short list below, and a completed verify closes its
   check the same session.
3. SHRINK THE ALWAYS-LOADED WALL — the 08/18 rule-diet step two: move rules into scoped
   injection (.claude/hooks/inject-scoped-rules.mjs + lib/scoped-rules.mjs already exist —
   extend coverage), then DELETE from CLAUDE.md what scoped injection now covers. A rule
   loaded every session competes with the work every session.
4. LEDGER BANKRUPTCY — 405 open checks and 45 open scratchpad items is noise wearing the
   costume of discipline; three live criticals once sat unread in it for days. OPERATOR
   DECISION OWED: triage to a live ~15, archive the rest with a date. Blocked on his word —
   mass-archiving his obligations is his call, not a session's.
5. ADOPT NOTHING NEW FOR 30 DAYS (from 08/19/2026) — no new tools, harnesses, or memory
   surfaces. Writ: evaluated, rejected. Omnigent: evaluated, rejected. Every recent "make
   the AI better" lead ended do-not-adopt; the leverage is finishing and deleting, not adding.

## OPERATOR — your 5 minutes

- On prod, in the Lab: build ONE under-contract email and ONE coming-soon email. Do they
  render correctly (coming-soon shows no street address)? Say "verified" and the whole
  config wave's last gate closes (recipes_as_config_live_verify).
- Next in the queue after that: csv-export and one-lane-recipes both sit BUILT and need a
  push-then-verify. Say "push them" and the session stages the push and hands you the
  two-line verify steps for each.
