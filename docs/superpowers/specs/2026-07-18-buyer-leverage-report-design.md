# Buyer Leverage Report — /r/how-long-has-it-sat

**Date:** 2026-07-18
**Check:** `buyer_leverage_report_live_verify` · tracker `steady20_buyer_leverage_report_dom_cdom`
**Source rank:** #4 in `docs/steadyapi-research/2026-07-18-top20-not-yet-implemented-plans.md`

## Problem

A buyer negotiating a home has no packaged, honest source telling them how long a
specific listing has *actually* been sitting or how many times its price has been cut.
Portals structurally under-report this: realtor.com restarts the days-on-market counter
under a new listing ID on every relist (verified 07/16 — Brick Underground +
ARMLS/CanopyMLS/OneKeyMLS docs), so a home that has sat 140 cumulative days across two
relists shows a fresh 12-day counter. We already compute the honest cumulative number
(`cdom_days`) and the full price-cut event history — but only surface them to
sellers/agents (chat comps, flyers). The buyer, who needs them most, never sees them.

## Goal

A standalone buyer-facing route that reads a specific home's time-on-market and price-cut
history from our own lake and frames it as **objective negotiating context** — handing the
buyer facts, never asserting the seller is motivated or promising a discount.

## Research (crawl4ai, 07/18/2026 — RULE 0.4)

DuckDuckGo sweep of 2026 buyer-negotiation guidance (realtywire, Own Luxury Homes, Redfin
blog, floridahomefinder, loanpal, propertiesincorporated). Consistent findings:

- **DOM, CDOM, and price cuts are the three named leverage signals** in every current
  buyer guide. "A low DOM signals competition and limited room to negotiate; a high DOM —
  **especially relative to local benchmarks** — suggests real leverage."
- **Leverage is relative, not absolute.** National median DOM was ~66 days early 2026
  (Redfin). A read must compare *this* listing's DOM to *its ZIP's*, not to a fixed number.
- **CDOM is the stronger number** because it resists the seller counter ("my 30-day DOM
  includes weekend open houses" — Sellable). The cumulative figure across relists can't be
  hand-waved.
- **Do-not-bake-in:** the UrbanDigs "2–2.5% discount per 30 days on market" elasticity is
  national, unverified at our grain, and is exactly the "invented elasticity" the source
  doc cut rank 14 over. We present facts; we never promise a discount percentage.

## Code substrate (probed live, 07/18/2026 — RULE 0.5)

All confirmed against live code; no phantoms:

- **Current + cumulative DOM:** `lib/listings/dom.ts` `formatDom({domDays,isFloor,cdomDays})`
  is the one authority for DOM wording (headline = current spell matching realtor.com;
  cumulative rides along when it changes the story). `listing_dom` view carries
  `dom_days`, `cdom_days`, and `address_key` (`lib/listings/select.ts:243–341`).
- **Price-cut EVENT history exists and is queryable** — this refutes the source doc's own
  excluded-list caution. `ingest/pipelines/listing_lifecycle/transitions.py:68–72`: when a
  listing stays in the same state but price moves, a **discrete transition row is appended**
  to `data_lake.listing_transitions` with `price`, `price_delta`, and date (`at`). A price
  cut = a row where `from_state == to_state` and `price_delta < 0`.
- **Per-address transition reads:** `lib/back-on-market/relist-fact.ts` is the exact
  precedent — reads `data_lake.listing_transitions` via `createServiceRoleClientUntyped()`
  (data_lake is outside the typed client), keyed on `address_key = addressKey(street, zip)`
  + `sale_or_rent="sale"`, with the condo `#201`→`Unit 201` normalization already solved
  and validated against 22 real rows. **Reused unchanged** (keeps it the one authority for
  relists; avoids collision with rank 6 which edits it).
- **No-invention precedent:** `lib/deliverable/recipes/price-reduced.ts` is the playbook for
  stating a price cut as fact while forbidding every "why it moved" inference. Its framing
  prohibition list is the model for this build's copy.
- **Confirmed gap:** `dom_days`/`cdom_days` flow only into seller/agent surfaces (chat
  comps, flyers) via `lib/listings/select.ts`; no buyer-facing route surfaces them or the
  cut history. (Verified: the columns are read in `select.ts`; no `app/r/*` buyer route
  consumes them.)

## What we're building

### Route & grain
`app/r/how-long-has-it-sat/page.tsx` (server, `runtime="nodejs"`, `dynamic="force-dynamic"`),
mirroring `app/r/back-on-market/page.tsx`:
- **Address entered** → per-home leverage read + area context.
- **Bare ZIP** → area buyer's-market read only (no per-home key exists for a ZIP).
- **Address in-scope but no per-home match** → still render the ZIP-area read for that
  address's ZIP (degrade to area, like back-on-market falls back to Lane-1) — never a dead
  end. **Empty / out-of-scope (not Lee/Collier)** → a plain ask, never a fabricated signal.
  Reuse `resolveQToZip` and the ReportShell/ReportHeader/ReportFooter chrome.

### Data assembly — new module `lib/buyer-leverage/`
All reads are our own lake; no vendor; every read empty-tolerant (null/[] on miss, never
throws, never invents). Injectable deps for tests (mirror `relist-fact.ts`).

1. **Per-home DOM read** — `listing_dom` by `address_key` → `{ domDays, isFloor
   (=dom_is_floor), cdomDays, state }`. Wording via `formatDom` (reused). **Carry `state`**
   (advisor blocker 3): the leverage framing assumes an *actively for-sale* home. A subject
   in `pending`/`holding`/`sold` is not a live negotiation target — branch and suppress the
   "here's your opening" framing (a plain status read, or degrade to the area read). Only
   `state='active'` gets the full leverage line.
2. **Price-cut history reader** — `listing_transitions` by `address_key` + `sale_or_rent="sale"`,
   read the rows (`at, from_state, to_state, price, price_delta, seed`, freshest first,
   `limit ~25`), then in code derive cuts = `from_state===to_state && price_delta<0` →
   `{ count, totalCut, events: [{date MM/DD/YYYY, size}] }`. Guard applied in code (like
   relist-fact's `>=7d` guard), so a test can prove it. (Column-to-column
   `from_state==to_state` isn't a clean PostgREST filter, so fetch + filter in code.)
   **FORWARD-ONLY — advisor blocker 1 (verified in code):** same-state price-move transitions
   only fire from the second scan onward (`transitions.py:11,68` — the seed run emits only
   "appeared" rows; `pipeline.py:160`). So the observed cut count begins at the listing's
   `first_seen`, NOT its true listing start. A home cut three times before it entered our
   sweep shows fewer (or zero). `dom_is_floor` is the completeness signal (same 07/03/2026
   censor boundary): **not floored** → we saw the listing fresh, cut history complete → "cut
   twice" is honest; **floored** → pre-window cuts are censored → the count must be hedged
   ("cut at least twice since we began tracking this listing"), never an unqualified total.
   This is the exact forward-only caveat the rank-6 brief flagged for `relist-fact.ts`,
   applied here.
3. **Relist fact** — reuse `resolveRelistFact` unchanged.
4. **ZIP benchmark (context, degrades gracefully) — LOCKED: compute live from our own
   `listing_dom`.** Median DOM for the ZIP's active for-sale listings via
   `percentile_cont(0.5) WITHIN GROUP (ORDER BY dom_days)` over `data_lake.listing_dom`
   filtered `sale_or_rent='sale' AND state='active' AND zip_code=$zip AND dom_days IS NOT
   NULL` **AND `dom_is_floor = false`** (aggregate at source, one SQL). **Exclude floored
   rows — advisor blocker 2:** floored rows have understated `dom_days` and concentrate in the
   long-sitting high-DOM tail this report cares about — including them understates "typical,"
   which *overstates* the gap. Exclude and note it. Corollary: a floored *subject*
   (`formatDom` emits "138+") must read "at least X longer than typical," never a crisp
   number. **Why live, not market-heat-swfl:** market-heat's
   `median_days_on_market` comes from realtor.com's *monthly published* ZIP aggregate
   (Economic Research Data Library) — a different provider, a monthly lag, and a **different
   DOM definition** than our per-home `dom_days`. Benchmarking a subject's `dom_days` against
   a realtor.com median compares two different rulers; computing the median off the *same
   `listing_dom` view* the subject's `dom_days` comes from keeps subject and benchmark on one
   ruler. **Cut-share half is free and same-provenance:** reuse
   `listing_momentum_stats.price_reduced_share` (already per-ZIP, off the same own-inventory
   `api_feed` sweep). Used only for the relative line ("longer than most homes here"); thin/
   absent area data → drop the comparison, the per-home facts still stand.

   *Deferred to the follow-up check `buyer_leverage_zip_dom_authority_audit` (opened this
   session): whether this own-data median DOM should be materialized once into
   `listing_momentum_stats` as the single shared authority — so buyer-leverage,
   listing-momentum, and market-heat cross-check against one own-inventory DOM instead of
   three definitions (one-authority-per-shared-concept). Out of scope for v1; v1 computes it
   at read time in `lib/buyer-leverage/`.*

### The framing (deterministic, no LLM — THE-GOAL rule 2)
Code composes the fact sentences the way `under-contract.ts` / `formatDom` do — e.g.
"Listed 138 days (94 longer than typical for this area). Price cut twice, $45,000 total."
Then it stops. **Forbidden by name** (from `price-reduced.ts`'s prohibition list): the seller
is motivated / anxious / relocating; "room to negotiate"; "you'll get X% off" or any
discount elasticity; "priced to sell / won't last / a deal / a steal"; any reason the price
moved. The buyer draws their own conclusion from real numbers. A leverage line renders
**only** on real data — no DOM, no cut, no line. **Floored subject/history hedges the
wording, never suppresses it:** a floored subject reads "listed at least 138 days" and "cut
at least twice since we began tracking" — the honest bounded form, not a crisp count it can't
support (advisor blockers 1–2). Composition is pure/deterministic and unit-testable.

### Provenance
Every figure cites "SWFL Data Gulf" (our listing data). As-of date MM/DD/YYYY, stated once.
Vendor name never surfaced. No system nouns / internal IDs in rendered copy.

### Reuse vs. new
- **Reuse:** report-shell chrome, `resolveQToZip`, `addressKey` (+ condo round-trip),
  `formatDom`, `resolveRelistFact`, `resolveZip`/scope guard, `cityForZip`.
- **New:** `lib/buyer-leverage/` (assembly + cut-history reader + ZIP benchmark), the route,
  a `components/buyer-leverage/` read component.
- **Untouched:** `lib/back-on-market/relist-fact.ts` (consumed, not edited).

### Testing
- `lib/buyer-leverage/no-invention.test.ts` — no leverage line without real data; asserts the
  rendered copy contains none of the forbidden motivation/discount phrases (mirror
  `back-on-market`/`should-i-sell` no-invention tests).
- Unit tests: cut-history derivation (count / total / dates / raises-excluded), DOM wording
  passthrough, ZIP-benchmark math, empty-tolerance on every read (no creds, no rows, error).
- **Completeness/censor tests (advisor blockers 1–3):** a floored subject never emits a
  crisp cut count or crisp DOM gap (only the hedged "at least" form); the benchmark median
  excludes `dom_is_floor` rows; a non-`active` subject (pending/holding/sold) does not get
  the leverage framing; an in-scope no-match address degrades to the ZIP-area read.

### Done / close
Verify with `bunx next build` (not tsc); live-verify the served route. On ship: SESSION_LOG
entry, close `buyer_leverage_report_live_verify` (live proof) + the `steady20_...` tracker.

### Parallel-session note (RULE 1.5)
Reads `relist-fact.ts` but does not edit it. If rank 6 (relist outcome) runs concurrently
and edits `relist-fact.ts`/`BackOnMarketRead.tsx`, isolate one of the two in a worktree.

## Non-goals (YAGNI)
- No discount/elasticity estimate, ever (invention trap).
- No seller-motivation inference (the `price-reduced.ts` prohibition).
- **No chart in v1 — conscious decision (advisor sharpener).** The `/r/` report family
  (should-i-sell, back-on-market) is prose + stat-grid, and v1 matches it. The DOM-vs-ZIP-
  median comparison is a genuine one-value-vs-reference shape the existing `dot-plot` frame
  already renders (the `price-reduced.ts` pattern, no new renderer), and cut history is a
  real price-step-down — both are noted **fast-follows**, deliberately deferred to keep v1
  bounded, not omitted by oversight.
- No chat-lane entry in v1 (route only; a chat gate can follow).
- No push notification / watch (that's rank 8's territory).
- No new ingest — everything reads columns that already land.
