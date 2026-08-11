# Back-on-Market surface — research + how-we-answer synthesis (LOCAL ONLY)

> **What this is:** the evidence base + design grounding for the "dedicated surface" the operator
> chose (07/17/2026) against landscape **item 7 — "Stigmatized listings (relisted after
> fallthrough) [BOTH · pain point]."** Folds the live 07/17 crawl4ai/web research into the
> pain already distilled in `STEADY-PAINS.md` (TIER-2 "Investors read price cuts as MOTIVATION"
> block). **Fold this into STEADY-PAINS.md next session** (that file was claim-locked by a parallel
> session at write time, so it isn't edited here).
>
> **Standing rules:** folder is gitignored (commit 99c724f0) — NEVER goes to GitHub. Never surface
> the SteadyAPI name or "stigmatized" to end users. Raw Reddit usernames stay in scratchpads.

---

## 1. The pain, in the users' own words

- **Buyers call a back-on-market home "tainted."** In the r/RealEstate cash-offer thread, buyers
  debated whether a home that returned to market is damaged goods. **No product explains why a
  contract fell through** (landscape item 7; STEADY-PAINS TIER-2).
- **Sellers whose deal collapses are left looking bad with no way to reframe it.** Same coin, seller
  side: the relist reads as a red flag the seller can't counter (landscape items 5, 11, 39 — RedX
  sells expired/cancelled-listing win-back leads *to agents*; nobody shows the moment to the seller).
- **The community's own honest lens is already fixed:** *"treat them as a motivation signal, not a
  valuation signal."* Cut **history/pattern** (count + interval) is named more useful than the
  current list price (STEADY-PAINS TIER-2, round5 finding 2).
- **Scale of the population nobody tracks:** Redfin — record 112,788 delistings in one December,
  ~45,000 relisted the following January (STEADY-PAINS TIER-1 #3).

## 2. Live research facts (crawl4ai + web, 07/17/2026 — sourced, not memory)

**What "back on market" actually means.** A listing returns to active after leaving *pending/under
contract* — the deal fell out of escrow. The cause is **majority buyer-side and "no fault of
seller"**: financing collapse (even post-preapproval), cold feet / buyer's remorse, title/lien
issues, failed contingencies. It is frequently a **negotiating-leverage signal** (a motivated,
frustrated seller), not evidence of a property defect.
Source: reddoormetro.com "Why a Home Goes Back on Market (No Fault of Seller)"; usajrealty.com BOM guide.

**Base rates (the de-stigmatizing numbers).**
- NAR Realtors Confidence Index: **~5%** of pending contracts terminate; **~7%** are delayed by
  appraisal issues. Source: nar.realtor RCI (Sept 2025 survey PDF).
- Redfin (**newest, May 2026 — VERIFIED via crawl4ai of the /news/ page, 07/17/2026**): **13.6%**
  of U.S. home-sale agreements fell through — unchanged seasonally-adjusted for the fourth straight
  month, range-bound 13.4–14% for two years (so ~1 in 7 is the current normal, not a spike). **Leaders
  are Atlanta 18.8%, Fort Worth TX, and Jacksonville FL (~18% each); 3 of the top-10 canceled-deal
  metros are in Florida — all strong buyer's markets.** Source:
  redfin.com/news/contract-cancellations-may-2026 (verbatim: "Nationwide, 13.6% of the homebuying
  deals made in May fell through"). Older prints for trend only: Dec 2025 16.3%, Jan 2026 13.7%.
  (Correction: an earlier "Orlando 17.7%" figure was a search-summary paraphrase, not on the page —
  do not use it.)
- **We already publish the LOCALIZED version nobody else has:** `seller-stress-swfl` emits, per ZIP
  (Lee + Collier), the **cancellation rate** (% of pending cancelled), **relisting rate**, and
  **delistings rate**, off Redfin Data Center — the exact "how often does this happen *here*" number
  the national stats only gesture at.

**SWFL-specific cause the portals never name: insurance.** STEADY-PAINS TIER-2 — insurance is the
emotional center of the SWFL seller story (premiums +102% in 3 yrs, ~3× national; "Insurance killed
my sale" is a recurring, searched thread). A large share of SWFL fall-throughs are
insurance/financing, not property defects. This is a genuinely differentiated, region-native answer
no national portal gives.

**NAMING + LEGAL CONSTRAINT (load-bearing).** "Stigmatized property" is a **legal term of art** =
psychologically impacted by an event (death, murder, suicide, crime, "haunting") with *no physical
impact* — NAR + Wikipedia. **Florida Statute 689.25 does NOT require disclosing such events and
explicitly shields sellers from suit.** A back-on-market home is **not** a legally stigmatized
property. Therefore:
- Product-facing name must **never** be "stigmatized" (internal research label only).
- We must **never assert a specific home's fall-through reason** — no-invention rule, defamation
  avoidance, and fair-housing (never tie a cause to any protected class) all converge here.
- The honest per-home statement is the **fact** ("back on market MM/DD/YYYY after N days off") +
  the **local base-rate context** ("~X% of pending deals fall out here; usually buyer-side").

## 3. What the portals already give away — so where our whitespace actually is

Redfin/Zillow/Realtor.com already show DOM, full price history, and a "back on market" / relisted
status **free** (landscape items 8, 11). Raw status is NOT the whitespace. Our four differentiators:
1. **Local base rates + context** — de-stigmatize with real Lee/Collier ZIP numbers, not vibes.
2. **Provenance / show-your-work** — every figure sourced, `[INFERENCE]` tagged, falsifier stated.
   AVM distrust is "extremely recurring"; provenance is the trust currency (STEADY-PAINS TIER-2 AVM
   block). This is the half portals don't do.
3. **Both-sides framing** — one engine answers the buyer ("red flag or normal?") and the seller
   ("here's how to preempt the stigma when you relist").
4. **SWFL-native causes** — insurance/financing framing the portals structurally never surface.

## 4. The hard boundary (this is the product's integrity, not a gap)

Our lifecycle state machine encodes it in code: a listing that leaves active goes to
**`holding` = reason unknown** (`transitions.py`: "we don't assert WHY it left — sold/pending/
withdrawn is unknown"); if it reappears it transitions to **`back_on_market`**. We can DETECT the
relist as a fact; we can never assert the *reason*. The surface says: it's back (fact) + how often
that happens here and the common local causes (context) + what it does/doesn't tell you (framing).

## 5. How the "both, layered" surface answers each pain point

Surface shape (operator pick, option 3): **ZIP/market base always available (Lane 1, live today);
per-address relist fact overlaid when a specific back-on-market home is in play (Lane 2, if flowing).**

| Pain (their words) | Our honest answer | Lane |
|---|---|---|
| Buyer: "is this back-on-market home tainted?" | Local base rate ("~X% of pending deals fall out in this ZIP; ~Y% of returns are back within Z days") + "usually buyer-side / no-fault-of-seller / often means leverage" | 1 (+2 for the specific-home fact) |
| Buyer: "why did the contract fall through?" | We don't claim the reason (record doesn't say). We give the local mix of *common* causes — financing, appraisal, inspection, **insurance (SWFL)** — as context, sourced | 1 |
| Seller: "my deal fell through, now my relist looks bad" | Preempt framing: the relist is common here (numbers), here's the neutral context to hand a buyer; leverage cuts both ways | 1 |
| Both: "where did this number come from?" | Provenance panel — every figure sourced "SWFL Data Gulf" / Redfin, `[INFERENCE]` + falsifier | cross-cutting |

## 6. Lane 2 lake probe — RESOLVED 07/17/2026 (live `pg.data_lake.listing_transitions` query)

Probed directly. Findings:
- **The cron IS running and fresh** — latest transition `at` ≈ 2026-07-15 (2 days old); non-seed
  transitions span ~06/30→07/15 across Lee/Collier/Hendry.
- **There is NO `back_on_market` to_state in the data.** Actual to_states: active, holding, sold,
  withdrawn. A returned listing is labelled "active" by the SteadyAPI feed, so **the relist signal is
  a `from_state='holding' → to_state='active'` transition, not `back_on_market`** (that state is only
  aspirational in `_LIVE_STATES`). Any relist logic must key on `holding→active`.
- **5,579 non-seed `holding→active` events exist and are fresh** — so the per-address relist signal
  is REAL, not empty.
- **BUT the raw count is contaminated by scan-completeness flicker** and cannot be cleaned with the
  transition's own fields: `days_in_prev_state` is **frozen at 0** for every holding→active (per
  `transitions.py`, `days_in_state` freezes at 0 on holding entry; true age lives in `last_seen`), so
  100% of the 5,579 bucket as "0–2d" — a measurement artifact, not reality.
- **Genuine departures DO persist** (current `listing_state` holdings by `today − last_seen`):
  899 @ 0–2d, 722 @ 3–6d, **1,319 @ 7–14d, 520 @ 15–30d, 0 past 30d** (the off-market resolution hook
  clears aged holdings to sold/withdrawn). So a real relist-after-real-departure signal exists
  underneath the flicker.

**Design consequence:** Lane 1 (Redfin ZIP rates via `seller-stress-swfl`) is the solid anchor and
ships without new data. **Lane 2 needs ONE bounded build before it can honestly surface per-address:
a scan-flicker-resistant relist detector** that stamps the true off-market duration onto the relist
event (reconstruct `at − holding-entry last_seen`; only surface "back on market after ≥ N days off").
Until that exists, the address page shows the relist as a heavily-caveated fact or defers to Lane 1.
No aggregate view counts relists today either (`listing_transitions_recent_zip_stats` counts holdings/
sales/new/price-cuts only) — a relist count column is part of the same small build.

## 7. Cross-refs
- `2026-07-17-buyer-seller-agent-augmentation-landscape.md` items 5, 7, 8, 11, 39.
- `STEADY-PAINS.md` TIER-1 #3 (delisting scale), TIER-2 motivation-signal + insurance + AVM blocks.
- Code: `refinery/packs/seller-stress-swfl.mts`, `ingest/pipelines/listing_lifecycle/transitions.py`,
  `docs/sql/20260701_listing_transitions_recent_zip_stats.sql`, `lib/concoctions/defs/zip-listing-activity.ts`.
