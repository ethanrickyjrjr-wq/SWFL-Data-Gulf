# Data Consolidation — one root per process

**Started 2026-07-18.** The problem, stated plainly: the same number is computed in many places from
different sources, so surfaces contradict each other. We stop building new and consolidate: walk every
process one at a time, list every source that feeds it, collapse the duplicates, name ONE root, point
every consumer at that root, and fix the checks that the drift opened. **Sale page first.**

Reference for where things currently live: `data-authority-map.md` (companion). This file is the
active walk — the scratchpad we work down, one process at a time.

## The doctrine (operator, 2026-07-18)

1. **Our own updated data is the root.** A metric's canonical value is computed from our own
   daily-updated data, not an external aggregate.
2. **External monthly (Redfin / Zillow) is only for a monthly figure** — used when we specifically want
   the published monthly number, clearly labeled as that vendor's monthly. It is a crutch, not the root.
3. **We derive our own monthly from a month of true daily.** Once we hold a month of real daily values,
   we compute our own monthly and retire the external-monthly crutch for that metric.
4. **Get the sale page onto the root first**, then the rest of the surfaces.

## The architecture (the play)

**One root PER PURPOSE, not per concept.** A concept can have >1 root when the purpose genuinely
differs — but each purpose has exactly one. DOM is the template: `listing_dom` (current, our own daily)
+ `listing_dom_historical` (history, ONE external monthly source chosen for that job). We do NOT retire
Realtor/Redfin/Zillow — we pick ONE per purpose and wire it to the root that needs it.

**The single place to check — the roots registry.** One file, `data-roots.json` (+ this doc as its
prose), lists every root: `concept.purpose → { root_view, built_from: [base tables], grain, cadence,
allowed_consumers }`. This is the "one fucking place" — before building anything, you look here for the
root; if it exists, you wire to it; if it doesn't, you add a root, not a bowl of sauce.

**Roots are VIEWS (or one loader function for cross-table math).** One definition. Fix the view → every
consumer gets the fix. That is "fix the root," made literal.

**The gate — why this doesn't rot (the load-bearing piece).** A rule that says "don't build new ones"
did not stop us; a CI lint will. Consumers (packs, lib, app) may read ONLY a registered root, never a raw
base table. A grep-based gate over every `.from(...)` / `.schema("data_lake").from(...)` / DuckDB read
site checks the target against `data-roots.json`; a read of an unregistered base table fails the build.
We already run exactly this shape — `verification/supabase-untyped-allowlist.json` gates who may use the
untyped client — so this extends a proven seam, not a new gate class (architecture rule C2). Only ingest
writes base tables; only root views read them; only consumers read root views. **When you add, the gate
forces you to wire from a root. When there's a problem, there's one view to fix.**

## Method per process (the walk)
1. Full inventory first: the entire lake (Tier-2 `data_lake.*`) + DuckDB (Tier-1) list — the raw material.
2. Pick a concept. List every source/table/column/view that computes it (audit + fresh grep).
3. Mark same-concept vs dead vs genuinely-distinct-purpose (current vs historical; list-side vs sold-side).
4. Name the ONE root per purpose (a view, or a loader fn). Register it in `data-roots.json`.
5. Find every consumer, one at a time; repoint each to the root. Add each to the root's allowed_consumers.
6. Fix + close the checks the drift opened. Open a new check only for a real gap with no owner.
7. Turn on the gate for that concept's base tables once all consumers are repointed.

---

## Research validation (crawl4ai, 2026-07-18) — this IS the standard pattern

The operator's wire-chart model is exactly how the two reference streaming systems work:

- **Amazon Kinesis Data Streams:** producers push to ONE stream; MANY consumers "consume data from the
  stream independently and concurrently"; a consumer's output can feed another stream → DAG topologies. A
  **retention period** (24h–365d) keeps replayable history AT the stream. → one source, fan-out to every
  consumer that needs it, history at the root. That's `listing_dom` → brain/chart/webpage, with
  `listing_dom_historical` = the retained history.
- **Google Cloud Datastream:** serverless CDC — **connection profiles** (source + destination) + **streams**
  that transfer **backfill** (initial full load) + **CDC** (ongoing changes) from source to destination,
  with **centralized metadata and LINEAGE management (Knowledge Catalog) to view resources in the context
  of all data sources.** → that lineage catalog IS "one place to look for what we have and where it runs";
  backfill+CDC IS current-root + historical-root.

**The one thing streaming gets for free that we must add: structural enforcement.** In Kinesis you
*physically cannot* read around the stream — the architecture forbids it. In our Postgres+DuckDB, anyone
can `SELECT FROM` any raw table, so single-source is not enforced by structure. **The lint gate is how we
buy the enforcement streaming has built in.** This is why the gate is load-bearing, not optional.

**We already own every piece — they were just never assembled:**
- The "stream/root" = a DB VIEW. `listing_dom` is already a textbook root-view.
- The "lineage catalog / wire chart" = **graphify** (already in the repo — `graphify-out/`, renders the
  data/app graph). This becomes the visual wire chart of roots → consumers.
- The "read only through the stream" enforcement = the lint gate (extends the untyped-allowlist seam).
- "Fix at source" = fix the view; every consumer that reads it gets the fix.

## The map of everything — the walk-list

Ordered: sale-page block first (the priority surface: `/r/should-i-sell`, `/r/how-long-has-it-sat`,
comp-helper, the homepage map, zip-report), then the rest.

**SALE-PAGE BLOCK (do these first):**
1. Days on market (DOM / CDOM) — list-side vs sold-side — **worked below**
2. Home value (assessed / list / sold-median / index) — 4 notions
3. Price cuts / reductions (per-listing event + area share)
4. Active inventory counts (homes-only vs all-types)
5. Sold / recorded-sale price by ZIP (deeds vs Redfin vs Realtor)
6. Rent & yield (index vs listing vs the yield denominator)
7. Price distribution / bands / histogram
8. New listings / listing lifecycle (new-listing share, transitions)
9. Relist / back-on-market / days-off-market
10. Pending / under-contract ratio
11. Market-state verdict (heat / temperature / momentum / stress → one temperature root)
12. Parcels (LeePA/FDOR: assessed, sale, year-built, quality, SOH gap)
13. Comps (own parcels vs SteadyAPI comp-helper)
14. Sale-to-list ratio / concessions

**REST OF PLATFORM (walk after the sale page):**
15. Permits (Lee/Collier/commercial) · 16. Rentals inventory · 17. Flood / FEMA / environment risk ·
18. Traffic / FDOT · 19. Tourism / TDT · 20. Labor (BLS LAUS/QCEW/OEWS) · 21. Macro (FHFA HPI /
mortgage rate / Census) · 22. Weather / USGS / NOAA / hurricanes · 23. News / city-pulse ·
24. Licenses / DBPR · 25. CRE (commercial) · 26. Condo / SIRS · 27. Communities / subdivisions ·
28. Geography (ZIP↔county crosswalk).

Each gets its own section below as we walk it. Status: 🔴 not started · 🟡 root chosen, consumers not repointed · 🟢 one root, all consumers on it, checks closed.

---

## Process 1 — Days on Market (DOM / CDOM) 🟡 root chosen

**Every source it lives in (9 logical / 15 physical, live-verified 2026-07-18):**
- OURS (daily): `listing_dom` view (computes `dom_days`/`cdom_days`/`dom_is_floor` from `listing_state`
  `listed_date` > relist > `first_seen`). 63% floored today; the listed_date backfill is de-flooring it.
- OURS (dead): `listing_state.days_on_market` (0% populated), `listing_active_stats.avg_days_on_market`
  (NULL), `listing_active_homes.days_on_market` (NULL), `active_listings_residential` (40k-row orphan corpse).
- EXTERNAL MONTHLY: realtor.com `market_heat_core_swfl.median_days_on_market` (ZIP×month, list-side),
  `market_details_swfl.median_days_on_market` (realtor snapshot, dup), Redfin `redfin_swfl.median_dom`
  (ZIP×month, **sold-side**), `redfin_{lee,collier,city}_market.median_dom` (county/city, sold-side, brain-orphaned).
- EMPTY: `user_mls_*` DOM (capacity only).

**Same vs distinct:** list-side (age of active inventory) and sold-side (time-to-close) are DIFFERENT
questions — keep both, never interchange. Within list-side, the four "ours-dead" tables + realtor's two
are all the same concept as `listing_dom`; the dead ones and the realtor snapshot dup collapse away.

**THE ROOTS — one per purpose (per doctrine):**
- **`listing_dom` — CURRENT list-side DOM (our own daily).** Wording via `lib/listings/dom.ts formatDom`.
  This IS "when all the numbers are updated." The de-flooring backfill makes it exact; until it finishes,
  aggregates hedge (the floor flag). Root for "how long has THIS listing sat."
- **`listing_dom_historical` — DOM HISTORY / typical-over-time.** Keeps ONE external monthly source for
  the job (realtor.com list-side `market_heat_core` for list-side history; do NOT also wire Redfin +
  Zillow for the same purpose — one per purpose). Once we hold a month of de-floored daily `listing_dom`,
  we compute our OWN monthly into this root and the external source becomes a labeled cross-check, not the
  value. This root exists so we keep history — we don't fully retire the external feed, we govern it.
- **Sold-side is a DIFFERENT purpose → its own root:** `redfin_swfl.median_dom` = "how long closed homes
  took." Registered separately, a different labeled metric, never rendered as if it answered list-side.
- Net: 3 registered roots (current / list-side-history / sold-side), each one source for its purpose. The
  four dead ours-copies + the realtor snapshot dup collapse away entirely.

**Consumers to repoint (this is the fix):**
- Sale page (`/r/how-long-has-it-sat`, should-i-sell, chat comps) → `listing_dom` root ✅ (already, but its
  typical-DOM benchmark must wait for de-flooring — `buyer_leverage_zip_benchmark_maturity_gate`).
- Homepage map DOM pill → currently realtor snapshot (`market_details_swfl`, ~100–122d) while chat shows
  `listing_dom` ("17+d") — **the 2–6× contradiction.** Repoint the map to the `listing_dom` root, or label
  it explicitly "realtor.com monthly" so it's not read as the same number.
- Email builder → reads dead `listing_active_stats.avg_days_on_market` + Redfin county DOM under separate
  keys; repoint to the root.
- active-listings-swfl brain → reads the dead avg column; repoint.

**Checks this root closes (fix, don't re-log):**
- `listing_active_stats_dom_repoint` — repoint the dead avg to `listing_dom.dom_days`. (Direct.)
- `active_listings_ship_or_delete` — kill the `active_listings_residential` corpse + its 4 crons.
- `active_stats_zip_median_dup_rows` — dedupe the ZIP rows feeding the medians.
- `active_listings_brain_dom` — inventory DOM into the brain with discrepancy framing.
- `buyer_leverage_zip_dom_authority_audit` — the cross-brain DOM-sourcing decision this root SETTLES
  (own-daily is the root; realtor-monthly is a labeled crutch).
- `buyer_leverage_zip_benchmark_maturity_gate` — self-resolves as the backfill de-floors `listing_dom`.
- NEW GAP (no owner): homepage-map DOM vs chat DOM contradiction → fold into the repoint work above.

**Open question for the operator on this process:** the homepage map currently shows realtor.com's ~100-day
list-side median; our own `listing_dom` typical is still de-flooring (reads low today). Do we (a) hold the
map on realtor-monthly, explicitly labeled, until our daily→monthly matures, then swap; or (b) swap now and
accept the immature number? The doctrine says (a) — labeled crutch until our own monthly is real.

---

## Process 2+ — queued (walk next, one at a time)

(sections added as we walk them)
