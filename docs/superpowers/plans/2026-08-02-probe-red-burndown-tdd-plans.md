# Probe-red burn-down — TDD plans for every remaining item

Written 08/02/2026 after the daily-probe triage (SESSION_LOG same date; commits 2650a4aa..919aa8d0
already shipped 7 direct fixes, doctor 10 red -> 7 red live). This doc is the execution plan for
what remains. Every plan follows the locked TDD rule: the failing test is written FIRST and named
after the failure mode it kills. Items that CANNOT be fixed or wired now are NOT here — they live
as PARKED checks in the ledger (the ops page renders open checks), each carrying its reason
inline. One place to read: the checks list, filtered to `parked_`.

Operator decisions encoded here (08/02/2026): baths flow to the email builder from every lane we
hold, joined via folio / property id where SteadyAPI lacks them; proxy research is DEFERRED until
most things run correctly; parked items must be findable on the ops page with their reason.

---

## P1 — Baths to the email builder (THE priority item)

**Live evidence (08/02):** `listing_state` active-sale baths coverage: Lee 2,961/22,019 (13%),
Collier 1,325/7,277 (18%), Hendry 527/1,359. Baths were 34,139/34,478 on 07/26 and were WIPED by
the sweep upsert's blanket EXCLUDED overwrite (documented in
`docs/superpowers/handoffs/2026-08-02-steadyapi-dom-full-scope-handoff.md` §5). The COALESCE
guard (`_ENRICH_ONLY_COLS`, commit 51fc9950) now protects refills. The email builder already
renders baths when present (`lib/email/listing-flyer.ts:138`) and already has a build-time vendor
fallback (`lib/listings/resolve-subject.ts:373-391`, /nearby-home-values, verified 07/13).

Three lanes, in cost order:

### P1a — Re-run the existing baths backfill (SteadyAPI lane) — READY NOW
- Tool exists and is tested: `ingest/pipelines/listing_lifecycle/backfill_baths.py`
  (+ `test_backfill_baths.py`). Narrow `UPDATE ... WHERE baths IS NULL` — cannot re-wipe.
- Dry run 08/02: `targets=20682 clusters=616 max_calls=1000` — one run covers every cluster,
  616 calls against the 50k/mo vendor quota.
- **Sequencing constraint:** the DOM backfill (parallel session, `backfill-dom` log) is running
  against the same 1 req/s vendor rate limit. Run baths AFTER it completes, never concurrently.
- Tests (already green in `test_backfill_baths.py` — re-run before + after):
  - existing suite proves clustering, dry-run zero-writes, and null-only updates.
  - ADD `test_backfill_never_overwrites_nonnull_baths` if not present verbatim — the wipe's
    inverse is the failure mode.
- DONE = live SQL shows active-sale baths coverage >= 90% of rows whose cluster was probed,
  and the next nightly sweep does NOT reduce the count (proves the COALESCE guard held).

### P1b — LeePA layer-23 fallback for Lee (folio join lane) — free, closes the residue
- The ONLY Lee surface holding beds/baths (`data-roots.md:44`): `data_lake.leepa_comparable_sales`,
  108,848 rows live, 75,746 with bedrooms>0, joins `leepa_parcels` on `folioid` at 98.9%.
- `listing_state` has `property_id` (vendor id) but NO folio — the bridge is the normalized
  site-address key (`address_key`), the same machinery named in check
  `ingest_parcel_year_built_join` and used by `lib/listings/community-lookup.ts`.
- **Step 0 (blocking):** resolve check `comps_commercial_contamination` — add the sanity ceiling
  (drop/flag rows failing `bathrooms BETWEEN 1 AND 10` or non-residential `dor_uc`) BEFORE any
  serving path reads these columns. Test first:
  `test_comp_view_excludes_commercial_bath_counts` (fixture: the real "1 bed / 389 baths" row).
- Step 1: extend `lee_comp_sales_v` (`docs/sql/20260722_lee_comp_sales_view.sql`) with a
  `LEFT JOIN LATERAL` picking latest bedrooms/bathrooms per folioid.
  Test: `test_lee_comp_view_carries_beds_baths_for_known_folio` (folio with live-verified 3/3.0).
- Step 2: subject-level fallback in the email path — in `lib/listings/resolve-subject.ts`, after
  the lake read and BEFORE the paid vendor fallback, match subject address_key -> LeePA
  address-derived key; fill baths only when exactly one parcel matches.
  Tests, failure-mode-named:
  - `test_baths_fallback_fills_from_leepa_on_unique_address_match`
  - `test_baths_fallback_stays_absent_on_ambiguous_match` (two folios, one key — NEVER guess)
  - `test_baths_fallback_never_overwrites_vendor_value` (lane order is a provenance rule)
  - `test_missing_baths_renders_no_cell_not_zero` (no-invention lint twin; cell drops, never fakes)
- Match-rate is MEASURED and reported, never assumed (Marco Island 0/360 precedent —
  `data-roots.md` coverage law). A low Lee match-rate is a reported fact, not a blocker.
- Collier residue: FDOR carries no beds/baths; SteadyAPI (P1a) is Collier's only lane. Stated
  here so nobody "fixes" Collier from a parcel table that doesn't hold the field.

### P1c — comp-ranking beds/baths scoring (already-built consumer) — rides P1b
- `lib/assistant/comp-rank.ts` W_BEDS scoring exists and waits; `comp-source-lake.ts:119-120`
  hardcodes nulls. After P1b Step 1, read the real columns.
  Tests: extend `comp-source-lake.test.ts` + `comp-rank.test.ts` fixtures for non-null beds/baths.
- This also satisfies the brain-first consumer question for `leepa_comp_sales` (the live answer
  engine is the consumer; registry `consuming_pack` note updated in the same commit).

---

## P2 — listing_lifecycle red: the last content-contract error

- 24 rows under the $20k floor; authority view already excludes all of them from every served
  median. Two named sub-items:
- **P2a — desk floor bypass (check `desk_raw_listing_state_price_floor_bypass`):** repoint
  `loadNotableCuts` + `countActiveFlag` (`lib/desk/loaders.ts:377-390,442-472`) at
  `listing_active_homes` (or add `.gte("list_price", 20000)`).
  Tests first: `test_notable_cuts_never_surface_sub_floor_prices` (fixture: the live $6,000 /
  $2,500-cut row), `test_new_listing_count_excludes_sub_floor_rows`.
- **P2b — Marco cluster classification (check `marco_condo_price_cluster_unverified`):** live
  SteadyAPI probe of one property_id (e.g. 9403897752) to classify the 9-row $6-10k Collier condo
  cluster: fractional/timeshare type-filter leak vs rent-as-sale. THEN the fix is data-driven:
  type leak -> extend the contract's property_type filter; rent leak -> flag rows, port the
  `active_listings/distill.py` rent-floor pattern as a NON-destructive `flag_price_suspect`.
  Test named after whichever failure mode the probe proves. No code before the probe.

---

## P3 — fgcu_reri parser regression (check `fgcu_reri_home_prices_range_parse_regression`)

- Floor already corrected 16->7 (shipped). Remaining: the range-sentence parser branch.
- Tests FIRST in the pipeline's test file, from the live July page's real sentence:
  - `test_range_phrasing_parses_low_and_high_rows` ("Up between 1.3 and 10.2 percent ..."
    -> two rows, `_range_low`/`_range_high`, no invented average)
  - `test_per_county_phrasing_still_parses` (May's real 3-county sentence — format alternates)
  - `test_missing_indicator_fails_loud` (any of the 8 labels parsing to zero rows -> stderr/raise,
    never a silent-partial GREEN — the failure mode that hid this for two months)
- Then: registry floor 7 -> 9 in the SAME commit the parser lands. Verify with the pipeline's
  `--dry-run` against the live page before merge.

---

## P4 — leepa_comp_sales doctor line: freshness=MISSING artifact

- Table is live (108,848 rows) but doctor reads no load record — the 07/22 load was local.
- Plan: diagnose which ledger doctor's freshness read expects (`_dlt_loads` schema_name mismatch
  vs missing row), then EITHER record the local load's real timestamp in the expected ledger
  (with its true 07/22 date — never a fabricated freshness) OR teach the registry entry the
  same `dispatch_only`-style shape lee_parcels now has. Test first:
  `test_locally_loaded_table_reads_fresh_not_missing` in the freshness suite, fixture mirroring
  the real leepa_comp_sales ledger state.
- DONE = doctor line goes red -> green with NO change to the actual data.

---

## P5 — timeout-raise verification (check `timeout_raises_live_verify`)

- fema-nfip (45->90) and dbpr-re-licensees (15->45) both accept `workflow_dispatch`, which
  bypasses the ENGINE_ENABLED job guard — they can be verified NOW without waiting for the
  kill-switch re-enable: one manual dispatch each, watch to completion, confirm rows land
  (fema: dlt merge; dbpr: ~15k licensees vs the 0-row kills).
- No new tests — the "test" is the run itself; the check closes on run URLs + row counts.
- neighborhood-stats already verified GREEN today (run 30765299583, 20,400 rows, floor
  rebaselined) — its slice of the check is closable now.

---

## PARKED — visible on the ops page, one reason each (operator decree 08/02)

These carry `parked_`-prefixed checks in the ledger so the ops page shows them with reasons.
NOT plan items; nothing here is being built now.

- `parked_crexi_restore_pending_proxy_research` — crexi ingest stays dark. Reason: the shared-pool
  residential proxy already failed Cloudflare within 2 weeks (07/12 run log proves proxy was
  active), the "self-hosted runner" was never real (run IDs 404, empty runner dir), and the
  operator deferred proxy research until the platform runs green (08/02). Interim: brevitas is
  the thin floor; stale crexi rows quarantined via check
  `cre_active_listings_no_expiry_stale_available`.
- `parked_dbpr_sirs_monthly_local_pull` — SIRS stays off GHA. Reason: DBPR's WAF drops datacenter
  IPs; operator-blessed fallback (06/22, reaffirmed by the 08/02 brief) is a monthly local run;
  non-critical master input with a confirmed vendor ceiling. Next local pull due before 08/21
  (30d x 2.0 tolerance from 06/22 data).
- ENGINE_ENABLED=false — NOT parked by this effort: it is the SteadyAPI raw-landing Step-5
  re-enable, owed by that workstream (its own handoff §4). Named here only so nobody reads the
  dark crons as new breakage.
