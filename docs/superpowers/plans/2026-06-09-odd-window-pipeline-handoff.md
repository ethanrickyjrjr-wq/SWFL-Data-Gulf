# ODD-Window Pipeline Handoff — 2026-06-09

Status of all 7 CRE / local-context pipelines after this session. Three tiers:
**Trigger to activate**, **Code work needed**, and **Blocked / parked**.

---

## Tier 1 — Trigger to activate (pipeline + data ready, just needs first GHA run)

### crexi_listings
**What it does:** Weekly Firecrawl agent scrape of Crexi for active CRE lease listings in Estero (33928) and Fort Myers Beach (33931). Fills the MarketBeat coverage gap in these two submarkets.

**Status:** Table exists (`data_lake.active_listings_cre`). Pipeline complete (`ingest/pipelines/crexi_listings/`). GHA workflow exists (`ingest-crexi-listings.yml`, weekly Sunday 11:00 UTC). Never run.

**To activate:**
1. Go to GitHub Actions → `ingest-crexi-listings` → Run workflow.
   - Leave corridor blank (runs both cities).
   - Run with `dry_run: true` first to confirm Firecrawl agent returns rows.
   - If rows return, re-run with `dry_run: false`.
2. Verify rows in Supabase: `SELECT count(*), city FROM data_lake.active_listings_cre GROUP BY city`.
3. Remove `probe_mode: odd_window` from `ingest/cadence_registry.yaml` entry → graduate to normal weekly probe.

**Known risk:** Crexi uses heavy JS rendering. The Firecrawl `/v2/agent` mode handles it, but the site may change selectors. If the agent returns 0 rows, check the Firecrawl agent logs and update the prompt in `extract.py`. `FIRECRAWL_API_KEY` is already in GH secrets.

---

### lee_associates_swfl
**What it does:** Quarterly PDF extraction of Fort Myers market reports (Office, Retail, Industrial, Multifamily) from Lee & Associates. Writes to `data_lake.marketbeat_swfl`.

**Status:** 20 rows already in DB (Q1-2025 thru Q1-2026, manually loaded 2026-06-09). Pipeline fully implemented. GHA workflow exists (`ingest-lee-associates-swfl.yml`, quarterly 20th of Feb/May/Aug/Nov).

**Q1-2026 snapshot:** Office 6.05% vacancy / $27.74 NNN. Retail 3.60% / $23.07 NNN. Industrial 9.01% / $12.20 NNN. Multifamily 17.2% / $1,689/unit.

**To activate:**
1. Go to GitHub Actions → `ingest-lee-associates-swfl` → Run workflow.
   - Set `year: 2026`, `quarter: 1`, `dry_run: true`.
   - Confirm output shows 20 rows extracted with correct values.
   - Re-run with `dry_run: false` (will upsert, no new rows since data already exists).
2. Remove `probe_mode: odd_window` from cadence registry entry.
3. The quarterly schedule will auto-run from here. Next real new data: Q2-2026 (~Aug 20).

**Note:** URL pattern is `lee-associates.com/wp-content/uploads/{yyyy}/{mm:02d}/{yyyy}-Q{q}-Fort-Myers-FL-{sector}.pdf`. If Lee changes their upload path for a future quarter, update `URL_TEMPLATE` in `extract.py` and the `--month` default mapping in `pipeline.py`.

---

## Tier 2 — Code work needed before the data is useful

### mhs_permits_swfl
**What it does:** Annual extraction of commercial permit data from the MHS (Maxwell Hendry & Simmons) SWFL Data Book PDF. One row per permit project (date, asset class, address, name, permit value, building SF).

**Status:** 281 rows loaded for 2025 calendar year (12 jurisdictions). Pipeline complete. GHA exists (`ingest-mhs-permits-swfl.yml`, annual Mar 20). Data is IN the lake but NOT wired to any brain yet.

**What's blocking graduation:**
1. **Jurisdiction → submarket crosswalk.** Rows use raw PDF text like `"Unincorporated Lee County"`, `"City of Cape Coral"`, `"City of Naples"`. The lake needs a mapping table (or inline dict) that resolves these to submarket slugs (`lee-county`, `cape-coral`, `naples`, etc.) before brain consumption. Without this, every `GROUP BY submarket` query produces garbage.
2. **Consumer brain.** Which brain reads `mhs_permits_swfl`? The natural home is a future `permits-commercial-swfl` leaf brain (or a new `construction-pipeline-swfl` brain). Do NOT blend into `permits-swfl` (that's residential Lee County permit data — different source, different jurisdictions, different schema).

**Steps to graduate:**
1. Create migration: `data_lake.mhs_jurisdiction_xwalk` table — columns: `raw_jurisdiction TEXT PK`, `submarket_slug TEXT`, `county TEXT`. Seed the 12 known jurisdictions (see below).
2. Wire in `extract.py`: after `_detect_jurisdiction()`, apply the crosswalk to add a `submarket_slug` column to each row. Or add a `submarket` column to `mhs_permits_swfl` and populate via UPDATE after load.
3. Build a `permits-commercial-swfl` pack that reads from `mhs_permits_swfl` via `mcp__lake__query_lake`.
4. Remove `probe_mode: odd_window` from cadence registry.

**Known 12 jurisdictions → suggested slug mapping:**
```
Unincorporated Lee County      → lee-county-unincorp
City of Cape Coral             → cape-coral
City of Fort Myers             → fort-myers
City of Bonita Springs         → bonita-springs
City of Sanibel                → sanibel
Town of Fort Myers Beach       → fort-myers-beach
Estero                         → estero
Unincorporated Collier         → collier-county-unincorp
City of Naples                 → naples
City of Marco Island           → marco-island
Unincorporated Charlotte County → charlotte-county-unincorp
City of Punta Gorda            → punta-gorda
```

**Next annual drop:** MHS 2027 Data Book (~March 2027). `first_expected_by: 2027-03-13`. Run `python -m ingest.pipelines.mhs_permits_swfl.pipeline --url <new-url> --year 2026` when it publishes.

---

## Tier 3 — Parked / blocked on external source

### estero_edc + fmb_recovery
**Status:** LIVE. 6 + 8 rows in `data_lake.local_cre_context`. GHA running monthly (`ingest-local-cre-context.yml`). These are seed-based — the pipeline re-upserts the same rows on each run (touching `_ingested_at` to keep the probe green).

**To improve over time:** When estero-fl.gov or FMB announces new projects, add new rows to `SEED_ROWS` in the respective `pipeline.py` and redeploy. The pipeline does a live check on FMB's Projects-Around-Town page (works, 200 OK). For Estero: their site returns Cloudflare 526 — the seed rows are the authoritative source until they fix their CDN.

**To wire into a brain:** `local_cre_context` rows belong in `cre-swfl`'s `caveats[]` array — contextual color on the Estero / FMB submarket picture. Implementation: in the `cre-swfl` pack, add a `mcp__lake__query_lake` call for `local_cre_context WHERE city IN ('Estero','Fort Myers Beach')` and fold the top rows into the narrative caveats.

---

### premier_commercial_swfl
**Status:** DEAD END. `premcomm.com` is a brokerage-only landing page — no market reports, no downloadable PDFs, no structured vacancy/rent/absorption data published anywhere on the site. Verified 2026-06-09. Stub pipeline exits 1.

**If this unblocks:** Premier Commercial may publish reports through a third-party platform (CoStar, CBRE Exchange). If a URL surfaces, implement `extract.py` using the same pdfplumber pattern as `lee_associates_swfl/extract.py` and update the cadence registry note.

---

### svn_florida_swfl
**Status:** TRANSACTION NEWS ONLY. `svncp.com` publishes individual deal press releases (sale price, buyer/seller, square footage) — not structured market stat surveys. No vacancy/rent/absorption tables exist on the site. Verified 2026-06-09. Stub exits 1.

**Potential future use:** SVN deal announcements are rich SWFL investment sales data. If deal-level sale comps are valuable (e.g., to validate `sale_price_psf` in `marketbeat_swfl`), wire to a separate table like `data_lake.cre_transactions_swfl`. The pipeline would use Spider/Firecrawl to scrape the news feed and parse deal rows. This is a distinct feature from the market survey data.

---

## Summary checklist

| Pipeline | Status | Action |
|---|---|---|
| `crexi_listings` | Ready — never run | Trigger GHA manually, verify rows, graduate |
| `lee_associates_swfl` | Ready — data loaded | Trigger GHA dry-run, verify, graduate |
| `mhs_permits_swfl` | Loaded — needs wiring | Jurisdiction crosswalk + consumer brain |
| `estero_edc` | Live (seed) | Wire into cre-swfl caveats[] |
| `fmb_recovery` | Live (seed) | Wire into cre-swfl caveats[] |
| `premier_commercial_swfl` | Dead end | Park until report URL found |
| `svn_florida_swfl` | Dead end for surveys | Consider deal-comps table if valuable |
