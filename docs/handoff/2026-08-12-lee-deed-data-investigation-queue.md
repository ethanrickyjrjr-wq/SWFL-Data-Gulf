# Lee deed data — the investigation queue

**Date:** 08/12/2026 · **For:** a Sonnet session (or several, in parallel — tasks are independent)
**What landed:** `data_lake.lee_deed_official_records` went from 0 real rows to 28,186 rows across
22 business days (07/13–08/11/2026), unfiltered — all 32+ doc types, not just DEED. First real data
this table has ever held. Full story: `SESSION_LOG.md` (2026-08-12 entry, "lee_deed_official_records:
first real data ever loaded"), pipeline mechanics: `ingest/pipelines/lee_deed_official_records/
README.md`, doc-type definitions: `_RESEARCH/data-and-ingest/2026-08-12-lee-deed-doc-type-catalog.md`.

**What this queue is:** every quantitative question this new data can actually answer, each scoped
tightly enough to run without a judgment call. **A task whose answer requires deciding what we
should BUILD is not on this list** — that stays with the operator. This is measurement, not
construction.

---

## HARD RULES — every task, no exceptions

1. **Query the real table.** `SELECT` against `data_lake.lee_deed_official_records` (Postgres,
   creds in `.dlt/secrets.toml`) — never estimate from the raw JSON files, they're pre-merge.
2. **Never invent a number.** Every figure in every finding is the output of an actual query, pasted
   verbatim (or close enough to verify) alongside the finding. If a question can't be answered from
   what's here, say so and name what's missing — don't estimate to fill the gap.
3. **22 business days is not a trend yet.** Every task below produces a MEASUREMENT and a
   DATA-QUALITY VERDICT (is this signal real, noisy, or too thin to trust), not a forecast. Flag
   explicitly if a finding would need more days of history to mean anything.
4. **The parcel join is broken — task 1 fixes it before anything else needs it.** Confirmed live
   08/12/2026: `lee_deed_official_records.parcel_strap` (format `XX-XX-XX-XX-XXXXX.XXXX`, e.g.
   `0-44-27-02-00012.0130`) does NOT match `lee_parcels.state_parcel_id` (format
   `Cnn-nnn-nnn-nnnn-n`, e.g. `C46-000-502-7399-4`) — a direct join returns 0 rows despite 12,399 of
   28,186 deed rows (44%) carrying a parcel_strap. Any task below that needs parcel enrichment
   (assessed value, year built, living area) is BLOCKED until task 1 resolves this.
5. **Every finding lands in `_RESEARCH/data-and-ingest/2026-08-XX-<slug>.md` AND gets its line in
   `_RESEARCH/INDEX.md` in the same pass.** Unindexed research does not exist.
6. **Grantor/grantee lists truncate past ~3 parties** (literal `"..."` marker, source-side, not our
   bug). Any task counting/matching people by name must report what share of rows hit the truncation
   marker, since that's a real completeness ceiling on identity-based tasks (probate, investor
   detection, marriage-to-purchase matching).
7. Dates MM/DD/YYYY. No tables in any answer back to the operator (plain prose/lists only). No
   invented findings — "the data doesn't support this yet" is a valid, complete answer.

---

## TASK 1 — Fix the parcel_strap ⇄ lee_parcels join (unblocks everything else)

**Input:** `lee_deed_official_records.parcel_strap` (12,399 populated rows) vs `lee_parcels` — check
`state_parcel_id`, `parcel_id`, and any other candidate column for a format that normalizes to
match (leading zeros, hyphens, section-township-range-subdivision-block digit grouping likely
differ). Also check `leepa` and `collier_parcels` in case Lee's own STRAP matches a different table
than `lee_parcels`.

**Output:** a normalization function (documented, not necessarily code — a plain transformation
rule is enough for this task) and a live-measured match rate: of the 12,399 deed rows with a strap,
how many resolve to a real parcel row after normalization. Write to
`_RESEARCH/data-and-ingest/2026-08-XX-deed-parcel-strap-join-fix.md`.

**Stop condition:** a measured match rate (a number, from a real query) — even if the answer is
"still 0% after normalization, here's why," that's a complete, valid finding.

---

## TASK 2 — Foreclosure timeline: does LIS PENDENS actually predict CERTIFICATE OF TITLE?

**Input:** `doc_type IN ('LIS PENDENS','JUDGMENT','LIEN','CERTIFICATE OF TITLE')`, grouped by
grantor/grantee name overlap (subject to the truncation caveat in rule 6) or by `parcel_strap` once
task 1 resolves it — whichever gives a real match.

**Output:** for however many LIS PENDENS → CERTIFICATE OF TITLE pairs exist in the 22-day window,
the measured gap in days between the two filings for the same property. State plainly if the window
is too short to find any complete pairs yet (foreclosure timelines typically run months) — that's
the likely honest answer, and it's still useful: it tells us how many MORE days of backfill we'd
need before this signal becomes usable.

**Stop condition:** either N measured pairs with a real day-gap, or a clear statement of why zero
pairs exist yet and what window would be needed.

---

## TASK 3 — Cash buyers vs financed buyers, daily

**Input:** `doc_type = 'DEED'` rows with `consideration_usd > 100` (arm's-length, 3,229 rows across
22 days per the last live count), joined same-day + same-parcel-strap-or-grantee against a
`doc_type = 'MORTGAGE'` row.

**Output:** daily and 22-day-aggregate share of arm's-length sales with NO same-day paired mortgage
(cash purchase signal) vs WITH one (financed). State the join method used (parcel_strap if task 1
resolved it in time, else grantee-name matching with the truncation caveat noted).

**Stop condition:** a real cash-vs-financed percentage split, with the join method disclosed.

---

## TASK 4 — Investor/entity buyer share

**Input:** `doc_type = 'DEED'`, `grantees` field — classify each grantee list as INDIVIDUAL vs
ENTITY (contains LLC, INC, LP, TRUST, TRUSTEE, CORP, or similar — write the exact pattern used).

**Output:** daily and 22-day-aggregate share of arm's-length DEED rows where the buyer is an entity,
not an individual. Also: which entities/trusts appear as grantee MORE THAN ONCE in the 22-day
window (portfolio-building signal) — list them with their acquisition count and dates.

**Stop condition:** a real entity-share percentage and a real list of repeat-buyer entities (even if
the list is empty — 22 days may be too short to catch many repeats).

---

## TASK 5 — Refinance/cash-out volume as a rate-sensitivity gauge

**Input:** `doc_type = 'MORTGAGE'` rows with NO same-day paired DEED (refinance, not purchase
financing) vs `doc_type = 'SATISFACTION'` rows (loan paid off) — daily counts of each.

**Output:** the daily refinance-vs-satisfaction ratio over the 22-day window. State whether the
window shows any visible trend or is flat/noisy — 22 days is short for a rate-sensitivity read, say
so plainly if that's the honest read.

**Stop condition:** the two daily series, real counts, with an explicit noisy-vs-trending verdict.

---

## TASK 6 — Notice of Commencement: leads or lags the permits pipeline?

**Input:** `doc_type = 'NOTICE OF COMMENCEMENT'` (354+242+... — recount live, don't reuse the
2-day-sample figure from the doc-type catalog) vs `data_lake.lee_building_permits` (the
`lee_permits` pipeline, weekly cadence) for the SAME date range.

**Output:** for however many address/parcel matches exist between the two (name the match method
used, since NOTICE OF COMMENCEMENT's `legal_full` and permits' address field are differently
shaped), the measured day-gap between a Notice filing and its matching permit issuance. This
directly tests the README's claim that Notice of Commencement "fires before a permit does."

**Stop condition:** a real measured gap (or a clear zero-match finding with the reason).

---

## TASK 7 — Sale-to-assessed ratio at transaction grain (BLOCKED on task 1)

**Input:** DEED arm's-length rows joined to `lee_parcels`/`leepa` assessed value, once task 1's join
works.

**Output:** the measured ratio distribution (median + spread) of `consideration_usd` to assessed
value, for whatever join rate task 1 achieves. Compare against `tier_divergence_swfl`'s existing
estimate-vs-reality gap number if that pack exposes a comparable figure — name the exact field
compared.

**Stop condition:** BLOCKED, explicitly, until task 1 lands a nonzero join rate. If task 1 fails,
this task reports "blocked, task 1 found no viable join" and stops — does not estimate around it.

---

## TASK 8 — Marriage license → subsequent deed, same names

**Input:** `doc_type IN ('MARRIAGE FL RESIDENCE WITHOUT COUNSELING','MARRIAGE FL/NON-FL WITH
COUNSELING','MARRIAGE NON-FL RESIDENCE')` grantee/grantor names vs later `doc_type = 'DEED'` grantee
names, same 22-day window.

**Output:** count of any name matches found (household-formation-to-purchase signal), with the
caveat that 22 days is almost certainly too short a window for this pattern to show up at all —
state that plainly if the count is zero, and note what backfill depth would be needed to test this
for real (this is a "is the idea worth pursuing" scoping task, not expected to find much yet).

**Stop condition:** a real count (likely zero) and an honest read on whether it's worth re-running
after a longer backfill.

---

## Explicitly out of scope for this queue
Any consumer/pack code, any UI, any new ingest pipeline, any proposal for what to build next — those
are operator decisions once the measurements above are in. This queue answers "is the signal there,"
not "should we ship it."
