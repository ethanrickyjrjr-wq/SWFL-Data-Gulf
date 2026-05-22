# lee_permits ingest

Lee County Accela building permits → Tier 2 Postgres via Firecrawl + dlt.

## Live run

1. Confirm `FIRECRAWL_API_KEY` in `.env` (invoke `firecrawl-build-onboarding` if missing).
2. Confirm `SUPABASE_PG_*` creds in `.dlt/secrets.toml`.
3. Run the DDL: `docs/sql/20260522_lee_building_permits.sql` (manual paste into Supabase SQL editor).
4. Run: `python -m ingest.pipelines.lee_permits.pipeline --start 2023-01-01 --end <today>`

## Firecrawl interact recipe (confirmed 2026-05-22)

The Accela portal uses ASP.NET viewstate; a static `/scrape` call won't submit
the date-range form. The working recipe uses `/interact` (Playwright/Node).

**Session flow:**

1. `scrape_url(ACCELA_SEARCH_URL)` → starts browser session, yields `scrape_id` as `job_id`.
2. Fill + submit:
   ```javascript
   await page.fill('input[id*="txtFromDate"]', "MM/DD/YYYY");
   await page.fill('input[id*="txtToDate"]', "MM/DD/YYYY");
   await page.click('input[id*="btnSearch"], input[value="Search"]');
   await page.waitForSelector("table.ACA_GridView", { timeout: 30000 });
   ```
3. Extract HTML per page: `return await global.page.content();`
4. Paginate:
   ```javascript
   const pager = await page.$(
     ".ACA_Pager_Style td:last-child a, .ACA_SmLabel a:last-child",
   );
   if (!pager) return "done";
   const txt = await pager.innerText();
   if (!txt.includes(">") && !txt.toLowerCase().includes("next")) return "done";
   await pager.click();
   await page.waitForSelector("table.ACA_GridView", { timeout: 15000 });
   return "more";
   ```
5. `stop_interaction(job_id)` in `finally` block.

**Confirmed selectors (against live portal):**

- Result table: `table.ACA_GridView` / `#ctl00_PlaceHolderMain_CapView_gdvPermitList`
- Column order: `[select, permit_id, permit_type, status, address, issued_date]`
- Pager next link: `.ACA_Pager_Style td:last-child a` (text contains `>`)

Implementation lives in `scraper.py:fetch_permit_pages`.

## Schema

See `docs/sql/20260522_lee_building_permits.sql`.

## Notes

- Permit-type → 5-bucket classification lives in `buckets.py` (pure function, fully tested).
- Detail-page lat/lon enrichment is OPTIONAL in v1; if Accela list view doesn't
  surface coordinates, the corridor-assignment step in the brain falls back to
  ZIP-centroid + nearest-corridor heuristic (documented in pack header).
