# Execution briefs — wire-up tier + one seller-side data-lift (5 parallel-ready builds)

Handoff for other Claude sessions. Source: `2026-07-18-top20-not-yet-implemented-plans.md`
(read the matching rank entry there for the full evidence trail before you start).

**What this is.** Five of the top-20 turned into execution-ready briefs so a fresh session can
pick one up and build it without re-deriving the analysis. Briefs 1–4 are the *pure wire-ups* —
every load-bearing metric/engine already exists. Brief 5 (rank 3, roof-age insurability) is a
seller-side data-lift: the raw field is ingested but the surface is a genuinely new claim category,
so it carries a real brainstorm. Every load-bearing claim below was **re-verified against live code
on 2026-07-18** (findings inline, so you don't inherit a phantom).

**What this is NOT.** These are briefs, not specs. Each still runs its own RULE 3.5 brainstorm and
`new-build.mjs` registration — that step is the *executing* Claude's job and opens the real
`<slug>_live_verify` build check. The `steady20_*` checks below are idea trackers, not build gates;
close the tracker when the build ships.

---

## The five, seller-weighted

The source doc's four "Small" wire-ups are ranks 1, 2, 4, 6. All four are here, plus rank 3 (the
seller-side heavier build) at operator request. The batch leans seller — the 07/17 trust-low-point
read puts the seller lane as the floated priority with seller-stress the validated whitespace:

- **Rank 1 — SOH "cost of waiting"** — seller-side. Metric already computed, zero surface presence.
- **Rank 2 — comp second-opinion verdict** — dual-framed (seller list price / buyer offer), engine live.
- **Rank 6 — relist outcome tracking** — seller-side. Price columns already land, surface ignores them.
- **Rank 4 — buyer leverage report** — buyer-side. Included by operator call; data fully built.
- **Rank 3 — roof-age insurability** — seller-side data-lift. Field ingested (Collier), new claim
  category, needs a real brainstorm. The one non-trivial build in the batch.

---

## Parallel-execution safety (RULE 1.5)

These five can run in parallel sessions. **File-collision watch — ranks 4 and 6 both touch the
back-on-market area.** Rank 6 edits `lib/back-on-market/relist-fact.ts` +
`components/back-on-market/BackOnMarketRead.tsx`; rank 4 reuses the back-on-market toggle pattern into
a **new** buyer route. If both run at once, worktree-isolate at least one (`node scripts/worktree.mjs
new relist-outcome` / `... new buyer-leverage`) so they don't collide on `main`. The other three are
disjoint: rank 1 in should-i-sell, rank 2 in the assistant comp path, rank 3 in a new pack + surface.

---

## Brief 1 — Save-Our-Homes "cost of waiting" calculator (rank 1)

**Tracker check:** `steady20_soh_cost_of_waiting_calc` · seller-side · effort: Small

**Verified live (2026-07-18):**
- `soh_gap_median_pct` emits from `refinery/packs/properties-lee-value.mts` (metric block ~L562).
- `collier_soh_gap_median_pct` emits from `refinery/packs/properties-collier-value.mts` (~L449).
- `JV_HMSTD` / `AV_HMSTD` ingested for both counties (lee_parcels + collier_parcels constants).
- **Gap real:** `grep -i soh|homestead|portability` across `app/r/should-i-sell/` = **0 hits**.

**Mechanic.** A per-parcel calc module: current shielded dollars = `jv_hmstd − av_hmstd`; apply the
LeePA upsize/downsize portability transfer math (transferable up to $500k, full on upsize, pro-rated
on downsize, 3-year window to re-establish) against a target home value. Add one line to Section 3
("what waiting could cost you") of `app/r/should-i-sell/[zip]/page.tsx`.

**Files.** New `lib/should-i-sell/` module (calc) + one Section-3 line in `[zip]/page.tsx`. Respect
the existing `lib/should-i-sell/property-tax.ts` null-guard.

**Hard constraints.**
- **No-invention:** state the gap % and let the user's real tax bill (or a cited default) finish the
  dollar math — do **not** invent a millage rate.
- **RULE 0.4 before Collier copy:** `collierappraiser.com` returned a frames-only stub on the last
  pass — fetch a working Collier portability-mechanics page via crawl4ai before writing any
  Collier-side copy. Lee copy can cite LeePA (already crawl-confirmed 07/18).
- **Provenance:** cite LeePA (Lee) / Collier Property Appraiser (Collier).
- **Owner flag:** the JV_HMSTD/AV_HMSTD per-parcel field may partly satisfy the open
  `should_i_sell_property_tax_source` check — coordinate, don't double-build.

---

## Brief 2 — Second-opinion price verdict on the comp helper (rank 2)

**Tracker check:** `steady20_comp_helper_second_opinion` · dual-framed · effort: Small

**Verified live (2026-07-18):**
- `compsForAddress` at `lib/assistant/comp-helper.ts:219` — production-wired into chat.
- Gate regexes confirmed: `COMP_WORD` (L107), `VALUE_WORD` (L108), `looksLikeCompAsk` (L115).
- **Gap real:** neither regex matches "offer" or agent-quoted phrasing ("agent wants $450k"), so a
  second-opinion ask falls through to web-fallback today (L362 no-ops when `looksLikeCompAsk` fails).

**Mechanic.** Three bounded pieces, all off the existing engine:
1. Widen `looksLikeCompAsk` (or add a parallel gate) to catch "$X offer/price/list" + agent-quoted phrasing.
2. A **deterministic** verdict function comparing the user's figure to the median of returned sold
   comps → labeled in-line / high / low in code (THE-GOAL rule 2 — never LLM-narrated; mirror
   `under-contract.ts`'s claims pattern).
3. Two entry-copy variants (seller = agent's list price / buyer = offer price).

**Files.** `lib/assistant/comp-helper.ts` (gate widen + verdict fn). Chat-only first; a dedicated
page can follow later.

**Hard constraints.**
- **ASK-FIRST before ship:** this changes chat-assistant behavior on a **live surface**. Build and
  show the diff; do not ship the gate widening without operator sign-off.
- Keep it distinct from rank 10 (net-proceeds economics comparator) — different mechanic, don't merge.
- No new data source.

---

## Brief 3 — Relist outcome tracking: did pausing cost the seller money (rank 6)

**Tracker check:** `steady20_relist_outcome_tracking` · seller-side · effort: Medium

**Verified live (2026-07-18):**
- `ingest/pipelines/listing_lifecycle/transitions.py` writes `price`, `price_delta` (L120–121),
  and `sold_price` / `sold_date` (the `_sold` transition, ~L268) on transitions rows.
- **Gap real:** `lib/back-on-market/relist-fact.ts` references **none** of
  `sold_price|sold_date|price_delta|.price` — it resolves the relist event (date + days off market)
  and reads zero price fields. `BackOnMarketRead.tsx` has no outcome reference.

**Mechanic.** Extend `relist-fact.ts` to read the price fields it currently ignores; compute the
sold-vs-relist delta **deterministically**; surface an outcome read in `BackOnMarketRead.tsx`
("homes in your ZIP that paused and relisted sold for X% less on the second try").

**Files.** `lib/back-on-market/relist-fact.ts` + `components/back-on-market/BackOnMarketRead.tsx`.
No new ingest.

**Hard constraints.**
- **Thin-N honesty:** `relist-fact.ts`'s own header notes `days_off_market` is forward-only from the
  first post-deploy sweep, so N is thin day-one and grows forward — frame as "building history," the
  same accepted limitation back-on-market already ships with. Gate the outcome line to render only on
  real data (no invented framing — mirror back-on-market's existing no-invention test).
- **Worktree if back-on-market is contended** (see Parallel-execution safety above).

---

## Brief 4 — Buyer Leverage Report: DOM/CDOM + price-cut history (rank 4)

**Tracker check:** `steady20_buyer_leverage_report_dom_cdom` · buyer-side · effort: Small

**Verified live (2026-07-18):**
- `formatDom()` at `lib/listings/dom.ts:18` renders cumulative-days-across-relists.
- `lib/listings/select.ts` pulls `dom_days` (L243/276/319) and `cdom_days` (L245/278) from the
  `listing_dom` view (L341) — but into seller/agent surfaces (chat comps, flyers) only.
- **Gap real:** no buyer-facing route presents this. CDOM is the "anti-manipulation number" —
  portals restart the DOM counter under a new listing ID; `cdom_days` captures the true cumulative sit.

**Mechanic.** A buyer-facing route (per-address or per-ZIP rollup) stating `dom_days`, `cdom_days`,
and price-cut history as explicit negotiating leverage. Reuse `app/r/back-on-market`'s buyer/seller
toggle pattern and `lib/listings/dom.ts` formatting. Gate to render only on a real relist or cut —
never invented framing (mirror back-on-market's no-invention test).

**Files.** New buyer route (new `app/r/` slug) + reuse of `lib/listings/dom.ts` + back-on-market toggle.
No new data.

**Hard constraints.**
- **Worktree if rank 6 is live** (both touch back-on-market — see Parallel-execution safety above).
- Distinct from the open `assistant_property_urgency_tax_history_wiring` check (due Aug 12) — that
  wires DOM into *seller* flyers/property-watch; this is the *buyer* tool. Don't conflate.
- No new data source.

---

## Brief 5 — Roof-age insurability as a sell-timing trigger (rank 3)

**Tracker check:** `steady20_insurability_roofage_sell_timing` · seller-side · effort: Medium
(**this one needs a real RULE 3.5 brainstorm — new seller-facing claim category, not a wire-up**)

**Verified live (2026-07-18):**
- `EFF_YR_BLT` / `ACT_YR_BLT` ingested for **Collier** — `collier_parcels/constants.py:58` (OUT_FIELDS),
  mapped to `effective_year_built` / `actual_year_built` at `resources.py:205–206`.
- **Gap real:** `grep -i insurab|non-renewal|wind_mitigation|roof.age` across app/lib/refinery = **0 hits**.
- FL OIR insurance ingest is **NOT** required for MVP — roof-age proxy alone suffices.

**Mechanic.** A roof-age classification off `effective_year_built` (e.g. shingle >20yr amber, >25yr
red, keyed to public underwriting norms — Citizens non-renews shingle roofs past 25 years). Surface
as a new Section-3 caveat in `app/r/should-i-sell/[zip]/page.tsx`. Deterministic code, no LLM.

**Files.** New roof-age classification module + a new Section-3 caveat in `[zip]/page.tsx`.
**Ship Collier-first.**

**Hard constraints.**
- **RULE 3.5 brainstorm is mandatory** — this is a new claim category (insurability), not a wire-up.
- **No-invention / no specific-carrier claim:** classify the age band → plain-language insurability
  caveat, cited to public underwriting norms. Never a claim about *this home's actual coverage*.
- **Lee waits on `ingest_parcel_year_built_join`** (open, due Jul 22) — Lee's leepa pipeline has no
  direct year_built field; ship Collier-only MVP, note the Lee dependency, don't gate on it.
- The open `ingest_new_source_fl_oir_insurance` check (due Aug 12) can deepen this later — do **not**
  gate the MVP on it.

---

## Each executing Claude's entry ritual

1. Read your rank's full entry in `2026-07-18-top20-not-yet-implemented-plans.md`.
2. Brainstorm (RULE 3.5) — the source doc flags exactly which items need a real brainstorm vs. a wire-up.
3. `node scripts/new-build.mjs <slug> "<label>"` — creates the spec stub + opens `<slug>_live_verify`.
4. Build against the verified files above. Honor the hard constraints (they map to autonomy rules —
   ask-first surfaces, crawl4ai-before-copy, no-invention/provenance).
5. Verify with `bunx next build` (not `npx tsc`); a code fix isn't live until served bytes prove it.
6. On ship: SESSION_LOG entry, close the `steady20_*` tracker + the `<slug>_live_verify` check.
