# 14 — Reconcile the Goal 9 flywheel migration

- **Status:** ⬜ Not started
- **Owner:** OPERATOR decides / SESSION can run the SQL (RULE 1)
- **Source:** autopsy §3 (flywheel) + §8 (SQL)

## What

`docs/sql/20260530_goal9_flywheel.sql` — a 2026-05-30 commit claims the Goal 9 row was inserted, but
the row **is missing from prod.** Textbook "migration falsely marked shipped." Either apply it or fix
the log that claims it shipped. **Do NOT delete until reconciled** — the risk is unapplied migrations,
not extra ones.

## Steps

1. Probe prod: does the Goal 9 row exist in the live `goals` table? (SELECT-first.)
2. If missing and the migration is still correct → apply it, verify the row.
3. If the migration is stale/superseded → correct the SESSION_LOG/commit claim rather than apply.
4. Not on the launch path (flywheel is Day 1 / honest red) — reconcile, don't invest.

## Done when (live proof)

- Either the Goal 9 row is present in the live `goals` table (SELECT returns it), OR the false
  "shipped" claim is corrected in the log with a note pointing here.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
