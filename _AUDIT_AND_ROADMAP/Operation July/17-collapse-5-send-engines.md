# 17 — Collapse the 5 send engines into 1 (P2)

- **Status:** ⬜ Not started — **brainstorm/plan first (RULE 3.5)**
- **Owner:** deliverable-builder
- **Source:** autopsy §9.2
- **Depends on:** `01-turn-on-send.md` (prove the spine sends), `15-decide-daily-email-digest-fate.md`

## What

Five correctly-scoped-but-paused engines exist — **weekly-read, activation, outreach, funnel-demo, and
the multi-tenant scheduler** — while the ONE live cron is the pre-decree ZIP digest that sends to
itself. Pick the **multi-tenant scheduler as the spine**, route everything through it, delete or fold
the rest.

## Why it's a plan, not a quick edit

5-engine consolidation touching the live send path (RULE 1 "ask first" territory). Brainstorm +
plan + operator sign-off before deleting any engine.

## Steps

1. `superpowers:brainstorming` — map each engine's unique responsibility; confirm the scheduler can
   absorb all five.
2. `node scripts/new-build.mjs <slug> "<label>"`.
3. Sequence AFTER `01-turn-on-send.md` proves the scheduler fires a real send.
4. Fold or delete each of the other four; retire the pre-decree digest (feeds/awaits task 15).

## Done when (live proof)

- One scheduler sends for all use cases in prod; the other engines are removed/folded; only the
  unified spine has a live cron.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
