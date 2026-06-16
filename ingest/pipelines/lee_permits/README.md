# lee_permits ingest

Lee County Accela building permits → Tier 2 Postgres via crawl4ai + dlt.

## Live run

1. Confirm `DESTINATION__POSTGRES__CREDENTIALS` in `.dlt/secrets.toml`.
2. Install deps: `pip install -r ingest/requirements.txt && python -m patchright install chromium`.
3. Run the DDL: `docs/sql/20260522_lee_building_permits.sql` (manual paste into Supabase SQL editor).
4. Run:
   ```
   python -m ingest.pipelines.lee_permits.pipeline --start 2026-06-09 --end 2026-06-16
   ```
   Add `--dry-run` to fetch and parse only (skip dlt write).

Production runs via GHA: `gh workflow run lee-permits-weekly.yml` (cron: Mondays 07:00 ET).

## crawl4ai scrape recipe (confirmed against live portal 2026-06-16)

The Accela portal is an Angular SPA (`ng-app="appAca"`) — the date-range
form is rendered client-side. The working recipe uses **crawl4ai 0.8.9 with
`UndetectedAdapter`** to drive a real Chromium session that fills the date
inputs, clicks submit, and paginates through the result grid.

**Confirmed against live portal 2026-06-16 (GHA datacenter IP, 11 pages, 94 rows):**

- Real host: `aca-prod.accela.com/LEECO/` (the vanity `aca.leegov.com` 302s here; `accela.leegov.com` is NXDOMAIN — the prior recipe pointed at a dead hostname).
- Module: `?module=Permitting&TabName=Permitting` (Lee's instance does NOT have a `module=Building`).
- Form inputs: `input[id$="txtGSStartDate"]` / `input[id$="txtGSEndDate"]`.
- Search submit: `#ctl00_PlaceHolderMain_btnNewSearch` (NOT `btnSearch` — that selector is ambiguous between submit and history).
- Result grid: `<table id*="gdvPermitList" class="ACA_GridView ...">`.
- Column order (0-indexed): `[_, Record Number, Address, Description, Status, Action, Related Records, Submittal Type, _]` — **no issued-date column on the list view**.

Implementation lives in `scraper.py:fetch_permit_pages`.

## Known limitations

- **Detail page 429s.** The Accela CapDetail pages rate-limit concurrent fetches (`concurrency=5`). Affected rows land with `permit_type_raw=NULL` and `declared_value_usd=NULL`; subsequent weekly runs re-merge and fill them if the permit re-appears in the window.
- **Date filter is inert.** The Accela General Search date range does not filter pre-2026 history — queries always return current active permits regardless of start date. History before 2026 is not loadable from this portal (check `lee_permits_history_source`).
- **`26TMP-*` temporary applications are filtered out** at parse time.

## Schema

See `docs/sql/20260522_lee_building_permits.sql`.

## Notes

- Permit-type → 5-bucket classification lives in `buckets.py` (pure function, fully tested). v1 has no `permit_type_raw`; classification falls back to description-only.
- Detail-page lat/lon enrichment is NOT in v1; corridor-assignment in the brain falls back to ZIP-centroid + nearest-corridor heuristic (documented in pack header).
