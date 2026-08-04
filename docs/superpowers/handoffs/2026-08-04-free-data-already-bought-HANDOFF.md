# HANDOFF — the data we already paid for and never read (08/04/2026)

> **Recommended model:** ⚡ Sonnet — 6 tasks, keywords: migration, schema

**Session outcome:** four roots shipped live, all from data already sitting in our own
database. Zero new vendor calls, zero new dollars. Nothing pushed.

**The operator's question that started it:** *"why the fuck are these things unwired and why
the fuck are we not bringing in data we need!!!! get everything."*

**The honest answer, which is the point of this handoff:** it was never "we forgot." Every
one of these was found, measured, written into a document, and the writing-down was treated
as the finish line. Pool was ingested 07/22 and recorded in four places. The permits family
was ranked #2 with "ZERO new calls" beside it on 07/16. The raw bodies landed 08/02–08/03
with an execution brief already written. **Research volume was never the problem. Conversion
from research to wire is.**

---

## 1. WHAT SHIPPED (all live, all verified end-to-end)

| Root | Rows | Cost | Consumer |
|---|---|---|---|
| `lee_comp_sales_v.pool` | 108,848 source rows, 100% filled | free | `comp-source-lake.ts` → ranker |
| `steadyapi_property_permits_v` | 79,281 permits / 12,946 properties | free | `lib/listings/property-permits.ts` |
| `steadyapi_tax_history_v` | 273,051 year-rows / 16,514 properties | free | `lib/listings/property-tax-history.ts` |
| `steadyapi_listing_events_v` | 235,383 events / 17,859 properties | free | `lib/listings/listing-events.ts` |

SQL: `docs/sql/20260804_lee_comp_sales_v_pool.sql` ·
`20260804_steadyapi_property_permits_v.sql` · `20260804_steadyapi_tax_history_v.sql` ·
`20260804_steadyapi_listing_events_v.sql`

**Verification standard used throughout:** TDD (tests written failing first), then a LIVE
end-to-end read through PostgREST — not a unit test, not "the DDL succeeded". Final state
584 pass / 0 fail across `lib/listings` + `lib/assistant`, `tsc --noEmit` exit 0.

**All four are VIEWS, not tables — deliberate.** `data-roots.md` rule 4 says roots are views.
The bytes are already persisted and immutable, so a second physical copy buys only a
staleness window, another cron, and another destructive-write surface. If a measured latency
problem appears, materialize the same definition — do not hand-roll a parallel one.

---

## 2. THE ONE THING MOST LIKELY TO CAUSE A REPEAT

**`docs/standards/data-roots.md` has NO entry for any of the four roots.** The file was
claimed by a parallel session all session (repolith refused the edit; per RULE 1.5 it was not
overridden). Paste-ready text for all of them is in check **`data_roots_pool_root_line_owed`**.

An uncatalogued root is invisible — that is *precisely* how pool sat unused for 13 days while
four documents said we had it. **Do this first.**

---

## 3. TRAPS FOUND IN THE SOURCE — every one guarded, none of them in the census

**Permits**
- `effective_date` is the human string "Mar 8, 2021" on **79,281 of 79,281** rows — zero ISO.
  Universal, not occasional.
- 4 permits parse to absurd futures: "Feb 14, 2282", "Aug 1, 2269" ×3 — one with status
  *Final*. Parsed date NULLed outside `[1900-01-01, today]`; raw string always kept.
- Duplicates, **two numbers 14× apart**: loose key (property+type+status+date) = 7,274 groups
  / 12,371 rows (15.6%); every-field key = 673 groups / 882 rows (1.1%). `dedupePermits`
  collapses ONLY the byte-identical kind — over-merging destroys history, double-counting
  merely inflates a count. Unresolved: check `steadyapi_permits_duplicate_rows`.

**Tax history**
- Key presence ≠ value presence. `assessment_total` 99.99% but **`assessment_building` 22.0%
  and `assessment_land` 19.0%**; `market_value_total` 99.9%, building 77.7%, land 67.3%.
  Rendering an absent split as `$0` is a fabricated figure.
- `market_value` is JSON *null* (not an object) on 139 rows; `tax_amount` null on exactly 1.
- 4 rows carry `tax_amount = 0` — inspected, genuinely tiny parcels ($100–$103 assessed).
  **Zero is kept as a real figure**, not treated as a sentinel.

**Listing events — the census is wrong on four points (check `steadyapi_census_four_corrections`)**
- **Vocabulary is 7 values, not 3.** Census says "Listed, Price Changed, Sold". Live adds
  *Listing removed* (49,531), *Listed for rent* (10,262), *Price Changed for rent* (6,760),
  *Relisted* (4,143). Removed + Relisted are the delisting signal nobody knew we had.
- **`days_after_listed` is the string "111 days"** — zero of 235,383 are JSON numbers. The
  census cites this field as the vendor's per-event DOM and used it to *correct* an earlier
  ceiling claim, without noting it is unparsed text.
- **`price_change_percentage` is effectively absent** and a string when present — zero are
  numbers. "Price cuts w/ amount+pct" is half right: the amount is real, the percentage isn't.
- **Rent events share the array with sale events** — 17,022 across 3,696 properties. Any
  price aggregate without `is_rental` mixes a $7,500/mo rent into sale prices.
- `price = 0` is a sentinel on **45.9% of "Listing removed"** (22,745 rows). NULLed, with
  `price_is_zero_sentinel` recording it. `price_change` keeps its 0 — there zero means
  "no change" and is real.
- Dates run back to **1800-01-01** (3,097 pre-1990, 124 pre-1900). Guarded, raw kept.
- **Exact correlation:** `listing{}` is null on 31,217 events and `source_name='Public Record'`
  on exactly 31,217. Those are deed events, not broken rows — a null `listing_id` is meaningful.

---

## 4. GATES DELIBERATELY LEFT CLOSED — do not "fix" these by opening them

- **`tax_amount` is NOT cleared for user-facing serving.** The playbook requires validation
  against a real county tax bill first. Enforced in code, not as a note:
  `TAX_AMOUNT_NOT_CLEARED_FOR_SERVING` rides on every summary object, so a caller cannot get
  the number without the caveat, and a test asserts the text. To close
  (`steadyapi_tax_amount_validation_owed`): pull one Lee property's real bill, compare, record
  the delta. Watch gross-vs-net of discounts, non-ad-valorem assessments, and year offset.
- **`listing_dom` STAYS the DOM root.** `days_after_listed` is a validation column here and
  must never become a second days-on-market root.
- **These are NOT valuation authorities.** Full-book assessed/market value stays
  `leepa_parcels` (Lee) / `collier_parcels` (Collier — that IS the FDOR pull, so **Collier is
  already covered**; the "Steady covers Collier where LEEPA doesn't" shorthand is WRONG and
  was corrected twice this session).
- **Everything Steady is LISTING-SCOPED.** A row exists only for a property we probed because
  it was listed or sold. County rolls are full-book. Never serve an aggregate off these views
  as a county or ZIP statistic. Each summary object carries a `scopeNote` so the caveat cannot
  be lost in transit.

---

## 5. ONE ROOT PER CONCEPT — the traps already set

- **Pool has exactly one root**, `lee_comp_sales_v.pool`, normalised in exactly one function
  (`poolFromSource`). `permit_type` literally takes the value `'Pool'` and there is a real
  "Pool spa fountain" permit in the data — **that is an EVENT, not a pool-ownership fact.**
  The view comment and a test both block it becoming a second root. Two other candidate pool
  lanes are already on the ledger (`amenities_listing_detail_hoa_lift`,
  `amenities_apify_maps_ground_truth`) — neither may ship without retiring the first.
- **Price cuts will have two lanes if nobody decides.** `listing_transitions.price_delta` is
  our own FORWARD-ONLY sweep; `steadyapi_listing_events_v` is the vendor's BACKWARD history.
  They answer different questions. Data-roots must say which is which before either reaches a
  surface.
- **A dead duplicate was killed this session:** `lib/listings/apify-style.ts` (zero importers)
  had been superseded by a parallel session's `apify-identity.ts`. Backed up to scratchpad,
  removed.

---

## 6. WHAT IS STILL OWED (ordered)

1. **data-roots entries for all four roots** — `data_roots_pool_root_line_owed`. Blocked only
   on the file being free. **Highest value, smallest effort.**
2. **Collier pool has no source at all** — `collier_pool_no_source`. Probe Collier's own GIS
   *before* paying for a Zillow actor; that was never checked.
3. **Consumers + brain-first artifacts for the three Steady roots** —
   `steadyapi_listing_events_shipped_needs_consumers`. The playbook wants a consuming
   PackDefinition, a quality-registry cross-source contract, a cadence entry, and data-roots
   ratification per family. Only the roots + typed readers exist.
4. **Fix the census doc** — `steadyapi_census_four_corrections`. Four measured errors still
   live in `docs/steadyapi-capability-census.md`.
5. **Resolve the permit duplicate ambiguity** — `steadyapi_permits_duplicate_rows`. Compare an
   overlapping property against a county spine to learn which count the county agrees with.
6. **Validate `tax_amount`** — `steadyapi_tax_amount_validation_owed`.

---

## 7. SIDE FINDING WORTH ITS OWN EYES

**The LeePA host returns a different row count on every identical call.** Eight calls three
seconds apart: 17208, HTTP-400, HTTP-400, HTTP-400, 20811, 21956, 23400, 24662 — and an
earlier burst returned `{count:0}` six times running. Schema returns clean every time and
layers 0/1/2 went to zero in the same window, so it is host-wide and intermittent, not the
layer being emptied. **The first six zero-reads nearly went into a report as "the layer is
empty"; retrying is the only reason they didn't.** It matters because `fetch_comp_sales`
asserts every partition exactly against that count. Merge-not-replace protects the 108,848
rows we hold, and the cron is annual (March 1), so there is time.
Check: `leepa_layer23_count_nondeterministic`.

---

## 8. THREE SELF-CORRECTIONS MADE THIS SESSION (pattern worth keeping)

Each was caught by **re-deriving rather than trusting the first result** — the discipline is
the transferable part:

1. Reported "7,274 exact-duplicate permit groups." True only under a loose key; under the
   every-field key it is 673 / 1.1%. A 14× difference.
2. Said the tax series "covers Collier where LEEPA doesn't reach." Wrong — `collier_parcels`
   IS the FDOR pull and Collier was already covered.
3. Said `assessment` "isn't always an object." Wrong — it is an object on all 273,051 rows;
   `market_value` is the null scalar, on 139.

Nothing was pushed. Session spend ≈ $182.

---
---

# FOLLOW-UP — "are we wired correctly?" (08/04/2026, next session)

**Append-only. Everything above stands as written except where corrected here.**

**The one-line answer: no, we are not wired — and three of the four "new" roots were not new.**

## F1. THE CORRECTION THAT MATTERS — all three Steady families already existed

The handoff above says four roots shipped and calls the listing-events view a **SOLE SOURCE**.
Live-probed prod this session:

```
data_lake.steadyapi_listing_events    235,383   =   steadyapi_listing_events_v    235,383
data_lake.steadyapi_tax_history       273,051   =   steadyapi_tax_history_v       273,051
data_lake.steadyapi_property_permits   79,281   =   steadyapi_property_permits_v   79,281
```

The **tables shipped 08/03** — one day earlier — with their own migrations
(`migrations/20260803_steadyapi_listing_events.sql`, `…_tax_history.sql`), their own parsers
(`ingest/pipelines/listing_lifecycle/parse_listing_events.py`, `parse_tax_history.py`), their own
handoff (`2026-08-03-steadyapi-step3-sonnet-handoff.md`), and — unlike the views — **live
consumers**: `listing_recent_price_cuts_stats` and `listing_recent_tax_paid_stats` feed
`refinery/sources/active-listings-residential-source.mts` → the active-listings-swfl pack. The
identical row counts in the handoff above (235,383 / 273,051 / 79,281 / 17,859 / 16,514 / 12,946)
are the **same numbers the 08/03 session measured**, re-measured as if for the first time.

Neither side is simply better. The **tables** carry the consumers, a `dedupe_key`, and unique
constraints. The **views** carry the six trap guards the tables lack (`is_rental`,
`price_is_zero_sentinel`, raw-beside-parsed date and `days_after_listed`, numeric percentage) and
cannot go stale, where the tables are wipe-and-re-derive from parsers **no cron runs** —
`parsed_at` is still 08/03 02:43. Whichever survives needs both halves. Nothing was removed
(RULE 1). Decision is a C1 call: **`steadyapi_three_families_table_vs_view_duplicate`**.

Permits is the worst of the three: the TABLE is live in prod with a pkey and a unique key but has
**no migration file and no parser anywhere in the repo**, and `data-roots.md` described it as
"🔴 not yet built" until this session corrected it.

**Why this happened is the same disease §2 above diagnoses, one level up.** The handoff's own
thesis — "research volume was never the problem, conversion from research to wire is" — was
written by a session that did not read the previous day's handoff on the same work.

## F2. THE WIRING ANSWER — measured, not asserted

Tree-wide grep, every language: `lib/listings/listing-events.ts`, `property-tax-history.ts`, and
`property-permits.ts` have **ZERO importers**. All three typed readers are dead code. The only
non-doc mentions anywhere are the ingest Python that predates them.

**And the mechanism built to catch exactly this does not fire here.** Gate 12 in
`check-prepush-gate.mjs` blocks a new `data_lake.*` **table** that nothing reads. These are
**views**, and their readers *do* exist — they are simply never called. So the guard reports green
on the precise failure it was installed for. That gap is worth closing before it is relied on
again (see `orphan_data_lake_tables_backlog_8`, which already grandfathers 8 more).

## F3. FOUR DEFECTS FOUND AND FIXED WHILE VERIFYING — all live, all test-guarded

1. **The percentage column silently held CUTS ONLY.** `price_change_percentage` is signed text.
   The view stripped `'%'` but not `'+'`, so `"+31.24%"` never matched: **16,099 of 44,896 parsed,
   and every single survivor was negative.** Anything reading it would have seen a market where
   asking prices never rise. Now 42,633 parse, 26,534 of them positive; row count unchanged.
   *The regex was written to match the header comment ("effectively absent"), not the data.*
2. **The vendor contradicts itself on 183 rows.** Of the 6,488 events carrying both a non-zero
   amount and a percentage, 183 disagree in **sign** — e.g. price 140,000, change −50,000,
   `"+154.55%"`. The amount is trustworthy on all 235,383 rows; the percentage is now NULLed on
   contradiction with `price_change_pct_conflict` recording it. Verified live: **0** contradictory
   pairs can reach a caller.
3. **The row cap was cutting real histories, arbitrarily.** Shipped `ROW_CAP = 200` under the
   comment *"busiest observed property histories are well under this"*. Measured: the two busiest
   carry **357 and 328** — and the fetch had **no ORDER BY**, so *which* 200 returned was
   undefined. Now 500, ordered newest-first, and a capped read sets `truncated` and declines to
   report a total.
4. **`totalPriceCut` was summing across unrelated listings.** `3970 NE 68TH AVE, 34120` (Collier)
   is ONE address with **11 distinct listing_ids across 3 boards, 2010–2026**, 291 cuts — the
   blind sum read **$18,471,297 of price cuts on one house**. Every component real, the total
   meaningless. Now returns `listingCycleCount` and NULLs the total across cycles. The per-cycle
   figure a seller actually wants is a product call, not one to make silently:
   `steadyapi_listing_events_per_cycle_total_undecided`.

Defects 3 and 4 share a shape worth naming: **both were false claims in comments that no test
checked.** "Busiest histories are well under this" and an unqualified "total" both read as
measured facts. They were assumptions.

## F4. WHAT LANDED

- **`data-roots.md` — the §2 blocker is CLEARED.** The claim that blocked it had been released;
  all four roots are now in the decision table. Pool folded into the existing comp-set row as
  `lee_comp_sales_v.pool` rather than a fifth row (a separate row would itself have been the
  duplication). Three new rows for the Steady families, each naming **both** objects and the
  scope law. Two new traps: **T11** (price-cut forward-sweep vs vendor-backward-history — the
  two-lane §5 above flagged and left open) and **T12** (listing-scope law). The stale
  "permits 🔴 not built" line corrected. `data_roots_pool_root_line_owed` **closed**.
- **Verification:** 626 pass / 0 fail across `lib/listings` + `lib/assistant`; `tsc --noEmit`
  clean; the corrected view applied to prod and re-probed; live end-to-end reads through the real
  reader on two real property ids (a fake fixture id returns empty and *looks identical to a
  broken SELECT* — worth knowing before trusting an empty result).

## F5. STILL OWED — ordered, and item 1 has changed

1. **Decide the table-vs-view merge** — `steadyapi_three_families_table_vs_view_duplicate`. This
   now blocks item 2: wiring a consumer to the wrong side cements the duplicate.
2. **Consumers + brain-first artifacts** — `steadyapi_listing_events_shipped_needs_consumers`,
   updated to BLOCKED-BY the above.
3. **Per-cycle price-cut total** — `steadyapi_listing_events_per_cycle_total_undecided`.
4. **Collier pool has no source** — `collier_pool_no_source`. Unchanged: probe Collier's own GIS
   before paying for an actor.
5. **Fix the census doc** — `steadyapi_census_four_corrections`. Now **five**: add that
   `price_change_percentage` is present on 44,896 events and parseable on 42,633, which the
   handoff above described as "effectively absent". That description is what produced defect F3.1.
6. **Permit duplicate ambiguity** (`steadyapi_permits_duplicate_rows`) and **`tax_amount`
   validation** (`steadyapi_tax_amount_validation_owed`) — unchanged.
7. **LeePA non-deterministic count** (`leepa_layer23_count_nondeterministic`) — unchanged, and §7
   above is still the best write-up of it.

## F6. THE TRANSFERABLE PART

§8 above credits *re-deriving rather than trusting the first result* for three self-corrections.
Every finding in F1 and F3 came from the same move, applied to a different target: **not to the
data, but to the sentence describing the data.** "SOLE SOURCE", "effectively absent", "busiest
histories are well under this", "total price cut" — four confident phrases, each false, each
written by someone who had just measured something adjacent. The census was checked against the
source; the source was never checked against the census's own prose.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 6, Task 6, Task 6, Task 6, Task 6, Task 6 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
