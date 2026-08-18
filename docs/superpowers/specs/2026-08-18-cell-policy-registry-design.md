# Cell-policy registry + Gate 18 — buyer-facing content rulings as one enforced root

**Date:** 2026-08-18 (built same session it was approved — bounded path, design approved in chat)
**Check:** `cell_policy_registry_live_verify`
**Note:** registered as "Gate 16" before reading the hook; gates already ran to 17, so it shipped
as **Gate 18**.

## Problem

Operator decree 08/18/2026 ("why the fuck do we want HOA costs on there? We don't want to detour
any potential buyers before arriving") was implemented per-recipe: under-contract had it since
July, new-listing/back-on-market got it 08/18 (commit 24d06a7f) — and every future ruling faced
the same manual walk across 17 recipe files. The walk is the step that never happens (strike
shape `decree-in-prose-code-never-walked-it`). Operator, on the pattern: "THIS IS ALL A FUCKING
LIE... we are writing fucking code to build a fucking email and every fucking email is different."

## Goal

A content ruling lands in ONE file, once, and is enforced on every buyer-facing email — including
recipes written after the ruling — with no per-recipe walking, ever.

## What we're building (shipped this session)

1. **`lib/deliverable/cell-policy.ts`** — the registry. `BUYER_FACING_BANNED_CELLS`: label
   matchers for the cost family (HOA, dues, taxes, insurance, CDD, carrying), each entry carrying
   the operator decree verbatim and dated. `bannedCellRule(label)` + `stripBannedCells(items)`.
2. **Chrome backstop** — `buildLifecycleEmail` (lib/email/lifecycle-chrome.ts) sweeps every
   stats-type block (spec strip AND recipe `middle`/`tail` stat rows) through the registry before
   layout. A block the policy empties is dropped whole, never an empty box.
3. **Fleet test** — `lib/deliverable/cell-policy.test.ts`: matcher coverage both directions
   (cost family banned, value family never), the chrome backstop (proven RED without the chrome
   edit: 2 fail → 0 fail with it), and a sweep of the exported spec builders (open-house,
   under-contract, coming-soon, market-comps) with an HOA fee loaded. new-listing/back-on-market
   keep their own in-recipe tests (their files were claimed by a parallel session on build day);
   the chrome backstop covers them at render time regardless.
4. **Gate 18** — `.claude/hooks/check-prepush-gate.mjs` runs the fleet test on every push
   touching `lib/deliverable/recipes/`, the registry, or the chrome. Escape:
   `ALLOW_CELL_POLICY_FAIL=1` (only for pushes changing the fleet test itself).

Also fixed while in there: open-house's narrator prompt claimed "the days-on-market and HOA
figures below are real" when no HOA cell has been on that page — stale prompt + stale comment
corrected (facts stay model-visible; 08/06 "why would the model not see HOA" ruling unchanged).

## Scope limits (deliberate)

- **Reader-facing cells only.** Model visibility and prose-side cost bans are separate,
  pre-existing mechanisms (narrator prompts + shared.ts regex guard) — untouched.
- **Cost cells whose story IS the cost stay legal by label:** price-reduced's cut and just-sold's
  sale price are not in the banned family.
- **Exceptions (none today)** are declared in the registry, visibly — never by bypassing the
  chrome.

## Failure modes → guards (RULE 3.5)

- A cost label slips the matcher → matcher test enumerates the family both directions.
- Matcher over-reach bans a value cell → negative test on $/Sq Ft, Beds, DOM, Asking, Sold For…
- A cell rides in via a recipe's `middle` stats block, not the spec strip → backstop sweeps ALL
  stats-type entries, tested.
- Policy empties a block and an empty box ships → empty blocks dropped whole, tested.
- A ruling gets re-implemented per-recipe out of habit → Gate 18's block message names the
  registry as the only legal home; playbook §HOA points at the code root.
- The gate itself breaks → fail-open (never wedge a push on a guard bug), same as Gates 15–17.

## Evidence

- Fleet test red-first (module not found), then 8 pass / 0 fail.
- Backstop proof-of-red: chrome edit stashed → 6 pass / 2 fail; restored → 8 pass / 0 fail.
- Full suites: `bun test lib/email lib/deliverable` → 2971 pass / 0 fail.
- Hook: `node --check` clean; Gate 18 uses the same `run()`/`block()`/fail-open idiom as Gate 15.
