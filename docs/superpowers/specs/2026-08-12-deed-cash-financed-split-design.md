# Cash vs financed purchase split from Lee recorded deeds (daily grain)

**Date:** 08/12/2026 · **Check:** `deed_cash_financed_split_live_verify` · **Status:** DESIGN, not approved

> Went straight to the design doc rather than the interactive `superpowers:brainstorming` loop —
> operator asked for the plan directly (08/12/2026). The substantive requirements of RULE 3.5 are
> honored below: research pass on file, failure modes named with a guard each, TDD gate declared.

---

## Problem

Every sold-price and buyer-type number we serve today is month-grain and lags roughly seven weeks
(`data-roots.md` T10). We can say what a home sold for last May. We cannot say what happened in this
market on Tuesday.

More specifically: **there is no read anywhere in the platform on HOW purchases are being paid for.**
Cash-versus-financed is the single most rate-sensitive variable in a second-home market, it moves
before price does, and no public source publishes it for Southwest Florida at business-day grain.
Redfin publishes national and metro cash shares on a monthly lag. The county clerk publishes the
underlying documents the same day they record.

## Goal

A daily and trailing-window measure of what share of arm's-length Lee County home purchases closed
**without** same-day recorded financing — the cash-purchase signal — served as a cited fact off our
own data, with the method disclosed and its known undercount stated rather than hidden.

Explicitly NOT a goal: predicting price, inferring market direction from the number, or attaching it
to any individual buyer.

## Why this one first (measured, not asserted)

Live probe 08/12/2026 against `data_lake.lee_deed_official_records` (28,186 rows, 07/13–08/11/2026,
22 business days):

- Arm's-length DEED rows (`consideration_usd > 100`): **3,229** — about 147 per business day.
- Of those, **3,049 carry a `parcel_strap` (94.4%)**. This is the fact that makes the build cheap:
  the table-wide strap coverage is only 44%, but DEED rows are far better populated than the feed
  average, so the join key we need is effectively there.
- MORTGAGE-family rows with a strap: **2,372**.
- Arm's-length deeds with a same-day mortgage on the same strap: **1,182 of 3,049 = 38.8%**.
  Complement: **61.2% recorded no same-day financing.**

**Do not ship 61.2% as "the cash share."** It is an upper bound, for the reasons in FM-1 below. The
build's job is to turn that upper bound into an honest number with a stated method.

Two further properties make this the right first build off this data:

1. **No parcel-table join required.** It is deed-strap to deed-strap, entirely inside one table.
   Every other high-value deed idea (sale-to-assessed, flip detection, subdivision density) is
   blocked on the broken `parcel_strap` ⇄ `lee_parcels` normalization
   (`docs/handoff/2026-08-12-lee-deed-data-investigation-queue.md` task 1). This one is not.
2. **It is a market statistic, not a person statistic.** No names, no identity resolution, no
   contactability. It sits entirely outside the Fork-A owner-targeting lane and its
   disparate-impact exposure (`_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md`
   §6, DOJ v. Meta).

## What we're building

**One metric family on the existing brain, not a new brain.** `refinery/packs/lee-deed-records-swfl.mts`
already exists, already reads this table, and already ships four metrics. It gains two more. Its
`corpusSummary`/`outputProducer` shape, its source, and its caveat discipline are reused verbatim.

Three pieces:

1. **A Postgres view — `lee_deed_purchase_financing_v`.** One row per arm's-length DEED, carrying
   `record_date`, `parcel_strap`, `consideration_usd`, and a `financing_class` of
   `financed` / `no_recorded_financing` / `unclassifiable`. The pairing window is a parameter of the
   view, not a magic number in TypeScript (see FM-1). Lands in `docs/sql/`, per the house pattern
   already used by `steadyapi_*_v`.
2. **A rollup the source can read.** Daily counts and a trailing-window share. PostgREST cannot
   compute this shape inline — same constraint that parked the median-consideration metric
   (`lee_deed_median_consideration_metric`) — so the aggregation lives in the view.
3. **Two new metrics on the deed brain**: `deed_no_recorded_financing_share_lee` (intensive, ratio)
   and `deed_arms_length_paired_mortgage_lee` (extensive, count). Vocab slugs ship in the SAME
   commit as the pack (`brain-vocabulary.json`, Gate 2).

### What it is NOT

Not a new brain. Not a new ingest pipeline. Not a UI. Not a Collier build — Collier has no deed feed
at all, so this is Lee-only and must be labeled Lee-only on every surface that renders it.

---

## Name the break — failure modes and the guard for each

**FM-1 — Same-day pairing undercounts financing, so the cash share reads too high.**
A purchase mortgage is normally recorded with its deed, but not always the same calendar day —
a next-morning recording, a weekend/holiday boundary, or a clerk backlog splits the pair. Every
split pair is silently counted as a cash purchase. This is the failure that would make the headline
number wrong in a specific, directional, embarrassing way.
**Guard:** the pairing window is a parameter, and its sensitivity gets measured before a value is
chosen. Test: `financing-window.test.mts` asserts the classifier returns monotonically non-increasing
cash shares as the window widens, on a fixture with a deliberately split pair.

**MEASURED 08/12/2026 — this failure mode is not live. The curve is flat.** Deed side deduped to one
row per `(record_date, parcel_strap)` per FM-3 (3,031 rows). Paired mortgages by window:
same-day **1,179** · +1 day **1,179** · +3 days **1,182** · +7 days **1,182** · −3/+14 days **1,182**.
Widening from same-day to a seventeen-day symmetric window adds **3 pairs out of 3,031 (0.1%)**.
The window is therefore NOT load-bearing, and same-day is the correct, simplest choice. Financed
share **1,182 / 3,031 = 39.0%**; no-recorded-financing **61.0%**.

Why the curve is flat, stated so nobody re-derives it: title companies record the deed and its
purchase mortgage as one package. Of the 2,372 MORTGAGE-family rows carrying a strap, roughly 1,190
never pair to an arm's-length deed at all — those are refinances and mortgages against nominal-
consideration deeds, which is precisely the population task 5 of the investigation queue wants.
The residual overcount in "cash" is now a different and smaller thing than a timing split: seller
financing, assumed mortgages, and financing recorded against a different strap. Still an upper
bound — but the window question is settled.

**FM-2 — Strap-absent deeds are dropped, and they are not a random sample.**
180 of 3,229 arm's-length deeds (5.6%) have no strap and cannot be paired at all. If those skew
toward a property type (new construction, condo, multi-parcel), the denominator is biased.
**Guard:** `unclassifiable` is its own class, never folded into either side, and its share is
reported alongside the number. A suppression floor rejects the metric entirely for any window where
unclassifiable exceeds 15%. Test: fixture with 20% strap-absent rows asserts the metric suppresses
rather than publishing a skewed share.
**MEASURED 08/12/2026:** 180 of 3,229 arm's-length deeds have no strap = **5.57% unclassifiable**,
comfortably inside the 15% floor. The floor still ships — it is the guard for a future window where
strap coverage degrades, not a formality about today's number.

**FM-3 — Multi-parcel and multi-doc transactions double-count.**
One sale can record several deeds (multiple parcels) or one deed against several mortgages.
Naive counting inflates both sides unevenly.
**Guard:** dedupe to one row per `(record_date, parcel_strap)` on the deed side before pairing, and
treat mortgage pairing as EXISTS, not a join fan-out. Test: fixture with one strap carrying two
mortgages asserts the deed counts once.
**MEASURED 08/12/2026:** 3,049 raw strap-carrying arm's-length deed rows collapse to 3,031 distinct
`(record_date, parcel_strap)` pairs — 18 rows, 0.6%. Small, but it is real double-counting and the
dedupe is one `distinct`, so there is no reason to carry the error.

**FM-4 — A cash share is read as a market-direction call.**
This is the pack-level trap `facts-only-lint` and `inference-bait-lint` exist for. "Cash share rose"
becomes "investors are piling in" the moment prose touches it.
**Guard:** the metric ships with `direction: "stable"` and the pack's existing preference line is
extended — the number is reported as recorded fact, never as a driver. Stage-4 validators already
abort the write on violation; no new gate is erected (RULE 3 C2).

**FM-5 — The number is served as current when the feed has not advanced.**
The FETCH is manual. A human misses three days and the trailing window silently becomes a stale
window rendered as today's read. This is the `stale-source-served-silently` shape, currently at
**6 strikes with the guard still owed** (`_ASSISTANT/STRIKES.md`).
**Guard:** the metric carries `max(record_date)` in its own citation string, and the pack's existing
thin-backfill caveat is extended to state the span explicitly. It never says "today"; it says the
date range it actually covers. This build does not attempt the fleet-wide staleness tripwire that
strike registry owes — it guards its own surface only, and says so.

**FM-6 — 22 business days is treated as a trend.**
It is not. There is no seasonality, no rate-cycle, and no year-over-year comparison available.
**Guard:** no trend language, no `direction: "rising"`, and a caveat stating the span in days until
the history clears a stated minimum. The existing span-based caveat in the pack already does this;
it is reused, not reinvented.

**FM-7 — Nobody reads it.** The `built-dark-no-consumer` shape is at 5 strikes.
**Guard:** the metric lands on an EXISTING brain that is already fetched, not a new dark table. The
check `deed_cash_financed_split_live_verify` closes only on a live fetched response containing the
metric slug — not on a green test run.

---

## Implementation order

1. ~~**Measure the pairing-window curve** (0/1/3/7 days).~~ **DONE 08/12/2026** — flat curve, window
   not load-bearing, same-day chosen. FM-1, FM-2 and FM-3 all measured; see their sections. This was
   the only step that could have changed the design, and it did not.
2. **TDD the classifier** (RULE 3.5 hard gate) — `superpowers:test-driven-development`, one failing
   test per failure mode above that has a deterministic-logic guard (FM-1, FM-2, FM-3), named after
   the failure mode, then implement to green.
3. **Ship the view** in `docs/sql/`, applied directly (RULE 1: migrations run directly, idempotent,
   verify row count after).
4. **Extend the source + pack + vocab in ONE commit** (Gate 2 — every emittable slug registered in
   `brain-vocabulary.json` in the same commit).
5. **Rebuild the one brain** — `pack_id=lee-deed-records-swfl`, never `master --force` (RULE 1).
6. **Live-verify and close the check** with a fetched response, not a test line (RULE 0.8 §4).

## Open questions for the operator

1. ~~**Pairing window.**~~ Resolved by measurement — the curve is flat, same-day it is. No decision
   needed from you.
2. **Does this number face the customer, or stay internal** until the history is deeper than 22 days?
   My read: internal until it clears a stated span floor, because FM-6 is the easiest way to look
   foolish with a real number.

## Cross-refs

- `docs/handoff/2026-08-12-lee-deed-data-investigation-queue.md` — task 3 is this measurement; task 1
  is the blocker for everything this build deliberately avoids
- `_RESEARCH/data-and-ingest/2026-08-12-lee-deed-doc-type-catalog.md` — doc-type definitions
- `_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md` §3, §6 — why the
  market-statistic lane and not the owner-targeting lane
- `docs/standards/data-roots.md` T10 — the month-grain sale-date trap this build routes around
- `refinery/packs/lee-deed-records-swfl.mts` — the pack being extended
