# Lee parcels — handoff (07/14/2026)

> **STATUS UPDATE 07/14/2026, same day:** §2's whole NAL-file lane turned out to be
> unnecessary. The "CO_NO=46 (Lee) is a broken partition" claim in §1's LeePA section
> and in `constants.py` was stale — diagnosed against the OLD keyset-pagination query
> shape, never retested against the `returnIdsOnly`+`objectIds` fix that unblocked
> Collier's identical symptom (commit `c892771b`, 07/06). Retested live: Lee works
> fine on the same statewide centroid layer, same retrieval code, just `CO_NO=46`.
> `constants.py` carries the full correction + evidence. Step 1's NAL-URL resolution
> (and `lee_parcels_nal_url_unresolved`) is moot — closed. `ingest/pipelines/
> parcel_subdivision` now takes both counties (`--county collier|lee|both`); §3
> (condo dedup) and §4 (address join) landmines still apply once Lee data lands.
> See project memory `project_lee-parcels-naples-fix-unblocks.md`.

**The goal in one line:** get Lee County parcels into `data_lake.parcel_subdivision` — the SAME
table Collier already fills — so a build on a Lee address can name its community, its home count,
and its median value. Today Lee gets **nothing**.

**Why it matters, with the real number:** `active_listings_residential` holds **11,185 active Lee
listings** (vs 9,687 Collier). Collier listings can resolve to a community from the tax roll for
free. Lee's cannot, because `parcel_subdivision` is **Collier-only — 220,875 rows, zero Lee**.
Lee's only community source right now is the listing detail-page scrape shipped 07/14/2026
(`lib/listings/listing-detail.ts`), which is per-listing and says nothing about home counts or
median value.

Open checks this closes: `lee_parcels_zero_coverage`, and it unblocks
`parcel_subdivision_orphaned_no_readers` + `communities_tables_zero_coverage`.

---

## 1. TWO DOORS ARE ALREADY CLOSED. Do not re-open them.

### The FDOR ArcGIS centroid layer — Lee 400s. Verified, documented, do not retry.

This is the layer Collier comes from (`ingest/pipelines/parcel_subdivision/constants.py`).
Its own docstring says, verbatim:

> `CO_NO=46` (Lee) record queries **400 on BOTH statewide layers** (count works, records don't)
> — a broken Lee partition. Do not pull Lee here.

Someone will be tempted to "just change `CO_NO` to 46." It does not work. The count endpoint
returns, the record endpoint 400s. This is a source-side partition problem, not a query bug.

### LeePA's own MapServer — no address, no legal description. Verified live 07/14/2026.

`https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer` — 24 layers, all of them
value/sales. I pulled layer 12 ("Just Value", the one we already ingest) and read its field list:

```
FOLIOID · Just · Market · Assessed · Taxable · SOHCap · CapDifference · Building · Land
```

**No `PHY_ADDR1`. No `S_LEGAL`. No subdivision.** And `data_lake.leepa_parcels` (548,798 rows,
already ingested) matches: `folioid`, `zip_code`, `use_code`, and seven value columns — nothing
that names a community or a street.

So LeePA can tell you what a Lee parcel is *worth*. It cannot tell you what it is *called* or
where it *is*. That is the whole problem.

---

## 2. THE LANE THAT WORKS: the FDOR NAL file

Florida DOR publishes the **real property roll as a NAL file — "Name, Address, Legal"** — per
county, as a bulk download. Confirmed on the live FDOR page 07/14/2026:

> Property appraisers submit three types of assessment roll files … the real property roll
> (**Name – Address – Legal, or NAL**), the Sale Data File (SDF), and the tangible personal
> property roll (NAP).

**This is the same data the broken ArcGIS layer is derived from.** The proof is our own Collier
`OUT_FIELDS`: `PARCEL_ID, S_LEGAL, DOR_UC, JV, PHY_ZIPCD, PHY_ADDR1` — those are NAL column names.
Going to the file instead of the FeatureServer bypasses the broken Lee partition entirely, and it
is a bulk download: no pagination, no `returnIdsOnly` dance, no soft-400s at deep cursors.

**Publish cadence** (from the same page): July 1 preliminary · October initial final · a final roll
after certification. **Only the most current version of each roll is posted** — older vintages are
by request. So this is an ANNUAL pull, and if you want a specific vintage you must grab it in
window. Cadence entry should reflect ~365 days, same as `leepa`.

### STEP 1 — THE ONE THING I COULD NOT VERIFY. Do this first.

I did **not** resolve a concrete Lee NAL download URL. The FDOR "Tax Roll Data File directory" is a
JS-rendered SharePoint listing and crawl4ai returned no file entries from it. **Do not invent a
URL.** Resolve it for real, one of two ways:

- **Lane A (preferred):** the Tax Roll Data File directory —
  `https://floridarevenue.com/property/dataportal/Pages/default.aspx?path=/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files`
  Drive it with a real browser (Chrome tools) or the SharePoint REST API to get the actual file
  list. Field meanings live in the "User's Guide for Department Property Tax Data Files" in the
  same portal — read it before mapping columns.
- **Lane B (fallback):** the Florida Geographic Information Office open-data portal,
  `https://geodata.floridagio.gov/` — a proper ArcGIS Open Data site with statewide parcel
  downloads. Real bulk export, not the FeatureServer that 400s.

Whichever lands, write the resolved URL into `constants.py` with an `as_of` — the same way the
Collier constants carry their verified-live date.

---

## 3. LANDMINES — each one already bit us once

### 3a. CONDO DEDUP. This inflated a real number and shipped it into a doc.

The FDOR centroid layer stamps **one DOR roll record onto multiple map points per condo**. Proven
live on parcel `81750002283` ("Whitaker Woods A Condominium"): **33 raw rows**, only `OBJECTID` /
`ORIG_FID` / geometry differ — owner, sale, value, `S_LEGAL`, `NO_RES_UNT` byte-identical across
all 33. Grouping raw rows inflated Collier's condo count to **169,047**; deduping on `parcel_id`
(the ingest's merge PK) reproduces the correct **100,847**.

The NAL is a flat roll file and *should* be one row per parcel — which would make this moot.
**Verify that before you trust any count.** `SELECT count(*), count(DISTINCT parcel_id)` on the raw
pull; if they differ, dedup on `parcel_id` and say so in the log. Single-family is NOT a safe
canary here — it "matched" in the old benchmark precisely because it rarely has >1 geometry point,
which is why the condo bug hid.

Full evidence: `verification/communities-name-join-accuracy.md` (read its correction block at the
top) and `docs/superpowers/specs/2026-07-05-communities-swfl-design.md` §Scope.

### 3b. THE NORMALIZER MUST STAY BYTE-IDENTICAL, or the community slugs drift apart.

Two pairs must not diverge, and neither is enforced by a type:

- `SUBDIVISION_QUALIFIER_PATTERN` (`constants.py`) ⟷ `normalizeSubdivisionName`
  (`refinery/lib/subdivision-aliases.mts`). "HERITAGE BAY UNIT 12" must stem to "HERITAGE BAY" on
  both sides or the alias reconciler mints two slugs for one community.
- `DOR_HOME_TYPE` — `001` single-family · `002` mobile · `004` condominium · `005` cooperative ·
  `007` misc-residential · `008` duplex-small-multifamily. Non-residential and vacant-residential
  codes are **dropped** (absent from the map), per the design spec's home-count scope. Lee must use
  the SAME map, or Lee's type-mix is not comparable to Collier's.

Reuse the Collier constants — import them, don't retype them.

---

## 4. THE ADDRESS JOIN — the numbers, measured, not guessed

This is how a listing finds its community, and the naive version is a trap.

**Listings write "1857 Galleon Drive". The tax roll writes "4806 MYERS RD".** Full words vs USPS
abbreviations, plus unit suffixes on the listing side. Measured on Collier, 07/14/2026:

- Naive exact string match: **3.5%**. Garbage.
- With USPS suffix canonicalization: **80.2% of Collier listings match a parcel**, and
  **77.2% resolve to exactly ONE community** — 7,465 of 9,669.

**Use the normalizer we already own — do not write a second one.** `addressKey()` in
`lib/listings/address-key.ts`, whose Python twin is
`ingest/pipelines/listing_lifecycle/address_key.py`. They are required to stay in exact parity
(`address-key.test.ts` mirrors the Python tests case-for-case). I hand-rolled a suffix map in SQL
while measuring this and then found `addressKey` already did it — learn from that and skip the step.

**FAN-OUT IS REAL AND MUST NOT BE GUESSED THROUGH.** Condo towers share one street address: the
worst Collier case is **273 parcels on a single address**. So the join is one-to-many. Rule: take
the DISTINCT `subdivision_name` across all parcels at that address key; **exactly one → that is the
community. More than one → no community. Never pick the most common one.** A silently-wrong
community is worse than an absent one — and the prose guard now opens on the presence of a
community fact, so a wrong fact licenses wrong prose.

---

## 5. WHAT THIS UNLOCKS ONCE LEE LANDS

1. **`neighborhood_stats` — the rollup that has never run.** `ingest/duckdb_pipelines/neighborhood_stats/agg.py`
   exists, is tested, and the table is **0 rows**. It turns parcels into per-community home count,
   count-by-type, and median just-value. It needs no new data. Run it.
2. **`parcel_subdivision` has ZERO readers** in `lib/` or `app/` today — 220,875 rows nobody queries.
   Wire the address→community lookup into the build path (the community facts now reach every
   listing recipe via `ListingFacts.community`; a parcel-backed lane would add home count + median
   value, which the detail page does NOT carry).
3. Lee's 11,185 listings stop being second-class.

---

## 6. GATES — this is an ingest, so it ships with them or it does not ship

- **Brain-first ingest gate:** no bulk write to `data_lake.*` without the consuming brain's
  `PackDefinition` in the same PR. `communities-swfl` already exists and already reads this table
  (`refinery/sources/communities-swfl-source.mts`) — so this is satisfied, but say so in the PR.
- **Pipeline-freshness:** the GHA cron wrapper **and** `--dry-run` ship in the SAME PR
  (`docs/standards/pipeline-freshness.md`). `parcel_subdivision` today has **no registry entry and
  no cron — manual dispatch only** (check `parcel_subdivision_zero_coverage`). Fix that for both
  counties while you are in here; an annual NAL cadence (~365d) matches `leepa`.
- **PROBE FIRST:** before the multi-minute pull, run the <1-min probe — fetch only the columns the
  normalizer reads, at the largest page the source honors. Guard load-bearing columns before any
  destructive replace (Gate 4: a destructive write with no non-null guard is BLOCKED).
- **ZIP gate G1:** `zip_code` from the SITE address only. The NAL's `PHY_ZIPCD` is the site ZIP —
  correct. A mailing ZIP would be a violation.

---

## 7. THE ORDER I WOULD DO IT IN

1. Resolve the real Lee NAL URL (§2 step 1). Write it into `constants.py` with an `as_of`.
2. Probe: pull ~2k Lee rows, confirm `PARCEL_ID` / `S_LEGAL` / `PHY_ADDR1` / `DOR_UC` / `JV` are
   populated, and check `count(*)` vs `count(DISTINCT parcel_id)` for the condo fan-out (§3a).
3. Extend `ingest/pipelines/parcel_subdivision` with a Lee resource that reuses Collier's
   `DOR_HOME_TYPE` + `SUBDIVISION_QUALIFIER_PATTERN` verbatim. Same table, `county='lee'`.
4. Idempotent merge on `parcel_id`. Verify row count. Registry entry + cron + `--dry-run`.
5. Run `agg.py` → fill `neighborhood_stats` for BOTH counties.
6. Wire the address→community lookup (§4) into the build path, honoring the one-community rule.

**Expected order of magnitude for step 2:** LeePA's own count is 548,798 Lee parcels (all types,
2026-05-31). After dropping non-residential and vacant per `DOR_HOME_TYPE`, expect the residential
subset — Collier's 364,827 raw became 220,875 homes. Do not treat these as targets; they are
sanity bounds. If Lee comes back at 12,000 or 3,000,000, something is wrong.
