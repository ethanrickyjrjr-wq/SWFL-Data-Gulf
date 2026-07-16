# Back on Market read — address-first fallthrough/relist context surface

**Date:** 2026-07-17
**Status:** approved design (operator, 07/17/2026) → pre-plan
**Build check:** `back_on_market_read_live_verify`
**Research (evidence base, LOCAL/gitignored):** `docs/steadyapi-research/2026-07-17-back-on-market-surface-research.md`
(fold into `STEADY-PAINS.md` next session; ties to landscape item 7 + the TIER-2 "motivation signal" block)
**Scope boundary (separated 07/17/2026):** the market snapshot + sell-now-vs-wait spread ("should I
sell now or wait?") are a SEPARATE product — `docs/superpowers/specs/2026-07-17-should-i-sell-design.md`
(`/r/should-i-sell`), finding #1 seller decision-support. They are NOT a phase of this read (finding
#7). The two share only the reconciled seller-stress reader (`lib/back-on-market/load-zip.ts`). This
spec stays Phases 1–4 (ZIP read → relist detector → per-home overlay → deliverable).

---

## Problem

Buyers in the r/RealEstate cash-offer threads call a home that returns to market **"tainted,"** and
**no product explains why a contract fell through.** Sellers whose deal collapses are left looking
bad with no way to reframe the relist. The community's own honest lens is already fixed —
*"treat it as a motivation signal, not a valuation signal"* — and the real base rates that would
de-stigmatize a relist exist but are never surfaced to either side. Portals (Redfin/Zillow/
Realtor.com) already show DOM, price history, and "back on market" status for free, so the raw status
is **not** the whitespace. The unclaimed half is **local context + provenance + both-sides framing**,
plus one thing structurally impossible to fake: *why* a specific deal died.

## Goal

A dedicated, address-first **"Back on Market" read** that answers both sides honestly:

- **Buyer:** "Is this back-on-market home a red flag?" → the real local fallthrough/relist rate + the
  neutral truth (usually buyer-side, no-fault-of-seller, often means negotiating leverage).
- **Seller:** "My deal fell through — now my relist looks bad." → the same numbers turned to preempt
  the stigma.

Grounded in data we already hold (`seller-stress-swfl`, Redfin ZIP rates), with every figure sourced,
and with a hard boundary: **we never assert why a specific contract fell through, and never use the
word "stigmatized"** (it is a legal term of art — death/crime/haunting — and FL Statute 689.25
shields sellers; a relist is nowhere near it).

## Non-goals (YAGNI)

- **No per-home reason.** `holding` is reason-unknown by design; we never claim sold/withdrawn/
  fell-through for a specific address unless the record itself resolved it (rare, budget-sampled).
- **No new hazard/insurance data.** Insurance appears only as *context on common local causes*, drawn
  from existing research, never as a claim about a specific home.
- **No competitor scraping / no vendor deep-links.** Citations stay "SWFL Data Gulf" (listing-citation
  policy); the surface never links a realtor.com permalink.
- **Not a new brain.** Lane 1 reads the existing `seller-stress-swfl` output; Lane 2 adds a small
  detector + a metric on an existing pack, not a whole reporter.

---

## Architecture — one engine, two lanes, two display states

An address-first read page. A place resolves to a ZIP and — when the address is a returned listing —
to that specific home. Both lanes render through one component; the page degrades gracefully.

- **Lane 1 — the ZIP read (ships now, zero new data).** The always-available base.
- **Lane 2 — the per-home relist fact (needs one bounded ingest build).** An overlay when a specific
  back-on-market address is in play; absent/deferred otherwise.

Display states:
1. **Specific back-on-market home in play** → Lane 2 fact layered on the Lane 1 ZIP context.
2. **No address, or per-home data thin/unbuilt** → Lane 1 alone ("how often do deals fall through and
   homes come back *here*").

### Units (each has one purpose, testable in isolation)

| Unit | Location (new unless noted) | Purpose | Depends on |
|---|---|---|---|
| `loadBackOnMarketZip(zip)` | `lib/back-on-market/load-zip.ts` | Lane 1 read: pull the ZIP's cancellation/relist/delist rates + causes context | existing `seller-stress-swfl` output via the zip-report brain-read seam (`lib/zip-report/`) |
| `resolveRelistFact(address)` | `lib/back-on-market/relist-fact.ts` | Lane 2: subject → its clean relist event (or null) | `resolveSubjectListing` (existing) + the new relist view |
| `BackOnMarketRead` | `components/back-on-market/` | Render both lanes, buyer/seller toggle, provenance panel | the two loaders |
| Page route | `app/r/back-on-market/` (address/ZIP param) | Mount the read; reachable from HeroBar "Market Report" mode | `heroBarAction` routing (existing) |
| `buildBackOnMarket` recipe | `lib/deliverable/recipes/back-on-market.ts` | "Send it" → deliverable | `buildLifecycleEmail` chrome + `authorListingNarrative` (existing) |
| clean-relist detector | `ingest/pipelines/listing_lifecycle/` + a view | Lane 2 data: flicker-resistant relist w/ true off-market duration | `listing_transitions` / `listing_state` |

---

## Lane 1 — the ZIP read (Phase 1, no ingest work)

**Pre-build verifications (RESOLVED 07/17/2026, advisor-directed):**
- `seller-stress-swfl` IS loaded by the ZIP read path — present in `REGISTRY_PACK_IDS`
  (`lib/zip-report/assemble.ts:36` + `load-ranked-signals.ts:46`), with live `seller_stress_by_zip`
  candidate mappings in `candidates.ts`, guarded by `registry-coverage.test.ts`. No wiring gap (the
  precedent failure — active-listings-swfl absent from the registry — does NOT apply here).
- **Coverage is strong:** the live brain scores **52 of ~55 core ZIPs (3 suppressed)** at the latest
  vintage — the local rate is the hero, not the exception.
- **Freshness caveat (must surface):** latest seller-stress period is **03/01/2026** (Redfin's rolling
  monthly cadence lags ~4 months). The surface states this as-of date (MM/DD/YYYY) plainly; it is the
  local structural rate, not a "today" number.

**Data (all already published):**
- From `seller-stress-swfl` per-ZIP `detail_table` (Lee + Collier core, Redfin Data Center monthly):
  `cancellation_rate_pct` (% of pending cancelled), `share_relisted_pct` (relist rate),
  `share_delisted_pct` (delist rate). This is the localized "how often *here*" number no portal gives.
- **Causes context (not a per-home claim):** the common national reasons a deal dies — financing,
  appraisal (~7% of contracts delayed), inspection — with **insurance called out as the SWFL-specific
  deal-killer** (STEADY-PAINS TIER-2; framed as "common local causes," sourced to our research + named
  web sources, never attributed to the subject home).
- **National frame (context, cited web source — VERIFIED against the live Redfin /news/ page
  07/17/2026):** 13.6% of U.S. home-sale agreements fell through (May 2026, unchanged 4 months
  seasonally-adjusted; range-bound 13.4–14% two years → ~1 in 7 is normal, not a spike); leaders are
  Atlanta 18.8%, Fort Worth TX, Jacksonville FL (~18%), with 3 of the top-10 in Florida. Source:
  `redfin.com/news/contract-cancellations-may-2026`. Written as MM/DD/YYYY, four-lane rule 3 (never
  framed as "ZIP-level"). **This number re-fetches at render time (Lane-3 named source), never
  hard-codes — it drifts monthly.**

**Rendering:** the read leads with the local rate, sets it against the national frame, and states the
neutral truth ("usually buyer-side / no fault of seller / a returned listing often means leverage").
Data-driven visual = a real bar/table of the ZIP's rates vs the region (built from the brain, per
charts rule 4 — never "can't chart it").

## Lane 2 — the per-home relist fact (Phase 2, one bounded ingest build)

**Probe evidence (live `pg.data_lake.listing_transitions`, 07/17/2026 — see research §6):** the cron
is running and fresh (latest event ~2 days old); the relist signal is a `from_state='holding' →
to_state='active'` transition (there is **no** `back_on_market` state in the feed — SteadyAPI labels a
returned listing "active"); **5,579 fresh relist events exist**; genuine departures persist (1,319
homes off-market 7–14d, 520 @ 15–30d, none past 30). **But** the raw count is contaminated by
scan-completeness flicker, and the transition's `days_in_prev_state` is **frozen at 0** (true age
lives in `last_seen`), so the count can't be cleaned with the transition's own fields.

**The build (bounded):**
1. A **flicker-resistant relist detector** that computes true off-market duration at reappearance
   (`at − holding-entry last_seen`) and only counts a relist when duration ≥ a threshold (proposed
   **≥ 7 days** — clears the same-week scan flicker; confirm against the persistence buckets during
   implementation). Stamp the duration onto the relist event (new column) so downstream reads are honest.
2. A **relist count** in `listing_transitions_recent_zip_stats` (currently counts holdings/sales/new/
   price-cuts only) — so both the ZIP read and any digest can cite it.
3. **Brain-first gate (RULE):** the new Tier-2 view column ships in the same PR as its consuming pack
   change — add a `relist_rate` metric to `listing-momentum-swfl` (its natural home: our own weekly
   list-side signal) **or** wire it into the Lane-1 loader as a second source. Decide at plan time;
   default = `listing-momentum-swfl` metric.

**Rendering:** only after the detector lands do we say, per home, **"back on the market MM/DD/YYYY
after N days off-market — the record doesn't state why."** Until then the page shows Lane 1 only for
that address. Empty-tolerant: `resolveRelistFact` returns null out of Lee/Collier, on no match, or on
a below-threshold event → page falls back to Lane 1 (no error, no invention).

---

## The boundary = the integrity (model it on `price-reduced.ts`)

The existing `lib/deliverable/recipes/price-reduced.ts` narrator framing is the proven template — it
already forbids, by name: a **reason** for the change, a claim about the **seller**, a claim about the
**market**, a **value judgment** ("deal/bargain/won't last"), reading the **address as a fact**, and
**comparing to other homes**. The Back on Market recipe/read reuses that framing with three deltas:

- **We DO have a legitimate market source here** (the ZIP fallthrough/relist rate is sourced), so the
  narrator MAY cite the local rate — but still **never the specific home's reason.**
- **Never the word "stigmatized"** in any user-facing string (linter-checkable; see Testing).
- **Never tie a cause to a protected class** (fair-housing) — causes are market mechanics only.

Every figure carries a provenance panel (`[INFERENCE]` + falsifier where projected) — the AVM-distrust
research says provenance is this audience's trust currency.

## Both-sides framing

One engine, a **buyer-view / seller-view toggle** (client state; same data, different sentence):
- **Buyer:** base rate + "usually buyer-side, no fault of seller, a returned listing is common and
  often means leverage — here's what it does and doesn't tell you."
- **Seller:** same numbers as preempt — "relists are common here (rate); here's the neutral context to
  hand a buyer; leverage cuts both ways."

## The "send it" deliverable hand-off

A button spins the current read into a deliverable via a new lifecycle recipe (`back-on-market.ts`)
built on the shared `buildLifecycleEmail` chrome — ribbon "Back on the Market," the ZIP-rate bar as
the middle (a real chart, unlike price-reduced which has none), the strict framing above, agent card /
brand sticky from the canvas. Reuses the existing recipe registry + `RecipeBuildContext`.

---

## Data flow

```
address bar (HeroBar "Market Report" mode)
  → /r/back-on-market?q=<address|zip>
    → resolve: address → ZIP (+ subject, if listed)  [resolveSubjectListing]
    → Lane 1: loadBackOnMarketZip(zip)                [seller-stress-swfl rates + causes + national frame]
    → Lane 2: resolveRelistFact(address)              [clean relist view; null → Lane 1 only]
    → BackOnMarketRead renders (buyer/seller toggle, provenance)
      → "Send it" → buildBackOnMarket recipe → EmailDoc
```

## Error handling / empty-tolerance (four-lane / ODD)

Every lane is empty-tolerant and never throws: out-of-footprint ZIP, suppressed seller-stress ZIP, no
subject match, or a below-threshold relist all degrade to the next available layer, ending at the ZIP
read or a plain "enter a Lee or Collier address / ZIP" ask. **No lane ever invents a number**; a gap
is filled from the next lane or left as an open slot (RULE 0.7 four-lane).

## Testing

- `load-zip.test.ts` — Lane 1 pulls the right ZIP rates; suppressed ZIP → graceful; national frame
  is a fixed cited string (no invented number).
- `relist-fact.test.ts` — below-threshold event → null; a ≥7-day off-market event → a fact with the
  duration; out-of-footprint → null.
- detector unit test (Python, `ingest/tests/pipelines/listing_lifecycle/`) — flicker (0–2d) excluded,
  real departure (≥7d) counted; duration stamped correctly.
- **No-invention lints:** the recipe's narrative goes through `gateNarrative` (existing); add a
  string-level assertion that user-facing output never contains "stigmatiz" and never asserts a
  per-home reason.
- Live-verify (closes `back_on_market_read_live_verify`): a real Lee/Collier address served on a prod
  build, screenshot both views, confirm the ZIP rate is the live `seller-stress-swfl` value.

## Build phases (ordered — Lane 1 ships credible on day one)

1. **Lane 1 read + page + both-sides toggle + provenance** — no ingest work, real numbers.
2. **Clean-relist detector (ingest) + relist count in the view + consuming-pack metric** (brain-first
   gate) — the one new data build.
3. **Lane 2 overlay** on the page (per-home relist fact) once Phase 2 lands.
4. **"Send it" deliverable** recipe.

Each phase is independently shippable and independently verifiable.

## Open decisions (resolve at plan time)

- Exact mount: a new `/r/back-on-market` route vs a fourth HeroBar mode vs a section of the existing
  `/r` report. Default: `/r/back-on-market`, reachable from the "Market Report" mode.
- Relist threshold: default ≥ 7 days off-market; confirm against the persistence buckets.
- Consuming pack for the relist metric: default `listing-momentum-swfl`.
- Public label wording (never "stigmatized"): default "Back on the Market."
