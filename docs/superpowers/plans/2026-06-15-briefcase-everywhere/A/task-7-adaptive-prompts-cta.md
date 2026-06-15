# A-7 — Context-aware prompts + escalating CTA — **SONNET** (NET-NEW)

## Goal
Make the pill feel alive: prompts that fit the page and a CTA that escalates by return visit.

## Scope (decision 3 — read carefully)
This is **net-new** (no `visits.ts` / `visits.test.ts` today). Prompts key off **page context**
(which report / zip / chart the pill is on) + **anon revisit count** — **NOT user history.** Copy is
**"context-aware,"** never "learns how you work."

## Define the count store FIRST
Client-side `localStorage` counter (`sdg_briefcase_visits`), anonymous, pure and testable. No user
attribution (that's the Tier-2 memory layer, not this).

## Behaviour
- `bumpVisits(storage)` increments the counter; `promptSetForVisits(n)` returns a fuller set early,
  leaner later; `ctaIntensity(n)` → `soft|medium|hard` (gentle → direct, still honest +
  ladder-aligned).
- Add a **"create this now"** suggestion derived from the current page context / filed items.

## Acceptance test
- `visits.test.ts` covers the count → prompt/CTA mapping (pure fns, storage injected, no `Date.now()`
  in tested paths).
- Manual: revisiting changes the prompt set + CTA intensity; prompts reflect the current page.
