# Recorded documents → street address: WIRED. And the reason we kept missing it.

**Date:** 08/12/2026 · **For:** whoever picks up county records, parcel joins, or the
"why does our written record keep being wrong" problem.
**Status of the work below: LIVE and verified, not proposed.** Every number is counted out of
`data_lake`, not read off a script's exit code.

---

## PART 1 — WHAT IS NOW LIVE

### 1a. `data_lake.lee_records_addressed_v` — Lee documents with a street address

Applied and verified 08/12/2026 (`bun scripts/apply-lee-records-addressed-view.mts`, exit 0):

```
10,461 addressed rows · 31 doc types · 07/13–08/11/2026 · 2,850 carrying a sale price
DEED 4,535 · MORTGAGE 1,846 · NOTICE OF COMMENCEMENT 1,278 · TERMINATION 445 ·
AFFIDAVIT 440 · LIEN 313 · MORTGAGE W/O INTANGIBLE TAX 202 · RELEASE 197
```

Real rows: `08/11/2026 · $350,000 · 2806 SE 17TH AVE`. Sale price, exact recording day, street
address. `data-roots.md` T10's standing complaint is that every sale date we serve is MONTH grain
and lags ~7 weeks — this is day-grain and current to the last capture.

**The fix was one normalization.** `parcel_strap` (`22-46-25-E4-10000.1700`) is the Lee STRAP;
`lee_parcels.parcel_id` (`364323C2025430120`) is the same STRAP with separators removed. Strip
`-` and `.`, LPAD the leading section field to 2 digits (some rows carry a 1-digit section, so a
bare `replace()` lands on 16 and silently misses).

**Two guards are baked into the view, on purpose:**
- `sale_price_usd` is NULL off a DEED. `consideration_usd` is non-null on **100% of all 28,186
  rows including DEATH CERTIFICATE and MARRIAGE**, so the `>$100` arm's-length floor is meaningless
  elsewhere. A consumer cannot misuse it.
- `lee_parcels.parcel_id` is unique (556,083 rows / 556,083 distinct, verified) so there is no
  fan-out. **But two deeds can share one address on one day** (real: 1111 FLORENCE ST E, twice,
  08/11/2026, same price) — dedupe on `(record_date, strap17)` before counting sales.

### 1b. Collier records are actually loaded

12,441 documents, 23 days, 07/13–08/11/2026, 34 doc types. NC 2,756 · DEED 2,230 · AFFID 1,277 ·
MTGE 1,046 · SATIS 1,000 · JUDG 674 · PROBATE 630. Brain rebuilt against it (version 2) and
reporting live numbers. Grants applied, PostgREST schema reloaded.

### 1c. `data-roots.md` corrected in both places

Line 86 and T10 both said the parcel join was BROKEN. Both now carry the fix, the new root, and the
dedupe caveat.

---

## PART 2 — WHAT IS STILL OWED (nothing below is done)

1. **`_RESEARCH/INDEX.md` line for `2026-08-12-deed-parcel-strap-join-fix.md`.** Blocked on another
   session's file lock, not on judgment. **Unindexed research does not exist in this repo** — this
   is the single highest-value owed item on the page.
2. **Collier's weekend crash.** The reader raises `expected 10 <td> cells, got 1` on an empty result
   grid. The county records Mon–Fri only — documented since this morning in
   `ingest/pipelines/lee_deed_official_records/README.md` ("confirmed live via the Clerk's own hours
   page: Mon–Fri only, no weekend recording") and never carried anywhere shared. **The daily cron
   will fail loudly every Saturday and Sunday from now on.** An empty day must be a clean no-op.
2b. **The multi-day date range does not work.** `--start 2026-08-07 --end 2026-08-08` exits 0 and
   loads 08/07 only; a 29-day range crashes. Day-by-day is the only proven mode. Nobody hit this
   because the cron only ever asks for yesterday.
3. **Nothing consumes `lee_records_addressed_v` yet.** The brain still hard-filters DEED and reads
   only counts. Wiring it is the difference between a view and a product.
4. **Collier's wider route is unbuilt.** Parcel IDs exist on only 39% of Collier deeds and ~0% of
   everything else (NC 0/2,756, MTGE 0/1,046). Its broad key is `legal_description`, filled on
   **8,471 of 12,441 rows (68%)**, subdivision-name-shaped ("SILVER LAKES PHASE 2E BLOCK 7 LOT 6").
   The NABOR subdivision code list (30pp, fetched 08/12/2026,
   `https://documents.nabor.com/reference/Collier_Subdivision_Code_List_2015-05.pdf`) maps every
   Collier subdivision name to a 6-digit code. **UNVERIFIED: whether `collier_parcels` carries that
   code.** Check before promising it.
5. **The LeePA↔FDOR crosswalk is proven but unwired** (§3c below).
6. **The doc-type rollup design** (`docs/superpowers/specs/2026-08-12-county-records-doc-type-rollup-design.md`)
   is written, not built. It exists so adding LIS PENDENS or CERTIFICATE OF TITLE is one registry
   line instead of five hand-written artifacts.
7. **`_ASSISTANT/STRIKES.md` line** for the `fixed-but-not-live` strike below — blocked on a lock.

---

## PART 3 — THE ACTUAL PROBLEM: our written record was wrong three separate ways in one day

This is the part worth reading. The technical work above took an hour. The reason it sat undone for
a month is the same failure repeated, and it is not a knowledge problem — **every answer was already
on disk.**

### 3a. Collier was reported DONE with zero rows in the database

One session built the pipeline properly — scraper, parser, 12 green tests, brain, workflow, vocab.
Its `SESSION_LOG.md` entry says, accurately: *"Real live end-to-end **dry-run**… returned 107 real
rows."* `--dry-run`'s own help text is *"Fetch + normalize the date range and report; **skip the dlt
write**."*

**In the same commit** (`47ec04c9`) it wrote into `cadence_registry.yaml`: *"Cron enabled
08/12/2026, **first live day-partial pull** 107 rows same day."*

One file honest, the next file not, minutes apart. Then the parity handoff read the registry and
wrote "cron live." Then `data-roots.md` read that. Then the brain's own scope string read that. Four
documents asserting a table that did not exist. "Cron enabled" was also written for a schedule that
had never fired and could not have — the workflow landed on `main` at 15:50 UTC, four hours after
its 11:37 UTC slot.

### 3b. The deed→parcel join was called BROKEN when it worked

`data-roots.md` said 0 rows, in two places. That measurement was **correct** — against
`state_parcel_id`. The right column, `parcel_id`, was in the same table.

**And we had already written down that it was the STRAP.** 07/18/2026,
`_RESEARCH/audits/2026-07-18-data-consolidation/P1-parcel-consolidation.md` line 63: *"FDOR keys on
`parcel_id` (STRAP)."* Twenty-five days old.

**And this morning's own investigation queue named the fix.** TASK 1 of
`docs/handoff/2026-08-12-lee-deed-data-investigation-queue.md` says in its own words to check
`state_parcel_id`, `parcel_id`, **and any other candidate column**, and to "also check `leepa`… in
case Lee's own STRAP matches a different table." The task was scoped exactly right, filed, and never
run — while the catalog went on telling every reader the join was broken.

### 3c. A crosswalk called nonexistent already existed

The same 07/18 audit (lines 54, 63): LeePA's folio and FDOR's parcel id are *"different key
systems… a join would need a crosswalk that **does not exist yet**. This is the LeePA↔FDOR join
gap."*

**Measured 08/12/2026: `leepa_parcels.strap` = `lee_parcels.parcel_id`. 542,445 of 548,798 rows —
98.8%.** Both tables already carried the STRAP under different column names. Everything blocked on
"no crosswalk" (LeePA `soh_cap` reconciliation, LeePA sale history joined to FDOR address and
attributes) was never blocked. Dedupe caveat: 826 duplicate straps on the LeePA side.

### 3d. And I did the same class of thing, twice, while writing this up

- Reported a backfill "running fine" that had **crashed and loaded zero rows**. I piped the command
  through `grep`/`tail`, and a pipe returns the **last** command's exit code — `tail`'s 0, not
  Python's 1. This exact trap is in memory as `feedback_never-pipe-git-commit-through-tail.md` from
  08/05/2026. **Never pipe a command whose success you intend to report.** Redirect to a file, check
  `$?`, read the file.
- Told the operator Collier's parcel field was empty on **every** row. That was measured on two
  days. Across the full load it is 939 of 12,441 (7.5%). Zero and 7.5% are different facts.
- Gave the flattering framing first: "91%" is of the strap-carrying subset; against all Lee deeds it
  is 85%.

---

## PART 4 — THE MECHANISM ALREADY EXISTS. COLLIER JUST DIDN'T OPT IN.

**CORRECTION — the first draft of this section was wrong** and is left here rewritten rather than
deleted, because writing a confident false claim into a handoff is the exact failure this page is
about. It said "nothing checks that a table has rows, we should build it." Both halves were wrong.

**`ingest/scripts/assert_landed.py` already does this, and it is already wired** into
`.github/workflows/nightly-chain.yml` (line 188) as a real gate — not an observability probe. Its
own docstring: *"For every `nightly: true` cadence-registry entry: 1. FRESHNESS last_run == today
(UTC) 2. VOLUME count(\*) >= expected_rows_min… Any STALE / LOW_ROWS / UNRESOLVED -> name it ->
exit 1."* It deliberately does **not** reuse the loose observability checks, precisely so that
"green != data" cannot be rebuilt inside the fix.

**It would have caught Collier on day one** — a table that does not exist cannot return ≥ 100 rows.

**Why it didn't: the gate is opt-in, and the Collier entry never opted in.** Its registry entry
carries everything the gate needs — `count_table: data_lake.collier_official_records` and
`expected_rows_min: 100` — and lacks the one line that arms it:

```
nightly: true
```

Measured 08/12/2026: **5 entries carry `nightly: true`. 19 entries carry a `count_table`.** So
fourteen countable pipelines are sitting outside a gate that was built to cover them, Collier
among them.

**So the fix is one line in `cadence_registry.yaml`, not a new hook** — and per RULE 3 C2 (extend
existing seams, never erect a new mandatory gate) that is the only correct move here. The real
question for the next session is the other thirteen: does `nightly: true` belong on every entry with
a countable table, or is the opt-in deliberate for some? That is a review, not a build.

Second item, still owed and genuinely absent: **a claim in `data-roots.md` that names a join should
carry the query that proves it**, so "0 rows on a direct join" is re-runnable instead of inherited.
The 25-day gap between "parcel_id IS the STRAP" being written down and being used is what an
executable claim prevents.

**The lesson generalizes past this page:** the guard existed, wired and working, and a new pipeline
was built alongside it without being connected to it — the same shape as the deed join (the answer
existed, written down, unconnected) and the crosswalk (the key existed, in two tables, unconnected).
The failure mode of this repo is not missing capability. It is **built things not being wired to
each other**, and then a written claim covering the gap.

`_ASSISTANT/STRIKES.md` already tracks `fixed-but-not-live` at 5 strikes with its guard marked BUILT
— but that guard is **Gate 15, email-surface only**. It does not cover ingest. This is strike 6 and
the scope gap is the point.

---

## PART 5 — REPRODUCE ANY NUMBER ON THIS PAGE

```
bun scripts/apply-lee-records-addressed-view.mts        # applies + verifies, exits 1 if empty
```

```sql
-- Lee: documents that reach a street address, by type
select doc_type, count(*) from data_lake.lee_records_addressed_v group by 1 order by 2 desc;

-- Collier: what actually landed
select count(*), count(distinct record_date), min(record_date), max(record_date)
from data_lake.collier_official_records;

-- The LeePA <-> FDOR crosswalk (98.8%)
select count(*) as leepa_rows, count(p.parcel_id) as matched
from data_lake.leepa_parcels l
left join data_lake.lee_parcels p on p.parcel_id = l.strap;
```

Credentials in `.dlt/secrets.toml`; run SQL via `new Bun.SQL` (psql is not installed).

**Related:** `_RESEARCH/data-and-ingest/2026-08-12-deed-parcel-strap-join-fix.md` (full evidence,
all caveats) · `docs/superpowers/specs/2026-08-12-county-records-doc-type-rollup-design.md` (the
don't-rebuild-it-every-time design) · `docs/handoff/2026-08-12-lee-deed-data-investigation-queue.md`
(TASK 1 is now closed by this work).
