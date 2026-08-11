# P4 — 13 UNMAPPED-TABLE GAP-FILL (data-roots.md completeness)

**Stream:** P4-unmapped-tables · **Date:** 2026-07-18 · **Author:** Opus (subagent)
**Scope:** the exact 13 tables the verify-1 pass named as absent from `docs/standards/data-roots.md`.
This is FILL-IN of that enumerated list, not discovery. Every row-count/column-count below was
re-probed live today via `mcp__lake__query_lake` (DuckDB→`pg.data_lake.*`); every reader is a
grep-confirmed `file:line`. Claims I merely inherited from the handoff and did NOT re-verify are
labeled "unverified (handoff)".

---

## Live probe — all 13 confirmed present (2026-07-18)

Source: `pg.information_schema.tables` + `pg.information_schema.columns` + live `count(*)`.

| # | table | object | rows | cols | classification | registry status |
|---|---|---|---|---|---|---|
| 1 | community_profiles | BASE TABLE | **0** | 27 | root (Tier-2, backbone not landed) | **UNTRACKED** (no entry) |
| 2 | cre_figures | BASE TABLE | **1,078** | 12 | root (derived), zero-consumer | **UNTRACKED** (no entry) |
| 3 | cre_figures_confidence | BASE TABLE | **985** | 12 | root (derived), zero-consumer | **UNTRACKED** (no entry) |
| 4 | dbhydro_stations | BASE TABLE | **12,937** | 14 | coverage-exempt (dead-and-tracked) | exempt: `defunct_source` |
| 5 | fdot_aadt_swfl_yearly | VIEW | **3,655** | 9 | dead-orphan view | none (view) |
| 6 | fema_nfip_claims_swfl | VIEW | **89,504** | 16 | dead-orphan view | none (view) |
| 7 | geo_anchor_cache | BASE TABLE | **42** | 8 | coverage-exempt (runtime cache) | exempt: `runtime_cache` |
| 8 | source_totals | BASE TABLE | **12** | 6 | coverage-exempt (derived telemetry) | exempt: `derived_signal_write_back` |
| 9 | user_mls_listings | BASE TABLE | **0** | 15 | coverage-exempt (client upload) | exempt: `client_upload_surface` |
| 10 | user_mls_stats | BASE TABLE | **0** | 10 | coverage-exempt (client upload) | exempt: `client_upload_surface` |
| 11 | usgs_caloosahatchee_stage_latest | VIEW | **1** | 3 | dead-orphan view | none (view) |
| 12 | view_vintages | BASE TABLE | **1,357** | 6 | coverage-exempt (derived snapshot) | exempt: `derived_snapshot` |
| 13 | zori_pivoted | VIEW | **137** | 4 | rollup-view (chart display) | none (view over `zori_swfl`) |

**Classification tally:** 3 roots (all 3 UNTRACKED) · 5 coverage-exempt (all tracked) · 3 dead-orphan
views · 1 rollup-view · 1 rollup-view-serving-charts. The 3 genuinely-untracked ingests
(#1, #2, #3) are flagged at the bottom with ratification-ready registry-entry recommendations.

**Method note on "zero readers":** every reader below comes from a repo-wide `Grep` over
`.ts/.mts/.py/.sql/.tsx` excluding `*.md`. "Zero product readers" means no `.from()/.rpc()/parquet`
consumer in `lib/`, `app/`, `refinery/`, `components/`, `ingest/pipelines/`; matches in
`scripts/lake-probe.mts`, test fixtures, and doc/SESSION_LOG text are named explicitly and are NOT
product reads.

---

## The 13 catalog entries (drop-in for data-roots.md)

Each entry follows the file's body house style (`STATUS / ROOT / DATA WE GET / ROUTES / NOTES`). A
parallel session owns the actual `data-roots.md` edit — these are the paragraphs to paste. No
normative "X is THE authority" line is asserted; any consolidation recommendation is tagged
`[NEEDS-SIGN-OFF]`.

**Header deviation (intentional):** the catalog's headers are `### name · cadence X · lane Y`; the
`###` lines below instead carry `· lane · classification/UNTRACKED` because this deliverable's job is
to surface the gap-fill status, not to slot into a cadence band (5 of the 13 have no cadence band at
all — they're views or exempt caches). Each entry's NOTES names the real catalog home to paste into
(e.g. "add to the `zori_swfl_tier2` entry", "add alongside `neighborhood_stats`"). Restore the
`· cadence · lane` header form on paste.

**Axis note (heads off a "root but exempt?" contradiction):** for the derived tables, *architectural
role* (root / raw-base / view) and *ingest-coverage accounting* (`pipelines` vs `coverage_exempt`) are
ORTHOGONAL axes. A derived table can BE a root (a registered read target consumers point at) AND be
`coverage_exempt` (because it's computed from an already-tracked source, not a vendor pull) — exactly
how `source_totals` and `view_vintages` already sit. So "root (derived)" in the table above and a
`coverage_exempt: derived_signal` recommendation in #B are not in conflict.

---

### 1. community_profiles · lane tier-2 · **UNTRACKED**
- **STATUS:** live-schema / **empty** — table exists (`BASE TABLE`, 27 cols) but **0 rows** today; the
  Phase-1/2/3 marketed-community backbone has not landed. Its own consuming pack emits the empty
  message "the Phase-1/2/3 backbone has not landed" (`refinery/packs/communities-swfl.mts:94`).
- **ROOT:** IS a root — Tier-2 catalog of ~300 marketed golf/gated communities (golf/fee/amenity from
  named-web sources; drive-time + nearby counts from Mapbox — each cell carries provenance). Sibling of
  the Tier-1 `neighborhood_stats` parcel-name-join backbone; the two together feed the `communities-swfl`
  brain. Migration `migrations/20260706_community_profiles.sql`.
- **DATA WE GET:** nothing yet (0 rows). Intended per-community columns per migration: county, golf/fee/
  amenity fields, drive-times, nearby counts, per-cell provenance.
- **ROUTES (source → brain → surfaces):**
  - Brain source connector: `refinery/sources/communities-swfl-source.mts:42` (`COMMUNITY_TABLE =
    "community_profiles"`), read at `:258` via `readTable(COMMUNITY_TABLE)` → `communities-swfl` pack.
  - Direct drill page (bypasses brain): `app/r/communities-swfl/communities.ts:129`
    (`db.schema("data_lake").from("community_profiles").select("*")`, `fetchCommunityProfiles()`) — same
    dual-read pattern the catalog already blesses for `neighborhood_stats` at this same file.
  - Source-page registry metadata: `app/r/source/_tables.ts:53`.
  - No pipeline, no cron, no writer — the scrape does not exist yet.
- **NOTES:** Genuine untracked-ingest gap, known internally via check `communities_tables_zero_coverage`
  but never carried into either the catalog OR the registry (`cadence_registry.yaml:2218` is a *comment*
  naming it a "REAL gap deliberately NOT exempted", not an entry). Add alongside `neighborhood_stats` in
  the value-parcels section. **Untracked → see registry recommendation #A.**

---

### 2. cre_figures · lane tier-2 (derived) · **UNTRACKED**
- **STATUS:** live / **zero-consumer** — table built **today** (`migrations/20260718_cre_figures.sql`),
  materialized with **1,078 rows** (12 cols). No brain, page, chart, email, or master edge reads it
  yet — grep for `cre_figures` across `.ts/.mts` hits only the migration and the writer script.
- **ROOT:** IS a root (DERIVED, not a raw vendor ingest) — per-firm normalized CRE figures
  (vacancy / asking-rent / absorption / cap-rate / sale-$psf), one row per
  `(canonical_submarket, sector, quarter, metric, source_firm)`, computed in TypeScript
  (`refinery/lib/derived/cre-figures.mts` `normalizeMarketbeat` + `cre-corroboration.mts`) from the
  already-tracked `data_lake.marketbeat_swfl` (all 4 firms: cw_marketbeat / colliers_industrial /
  mhs_databook / lee_associates). Carries a `fanned boolean` column
  (`20260718_cre_figures.sql:50`). Grain index `(sector, quarter, metric)`.
- **DATA WE GET:** 1,078 normalized figure rows. Writer: `scripts/build-cre-figures.mjs`
  (DELETE+INSERT full refresh, `:116-119`).
- **ROUTES:** writer `scripts/build-cre-figures.mjs` → `data_lake.cre_figures`. **No consumer wired
  yet.** No cron workflow exists (`.github/workflows/*cre*` = only `ingest-local-cre-context` +
  `ingest-crexi-listings`, both unrelated) — the build script is run manually. Design/plan:
  `docs/superpowers/specs/2026-07-17-cre-figures-corroboration-design.md`,
  `docs/superpowers/plans/2026-07-18-cre-figures-corroboration.md`.
- **NOTES:** Per its design doc, this is the intended fix for the "verified=false gate drops 261 of 285
  marketbeat rows" problem the catalog's `marketbeat_swfl` / `colliers_industrial` /
  `lee_associates_swfl` entries describe; built same-day as the completeness audit, consumer repoint
  (into `cre-swfl`) is the design's next step and not yet done. **`[NEEDS-SIGN-OFF]`** — whether
  `cre_figures` should REPLACE the `marketbeat_swfl` direct-read as the CRE-figures authority is a C1/C2
  architecture call for the operator, NOT asserted here; I only report that the table exists, is derived
  from marketbeat, and has zero consumers today. **Untracked → see registry recommendation #B.**

---

### 3. cre_figures_confidence · lane tier-2 (derived) · **UNTRACKED**
- **STATUS:** live / **zero-consumer** — same migration as #2 (`migrations/20260718_cre_figures.sql:33`),
  **985 rows** (12 cols). No product reader (same grep result as #2).
- **ROOT:** IS a root (DERIVED) — tiered cross-firm corroboration layer over `cre_figures`:
  one row per `(canonical_submarket, sector, quarter, metric, tier)` with tier ∈
  {corroborated / flagged / single_source} + cross-firm spread + a `contributing_firms text[]` +
  `has_fanned_contributor boolean` (`20260718_cre_figures.sql:51`). Computed by
  `refinery/lib/derived/cre-corroboration.mts`. Grain index `(sector, quarter, tier)`.
- **DATA WE GET:** 985 confidence rows. Same writer/refresh as #2
  (`scripts/build-cre-figures.mjs:117,129`).
- **ROUTES:** writer only (`scripts/build-cre-figures.mjs`). No consumer, no cron.
- **NOTES:** The corroboration twin of `cre_figures`; both land and refresh together and both await the
  same consumer wiring. **Untracked → see registry recommendation #B (bundled with cre_figures).**

---

### 4. dbhydro_stations · lane tier-2 · coverage_exempt (`defunct_source`)
- **STATUS:** **dead-and-tracked** — 12,937 rows are a legacy artifact; no pipeline writes it, no
  product code reads it (grep: only doc/registry mentions). SFWMD DBHYDRO API decommissioned (OAuth
  wall on new REST).
- **ROOT:** not a root — decommissioned source's leftover table. Already accounted for in
  `cadence_registry.yaml:2192` `coverage_exempt: reason: defunct_source` (note at `:2116-2118`).
  History: `docs/API_BLUEPRINTS_DBHYDRO.md`.
- **DATA WE GET:** nothing new — frozen.
- **ROUTES:** none — zero readers, zero writers.
- **NOTES:** Deletion candidate on the same footing as the other corpses (no consumer), but it is
  correctly registry-tracked as exempt; the only gap was its absence from the catalog doc. Add as a
  one-line dead-and-tracked entry.

---

### 5. fdot_aadt_swfl_yearly · lane tier-2 (VIEW) · **dead-orphan**
- **STATUS:** **dead-orphan view** — 3,655 rows, but **zero product readers**. Only repo reference
  outside its own DDL is the diagnostic probe `scripts/lake-probe.mts:22`.
- **ROOT:** not a root — a `CREATE OR REPLACE VIEW` over the real base `data_lake.fdot_aadt_fl`
  (`docs/sql/fdot_aadt_swfl_yearly.sql:29,31` — `yearx AS year_ FROM data_lake.fdot_aadt_fl`). The
  live traffic brain reads `fdot_aadt_fl` DIRECTLY, not this view: `refinery/sources/fdot-source.mts`
  (`.select("yearx,…")`, `.eq("yearx", …)`) and `fdot-freight-source.mts`.
- **DATA WE GET:** nothing the base table doesn't already expose — it's a rename/filter convenience.
- **ROUTES:** none in product. (`fdot_aadt_county_year` is the documented, consumed view.)
- **NOTES:** Looks like a superseded/duplicate of the documented `fdot_aadt_county_year` view — dead
  weight, not a second live consumer. **[NEEDS-SIGN-OFF]** deletion candidate: guarded
  `DROP VIEW IF EXISTS data_lake.fdot_aadt_swfl_yearly;` — but only after confirming no out-of-repo
  (ops / analyst) reader, and NOT executed here (operator-gated, RULE 1).

---

### 6. fema_nfip_claims_swfl · lane tier-2 (VIEW) · **dead-orphan**
- **STATUS:** **dead-orphan view** — 89,504 rows, but **zero product readers**. The env brain's own
  source comment says the live path reads the base `fema_nfip_claims` table + `fema_nfip_county_year`
  view **directly, NOT** this convenience view: `refinery/sources/fema-nfip-source.mts:35` ("directly,
  not the convenience view at docs/sql/fema_nfip_claims_swfl.sql"). Only other hits are
  `scripts/lake-probe.mts:24` and two citation-string tests (`lib/welcome/grounded.test.ts:26`,
  `lib/citations/clean-url.test.ts:29`) which pass the *name string* to a pretty-printer — not data
  reads.
- **ROOT:** not a root — an analyst-convenience `CREATE VIEW` (`docs/sql/fema_nfip_claims_swfl.sql:26`;
  created by `ingest/scripts/migrate_nfip_flood_zone_current.py:21`) that widens NFIP claims across "the
  6-county set so an analyst running `SELECT *` gets SWFL out of the box"
  (`fema_nfip_claims_swfl.sql:14`).
- **DATA WE GET:** nothing new — a view over the documented `fema_nfip_claims` base.
- **ROUTES:** none in product.
- **NOTES:** Genuinely dead/unused convenience view. **[NEEDS-SIGN-OFF]** deletion candidate (guarded
  `DROP VIEW IF EXISTS`) OR keep as an explicitly-labeled analyst-only view; either way it belongs in
  the catalog as dead-orphan. Do NOT delete without confirming no analyst/ops dependency.

---

### 7. geo_anchor_cache · lane n/a · coverage_exempt (`runtime_cache`)
- **STATUS:** **live runtime cache** — 42 rows (8 cols). "0 new rows on a quiet day is CORRECT"
  (registry note).
- **ROOT:** not a root — geocode-ladder cache. Written/read by `ingest/lib/geo_ladder.py` (migration
  `migrations/20260710_pulse_geo.sql`); opportunistic inserts on pulse distills. Registry-tracked at
  `cadence_registry.yaml:2240` `coverage_exempt: reason: runtime_cache`.
- **DATA WE GET:** cached geocode anchors — internal plumbing, not a vendor dataset.
- **ROUTES:** `ingest/lib/geo_ladder.py` (writer + reader). No brain/page/chart/email.
- **NOTES:** Infrastructure cache; catalog entry is a one-liner cross-referencing the exempt reason. Not
  a deletion candidate (live plumbing).

---

### 8. source_totals · lane n/a · coverage_exempt (`derived_signal_write_back`)
- **STATUS:** **live derived telemetry** — 12 rows (6 cols).
- **ROOT:** not a root — `/census` source-ceiling snapshot ledger. Census audit tooling WRITES it
  (`migrations/20260707_source_totals.sql`); the **ops repo** reads "latest per pipeline_name" (renders
  on `/ops/census`). Registry-tracked at `cadence_registry.yaml:2224`
  `coverage_exempt: reason: derived_signal_write_back`.
- **DATA WE GET:** our own reconciliation snapshot (source ceiling vs pulled), not a vendor feed.
- **ROUTES:** written by census audit tooling; **no in-repo product reader** (consumer is the separate
  `swfldatagulf-ops` repo). No brain/page/chart/email in THIS repo.
- **NOTES:** Derived ops signal, correctly exempt; catalog entry is a one-liner. Not a deletion
  candidate.

---

### 9. user_mls_listings · lane n/a · coverage_exempt (`client_upload_surface`)
- **STATUS:** **live client-upload surface** — table exists, **0 rows** today (no client has synced;
  15 cols).
- **ROOT:** not a root and NOT a vendor ingest — client's own RESO/MLS Property records, stored in the
  `data_lake` namespace for isolation (migration `migrations/20260625_user_mls_data_lake.sql`).
  Registry-tracked at `cadence_registry.yaml:2232` `coverage_exempt: reason: client_upload_surface`.
- **DATA WE GET:** whatever a connected client uploads — user-owned, per-user, not platform data.
- **ROUTES:** writer `lib/reso/sync.ts:114,141`. Readers: `lib/reso/pull-zip-stats.ts:64`,
  `lib/reso/pull-agent-listings.ts:63`; delete on disconnect `app/api/mls/disconnect/route.ts:28`. No
  brain (no brain exists for user-owned data — correct by the client-data policy).
- **NOTES:** App-side client surface, correctly exempt. Add as a one-line entry noting it lives in the
  lake namespace for storage isolation, not because it's a vendor root. Not a deletion candidate.

---

### 10. user_mls_stats · lane n/a · coverage_exempt (`client_upload_surface`)
- **STATUS:** **live client-upload surface** — **0 rows** today (10 cols).
- **ROOT:** not a root — per-user ZIP-level aggregate OVER `user_mls_listings`, same writer/class
  (`migrations/20260625_user_mls_data_lake.sql:32`). Registry-tracked at
  `cadence_registry.yaml:2236` `coverage_exempt: reason: client_upload_surface`.
- **DATA WE GET:** computed per-user ZIP stats over the client's own listings.
- **ROUTES:** writer `lib/reso/*`; reader `lib/reso/pull-zip-stats.ts:89`; delete on disconnect
  `app/api/mls/disconnect/route.ts:34`.
- **NOTES:** Same class as #9; one-line dead-simple catalog entry. Not a deletion candidate.

---

### 11. usgs_caloosahatchee_stage_latest · lane tier-2 (VIEW) · **dead-orphan**
- **STATUS:** **dead-orphan view** — 1 row (3 cols), **zero product readers**. Repo-wide grep returns
  only the DDL (`docs/sql/20260623_usgs_caloosahatchee_stage_latest_view.sql:6`), its migration runner
  (`scripts/run-agg-migrations.py:32`), and SESSION_LOG/plan text.
- **ROOT:** not a root — a single-row "latest Caloosahatchee stage" view proposed by the 2026-06-23
  aggregate-at-source handoff that the live path **never adopted**. The env water brain reads
  `data_lake.usgs_daily` + `data_lake.usgs_sites` DIRECTLY:
  `refinery/sources/usgs-water-source.mts:32` (`DAILY_TABLE = "usgs_daily"`), `:33`
  (`SITES_TABLE = "usgs_sites"`), read at `:206` / `:224`. (`SESSION_LOG.md:15591` claims the live path
  queries this view — that is a stale plan note contradicted by the code; RULE 0.5 → code wins.)
- **DATA WE GET:** nothing consumed — the aggregate-at-source swap was designed but not wired.
- **ROUTES:** none in product.
- **NOTES:** Genuine dead/orphan view. **[NEEDS-SIGN-OFF]** deletion candidate (guarded
  `DROP VIEW IF EXISTS data_lake.usgs_caloosahatchee_stage_latest;`) — OR the intended aggregate-at-source
  optimization gets finished (repoint `usgs-water-source.mts` at the single-row view). Either way,
  catalog it as dead-orphan and open the decision as a check. Do NOT delete here (RULE 1).

---

### 12. view_vintages · lane monthly (day 26) · coverage_exempt (`derived_snapshot`)
- **STATUS:** **live derived snapshot** — 1,357 rows (6 cols).
- **ROOT:** not a root — point-in-time capture of OUR OWN `zhvi_pivoted`/`zori_pivoted` views for
  backtest vintage reconstruction. Writer: `ingest/scripts/capture_view_vintages.py` via
  `.github/workflows/view-vintages-monthly.yml` (monthly, day 26; captures `zori_pivoted`/`zhvi_pivoted`
  keyed on `month`, `capture_view_vintages.py:39`). Registry-tracked at `cadence_registry.yaml:2220`
  `coverage_exempt: reason: derived_snapshot`.
- **DATA WE GET:** monthly frozen copies of the pivoted index views (per `view_name`, per `month`).
- **ROUTES:** writer `capture_view_vintages.py`; **reader** = the backtest engine
  `refinery/lib/backtest/view-vintage-reader.mts` (`viewVintagesToVintages`, verified live by
  `refinery/lib/backtest/view-vintage-reader.test.mts`). Not a customer surface.
- **NOTES:** Derived internal snapshot for backtesting; correctly exempt. Catalog it as
  derived-snapshot with the backtest reader named. Promote-to-`pipelines` decision rides check
  `coverage_exempt_confirm_three` (per registry note). Not a deletion candidate.

---

### 13. zori_pivoted · lane tier-2 (VIEW) · **rollup-view (chart display)**
- **STATUS:** **live-via-non-brain-surface** — 137 rows (4 cols). The ZORI sibling of the
  already-catalogued `zhvi_pivoted` chart-display view.
- **ROOT:** not a root — wide display view over the real base `data_lake.zori_swfl`, one row per month
  (`docs/sql/20260612_zori_pivoted_views.sql:53`). Mirrors `zhvi_pivoted` (which the catalog's
  `zhvi_swfl_tier2` entry DOES list, lines 651/662).
- **DATA WE GET:** monthly ZORI rent-index time series for charting (metro columns) — trend for
  display, not a live per-ZIP number (that's the brain-input `zori_zip_latest`).
- **ROUTES (chart surfaces, bypass the brain by design):**
  - `app/charts/page.tsx:228` (`loadMetros(supabase, "zori_pivoted")`).
  - `app/insiders/page.tsx:112` (`loadMetroTrend("zori_pivoted")`).
  - `lib/charts/gallery-loaders.ts:257` (`loadMetros(db, "zori_pivoted")`, gallery panel).
  - Also captured monthly by `view_vintages` (`capture_view_vintages.py:39`).
- **NOTES:** Legitimate non-brain chart surface — same status the catalog already grants `zhvi_pivoted`
  ("chart pages read the LAKE VIEW, bypass the brain"). No brain computes a rent-index time series for
  charting, so this is NOT a redundant wire — just an asymmetric documentation miss against the
  `zhvi_swfl_tier2` entry it otherwise mirrors line-for-line. Add to the `zori_swfl_tier2` entry
  alongside its already-documented `zori_zip_latest` brain-input view + email direct-read. NOT a
  deletion candidate.

---

## THE 3 UNTRACKED INGESTS — registry-entry recommendations `[NEEDS-SIGN-OFF]`

These three are the only tables with **no `cadence_registry.yaml` accounting of any kind** — not a
`pipelines:` entry, not `coverage_exempt:`. All three are real, present, and (for cre_figures*) full
of data. They need a registry decision in-session (RULE 2.4 — no silent deferral). Recommendations are
ratification-ready but tagged for operator sign-off; do not treat as ratified.

### #A — community_profiles `[NEEDS-SIGN-OFF]`
- **Not** coverage-exempt — the registry comment at `cadence_registry.yaml:2218` deliberately keeps it
  OUT of the exempt block as one of the "three REAL gaps... a RED that produces a decision" (paired with
  `neighborhood_stats`). It is a genuine ingest gap (the marketed-community scrape has not been built),
  already surfaced by check `communities_tables_zero_coverage`.
- **Recommendation:** register under `not_yet_running:` (Operation-Dumbo-Drop scaffold shape — the
  consumer is already empty-tolerant, `communities-swfl.mts:94`) with a cited cold target + idempotent
  merge key `(community_id)` or `(county, community_name)`, NOT `coverage_exempt`. Keeps the RED
  visible on `/ops/census` instead of silencing it. Draft:
  ```yaml
  # cadence_registry.yaml → not_yet_running:
  - table: data_lake.community_profiles
    reason: ingest_not_built
    note: "~300 marketed golf/gated communities (golf/fee/amenity named-web scrape + Mapbox drive-time/nearby). Migration 20260706_community_profiles.sql; consumer communities-swfl empty-tolerant. 0 rows — Phase-1/2/3 backbone not landed. Tracked by check communities_tables_zero_coverage. Sibling of neighborhood_stats."
  ```

### #B — cre_figures + cre_figures_confidence `[NEEDS-SIGN-OFF]`
- Both are DERIVED (from the already-tracked `marketbeat_swfl`), materialized by a **manual** script
  (`scripts/build-cre-figures.mjs`) with **NO cron wrapper** — this is a second gap beyond the missing
  registry entry, and it violates the pipeline-freshness rule (every pipeline ships its GHA cron +
  `--dry-run` in the same PR). Two coupled decisions:
  1. **Registry accounting** — because they are derived-not-vendor (same nature as the already-exempt
     `source_totals` / `view_vintages`), the natural home is a `coverage_exempt: reason:
     derived_signal` pair. Draft:
     ```yaml
     # cadence_registry.yaml → coverage_exempt:
     - table: data_lake.cre_figures
       reason: derived_signal
       note: "Per-firm normalized CRE figures derived from data_lake.marketbeat_swfl in TS (refinery/lib/derived/cre-figures.mts) and materialized by scripts/build-cre-figures.mjs (migrations/20260718_cre_figures.sql). 1,078 rows. Not a vendor ingest. Consumer wiring into cre-swfl pending."
     - table: data_lake.cre_figures_confidence
       reason: derived_signal
       note: "Cross-firm corroboration layer over cre_figures (tier corroborated/flagged/single_source), same writer/migration. 985 rows."
     ```
  2. **Cron gap** — a GHA wrapper for `build-cre-figures.mjs` (with `--dry-run`) should ship before this
     is a dependable root; today it only refreshes when someone runs the script by hand. Open a check
     (e.g. `cre_figures_no_cron`). If instead these are meant to be rebuilt *inside* the cre-swfl brain
     build (not a standalone cron), the `derived_signal` exemption above is sufficient and the cron item
     is moot — that's the operator's call.
- **Also flag:** both are zero-consumer today. They are the in-flight fix for the marketbeat
  "verified=false drops 261/285 rows" problem; the cre-swfl repoint is the pending step. Track the
  consumer-wiring as its own check so the built-but-unread state doesn't get forgotten (RULE 2.4).

---

## Cross-checks against the handoff's verify-1 claims (what I extended vs. inherited)

- **Row counts** #4–#13: independently re-probed live today (table above). `dbhydro_stations` 12,937
  and `fema_nfip_claims_swfl` 89,504 match the handoff; the rest (cre_figures 1,078 / _confidence 985 /
  community_profiles 0 / geo_anchor_cache 42 / source_totals 12 / view_vintages 1,357 / zori_pivoted 137
  / usgs view 1 / user_mls* 0) are newly measured here.
- **usgs_caloosahatchee_stage_latest reader conflict RESOLVED:** handoff says "zero readers, live path
  reads usgs_daily/usgs_sites"; SESSION_LOG.md:15591 says the live path queries the view. Read the
  code — `usgs-water-source.mts:32-33,206,224` reads `usgs_daily`/`usgs_sites` directly. **Handoff is
  correct; SESSION_LOG is a stale abandoned-plan note.** (RULE 0.5, code beats memory.)
- **community_profiles registry status:** confirmed `cadence_registry.yaml:2218` is a COMMENT, not an
  entry → genuinely untracked, consistent with verify-1 (and correcting verify-2's looser phrasing
  "in cadence_registry.yaml:2218").
- **cre_figures/_confidence zero-consumer:** confirmed by grep — refinery references the *derivation
  module* `refinery/lib/derived/cre-figures.mts` (a `type CreFigureRow` + `normalizeMarketbeat`), never
  the materialized `data_lake.cre_figures` TABLE. Writer-only today.
- **All 5 coverage_exempt claims** (dbhydro/geo_anchor/source_totals/user_mls_listings/user_mls_stats/
  view_vintages) verified present at the cited `cadence_registry.yaml` lines (2192 / 2240 / 2224 / 2232
  / 2236 / 2220).

## Blockers
None. All 13 confirmed live, classified, readers traced, registry status verified, catalog paragraphs
written. Nothing required a repo edit (write-only to this scratchpad path, per constraints). The 3
untracked ingests are flagged with sign-off-tagged registry drafts; deletion candidates (#5, #6, #11)
are TEXT-only guarded `DROP VIEW` suggestions, none executed.
