# Own the comp distance function

**Date:** 2026-07-22 · **Check:** `comp_distance_ranker_live_verify`
**Closes:** `comps_no_size_band_guard` [defect, due Jul 26] · `knn_own_the_comp_distance` [idea, opened 07/13]
**Research:** `_RESEARCH/data-and-ingest/2026-07-22-naive-bayes-knn-algorithm-fit.md`

**Operator decisions locked in-session 07/22/2026:**
- Comp source: **"Do both. Start with api"** — vendor feed first, our parcels second.
- Recency window: **"Do 6 months"** — stricter than the Fannie Mae 12-month standard.
- Design approved in-session ("Good").

---

## Problem

Comp selection performs **no similarity computation at all.** Probed live 07/22/2026 —
`lib/assistant/comp-helper.ts` `compsForAddress`: geocode → Lee/Collier gate → one SteadyAPI
`/nearby-home-values` call (`status: "sold"`, `limit: 25`) → **`nearby.slice(0, deps.topN ?? 6)`**.
That slice is the entire selection logic. "Comparable" currently means *the vendor put it in the
nearby list and it isn't bare land* (`isComparableHome` requires beds AND sqft — a vacant-lot guard
added 07/13/2026).

`lib/listings/select.ts` `rankListings` is the same shape: a hand-written
`score() = (has coords ? 2 : 0) + (residential ? 1 : 0)`, then newest-first.

Two live consequences:
- `comps_no_size_band_guard` [due Jul 26] — *"460 and 684 sq ft rows compared against a 1,978 sq ft
  subject make the ask look wildly overpriced."*
- Operator, scratchpad item 23: *"only one comp??????????? has to be other sales near by in last 6
  months."*

**This is not a machine-learning build.** Nothing is trained; there are no labels, no model
artifact, no Python. "KNN" names the correct *shape* (scale the features, filter to a band, order by
weighted distance). The implementation is a deterministic TypeScript rank — a better `ORDER BY`
whose every output can be explained in words.

## Goal

Replace the blind `slice(0, 6)` with a pure, source-agnostic ranker that selects comps against a
published lender standard, explains every comp it returns, and returns fewer rather than padding
when the market is thin.

---

## Evidence (probed live 07/22/2026 — RULE 0.5 / 0.4)

**Vendor path.** `compsForAddress` is hard-capped at ≤3 Steady calls (1 `/nearby-home-values` +
≤2 `/property-tax-history` enrichments). The 25-candidate response is already paid for; ranking it
costs zero additional calls.

**Our parcels — depth, NOT recency.** `data_lake.lee_parcels` (556,083 rows / 104 cols) carries
`sale_prc1`/`sale_yr1`/`sale_mo1`, `living_area_sqft`, `actual_year_built`, `effective_year_built`,
`dor_uc` (DOR use code), `phy_zipcd`, `phy_addr1`. Queried live:
- `sale_yr1` **2025: 24,063 rows (15,776 with price > $1,000)** · **2024: 62,711 (43,182)**
- **ZERO 2026 sales.** Today is 07/22/2026 — the FDOR annual roll is **7+ months behind**.
- **No `lat`/`lon` columns.** Locality from parcels must be ZIP + subdivision, not radius.
- `sale_change_code_1` is `0` on 15,720 of 15,776 2025 sales (99.6%) — **will not discriminate
  arms-length**; do not build a qualifier filter on it without re-probing the code meanings.

→ **This is why the vendor feed goes first.** A 6-month window run against our parcels today would
return almost nothing. Parcels give depth and history; the vendor gives current sales.

**Property type is NOT collapsed** (corrects a stale scratchpad claim repeated earlier this
session). `data_lake.listing_state` active-for-sale, queried live: single_family 13,182 · land 7,931
· **condo 5,781** · other 1,640 · multi_family 566 · townhouse 519 · residential 298. A condo/SF
class filter is supportable today.

**Label-side note, unrelated to this build but found in the same pass:**
`data_lake.listing_transitions` `max(at)` = 07/19/2026 — no outcome labels for 3 days
(check `listing_transitions_label_stall_since_0719`).

---

## The standard we build to (named source, fetched live)

**Fannie Mae Selling Guide B4-1.3-08, Comparable Sales (06/04/2025)** —
https://selling-guide.fanniemae.com/sel/b4-1.3-08/comparable-sales

Verbatim requirements this design adopts:
- *"A minimum of three closed comparables must be reported."*
- *"Comparable sales that have closed within the last 12 months should be used."*
  → **Operator overrides to 6 months. Stricter, so still compliant.**
- *"The distance between the subject property and each comparable property is to be measured using a
  straight line."* Reported *"in terms of miles and include the applicable directional indicator (for
  example, '1.75 miles NW')."*
- *"Comparable sales from within the same market area (including subdivision or project)... should be
  used when possible."* Going outside requires *"commentary to explain the rationale."*
- *"In no instance may the appraiser create comparable sales by combining vacant land sales with the
  contract purchase price of a home."* → our existing vacant-lot guard is already aligned.
- Flood zone *"should be given consideration when selecting comparables."* → **noted, not built in
  v1** (see Out of scope).

Building to a published lender standard means a comp set is defensible against something external,
not against our own taste.

---

## What we're building

### One ranker, two feeds

A pure, source-agnostic module — `rankComps(subject, candidates, config)` — that knows nothing about
where candidates came from. Phase 1 feeds it the vendor's 25. Phase 2 feeds it parcel rows. Same
function, same tests, same output. Phase 2 is a new **adapter**, not a rewrite. This is the entire
reason "do both" is cheaper than it sounds.

### ⚠️ FIELD AUDIT — what the vendor feed actually carries (probed 07/22/2026, AFTER approval)

Read `lib/assistant/comp-helper.ts:34` (`RenderComp`) and `lib/listings/steadyapi.ts:355`
(`NearbyComp`). **Three features named in the approved design have NO DATA in Phase 1:**

| Feature | Phase 1 (vendor) | Phase 2 (parcels) |
|---|---|---|
| sqft / beds / baths | ✅ present | ✅ `living_area_sqft` |
| sale date (recency) | ✅ `priceDate` | ⚠️ `sale_yr1`/`sale_mo1`, month grain |
| ZIP locality | ✅ `zip` (on `NearbyComp`) | ✅ `phy_zipcd` |
| **property type / class** | ❌ **ABSENT** | ✅ `dor_uc` |
| **lat/lon → miles** | ❌ **ABSENT** | ❌ absent (needs geometry join) |
| **year built / age** | ❌ **ABSENT** | ✅ `actual_year_built` |

Corroborates the standing note `reference_steadyapi-no-property-type-field.md` — SteadyAPI exposes
property type as a `/search` FILTER only, never as a per-row field.

**Geocoding the 25 comps to recover miles is NOT a workaround** — `compsForAddress` is hard-capped at
≤3 Steady calls, and 25 geocodes would blow both that cap and the egress constraint.

**Consequence — Phase 1 scope narrows, and the headline defect still closes.**
`comps_no_size_band_guard` (due Jul 26) is a **size** defect, and sqft is present. Recency is present.
So Phase 1 ships size band + 6-month window + beds/baths/sqft ranking + ZIP locality — which is the
dated defect, fully. **Class match (F4), straight-line miles, and age move to Phase 2**, where the
parcel fields exist.

**This was caught before writing code, not after** — the field audit is exactly what the RULE 3.5
failure-modes discipline is for. A test written for F4 in Phase 1 would have been a test against a
field that does not exist.

### 🚫 WIRING BLOCKER — the 6-month window is NOT enforceable on the vendor feed

Found 07/22/2026 while wiring, by reading `comp-helper.ts:300-334` (the `NearbyComp` →
`RenderComp` mapping). **The ranker is built and green; this blocks only its wiring.**

The vendor's `/nearby-home-values` response carries **no sale date**. A real sale date arrives only
from the separate `/property-tax-history` enrichment, which is **hard-capped at 2 comps** to hold
the ≤3-call budget. The mapping is explicit:
- `priceKind: "sold"` → `priceDate = sold.soldDate` — a REAL sale date, **≤2 comps only**
- `priceKind: "estimate"` → `priceDate = c.estimateDate` — **an AVM date, not a sale**
- `priceKind: "last_list"` → `priceDate = null`

So filtering "sold in the last 6 months" on `priceDate` would (a) drop every comp except the ≤2
enriched ones, and (b) silently treat AVM valuation dates as sale dates for the rest. **Both are
wrong, and (b) would be an invented fact** — the exact hard block in RULE 1.

Also found: `zip` exists on `NearbyComp` but is **dropped** by the mapping, so ZIP locality is
available at selection time (pre-mapping) and gone afterward. **Rank before the mapping, not after.**

**What this does NOT block.** `comps_no_size_band_guard` (due Jul 26) is a **size** defect. Size,
beds, baths and ZIP are all present on all 25 candidates at selection time, so the dated defect
closes fully. The fix also reorders the pipeline correctly: today it is fetch 25 → `slice(6)` →
enrich 2, which enriches whatever the vendor happened to list first. Ranking **before** enrichment
spends the same 2 calls on the 2 best comps instead.

**Open decision for the operator — do NOT resolve this silently.** The 6-month window can be
enforced honestly on `priceKind === "sold"` rows only, because those are the only actual sales we
hold a date for. The existing code already tells sales from estimates from last-list, and
`market-comps.ts` already carries honesty machinery for that mix. Options are: apply the window to
sold-priced comps only; raise the enrichment cap (more vendor calls); or source sale dates from our
own lake instead of the vendor. **Not decided here.**

### Hard filters (disqualify before ranking)

A candidate that fails any of these never reaches the score:
1. **Not a home** — must have beds AND sqft (existing `isComparableHome`; Fannie forbids land in a
   home comp set).
2. **Class match** — condo comps to condo, single-family to single-family. Never cross.
   **PHASE 2 ONLY** — no type field on the vendor feed (see field audit above).
3. **Recency — 6 months, HARD.** Operator decree. Phase 1 uses `priceDate`.
4. **Size band** — comp sqft within **±25%** of subject sqft at Tier 1–2, widening to **±35%** at
   Tier 3 only. This is the `comps_no_size_band_guard` fix: against a 1,978 sq ft subject the band is
   1,484–2,473 sq ft, so the 460 and 684 sq ft rows named in that defect are **disqualified, not
   down-ranked**.
   **Provenance of the number, stated plainly:** Fannie B4-1.3-08 does **not** publish a percentage
   band — it requires "similar... finished area" and leaves the threshold to appraiser judgment. So
   ±25%/±35% is **our chosen default, not a cited standard**, and the spec says so rather than
   dressing it as vendor-backed. It is a named constant, configurable, and the first thing to tune
   against real SWFL comp sets once Phase 1 is live.

### Soft score — the distance function

Per-feature **scaling first** (the failure that makes everything else pointless), then a weighted
sum, sorted ascending:
- **sq ft** — `|log(comp_sqft / subject_sqft)|`. Log so half-size and double-size are penalized
  symmetrically; a raw difference makes sqft dominate every other feature.
- **beds**, **baths** — absolute difference, scaled.
- **locality** — same ZIP as subject scores better than a different ZIP. **Phase 1's only geographic
  signal**, since the vendor feed has no coordinates.
- **recency** — fresher sale scores better inside the 6-month window.
- **age** — absolute difference in year built. **PHASE 2 ONLY** (no year built on the vendor feed).
- **distance** — straight-line miles (Fannie's measure). **PHASE 2 ONLY**, and only once a geometry
  join exists; parcels carry no lat/lon either.

Weights are constants in one place, named, with the rationale in a comment. They are **not** fitted
— there are no labels, and inventing fitted weights is the seller-stress mistake this platform is
already trying to undo.

### Degradation ladder — expand geography, NEVER time

Fannie's own "expand and explain" rule, with the operator's window held fixed:
- **Tier 1** — same subdivision, tight size band, 6 months.
- **Tier 2** — same ZIP, 6 months.
- **Tier 3** — wider market area, looser size band, 6 months — **and the output says so in words.**

**The 6-month window is never relaxed at any tier.** Expansion happens on geography and size band
only. This is deliberate: a window that silently widens to 12 months in a thin market is exactly the
kind of drift that has bitten this repo repeatedly, and it would quietly overturn an operator decree.

**Minimum three (Fannie). If fewer than three qualify, return fewer and say the standard was not
met. Never pad to six.** This converts "only one comp" from a bug into an honest, defensible
statement about a thin market.

### Output — every comp carries its own why

Each comp renders the facts that made it comparable.

**Phase 1** (no coordinates, so no miles): `1,840 sq ft vs your 1,978 · 3 bed / 2 bath · same ZIP ·
sold 03/14/2026`

**Phase 2** adds Fannie's distance format once a geometry join exists:
`1.2 miles NW · 1,840 sq ft vs your 1,978 · built 2004 · sold 03/14/2026`

Phase 1 must **not** print a distance or a direction — we do not hold the coordinates to compute
one, and stating "1.2 miles NW" without them would be an invented number (RULE 1, the one hard
block).

**The raw distance score is never displayed.** A reader verifies the comp from the facts, not from
a number they cannot check (research failure mode F6). Citation stays "SWFL Data Gulf" with an
MM/DD/YYYY as-of, per the existing `listingToFigure` contract — vendor names and MLS numbers remain
internal provenance.

---

## Failure modes and their guards (RULE 3.5 — named before building)

- **F1 — Unscaled features.** sqft (~2,000) drowns beds (~3), so the "nearest" comp matches only
  square footage. *Guard:* explicit scaling, plus a unit test with a fixture where an **unscaled**
  run picks a visibly wrong neighbor and the scaled run does not.
- **F2 — Silent window drift.** A thin market tempts a fallback to 12 months, overturning the
  operator's decree. *Guard:* the window is a single constant consumed by every tier; a test asserts
  no tier can return a comp older than 6 months.
- **F3 — Padding a thin set.** Returning 6 comps when only 2 qualify, by relaxing filters. *Guard:*
  a test that a 2-qualifier fixture returns exactly 2 **plus** the standard-not-met flag — never 6.
- **F4 — Class leakage.** A condo comped against single-family homes. **PHASE 2** — the vendor feed
  carries no type field (field audit above), so there is nothing to filter on in Phase 1. *Guard
  (Phase 2):* class-match test over the real `dor_uc`-derived values, asserting no cross-class comp
  survives. *Phase 1 mitigation:* the size band is a partial proxy — a 700 sq ft condo falls outside
  a 1,978 sq ft subject's band anyway — but it is a **proxy, not the guard**, and the spec says so
  rather than claiming coverage it does not have.
- **F5 — Vendor-empty read as market-empty.** `compsForAddress` already distinguishes a degraded/
  throttled empty from a true empty; the ranker must not collapse that distinction. *Guard:* a
  degraded-source fixture asserts the existing retry wording still fires, not "no comps exist."
- **F6 — Egress.** Phase 2 scanning the lake per request — the pattern killed on 07/21. *Guard:*
  Phase 1 adds **zero** reads (it re-ranks a response already fetched). Phase 2 is precomputed or
  bounded SQL; a structural guard fails on an unbounded lake read in the comp path.
- **F7 — Stale-source comps presented as current.** Phase 2 parcels are 7+ months behind, so a
  parcel comp is a historical sale. *Guard:* every comp carries its real sale date; a parcel-fed comp
  can never satisfy a 6-month window using the roll date instead of the sale date.

**Guard-type note (RULE 3.5):** F1–F5 and F7 are TDD-shaped and get failing tests named for the
failure mode. F6 is a lint/structural guard — a green test suite cannot prove absence of an
unbounded read.

---

## Testing

TDD per RULE 3.5 — each failure mode above gets a test named for it, written failing first.
Pure-module tests are `bun:test` against fixtures (no network, no DB). The live-verify closing
`comp_distance_ranker_live_verify` must be driven on a **real address on the real surface**, not a
script that re-implements the path — the documented 07/20 lesson (scratchpad item 16: a simulator
that tests your own copy of the code proves nothing).

---

## Phasing

**Phase 1 — vendor feed (first, per operator).** Extract the pure ranker; wire it in place of
`nearby.slice(0, topN)` in `compsForAddress`. Zero new data dependencies, zero added API calls,
closes `comps_no_size_band_guard`. Ceiling: we only ever rank the 25 candidates the vendor chose —
if all 25 are wrong-sized, ranking cannot invent a right-sized one, and the standard-not-met path
fires.

**Phase 2 — our parcels.** A second adapter feeding the same ranker from
`lee_parcels`/`collier_parcels`. Locality is ZIP + subdivision (no lat/lon), which is Fannie's
*preferred* basis rather than a fallback. Blocked on nothing technically, but its value is limited by
the annual-roll lag documented above — it adds **depth and history**, not recency.

---

## Out of scope (v1)

- **Flood-zone consideration** in comp selection, though Fannie names it and we hold the data
  (`fema_nfip_claims`, env-swfl). Deferred deliberately — it is a real enhancement, not a v1
  requirement. → open a check rather than let it evaporate (RULE 2.4).
- **Fitted weights.** No labels exist; see `logistic_regression_listing_outcome`.
- **`rankListings` in `lib/listings/select.ts`.** Same hand-weighted shape and a plausible second
  consumer of the ranker, but it selects *listings to feature*, not *comps* — a different job.
  Not merged in v1.
- Adjustments to comparable sales (Fannie B4-1.3-09). We select and present comps; we do not compute
  adjusted values.
