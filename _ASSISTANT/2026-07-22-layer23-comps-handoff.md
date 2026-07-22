# HANDOFF — layer 23 landed, ranker still unwired, broken file on main

**Written 07/22/2026.** Read before touching comps, the comp ranker, or the `leepa_comp_sales`
pipeline. Every number below was measured live. Re-verify before acting.

## DO THIS FIRST — there is broken code on `origin/main`

`origin/main` is `5418714d`. The `ingest/pipelines/leepa_comp_sales/resources.py` committed there
is the **broken OBJECTID-keyset version**. It cannot finish the pull — it dies around 82–90k of
108,881 rows. It was committed mid-build by a parallel session that bundled another session's
in-progress files with its own work.

**The working fix is LOCAL and UNCOMMITTED**: the partitioned `resources.py`, plus corrected
`constants.py` and `cadence_registry.yaml`, plus the never-committed
`docs/sql/20260722_leepa_comparable_sales_indexes.sql`. A backup patch also exists outside git in
the 07/22 session scratchpad (`backup/working-partitioned-fix.patch`).

Nothing was reverted and nothing was force-pushed — shared `main` with live parallel sessions is
Ricky's call. Check: `leepa_comp_sales_broken_on_main`.

**Why the broken version cannot be rescued by tuning:** the server's cost scales with the OBJECTID
range scanned, not rows returned. Measured at `OBJECTID>512626`: n=1000 timed out at 140s, n=200
took 71s, n=100 took 73s — while the identical query shape at the shallow end served n=1000 in
0.6s. No smaller page size or retry budget fixes that. The working version partitions on
`SaleYear × SaleMonth` (~3–5k rows each), removing OBJECTID from the query entirely and letting
each partition assert against its own count — a stronger completeness guard than the 90% row floor
it replaced. Do not "simplify" it back to a single walk.

## What actually landed

`data_lake.leepa_comparable_sales`, from LeePA ParcelInfo MapServer layer 23 ("Comparable Sales"),
pulled 07/22/2026:

- **108,881 fetched against a canonical 108,881** — exact; all 31 partitions matched their own count.
- **108,848 rows landed**, 92,625 distinct folios. The 33-row gap is exact content duplicates
  (same parcel/month/deed/price) collapsing on the `comp_id` hash — indistinguishable in the source.
- Bedrooms present on **75,746 rows (69.6%)**; bathrooms on 76,671. Prices parsed 100%
  (`"$300,000"` → `300000.0`). Range Jan 2024 – Jul 2026.
- Join `FOLIOID` → `data_lake.leepa_parcels`: **91,546 of 92,625 folios (98.8%)**.

**Coverage gain on the thing this was pulled for** — of the 8,999 trailing-6-month rows in
`data_lake.lee_comp_sales_v`: **8,648 gain a bedroom count (96.1%)**, **8,774 gain a bathroom count
(97.5%)**, 8,646 gain both. Baths were 0.4% before this.

**Caveat that must travel with any use of it:** beds/baths attach at **parcel grain from any
2024–2026 comp record, not from the matched sale**. A parcel's bedroom count doesn't vary per sale,
so this is semantically defensible — but it is NOT "this sale's beds and baths" and must never be
described that way.

Layer 23 is one month fresher than `leepa_parcels` (newest Jul 2026 vs Jun 2026), but it is still
`SaleYear`+`SaleMonth` — **month grain. It does NOT fix sale-date recency.** data-roots trap T10
stands.

## The ranker is STILL NOT WIRED — this is the open thread

`lib/assistant/comp-rank.ts` and `lib/assistant/comp-source-lake.ts` are imported by **nothing but
their own tests**. `lib/assistant/comp-helper.ts` — the one live comp path, `compsForAddress` — does
not import either. Eight production surfaces still run the unguarded vendor `/nearby-home-values`
path: `app/r/offer-check`, `app/r/should-i-sell/[zip]`, recipes `just-sold` / `price-reduced` /
`market-comps`, `lib/listings/showing-prep-source.ts`, `lib/offer-check/verdict.ts`,
`lib/assistant/conversation-path.ts`.

So the 96% beds/baths coverage reaches no user. The ranker's `W_BEDS`/`W_BATHS` terms are still
dead because nothing feeds them.

**The seam** is inside `compsForAddress`, before the `fetchTracked` nearby call at
`comp-helper.ts:266`: Lee-only branch, lake candidates through `rankComps`, vendor as fallback for
Collier or a thin lake result. Surfaces keep calling `compsForAddress` and never know.

**Ricky has not approved this wiring.** It changes what eight live surfaces serve. Do not do it
without an explicit go.

## Before you wire it — three things that will bite

1. **Commercial contamination in `lee_comp_sales_v`, pre-existing.** `4395 COLONIAL BLVD` shows
   1 bed / **389 baths**; three CAPTIVA DR parcels are each stamped the same $45M bulk-sale price.
   Small (6 rows beds>8, 8 rows baths>8, 3 rows baths>20) and NOT caused by the layer-23 pull — the
   join surfaced it. **The ranker needs a sanity ceiling before it serves anything.**
   Check: `comps_commercial_contamination`.
2. **The ±25% band has never been tested in the thin case.** `bandPct: 0.25`, so for a 1,978 sq ft
   subject the tier-1 filter admits 1,483–2,473 sq ft. If only 4 candidates clear it, all 4 return
   with `standardMet: true`, tier 1, `note: null` — a 25% size miss with no caveat at all. The only
   live probe ran in a dense ZIP (64 candidates), the easy case. **Probe a thin subject — large or
   unusual home in a low-volume ZIP — before shipping.**
3. **No brain consumes the new table, and inventing one is the wrong fix.** `properties-lee-value`
   reads six columns off `leepa_parcels` and reports county-wide assessed-value aggregates; it is a
   valuation reporter, not a comp reporter. No pack anywhere references a comp table. data-roots
   already lists the comp root's brain as "no single brain (answer-engine path)" — a comp set
   answers one question about one home on demand, which is not brain-shaped. The brain-first ingest
   gate will still block the PR. Wiring the ranker IS the consumer; raise the gate exception with
   Ricky rather than building a fig-leaf pack. If a genuinely brain-shaped use is wanted, layer 23
   holds reportable region facts (bed/bath mix of recent Lee sales, pool share, median year built by
   area) that `properties-lee-value` could carry. Check: `leepa_comp_sales_no_consumer`.

## The other half of today: ceilings are now visible

`scripts/ceilings-to-checks.mjs` (new, 07/22/2026) walks every `source_scope.source_ceiling` in
`ingest/cadence_registry.yaml` and opens one check per pipeline holding censused-but-unpulled data.
**72 existed. None had ever been surfaced.** All 72 are now open checks in project `ingest`, key
prefix `ceiling_`. Idempotent, dry-run by default, never auto-closes.

A roll-up section was added to the TOP of `docs/standards/data-roots.md`, above the decision table,
because the ceiling notes were already in that file ~94 times — buried 1,000+ lines down where
nobody reads them.

**Root cause worth carrying forward:** layer 23 was censused 07/19/2026 and recorded correctly in
BOTH the registry and data-roots. On 07/22 two separate sessions independently told Ricky we had no
beds/baths for comps — one after querying `information_schema` and concluding "the field is not in
the file." It was in the file, twice. **Recording is not surfacing.** `information_schema` tells you
what we PULLED; `source_ceiling` tells you what EXISTS; answer with both and the delta, never one.

Still unsurfaced and worth a look: FDOT (their org runs 1,586 public layers, we use one — crash and
fatality data untouched), Lee permits (county ArcGIS has structured permit layers, 9,386
unincorporated-Lee permits), FEMA (publishes real NFIP penetration rates; our code uses a static
0.3 guess).

## Checks opened today

`leepa_comp_sales_broken_on_main` · `leepa_comp_sales_no_consumer` · `comps_commercial_contamination`
· `comps_bed_bath_missing` (opened before the pull — **now mis-scoped**; the data exists and landed.
Re-scope to "beds/baths do not reach a served comp because the ranker is unwired") · plus the 72
`ceiling_*` checks.

Separately: the ledger was at 649 open before today, all `resolution='manual'`, **641 of them with
no verification signal** even though the signal engine exists. Burn-down plan:
`_ASSISTANT/2026-07-22-checks-burndown-handoff.md`.

## Cost

This session burned roughly $109, most of it the layer 23 build. Whoever picks this up should know
that before choosing the next move.
