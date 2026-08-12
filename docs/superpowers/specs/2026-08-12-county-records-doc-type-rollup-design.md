# County recorded-records parity — doc-type rollup design

**Date:** 08/12/2026 · **Supersedes the execution order in:**
`docs/handoff/2026-08-12-lee-collier-deed-records-parity-and-routing-handoff.md` Part B/C.
**Status:** design, not yet built. Lee half is implementable now; Collier half is blocked (§1).

---

## 1. BLOCKER FOUND FIRST — `data_lake.collier_official_records` DOES NOT EXIST

Measured live 08/12/2026, before any design work:

```
select table_schema, table_name from information_schema.tables
  where table_name ilike '%official_record%';
-- data_lake.lee_deed_official_records
-- data_lake_staging.lee_deed_official_records
-- (no collier row)
```

```
gh run list --workflow=ingest-collier-official-records.yml --limit 5 --json ...
-- []        (gh authed as ethanrickyjrjr-wq; the Lee load workflow returns a real
--            success row for 08/12/2026 12:01 UTC from the same command)
```

There is also **no DDL** — `ls migrations/ docs/sql/ | grep -i collier` returns the permits,
parcels, and sold-median files only, nothing for `collier_official_records`. Commit `47ec04c9`
(the pipeline build) **is** on `origin/main`.

### 1a. WHY — and it is not a broken build (corrected 08/12/2026)

The build is real and complete: scraper, parser, 12 green Python tests, brain pack, vocab, workflow,
registry entry. Two mundane facts explain the missing table, and neither is a failure:

1. **The 107 rows were a `--dry-run`, which by definition does not write.** `pipeline.py`'s own flag
   help reads *"Fetch + normalize the date range and report; **skip the dlt write**"*, and `main()`
   returns before `run_pipeline()` when it is set. `SESSION_LOG.md` says "dry-run" plainly — **the
   build session reported this honestly.**
2. **The daily cron has not had its first firing yet.** The workflow file landed on `main` at
   **15:50 UTC** on 08/12/2026 (`47ec04c9`, committed 11:50:45 -04:00); its cron slot is **11:37
   UTC**. GitHub only fires a schedule for a workflow already present on the default branch, so it
   missed today's slot by ~4 hours. **First automatic run: 11:37 UTC on 08/13/2026.**

So "the workflow has never executed once" is true but must not be read as *something broke* — nothing
has failed, because nothing has yet been asked to run.

**The actual defect is documentary, and it is narrow:** an honest "dry-run: 107 rows" was copied
forward into `cadence_registry.yaml` as *"first live day-partial pull 107 rows same day"* and into
the handoff as *"cron live 08/12/2026"*. Those two sentences converted a dry-run into a live claim,
and every downstream reader — including this spec's first draft — inherited it.

**Four tracked documents currently overclaim this table as live.** Each needs a correcting line in
the same pass that fixes the state:

- the handoff, Part A — *"Collier's FETCH+LOAD is fully automated, cron live 08/12/2026"*
- `ingest/cadence_registry.yaml`, the `collier_official_records` note — *"Cron enabled 08/12/2026,
  first live day-partial pull 107 rows same day"*
- `docs/standards/data-roots.md` line 86 — the new 🟡 Collier root, *"fully automated daily cron"*
- `refinery/packs/collier-official-records-swfl.mts` scope string — *"ALL 37 document types"*, as
  a present-tense claim about data on hand

This is the `fixed-but-not-live` strike shape (`_ASSISTANT/STRIKES.md`, 5 strikes, guard BUILT).
Not softened here: the pipeline was written and tested, and then nothing ran.

**What unblocks it** is one workflow dispatch, not a rewrite. `pipeline.py` uses
`dataset_name="data_lake"` with a dlt Postgres destination, and dlt creates its own tables on first
successful load — so hand-written DDL is likely unnecessary. The step that will **not** happen
automatically is `ingest/CLAUDE.md`'s post-creation grant:

```sql
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst,'reload schema';
```

Without it a dlt-created table is invisible to PostgREST, so the brain connector still fails after
a green load. Dispatch → verify the row lands → run the grant → re-probe. **Operator gate:** RULE 1
lists "ingest writes to `data_lake.*`" as ask-first. Free run (public records, crawl4ai, no LLM, no
paid API) — needs his word, not his budget.

---

## 2. The full-scope audit — what the sources hand us vs. what we keep

This is the section the operator asked for: *are we filling everything we don't yet know what to do
with, so we don't rebuild later.*

### 2a. Lee — the ingest layer drops 3 named columns the source gives us for free

`convert_export_xlsx.py` (the real delivery path since 08/12/2026) reads the Export button's XLSX,
whose header is:

```
Status · Consideration · Grantor · Grantee · Record Date · Doc Type · Book Type · Book · Page ·
Clerk File Number · DocLinks · Legal · Lot · Block · Unit · Subdivision · Building · Section ·
Township · Range · Comment
```

21 columns. The converter builds 18 keys and **never reads three of them**:

- **`DocLinks` — the real loss.** README idx 14 describes it as *"present only when linked images
  exist; contains instrument numbers."* That is a **document-to-document edge**: a deed pointing at
  its own mortgage, a lien pointing at its release, a satisfaction pointing at the mortgage it
  closes. We currently reconstruct that relationship by *guessing* — the cash-vs-financed build
  pairs a deed to a mortgage on `same parcel_strap + same record_date`, and its own caveat calls the
  result "an upper bound on the true cash-purchase share, not the share itself." **`DocLinks` is the
  source telling us the answer directly, and we throw it away on every row.** This is exactly the
  "data we don't know what we'll do with later" case — capture it now as raw text; parsing it into
  edges is a separate, later build that becomes possible instead of blocked.
- **`Comment`** — unread. Content unknown (never sampled). Capture as raw text.
- **`Building`** — deliberately unread. `convert_export_xlsx.py`'s docstring: *"Does NOT populate
  `phase` — this export's column in that position is headed 'Building', not 'Phase' (a genuine
  discrepancy from the README's documented shape, worth reconciling later, not guessed at here)."*
  The caution was right; the resolution is to add a `building` column rather than keep discarding.
  Live confirmation that this discard is real: `phase` is populated on **15 of 28,186 rows**.

Everything else the source exposes is either captured (20 columns + `consideration_usd`,
`record_date`, `parcel_strap` derived + ODD provenance) or genuinely empty at source (XHR idx 5, 24,
26 — blank in every sample, unconfirmed).

**Live column fill, all 28,186 rows, measured 08/12/2026:**

```
status 28,186 · book_type 28,186 · page 28,186 · clerk_file_number 28,186 · internal_doc_id 28,186
legal_full 24,046 · subdivision 14,826 · lot 12,579 · unit 10,275 · block 9,853
section 1,053 · township 994 · range 993 · phase 15 · book 0
```

`book` is **structurally empty — 0 of 28,186.** Either the source never fills it or the mapping
drops it; it is the only column that is 100% NULL. Do not emit a metric off it, and do not treat its
emptiness as a bug to chase before someone confirms which of the two it is.

### 2b. Collier — 9 of 9 grid columns captured, but the ceiling was never probed past the grid

`normalize.py` reads all 9 result-grid columns. The `source_ceiling` in `cadence_registry.yaml`
claims 9 is the full width the UI exposes — but that measurement was taken on the **search results
grid only**. Nobody has opened a single **document detail view**, which on most clerk platforms
carries fields the results grid omits. Until someone does, "9 is the ceiling" is a grid-level claim
being reported as a source-level one. One probe closes it; it is not a build.

Also unfilled, and cheap: `constants.py` holds the full 37-code → English label map read off the
live UI, and `normalize.py` never attaches it. The label is derivable at read time so nothing is
lost — noted so the next session doesn't re-derive the map.

### 2c. The brain layer is where the data actually dies — 81% of it

Ingest is close to complete. Consumption is not:

```
data_lake.lee_deed_official_records:  28,186 rows · 43 doc types
lee-deed-records-swfl reads:           5,353 rows ·  1 doc type   (.eq("doc_type","DEED"))
```

**Every query in `lee-deed-records-source.mts` hard-filters DEED.** 22,833 loaded rows — every
foreclosure filing, every probate, every construction start — are invisible to every consumer of
this platform. That is the parity gap, and it is a brain-layer gap, not an ingest one.

**Correction to four documents: there are 43 live doc types, not 32.** The 32 figure comes from
`_RESEARCH/data-and-ingest/2026-08-12-lee-deed-doc-type-catalog.md`, a **2-day, 2,000-row capped**
sample; the registry, the pipeline README, `data-roots.md`, and the handoff all repeat it. Any
doc-type count spoken from here on comes from the rollup view (§3a), never from the catalog.

Top of the live distribution (`n`, and `parcel_strap` coverage — which varies enormously and governs
what can ever be parcel-joined):

```
DEED                    5,353   strap 4,999 (93%)
NOTICE OF COMMENCEMENT  4,424   strap 1,542 (35%)
JUDGMENT                2,366   strap    19 (0.8%)
AFFIDAVIT               2,254   strap   486
MORTGAGE                2,216   strap 2,005 (90%)
SATISFACTION            2,136   strap   185
COURT PAPER             1,350   strap     6
PROBATE                 1,254   strap   714 (57%)
ORDER                   1,139   strap    13
LIEN                      687   strap   352
LIS PENDENS               292   strap    80
CERTIFICATE OF TITLE       88   strap    18
DEATH CERTIFICATE         439   strap     0
```

Two things fall out. **The Lee Notice-of-Commencement string is `NOTICE OF COMMENCEMENT`** — the
full words, 4,424 rows, the #2 type — *not* Collier's coded `NC`. And **parcel-join work is
DEED/MORTGAGE-shaped only**; a join built on JUDGMENT (0.8%) or DEATH CERTIFICATE (0%) silently
returns almost nothing.

---

## 3. The design — a rollup, not another hand-written metric

The handoff asks for three new metrics (`lee_records_total`, `lee_records_30d`,
`lee_notice_of_commencement_30d`). Building them the way the existing metrics are built means, for
each one: a new count query in the source connector, a new field on the summary interface, a new
`key_metrics` block in the pack, a new `brain-vocabulary.json` entry, a new test. Then next week
LIS PENDENS, CERTIFICATE OF TITLE, PROBATE, MORTGAGE — five more times, times two counties.

**That is the rebuild-every-time pattern.** The design below pays for itself at the second doc type.

### 3a. One rollup view per county

Mirrors the established `lee_deed_purchase_financing_v` pattern (`docs/sql/`), keeps
"aggregate at source" honest, and replaces N count queries with one read of a ~43-row view:

```sql
create or replace view data_lake.lee_records_doc_type_v as
select
  doc_type,
  count(*)                                                                   as n_total,
  count(*) filter (where record_date >= current_date - interval '30 days')   as n_30d,
  count(*) filter (where parcel_strap is not null)                           as n_with_parcel,
  min(record_date)                                                           as earliest_record_date,
  max(record_date)                                                           as latest_record_date
from data_lake.lee_deed_official_records
group by doc_type;
```

Collier gets the identical shape, swapping the parcel predicate to
`jsonb_array_length(parcel_ids) > 0`. **`n_with_parcel` is deliberate** — it makes the coverage in
§2c visible per type instead of assumed, which is what stops a future parcel-join from silently
under-counting.

Deliberately absent: **no consideration column.** See FM-1.

The all-types totals the handoff asks for are then `sum(n_total)` / `sum(n_30d)` over the view —
no separate query, and they can never drift from the per-type numbers because they are derived
from them.

### 3b. One declared doc-type registry

`refinery/lib/records-doc-types.mts` — the single place a doc type is promoted to an emitted metric:

```ts
export interface RecordsDocType {
  slug: string;             // metric suffix: "notice_of_commencement"
  label: string;            // "Notices of Commencement"
  lee: string | null;       // exact live string: "NOTICE OF COMMENCEMENT"
  collier: string | null;   // exact live code:   "NC"
  emit: boolean;            // promoted to a key_metric today
  citation: string;         // the statutory / plain-English one-liner
}
```

`emit: true` for this pass: `deed`, `notice_of_commencement`. Declared with `emit: false`, ready:
`lis_pendens`, `certificate_of_title`, `judgment`, `lien`, `probate`, `death_certificate`,
`mortgage`, `satisfaction` — the ranked add-list already researched in the doc-type catalog and
independently in `_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md`.

**Adding a type later = flip one boolean + one vocab line.** No new query, no new summary field, no
new metric block.

### 3c. Naming — the handoff's step 5, and it is worse than the handoff knew

The two brains use **opposite affix conventions**, which the handoff read as "Lee just doesn't have
the metric yet":

```
Lee:      deed_records_total_lee      deed_records_30d_lee        (county SUFFIX)
Collier:  collier_records_total       collier_records_30d         (county PREFIX)
```

**Decision: new metrics use the county-PREFIX form** (`lee_records_total`, `lee_records_30d`,
`lee_notice_of_commencement_30d`, `<county>_<slug>_30d`). **Existing `*_lee` slugs are NOT renamed**
— they are registered in `brain-vocabulary.json` and a rename breaks every consumer for cosmetics.
The inconsistency is documented and frozen rather than churned. That is the whole of step 5.

### 3d. Order of work

1. Lee rollup view + registry + source connector reads the view + the 3 new metrics + vocab + tests.
   **Unblocked, this is the deliverable.**
2. Correct the four overclaiming documents (§1) and the 32→43 doc-type count (§2c).
3. Collier: dispatch the workflow, verify rows land, run the grant, re-probe. Then the identical
   view + the same registry, no new design.
4. Master wiring — both brains into `master.mts` `sources[]` + `input_brains[]`, and fix the stale
   line 385 comment (*"moot while its table is empty"* — false for Lee since this morning).
   **Lee can wire as soon as step 1 ships. Collier must not wire before step 3** — see FM-4.

Rebuilding `brains/master.md` to pick the new inputs up is a paid Sonnet dispatch (RULE 1) and is
**not** in this spec.

---

## 4. Failure modes and their guards (RULE 3.5 — named before build)

**FM-1 — a consideration predicate applied to a non-DEED type returns a meaningless number.**
Measured: `consideration_usd` is **non-null on 100% of all 28,186 rows, every doc type**, including
DEATH CERTIFICATE (439/439) and MARRIAGE (273/273). So `> 100` does not fail loudly on a
non-transactional type — it silently returns a count that means nothing.
*Guard:* the rollup view carries no consideration column at all; arm's-length classification stays
inside the DEED-only financing view. Test asserts the view's column list contains no
`consideration*` field.

**FM-2 — a doc-type string typo in the registry emits a silent zero forever.** Lee's strings are
free text from an export; Collier's are short codes. `"NOTICE OF COMMENCMENT"` returns 0 rows and
ships a confident 0.
*Guard:* a test asserting every `emit: true` entry matches a live rollup row with `n_total > 0`.
A promoted type that finds nothing **fails the test** instead of shipping. Fixture-mode variant
asserts against the fixture.

**FM-3 — speaking a doc-type count from the catalog research.** Four documents say 32; live is 43.
*Guard:* the view is the single count root; no doc-type total is hard-coded anywhere. §2c is the
correcting record.

**FM-4 — the Collier connector throws instead of returning empty, aborting the whole brain build.**
The pack has an empty-tolerant path keyed on `collier_records_total === 0`, but a missing relation
returns PostgREST `42P01` as an **error**, which `throwOnError` converts to a throw — so the
empty-tolerant path never runs and the build dies. **The pack's claimed empty-tolerance is currently
fictional**, and this is why Collier must not wire into master before its table exists.
*Guard:* the connector catches the missing-relation error class and returns a zero summary carrying
a caveat that names "table not created," which is what the pack already knows how to render.

**FM-5 — a parcel join built on the rollup silently under-counts.** Coverage runs 93% (DEED) to 0%
(DEATH CERTIFICATE).
*Guard:* `n_with_parcel` is a first-class view column; any consumer reads coverage rather than
assuming it.

**FM-6 — treating `book`'s emptiness as recoverable.** 0 of 28,186.
*Guard:* documented in §2a; no metric emits from it until someone confirms source-vs-mapping.

**FM-7 — `current_date` inside the view moves under a cached brain.** `ttl_seconds` is 24h, so a
cached brain's "trailing 30 days" is up to a day stale. This is existing behavior for every 30d
metric on the platform, unchanged by this design.
*Guard:* none needed; named so it is not rediscovered as a bug.

**FM-8 — Lee's history stops advancing and nothing says so.** FETCH is manual (Akamai); the span
grows only when a human drops a file. A trailing-30d number silently decays toward zero.
*Guard:* the existing thin-backfill caveat already fires below a 30-day span; the rollup's
`latest_record_date` per type keeps it accurate as types are added.

---

## 5. Explicitly NOT built

- **A Collier cash-vs-financed metric.** The source carries no consideration column
  (`_RESEARCH/data-and-ingest/2026-08-12-collier-clerk-liveness-probe.md`, all 9 columns
  enumerated live). Not "not yet" — not buildable from this source. Named so nobody re-discovers it
  by trying.
- **Collier's `parcel_ids` fill-rate measurement** (handoff step 4). There is no table to measure.
  It moves to step 3 of §3d, after the first green load.
- **Parsing `DocLinks` into document-to-document edges.** §2a says capture the raw text now; the
  edge-graph build (and the cash-vs-financed accuracy it would unlock) is a separate spec.
- **A distress/opportunity signal lane.** The doc types this design makes reachable are the raw
  material; the lane itself is scoped in
  `_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md` as a
  market-statistic lane only — no identity resolution, no owner targeting.
- **`brains/master.md` rebuild.** Paid dispatch, operator-gated.
