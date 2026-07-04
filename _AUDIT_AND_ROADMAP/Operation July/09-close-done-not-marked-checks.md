# 09 — Close the ~34 done-but-not-marked checks

- **Status:** ⬜ Not started
- **Owner:** OPERATOR (most need a page-load or a flow-run once) / SESSION (can prep the list)
- **Source:** autopsy §7 + §2 (register §4) + §9.1

## What

The dominant open-item type across the platform is **built + pushed + never-run-in-prod.** ~34 checks
are done in code but never marked because the last-mile prod action never happened. This backlog
*is* most of "what never gets finished."

> Per RULE 2, `public.checks` (`node scripts/check.mjs list`) is the source of truth — this file is a
> pointer to that work, not a second tracker. Each check closes in the ledger, not here.

## Steps

1. `node scripts/check.mjs list` — pull the full open set (138 open at session start).
2. Cross-reference the register §4 "done-but-not-marked" set (full detail in
   `~/Downloads/SWFL-LAUNCH-AUDIT-2026-07-04/00-REGISTER.md`).
3. For each: run the one live action it needs (load the page / run the flow / hit the endpoint),
   confirm the live evidence, then `node scripts/check.mjs close <key>`.
4. Do NOT close on "code looks right" — `public.checks` is prod evidence, not dev attestation.

## Done when (live proof)

- Each closed check has a real prod observation behind it; the open count drops by ~34 in the ledger.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
