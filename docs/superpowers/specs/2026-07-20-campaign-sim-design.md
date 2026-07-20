# Listing lifecycle campaign simulator (teaser → sold)

**Date:** 2026-07-20
**Operator ask (verbatim intent):** "have email builder build a full campaign from teaser to sold
on a real new listing… build a fake example that feeds it the property description and send it fake
updated price cuts and actual sold info. build the program, do not build anything in the email
yourself. I want to see how it sends exactly… send in order, firing at different times based on the
schedule you set up… Let it find its own comps. save the program for when it doesn't work."

## Problem

Seven listing-lifecycle recipes exist and each is unit-tested in isolation. Nothing has ever driven
all seven **as one campaign, on one house, through the real send path, into a real inbox**. Every
email defect in the failure catalog (`docs/standards/emails.md` §7) was found in an inbox, not in a
test — empty skeletons that returned `applied: true`, a brand overlay clobbering the authored
address, a Gmail-expanded accordion, near-identical consecutive sends. A green suite proves each
recipe does what it was told for known inputs; it does not prove a subscriber walking Coming Soon →
Sold receives seven coherent, correct, visually-sibling emails.

Two lifecycle stages also cannot be exercised on a live active listing at all: **price-reduced**
needs a cut on record, and **just-sold** needs a recorded close. Waiting for a real house to cut its
price and close is not a test loop.

## Goal

One saved, re-runnable program that drives the **real** builder (`authorDoc`) through all seven
stages on **one real Lee/Collier listing**, injects the two events the real world won't supply on
demand (a price cut, a close), and sends each stage in order to `hello@swfldatagulf.com` on a
schedule — so the operator sees exactly what a subscriber sees, in sequence. It survives its own
failure: state file, resume, dry-run, and loud per-stage assertions.

## What we're building

**Subject (real, unfaked):** 8348 Southwindbay Cir, Fort Myers, FL 33908 — 3 bed / 2 bath,
1,978 sq ft, $659,000, single-family, Lee County. Resolved from `data_lake.listing_dom` by the real
`resolveSubjectListing` (real photo, real specs). Verified present and active 07/20/2026.

**The only invented inputs — named, and confined to the simulator:**
1. The **property description** (MLS remarks). No vendor sells us remarks; lane 2 is the agent's own
   pasted text. The sim supplies one, exactly as an agent would paste it into the build box.
2. The **price cut** — stage 5 onward: `$24,000` off, new ask `$635,000`.
3. The **close** — stage 7: `$628,500`, recorded date set from the run clock.

Everything else — comps, county inventory, area DOM, ZIP figures, photo, specs, charts — is real and
found by the builders themselves. The sim never authors a block, never writes copy, never touches an
`EmailDoc`.

**Entry point is `authorDoc`, never a builder directly.** The layer that broke twice (07/13 recipe
dispatch, 07/19 subject resolution) is inside `authorDoc`; a program that bypasses it proves nothing
about the thing the operator just had fixed. Each stage calls `authorDoc({ recipeKey, prompt,
rawDoc, scope })` — the same call the Lab's Build box fires.

**Fake data enters at the data-fetch boundary, via `mock.module`, in the sim process only.**
Verified working transitively from a plain Bun script (probe, 07/20/2026). Two mocks, both
**call-through-then-patch** so real data still does the work:
- `@/lib/listings/resolve-subject` → real resolver, then the current stage's cut layered onto the
  returned `ListingFacts` (`price`, `isPriceReduced`, `priceReduction`).
- `@/lib/assistant/comp-helper` → real `compsForAddress` (it finds its own comps), then the
  subject's own row patched to a recorded sale for the sold stage only. This is the only honest
  source of a close (`just-sold.ts` header) — so it is the only place a fake one can enter.

Zero production files change. The mocks live in the sim and are unreachable from app code.

**Stage plan** (order, event applied, wall-clock offset at default 4-min spacing):

| # | Recipe | Event in force | Offset |
|---|---|---|---|
| 1 | `coming-soon` | — (address suppressed) | +0 |
| 2 | `new-listing` | — ($659,000) | +4m |
| 3 | `open-house` | — | +8m |
| 4 | `market-comps` | — | +12m |
| 5 | `price-reduced` | cut $24,000 → $635,000 | +16m |
| 6 | `under-contract` | cut still in force | +20m |
| 7 | `just-sold` | close $628,500 | +24m |

Campaign *narrative* time (the listing cut its price after weeks) lives in the data; wall-clock
spacing is compressed so the operator watches the whole arc in one sitting.

**Send path is blast-route parity**, verbatim from the shape `tmp-rainbow-recipe-send.mts` proved:
`renderEmailDocHtml` → `collectAllowedUrls` + `lintCompiledHtml` (hard gate) → per-recipient
footer + unsubscribe → Resend → `email_blasts` audit row → `recordEmailSent`. Deliverable row saved
per stage so every email has a real `/p/<id>` web view.

## Failure modes, and the guard that stops each

| # | How it breaks | Guard |
|---|---|---|
| 1 | **A stage silently falls through to the generic author** and ships a grab-bag email under a lifecycle ribbon — the 07/13 disease "wearing a lab coat". | Per-stage assertion: `applied === true` AND the stage's **headline field actually rendered** (ribbon word present; cut present on price-reduced; close present on just-sold). Fail loud, abort the run, send nothing. |
| 2 | **Fake data escapes the simulator** into the lake, a brain, or a real user's deliverable. | Zero writes to `data_lake.*`. Deliverables land under a dedicated sim project id and carry `SIM:` in the instruction. Mocks are process-local; no prod file gains an injection port. |
| 3 | **Sends to a real person.** | Hard recipient allowlist (`hello@swfldatagulf.com`, operator inbox). Anything else exits non-zero before Resend is constructed. |
| 4 | **Duplicate sends** on re-run after a mid-campaign failure. | Run-state file (`runs/campaign-sim/<run-id>.json`) records each stage's `sent_at` + Resend id; a sent stage is skipped unless `--resend` is passed. |
| 5 | **Price-cut arithmetic inverted** — `priceReduction` is the size of the *cut*, not the old price (the documented $104,975-vs-$699,975 trap). Getting it backwards ships a lie about someone's house. | TDD'd pure reducer + a test named for exactly this trap. `previous = current + cut` must hold, and the sim asserts the rendered previous-price cell exceeds the rendered ask. |
| 6 | **Narrator invents** a reason for the cut / a market claim. | Untouched existing gates: `gateNarrative`, `narrative-lint`, `claims.ts`, and price-reduced's own prohibition list. The sim adds none and removes none. |
| 7 | **A fake link ships.** | `lintCompiledHtml` against `collectAllowedUrls` — hard abort, same gate as the blast route. |
| 8 | **Process dies mid-campaign** (a 24-minute run in one process). | State file after every stage; `--resume <run-id>` picks up at the first unsent stage. Stage builds are independent. |
| 9 | **Real vendor spend on the dev loop** — comps + geocode per stage against SteadyAPI. | `--dry-run` builds and writes HTML to `runs/` with no send; the paid path runs only on the real serve. Comps fetched once per stage, as the recipes already do. |
| 10 | **Seven emails that look like seven companies** — the exact disease `buildLifecycleEmail` was created to cure. | The run writes every stage's HTML to `runs/campaign-sim/<run-id>/` so the arc is inspectable side by side, not just in an inbox. |
| 11 | **Mock leaks into a stage that should be real** (e.g. the cut appearing on `new-listing`). | Mock behavior is a pure function of the current stage index — installed once, never toggled. Stage 1–4 assert `isPriceReduced` is absent from the facts handed to the builder. |

## Verification

1. `bun test lib/deliverable/campaign-sim/` — the pure reducer (TDD, failure mode #5 named).
2. `--dry-run` full seven-stage build; inspect written HTML.
3. Live serve → `hello@swfldatagulf.com`, in order.
4. Close `campaign_sim_live_verify` only on inbox evidence, not on a green build.
