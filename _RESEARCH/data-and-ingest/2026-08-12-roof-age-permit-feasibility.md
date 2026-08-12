# Roof age from permits — OUR data first, then Collier (Task 9 of the 08/11 Sonnet queue)

**Date:** 08/12/2026 · **Parent:** `docs/handoff/2026-08-11-listing-grade-sonnet-work-queue.md` Task 9
**Method:** live queries against production Supabase (`data_lake` schema, PostgREST, service-role
key from `.dlt/secrets.toml`) + one live crawl4ai fetch + one live direct download of a Collier
County XLSX. No code written, no consumer wired, no write attempted, no email drafted.

**Headline: the roof-permit answer with the widest reach and zero incremental cost is already
sitting in our own database — `data_lake.steadyapi_property_permits` — and it was NOT built by
this task. It landed 08/03–08/04/2026, eight days before this session started. The 08/02/2026
research file this task points to says "still unbuilt" — that line went stale two days after it
was written and nobody corrected it until now.**

---

## Step 0 — the vendor endpoint we already pay for: DID NOT make a new live call, and here's why

`_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md` (read in full first, per
the task) records that `/property-tax-history` returns a `building_permits[]` family and that we
persist zero of it. That was true on 08/02. It stopped being true on 08/03–08/04/2026:

- **The raw response body is landed.** `migrations/20260802_steadyapi_property_history_raw.sql`
  created `data_lake.steadyapi_property_history_raw` (full JSON body, cold provenance store) as
  part of `docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md`.
- **`building_permits[]` is parsed out of it.** `docs/sql/20260804_steadyapi_property_permits_v.sql`
  documents the parser (`parse_property_permits.py`) landing **79,281 permit rows across 12,946
  properties** into `data_lake.steadyapi_property_permits`, measured live 08/04/2026, "ZERO PAID
  CALLS." The TypeScript consumer already exists: `lib/listings/property-permits.ts`.
- **I re-verified this is real, live, today (08/12/2026)**, not a stale comment:
  `GET .../rest/v1/steadyapi_property_permits?select=*&limit=3` (Accept-Profile: data_lake)
  returned real rows, e.g. property `6833133056` / address_key `489ADIRONDACKCT:34145` / county
  `Collier`, permit_type `"Shutter(s) with electric"`, effective_date `2022-09-15`.
- Live count confirms the documented total exactly: **79,281 rows**, county split **Lee 55,376 ·
  Collier 21,718 · (remainder Hendry/other) 2,187**.

**Per HARD RULE 3 of the task queue ("if the answer is already there, say so and stop — that is a
successful task, not a failed one") and RULE 0.7a rung 2 ("a paid row we ALREADY BOUGHT — a read,
not a call — never treat it as spend"), I did not make the new `/property-tax-history` call the
task pre-authorized.** There is no missing field to justify a rung-3 paid call — the family is
already fully landed for 12,946 properties, 26,000x the scale of a 3-5 address probe, at zero
additional cost. Spending money to re-derive an answer the lake already holds is the exact ladder
violation RULE 0.7a exists to stop.

### What `building_permits[]` actually contains (fields, live-queried)

Per permit: `permit_type, project_type_1, project_type_2, project_type_3, project_name,
effective_date, status` plus join scaffolding added by the parser: `property_id, permit_seq
(permit_ordinal), address_key, county, fetched_at`.

**No dollar/cost field exists anywhere in this family.** The 08/02 census enumerated all 64 field
paths in the vendor response and none of them is a permit value — confirmed again on every sampled
row (`declared_value` is not a column). Any roof-age product built off this source states a permit
*date*, never a permit *cost*.

**Date format:** `effective_date` is stored parsed (the vendor's raw `"Mar 8, 2021"` string is not
kept — see `steadyapi_permits_vendor_date_string_not_stored`, an open, deliberate, documented loss,
not a bug). The view guards 4 rows with absurd future dates (`Feb 14, 2282`; `Aug 1, 2269` x3) to
NULL; `effective_date_raw` keeps them inspectable.

### Is a roof permit identifiable? Yes — but substring matching over-states it

Union match (`permit_type` OR any of the three `project_type_*` columns `ILIKE '%roof%'`):
**11,182 rows, 6,480 distinct properties.**

Precise match (`permit_type ILIKE '%roof%'` only): **8,828 rows, 5,228 distinct properties.**

**The gap between those two numbers is the finding, not noise.** Widening the match to
`project_type_*` pulls in permits that are NOT roof jobs — the same false-positive shape measured
independently on the Lee Accela table below: a solar permit tagged "Photovoltaic System Installation
on Roof," an electrical revision whose description says "roof venting correction," an HVAC permit
for a "rooftop package unit." **The rule for any future consumer: match the type field against a
canonical roof vocabulary (`Roof`, `Reroof`, `Re-roof`, `Roofing …`, `Alteration-roof`, etc. — the
sampled distinct `permit_type` values are clean, unambiguous roofing language), never a bare
`ILIKE '%roof%'` substring across every tag field, and never a permit-number prefix alone.**

Sampled distinct `permit_type` values containing "roof" (1,000-row sample, all read as genuine
roof work): `Alteration-roof` (309) · `Roof` (254) · `Roofing various - residential` (116) ·
`Reroof` (86) · `Re-roof` (78) · `Roofing shingle to shingle or shingle to metal - residential
(push-button)` (42) · `Roofing misc` (17) · `Re-roof: 1&2 family` (14) · `Building - trade - roof
permit` (13) · plus several smaller variants.

**Coverage, in the right unit (properties, not rows):** of 12,946 properties with any permit
history, **5,228 (40.4%) carry at least one type-matched roof permit** (40.4% on the precise
measure; 50.1% / 6,480 on the loose measure that over-counts). This is high but plausible for SWFL
post-Ian (2022) reroofing volume — reported as measured, not editorialized.

### The two constraints that travel with this data — do not drop them

1. **Scope law is binding, per the view's own comment:** listing-scoped — a permit row exists only
   for a property we probed because it was listed or sold. **Never** a county-wide permit
   statistic. `lee_building_permits` / `collier_building_permits` (Step 1/2 below) stay the
   area-wide lane.
2. **`data-roots.md` flags an open, unresolved duplicate-object check:**
   `steadyapi_three_families_table_vs_view_duplicate` — "Nothing new may consume either side until
   the merge is decided." A roof-age feature reading this table is a new consumer and should check
   that this is resolved before wiring, not just before this report.
3. **Duplicates are NOT collapsed at the row level.** 15.6% of rows (loose key) vs 1.1% (every-field
   key) are duplicate objects the vendor sent twice — `lib/listings/property-permits.ts`
   `dedupePermits()` handles this for a single-property read, but a raw COUNT off the table (as
   used above for the coverage numbers) is a row count, not a deduplicated permit count. A future
   roof-age reader must call the existing dedupe, not re-derive one.

### The `_ENRICH_ONLY_COLS` trap — read before proposing ANY write here

`ingest/pipelines/listing_lifecycle/distill.py` — `upsert_state._ENRICH_ONLY_COLS = ("listed_date",
"baths")`. Every other column in `_STATE_COLS` takes a blanket `EXCLUDED` overwrite on the nightly
merge, and `/search` sets those fields back to `None`. This is how `baths` was wiped on 34,139 of
34,478 rows (07/26/2026) and `listed_date` on 17,127 rows (07/19/2026) — twice reactively patched.
**The corollary for roof age specifically: `building_permits[]` is correctly kept OFF
`listing_state` entirely (it's one-to-many, per the view comment) — but if a future build derives a
SCALAR onto `listing_state` from it (e.g. a computed `roof_permit_year`), that column must be added
to `_ENRICH_ONLY_COLS` in the SAME commit or the next nightly sweep nulls it silently.** No such
column exists today; this is a landmine for whoever builds one, named so it isn't re-tripped.

### One honest limitation of skipping the paid call

The landed bodies carry `fetched_at` timestamps of 08/02–08/03/2026. This report is a **content
census of what we already hold**, not a live proof that the vendor's `building_permits[]` shape is
identical today, 08/12/2026. If a future build needs that live-shape guarantee, that is the
narrower, genuinely justified reason for a fresh probe call — not "we don't have permit data,"
which would be false.

---

## Step 1 — Lee: `data_lake.lee_building_permits` (live-queried)

**306 total rows** (weekly Accela/crawl4ai scrape, `lee-permits-weekly.yml`, per
`ingest/cadence_registry.yaml`; `count_table: data_lake.lee_building_permits`). Live-queried date
range: **2026-02-25 to 2026-08-07** — about 5.5 months, not the "90d backfill" the registry comment
states; that comment is stale by roughly 2.5 months and worth a separate, small correction (not
fixed here — out of this task's scope, no write made).

**Columns (live sample):** `permit_id, issued_date, permit_type_raw, permit_description_raw,
bucket, address, zip_code, lat, lon, declared_value_usd, status, corridor`, plus dlt/ingest
metadata columns.

### Is a roof permit identifiable? Yes, cleanly — but not via the classifier bucket

`buckets.py`'s 5-way classifier (`commercial_new, commercial_alteration, residential, demolition,
other`) has **no roofing bucket** — a roof permit lands in `residential` or `other` indistinguishably
from anything else. The real signal is the **permit-number prefix and the raw type field**:

- `permit_id ILIKE 'ROF%'`: **15 of 306 rows (4.9%)**
- `permit_type_raw = 'Roof'` exactly: **12 of 306 (3.9%)**
- Bare substring `ILIKE '%roof%'` across `permit_type_raw` OR `permit_description_raw`: **27 of 306
  (8.8%)** — and sampling those 27 confirms the same over-match pattern as Step 0: a solar permit
  ("Photovoltaic System Installation on Roof"), an electrical revision ("roof venting correction"),
  a storage-building permit mentioning "3:12 roof slope," and an HVAC/mechanical permit for a
  "rooftop package unit" — none of these are roof-replacement jobs. **Use `permit_id` prefix `ROF`
  or exact `permit_type_raw = 'Roof'`, never the bare substring.**

### Address / value

- **305 of 306 rows carry a non-empty `address`** — a raw formatted string, e.g. `"401 MAPLE AVE N,
  LEHIGH ACRES FL 33972"` (city + state + zip embedded in the string, not split into columns beyond
  a separate `zip_code` field, which is populated on 304 of 306 rows).
- This is **not** the same key shape as `steadyapi_property_permits.address_key`
  (`STREETNOSPACE:ZIP`, matching `listing_state`'s own key format) — joining this table to a
  listing needs a normalization pass (the codebase already has the tools: `canonStreet`,
  `looseAddressKey` in `lib/listings/apify-record-store.ts`), not a new join mechanism.
- **`declared_value_usd` is populated on only 28 of 306 rows (9.2%)** — mostly null. Cost/value is
  effectively absent from this source, same as Step 0.

### The real finding for Step 1

**306 total Lee permits of any kind, over 5.5 months, is a small fraction of true Lee County permit
volume** — this table exists to make our OWN listing/permit cross-checks possible, not to be a
comprehensive county roof register. **The SteadyAPI listing-scoped table in Step 0 already covers
55,376 Lee-county permit rows** (180x this table's total row count) with a cleaner join key. For
"does THIS specific listed property have roof permit history," Step 0's data is the stronger lane
for Lee, not this one. This table's registry entry also documents an unused, much bigger Lee County
GIS ceiling (`source_ceiling`: 9,386 unincorporated-Lee + 719 commercial + 2,192 Cape Coral
residential permit rows on Lee's own ArcGIS FeatureServer) that is out of scope for this task but
worth flagging as a real, cited, unbuilt lane.

---

## Step 2 — Collier: `collier_permits` pipeline (parked, but the source and the already-loaded data are both live and current)

### What's already loaded, from a prior one-off run

`data_lake.collier_building_permits` already holds **4,975 rows** from an April 2026 Issued-series
XLSX, loaded 05/27/2026 (per `ingest/cadence_registry.yaml`'s `confirmed_total`). Live-sampled
schema: `permit_number, declared_value, building_type, permit_class, permit_type_desc,
permit_status, site_address, property_id, date_issued, date_applied, total_sf, total_units,
const_type, owner_name, owner_city/state/zip, contractor_type/name/city/state/zip, lat, lon,
bucket, source_file` — 23 mapped columns, matching the registry's `confirmed_total` claim.

**Roof identification in the already-loaded April data:** `permit_type_desc = 'Reroof'` — **303 of
4,975 rows (6.1%)**, permit numbers prefixed `PRRF`, e.g. `PRRF20251250584` / "15872 Delaplata LN,
Naples" / declared_value **$56,812** / issued 2026-04-14.

### Live re-verification, today, 08/12/2026 — the source page and file are both live now

The task asked to fetch the source live, not just trust the loaded sample. I did:

1. **crawl4ai fetched** `https://www.collier.gov/Business-Resources/Building-Permits-Construction/
   Meetings-Advisory-Boards-Reports/Monthly-Building-Permit-Reports` — page loads clean, and the
   Issued/Applied file table is live with a **June 2026** row as the newest: `2026-6-issued.xlsx`
   (964KB) at `https://www.collier.gov/files/content/county/v/65/business-resources/
   building-permits-construction/meetings-advisory-boards-reports/monthly-building-permit-reports/
   2026-6-issued.xlsx`.
2. **Downloaded that file directly** (HTTP 200, 986,866 bytes) and parsed it with `openpyxl`.
   **Columns match the already-loaded table's 23-column shape exactly**: `Permit Number, Declared
   Value, Building Type, Permit Class, Permit Type Desc, Permit Status, Site Address, Property ID,
   Date Issued, Date Applied, Total SF, Total Units, Const Type, Owner Name, City, State, Zip,
   Contractor Type, License Number, Contractor Name, City 1, State 1, Zip 1`.
3. **5,505 data rows** in the June 2026 file. `Permit Type Desc = 'Reroof'` exactly: **337 rows
   (6.1%)** — matching the April rate almost exactly. `Declared Value` populated (non-null,
   non-zero) on **5,188 of 5,505 rows (94.2%)** — a real dollar figure on nearly every permit,
   unlike either Step 0 or Step 1.

**Answer to the task's exact question: yes, the county's own current XLSX identifies roof permits
cleanly (`Permit Type Desc = 'Reroof'`) with a site address, and carries a dollar value on 94% of
rows.** No records request is needed to get this — the county already publishes it monthly, in a
structured format, for free, and we already wrote the pipeline to consume it.

### The one real gap: the join key, not the data

- **`Site Address` has no ZIP in it** (`"4410 Lakewood BLVD, Naples"`) — the `Zip`/`Zip 1` columns
  in the file are the **owner's** and **contractor's** zip, not the site's. This is exactly why the
  already-loaded table's `zip_code` column is null on every sampled row despite `lat`/`lon` being
  populated (the pipeline geocodes but doesn't reverse-derive a site zip).
- This means Collier permits **cannot** produce the `STREETNOSPACE:ZIP` key format that
  `steadyapi_property_permits.address_key` and `listing_state.address_key` both use. A join needs
  street+city normalization (`canonStreet`/`looseAddressKey`, already in the codebase) or a
  lat/lon-based match — either is real work, not a records-request problem.
- **State the caveat plainly, per `data-roots.md`'s own precedent:** address-based joins in this
  codebase have measured as low as 0/360 (Marco Island). Any claimed Collier permit↔listing match
  rate needs its own live measurement before being trusted, not an assumption of success.

### Why the pipeline is parked (and why that's the real blocker, not data availability)

`ingest/cadence_registry.yaml`: `collier_permits` has `dispatch_only: true` with the comment "cron
deliberately commented out (pending a dry-run probe of the crawl4ai port proving out on
lee_permits first) — no schedule fires; a stated fact, not a gap." **The blocker was never "can we
get this data" — I just proved live, today, that we can, cleanly, with roof identification and a
dollar value.** The blocker is an unrun operational dry-run probe on an already-written pipeline.

---

## Recommendation on the open check `collier_permit_roof_age_request`

**Not simply close it — re-point it.** The check was opened 08/11/2026 presumably on the assumption
that Collier roof-permit data might require a county records request. That assumption is now
disproven with live evidence: the county publishes exactly this data monthly, free, structured,
with roof permits cleanly identifiable and a dollar value on 94% of rows, and we already wrote a
pipeline for it. **No records request is needed.** The real remaining work is operational — running
the dry-run probe that's been pending on `collier-permits-monthly.yml` since before 05/27/2026, and
solving the site-address→ZIP join gap. I'm not running `check.mjs close/open` myself per the task's
instruction (records-request-adjacent decisions stay with the operator); this paragraph is the
recommendation for that session to action.

---

## Sources, verbatim, all fetched live 08/12/2026 unless noted

- `_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md` (read in full, prior
  session's probe, 08/02/2026 — the "still unbuilt" claim it makes about `building_permits[]` is
  now stale, corrected above)
- `docs/sql/20260804_steadyapi_property_permits_v.sql` (view definition + comment, 08/04/2026)
- `migrations/20260802_steadyapi_property_history_raw.sql`
- `lib/listings/property-permits.ts` (existing TS consumer, already built)
- `data_lake.steadyapi_property_permits` — live PostgREST queries, 08/12/2026
- `data_lake.lee_building_permits` — live PostgREST queries, 08/12/2026
- `data_lake.collier_building_permits` — live PostgREST queries, 08/12/2026
- `ingest/cadence_registry.yaml` — `lee_permits` and `collier_permits` entries
- `ingest/pipelines/lee_permits/buckets.py` (classifier, read in full)
- `https://www.collier.gov/Business-Resources/Building-Permits-Construction/
  Meetings-Advisory-Boards-Reports/Monthly-Building-Permit-Reports` — crawl4ai fetch, 08/12/2026
- `https://www.collier.gov/files/content/county/v/65/business-resources/
  building-permits-construction/meetings-advisory-boards-reports/monthly-building-permit-reports/
  2026-6-issued.xlsx` — direct download + `openpyxl` parse, 08/12/2026
- `docs/standards/data-roots.md` — SteadyAPI raw-landings section (scope law, open duplicate check)
- `ingest/pipelines/listing_lifecycle/distill.py` — `_ENRICH_ONLY_COLS` (read in full)
