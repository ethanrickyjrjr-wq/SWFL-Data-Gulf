# 14 cre-reports — pipeline plan (09/26/2026)

Family 14 owns the commercial real estate report ingests and the local CRE context feeds: seven registry entries (marketbeat_swfl, colliers_industrial, mhs_databook, cre_figures, lee_associates_swfl, estero_edc, fmb_recovery). They run through three workflows plus two manual lanes, and land in three lake tables (data_lake.marketbeat_swfl, data_lake.local_cre_context, data_lake.cre_figures + cre_figures_confidence). The verdict is blunt. The only scheduled job in this family that has ever landed real new data unattended is Lee & Associates. The MarketBeat cron has gone green twice and landed zero rows both times. Every C&W and Colliers row in the lake came from a hand or CLI load. The two local-context feeds re-stamp hard-coded seed rows every month, so the freshness probe reads them as fresh when their content has not changed since 06/09. cre_figures is a dark root that is now 19 figures behind its own upstream. What reaches a customer today is 113 human-verified C&W rows plus 48 MHS rows, and the served C&W quarter will go stale on 10/18/2026 unless a new quarter is both published and reviewed. Verdicts: marketbeat_swfl REPAIR, colliers_industrial PARK, mhs_databook GOOD ENOUGH, cre_figures IMPROVE, lee_associates_swfl IMPROVE, estero_edc RETIRE, fmb_recovery REPAIR.

## 1. Scope

Seven pipelines, counted from `docs/audit/2026-09-26-pipeline-plans/00-FAMILIES.md:114-121`.

- marketbeat_swfl. Registry `ingest/cadence_registry.yaml:1690`. Workflow `.github/workflows/marketbeat-pdf-ingest.yml`. Code in `ingest/pipelines/marketbeat_pdf/` (pipeline.py, extractor.py, loader.py, downloader.py) plus `.github/scripts/download-cw.py`. Table `data_lake.marketbeat_swfl`, `source_name='cw_marketbeat'`. Consumer: cre-swfl via `refinery/sources/marketbeat-swfl-source.mts` (imported at `refinery/packs/cre-swfl.mts:27`) and cre_figures.
- colliers_industrial. Registry `:1751`. Same workflow and same code, plus `.github/scripts/download-colliers.py`. Same table, `source_name='colliers_industrial'`. Consumers: cre-swfl nominally (every row is dropped by the verified gate at `marketbeat-swfl-source.mts:191`) and cre_figures.
- mhs_databook. Registry `:1776`. `workflow: none`, `dispatch_only: true`: a human drops the PDF and there is no code writer (`:1779-1781`). Same table, `source_name='mhs_databook'`. Consumers: cre-swfl (MHS branch at `marketbeat-swfl-source.mts:189-190`) and cre_figures.
- cre_figures. Registry `:1808`. `workflow: none`, manual `bun scripts/build-cre-figures.mjs` (`:1813-1817`). Tables `data_lake.cre_figures` and `data_lake.cre_figures_confidence`. Consumer: none. `consuming_pack: none` at `:1810`. The grep in [R2] finds no reader outside the builder.
- lee_associates_swfl. Registry `:1962`. Workflow `.github/workflows/ingest-lee-associates-swfl.yml`. Code `ingest/pipelines/lee_associates_swfl/` (pipeline.py, extract.py). Table `data_lake.marketbeat_swfl`, `source_name='lee_associates'`. Consumers: cre-swfl nominally (all rows dropped by the verified gate) and cre_figures.
- estero_edc. Registry `:1988`. Workflow `.github/workflows/ingest-local-cre-context.yml` (step at `:42-49`). Code `ingest/pipelines/estero_edc/pipeline.py`. Table `data_lake.local_cre_context`, `source_name='estero_edc'`. Consumer: cre-swfl caveats via `refinery/sources/local-cre-context-source.mts` (`cre-swfl.mts:35`, used at `:2012-2019`).
- fmb_recovery. Registry `:2011`. Same workflow (step at `:51-58`). Code `ingest/pipelines/fmb_recovery/pipeline.py`. Table `data_lake.local_cre_context`, `source_name='fmb_planning'`. Consumer: same cre-swfl caveat path.

Other readers of `data_lake.marketbeat_swfl` that are not the brain (from [R2]): `app/r/source/_tables.ts:39` (the public provenance page `/r/source/marketbeat_swfl`), `refinery/tools/build-corridor-fact-pack.mts`, `refinery/tools/run-corridor-character-preview.mts:183`, `refinery/tools/verify-corridor-chart-blocks.mts:78`, `refinery/lib/cre-submarket-crosswalk.mts`.

### Evidence commands (referenced as [Qn], [Gn], [Cn], [Tn], [Rn], [Bn], [Kn] below)

Every SQL ran read-only through a throwaway Bun.SQL script in the session scratchpad. It copies the connection approach in `scripts/apply-fdic-sod-view.mts:15-27` (credentials from `.dlt/secrets.toml`) and refuses anything that is not SELECT or WITH. The SQL text is inlined here so anyone can re-run it.

- [Q1] `select source_name, sector, count(*) n, sum(case when verified then 1 else 0 end) ver, min(quarter) qmin, max(quarter) qmax, max(_ingested_at) ing from data_lake.marketbeat_swfl group by 1,2 order by 1,2`
- [Q2] `select count(*) n, max(_ingested_at) from data_lake.marketbeat_swfl`
- [Q3] `select source_name, city, count(*) n, min(report_date) rmin, max(report_date) rmax, max(_ingested_at) ing, min(_ingested_at) ingmin from data_lake.local_cre_context group by 1,2`
- [Q4] `select count(*) n, max(built_at) b, count(distinct source_firm) firms, min(quarter), max(quarter) from data_lake.cre_figures`, then `select source_firm, count(*), max(quarter) from data_lake.cre_figures group by 1`, then `select count(*), max(built_at) from data_lake.cre_figures_confidence`
- [Q5] `select source_name, sector, max(quarter) filter (where verified) vq, count(distinct submarket) subs, count(distinct quarter) qs from data_lake.marketbeat_swfl group by 1,2`
- [Q6] `select column_name, column_default from information_schema.columns where table_schema='data_lake' and table_name='marketbeat_swfl'`
- [Q7] `select sector, quarter, vacancy_rate, asking_rent_nnn, asking_rent_mf, absorption_sqft, sale_price_psf, cap_rate, inventory_sf, under_construction from data_lake.marketbeat_swfl where source_name='lee_associates' ...` (by quarter, and the multifamily history ordered by quarter)
- [Q8] `select count(*) filter (where cap_rate is not null), count(*) from data_lake.marketbeat_swfl`, then `select source_name, count(*) filter (where source_url is null), count(*) filter (where _source_model is not null), string_agg(distinct _source_model, ',') from data_lake.marketbeat_swfl group by 1`
- [Q9] `select metric, units, count(*), min(value), max(value) from data_lake.cre_figures where sector='multifamily' group by 1,2`
- [Q10] `select case when submarket in ('Charlotte County','Punta Gorda') then 'charlotte' when submarket in ('East Naples','Golden Gate','Lely','Marco Island','Naples','North Naples','Outlying Collier County') then 'collier' else 'lee' end cty, source_name, count(*) from data_lake.marketbeat_swfl group by 1,2`. The name-to-county mapping in the CASE is mine. It follows the scope rule at `refinery/lib/cre-submarket-crosswalk.mts:18-21`.
- [Q11] `select count(*) filter (where verified_vacancy), count(*) filter (where verified_rents), count(*) filter (where verified_absorption), count(*) filter (where verified), count(*) from data_lake.marketbeat_swfl where source_name='mhs_databook'`
- [Q12] `select call_type, count(*), max(created_at) from public.api_usage_log where call_type ilike '%marketbeat%' group by 1`, then `select count(*) from public.api_usage_log`
- [Q13] the proposed contract SQL from section 8, evaluated live
- [Q14] `select source_name, array_agg(distinct submarket order by submarket) from data_lake.marketbeat_swfl group by 1`
- [G1] `gh run list --workflow <file> --limit 15 --json databaseId,status,conclusion,createdAt,event`, run for marketbeat-pdf-ingest.yml, ingest-lee-associates-swfl.yml and ingest-local-cre-context.yml
- [G2] `gh run view 29411199476 --log`, grepped for the download and process lines
- [G3] `gh run view 32358484270 --log`, grepped for `Downloading|quarters extracted|Total:|Upserted`
- [G4] `gh run view 33475794727 --log`, grepped for `estero|Upsert|Live scrape|unreachable`
- [G5] `gh run view 27190021217 --json jobs,event,displayTitle` and `gh run view 27190021217 --log-failed`
- [G6] `gh issue list --label odd-manual-drop --state all --json number,title,state,createdAt`
- [G7] `gh run view 36259690113 --log`, grepped for the seven family names (the doctor table printed by the daily freshness probe)
- [G8] `gh run list --workflow daily-rebuild.yml --limit 5`
- [C1] a read-only import of the pipeline's own constants: `python -c "from ingest.pipelines.marketbeat_pdf.downloader import _scrape_markdown, _CW_PDF_URL_RE, _CW_HUB_URL; ..."`, run with the crawl4ai venv `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`. It prints the (year, quarter, sector) of every PDF link on the C&W hub. No download, no DB.
- [C2] `curl -s -o /dev/null -w "%{http_code}"` against the Lee & Associates upload URLs (Q3 2026 in folder 2026/10; Naples Q2 2026 Office; Q4 2025 in folder 2025/01 and in folder 2026/01)
- [C3] curl of the Colliers media URL variants from `downloader.py:161-172` for 2025/2026 from this Windows workstation, a `curl -sIL` follow of the one 302, and `ssh fedora "curl ..."` for the 2026 `--26q1` media URL and the Colliers research page
- [C4] `curl -L -w "%{http_code} %{size_download} %{ssl_verify_result}"` against estero-fl.gov (page and home), the FMB Projects-Around-Town page and `/cdbg-dr`, the MHS 2026 page, and the Lee research page
- [C5] crawl4ai (same venv) of `https://estero-fl.gov/` (development links) and the FMB Projects-Around-Town page (markdown headings)
- [C6] `curl` of `https://www.lee-associates.com/wp-content/uploads/2026/07/2026-Q2-Fort-Myers-FL-{Industrial,Office,Retail,Multifamily}.pdf`, then pdfplumber `pages[0].extract_text(x_tolerance=3, y_tolerance=3)` (the same call as `extract.py:197`), printing the MARKET INDICATORS block
- [T1] `bun test refinery/sources/marketbeat-swfl-source.test.mts refinery/lib/derived/cre-figures.test.mts refinery/lib/derived/cre-corroboration.test.mts scripts/build-cre-figures.test.mjs refinery/packs/cre-swfl.test.mts`, one file at a time
- [T2] `ls ingest/tests | grep -i -E "marketbeat|lee_assoc|estero|fmb|local_cre|colliers|mhs|cre"` and `ls` of the four pipeline dirs for test files. Both return nothing.
- [R1] `rg -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|refinery|llm|gpt|haiku|sonnet" ingest/pipelines/marketbeat_pdf ingest/pipelines/lee_associates_swfl ingest/pipelines/estero_edc ingest/pipelines/fmb_recovery .github/workflows/marketbeat-pdf-ingest.yml .github/workflows/ingest-lee-associates-swfl.yml .github/workflows/ingest-local-cre-context.yml .github/scripts/download-cw.py .github/scripts/download-colliers.py scripts/build-cre-figures.mjs refinery/lib/derived/cre-figures.mts refinery/lib/derived/cre-corroboration.mts`
- [R2] `rg -n "marketbeat_swfl|local_cre_context|cre_figures" refinery lib app scripts` (tests and markdown excluded)
- [B1] `bun scripts/build-cre-figures.mjs --dry-run`. The header at `scripts/build-cre-figures.mjs:2` and the early return at `:105-107` prove it writes nothing.
- [K1] `node scripts/check.mjs list`

## 2. What is being brought in

marketbeat_swfl (Cushman & Wakefield MarketBeat, Fort Myers/Naples)
- Source: the C&W hub `https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/fort-myers-naples-marketbeats` (`downloader.py:46-49`). Text PDFs parsed by PyMuPDF (`extractor.py`).
- Fields written (`loader.py:21-39`): inventory_sf, vacancy_rate, absorption_sqft, ytd_absorption_sqft, under_construction, deliveries, asking_rent_nnn, asking_rent_mf, asking_rent_os, asking_rent_full_service, geographic_type, keyed on (source_name, sector, submarket, quarter).
- Cadence: registry `cadence_days: 90` (`:1694`); cron `0 10 15 1,4,7,10 *` (`marketbeat-pdf-ingest.yml:7`).
- Live [Q1]: industrial 109 rows (2024-Q1..2026-Q1, 49 verified), medical_office 64 rows (2024-Q3..2026-Q1, 64 verified). Newest `_ingested_at` is 07/15/2026 21:07 UTC (industrial) and 07/15/2026 21:18 UTC (medical).
- Geography [Q10][Q14]: 18 distinct submarket labels. Lee 88 rows, Collier 73, Charlotte 12 (out of scope; the crosswalk drops it at `cre-submarket-crosswalk.mts:18`), Hendry 0.

colliers_industrial (Colliers SWFL Industrial)
- Source: colliers.com media URLs (`downloader.py:161-172`). Same parser, same loader.
- Fields: the same loader columns. Industrial and flex sectors.
- Cadence: `cadence_days: 90`, `tolerance_multiplier: 2.5` (`:1755-1756`). Same cron.
- Live [Q1]: flex 66 plus industrial 66, 2022-Q4..2025-Q4, 0 verified. `_ingested_at` is 06/09/2026 06:12 UTC.
- Geography [Q10]: 6 submarkets. Lee 88, Collier 22, Charlotte 22, Hendry 0.

mhs_databook (MHS Appraisal annual Data Book)
- Source: the MHS 2026 Data Book PDF, a manual drop (`:1779-1789`). `_source_model = mhs-geometry-v1` on all 48 rows [Q8].
- Fields: vacancy, rents and absorption, with per-field verified flags.
- Cadence: `cadence_days: 365`, `tolerance_multiplier: 1.5` (`:1783-1784`).
- Live [Q1]: 16 rows each for industrial, office and retail, quarter 2026-Q1, `_ingested_at` 06/05/2026 22:00 UTC. [Q11]: all 48 carry verified, verified_vacancy, verified_rents and verified_absorption set true.
- Geography [Q10]: Lee 24, Collier 21, Charlotte 3, Hendry 0.

cre_figures (derived)
- Source: all of `data_lake.marketbeat_swfl`, with no verified filter (`build-cre-figures.mjs:5`), normalized and corroborated (`refinery/lib/derived/cre-figures.mts`, `cre-corroboration.mts`).
- Fields [Q4]: canonical_submarket, sector, quarter, metric, value, units, source_firm, source_url, source_verified, as_of, built_at, fanned.
- Cadence: `cadence_days: 92` (`:1819`), manual.
- Live [Q4]: 1,078 figures and 985 confidence rows, all `built_at` 07/18/2026 04:30 UTC, quarters 2022-Q4..2026-Q1. By firm: colliers_industrial 459, cw_marketbeat 344, lee_associates 95, mhs_databook 180.
- Geography: inherits upstream (Lee, Collier, and whatever Charlotte rows the normalizer admits). Hendry 0.

lee_associates_swfl (Lee & Associates Fort Myers quarterly)
- Source: `https://www.lee-associates.com/wp-content/uploads/{yyyy}/{mm}/{yyyy}-Q{q}-Fort-Myers-FL-{Sector}.pdf` (`extract.py:29-31`). Four sectors, five quarters per PDF (`extract.py:1-16`).
- Fields (`pipeline.py:74-83`): vacancy_rate, asking_rent_nnn, asking_rent_mf, absorption_sqft, sale_price_psf, under_construction, inventory_sf, cap_rate, geographic_type, report_label, verified (always false, `extract.py:137`).
- Cadence: `cadence_days: 90`, `probe_mode: odd_window` (`:1966-1967`). Cron `0 10 20 2,5,8,11 *` (`ingest-lee-associates-swfl.yml:7`).
- Live [Q1]: 6 rows each for industrial, multifamily, office and retail (24 total), 2025-Q1..2026-Q2, 0 verified, `_ingested_at` 08/20/2026 10:21 UTC.
- Geography [Q10]: submarket "Fort Myers" only. Lee 24, Collier 0, Hendry 0.

estero_edc (Village of Estero development context)
- Source: `https://estero-fl.gov/development-services/active-projects` (`estero_edc/pipeline.py:29`). The live fetch never parses. It returns `[]` on any non-5xx response (`:134-145`). Rows are the 6 hard-coded `SEED_ROWS` (`:52-131`).
- Fields: id, source_name, city, report_date, topic, headline, detail, source_url (`:164-168`).
- Cadence: `cadence_days: 30`, `probe_mode: odd_window` (`:1992-1993`). Cron `0 1 1 * *` (`ingest-local-cre-context.yml:8`).
- Live [Q3]: 6 rows, report_date 2025-12-01..2026-01-01. Both MIN and MAX of `_ingested_at` are 09/01/2026 06:05:58 UTC, so every row was re-stamped by the same run.
- Geography: Estero (Lee) only.

fmb_recovery (Fort Myers Beach recovery projects)
- Source: `https://www.fortmyersbeachfl.gov/123/Projects-Around-Town` (`fmb_recovery/pipeline.py:29`). The fetch runs, but `_try_live_scrape` always returns `[]` (`:168-179`). Rows are 8 hard-coded seeds.
- Fields: the same as estero_edc.
- Cadence: `cadence_days: 90`, `probe_mode: odd_window` (`:2015-2016`). The same monthly cron runs it.
- Live [Q3]: 8 rows, report_date 2025-08-01..2026-05-01. MIN and MAX of `_ingested_at` are both 09/01/2026 06:06:00 UTC.
- Geography: Fort Myers Beach (Lee) only.

Family-wide: Hendry 0 rows in every table ([Q10], [Q3]).

## 3. What is working

- marketbeat_swfl: the text parser produced the 173 C&W rows [Q1]. 113 of them are human-verified and served to cre-swfl (49 industrial, 64 medical_office) [Q1]. The downloader's own regex still finds the hub's current PDFs today: [C1] returned (2025, Q4, retail), (2026, Q1, industrial), (2026, Q1, medical), (2026, Q1, office). Tests [T1]: marketbeat-swfl-source.test.mts 22 pass, cre-swfl.test.mts 39 pass. The workflow itself is NOT evidence of anything working. Its two greens landed nothing (section 4, problem 1).
- colliers_industrial: the parser handled 11 quarterly PDFs and produced 132 rows [Q1][Q5]. Nothing in the scheduled path works.
- mhs_databook: 48 rows, all field flags true [Q11], served through the MHS branch (`marketbeat-swfl-source.mts:189-190`). A manual annual source with no code writer is the stated design (`:1779-1781`).
- cre_figures: the builder works end to end read-only. [B1] printed `source marketbeat rows: 377`, `figures=1097  confidence=1004`, tiers single_source 911 / corroborated 45 / flagged 48. Tests [T1]: cre-figures.test.mts 6 pass, cre-corroboration.test.mts 8 pass, build-cre-figures.test.mjs 1 pass.
- lee_associates_swfl: [G1] shows 3 of 3 runs green, including scheduled run 32358484270 (08/20/2026). [G3] shows `Total: 20 rows (4 sectors × up to 5 quarters)` and `Upserted 20 rows into data_lake.marketbeat_swfl (source=lee_associates)`. The parse is faithful. The Q2 2026 PDF text [C6] matches the lake [Q7] cell for cell on the rows checked: industrial 2026-Q2 vacancy 9.61, NNN 13.64, cap 8.32, under construction 1,489,105, inventory 45,492,945; multifamily inventory 121,594 / 119,193 / 116,012 / 111,735 / 37,223.
- estero_edc: [G1] shows 3 of 3 runs green (07/01, 08/01, 09/01/2026). They are green only because the job writes seeds. Nothing live is fetched: [G4] shows `estero-fl.gov unreachable (... SSLCertVerificationError ...)` then `Upserted 6 rows`.
- fmb_recovery: the same 3 green runs [G1]. [G4] shows `Live scrape OK (225,060 bytes) -- seed rows authoritative` then `Upserted 8 rows`. The page fetch works from GHA and the parse does not exist.
- Consumer side: cre-swfl reads marketbeat_swfl and local_cre_context (`cre-swfl.mts:27`, `:35`). The daily-rebuild workflow that rebuilds brains last ran 08/12/2026 (31606980553 per [G8]). The brief records master last rebuilt 08/19 with the chain stalled, so served CRE numbers are frozen at that build whatever this family lands.

## 4. Problems

1. The MarketBeat cron has never landed a row.
   - Symptom [G2]: scheduled run 29411199476 (07/15/2026, green) logged `[colliers] could not auto-download Q2 2026`, `[cw] could not scrape https://www.cpswfl.com/research`, then `No MarketBeat/Colliers PDFs found to process.` The 06/09/2026 dispatch run 27213582576 (green) filed issue #85 at 14:34:23 UTC [G6], so its downloads failed too. Its log has expired.
   - Every C&W and Colliers `_ingested_at` [Q1] is outside any run that executed a job (06/09 06:12 UTC falls among the seven 06/09 push-event runs, all with `jobs=0` per `gh run view <id> --json jobs`; 07/15 21:07 and 21:18 UTC come ten hours after 29411199476), so those rows came from CLI loads.
   - Root cause: the target quarter is always the previous calendar quarter (`marketbeat-pdf-ingest.yml:49-63`). On 07/15 it hunted for 2026-Q2 while Q1 was the published quarter. On 10/15/2026 it will hunt for 2026-Q3. C&W and Colliers carry one quarter per PDF, and the hub lists only the current PDFs [C1], so a quarter that publishes late is never retried.
   - The dispatch input `from_downloads` (`:14-17`) is declared and never read.
   - Severity: blocks a served number (no future C&W quarter can arrive unattended).
   - First seen: 06/09/2026 (#85).
2. The cron auto-downloads C&W Industrial only.
   - Root cause: `.github/scripts/download-cw.py:14` calls `try_download_cw(quarter, drop)` with the default `sector="industrial"` (`downloader.py:207`). Medical Office has a parser and a sector path (`downloader.py:54-57`) but is never requested. The registry states this at `:1702-1703`.
   - 64 of the 113 served C&W rows are medical_office [Q1], so the larger served feed is manual-only.
   - Severity: blocks a served number.
   - First seen: 07/15/2026 (registry note).
3. C&W has not published 2026-Q2 for this metro.
   - Symptom [C1]: on 09/26/2026 the newest hub PDFs are 2026-Q1 (industrial, medical, office) and 2025-Q4 (retail). That is 88 days after Q2 closed (06/30 to 09/26).
   - Root cause: upstream. Could not verify. `downloader.py:5-6` records that the local C&W affiliate was acquired on 06/09/2026, and the three 2026-Q1 hub file names carry `americas_alliance` [C1].
   - The served C&W quarter is 2026-Q1 [Q5].
   - Severity: blocks a served number. It goes stale on 10/18/2026 under the section 8 rule.
   - First seen: 09/26/2026 (this audit).
4. One GitHub issue per blocked run.
   - `marketbeat-pdf-ingest.yml:87-124` calls `github.rest.issues.create` whenever either download fails. Two open duplicates [G6]: #85 (06/09/2026) and #124 (07/15/2026), both titled `[ODD] MarketBeat PDF manual drop needed: 2026-Q2`. Label `odd-manual-drop` has no other user (`rg -l "odd-manual-drop" .github scripts ingest` returns only this workflow).
   - Severity: cosmetic (noise).
   - First seen: 06/09/2026.
5. The Colliers auto-download is blocked.
   - Symptom: [G2] (the GHA line in problem 1). [C3] from this workstation: every media-URL variant returns 403, and the one GET 302 resolves to `HTTP/1.1 403 Forbidden` under `curl -sIL`. [C3] from Fedora: `403 6251` on the 2026 `--26q1` URL and `colliers research page: 403`. A real browser has not been tried from either box.
   - Root cause: Cloudflare managed challenge (`downloader.py:18-20`) plus form-gated newer quarters (registry `:1765`).
   - Newest Colliers quarter is 2025-Q4 and 0 of 132 rows are verified [Q1].
   - Severity: blocks a consumer (cre_figures loses its third firm going forward). Nothing served depends on Colliers.
   - First seen: 06/09/2026 (registry `:1765`).
6. Estero and FMB re-stamp seeds, which launders freshness.
   - Symptom [Q3]: all 14 rows have `_ingested_at` MIN = MAX = 09/01/2026 while report_date tops out at 2026-05-01.
   - Root cause: `estero_edc/pipeline.py:148-174` and `fmb_recovery/pipeline.py:182-208` set `_ingested_at = now` on every upsert, even when nothing changed. The probe reads that column (`check_freshness.py:241-264`). [G7] reports estero_edc WINDOW_OPEN and fmb_recovery WAITING, never stale.
   - Consumer: cre-swfl turns each row into a served caveat (`cre-swfl.mts:2012-2019`) with no age filter (`local-cre-context-source.mts:64-71`).
   - Severity: blocks a served number. The caveats carry dated figures and dates, e.g. "Corkscrew Rd Widening Phase 2 -- ~$27M, est. completion end-2026" (`estero_edc/pipeline.py:111`).
   - First seen: the first monthly run, 07/01/2026 (28495422043 [G1]).
7. The Estero source page is gone, and the pipeline never parses it anyway.
   - Symptom: [C4] `.../development-services/active-projects -> 404` (estero-fl.gov home returns 200). [G4] on GHA: `SSLCertVerificationError`.
   - Root cause: `estero_edc/pipeline.py:139-142` returns `[]` on any status below 500, so even a 200 would add nothing.
   - The Village does still publish: [C5] found a live link to a Planning Zoning Design Board item "addressed by the planning zoning design board on September 15 2026" on estero-fl.gov.
   - Severity: blocks a consumer (Estero context is frozen at the 06/09 hand snapshot).
   - First seen: 07/08/2026 (registry note `:1999`).
8. The FMB page is fetched but not parsed, and one expired row is still served.
   - Root cause: `fmb_recovery/pipeline.py:168-179` fetches the page and returns `[]` by design ("seed rows authoritative").
   - [C5]: the live page has 24 markdown headings, including Asphalt Project Tier 1, Island Wide Lighting Project, Stormwater Drains Tier 1, Bay Oaks Park, Big Carlos Pass Bridge Project and Estero Island Shore Protection Project.
   - [Q13]: 1 fmb_planning row has report_date older than 365 days (2025-08-01), and cre-swfl still serves it.
   - `/cdbg-dr`, the URL behind `CDBG_URL` (`:31`), returns 404 [C4].
   - Severity: blocks a served number.
   - First seen: 07/07/2026 (registry `:2029-2030` names the gap).
9. The Lee Q4 URL is wrong.
   - Root cause: `extract.py:29-31` uses `{yyyy}` for both the upload folder and the report year, and `pipeline.py:118` maps Q4 to month 1. The February run therefore builds `uploads/<report year>/01/`, while Lee uploads Q4 into the following January's folder.
   - Proof [C2]: `uploads/2025/01/2025-Q4-Fort-Myers-FL-Office.pdf` returns 404 and `uploads/2026/01/2025-Q4-...` returns 200.
   - No February run exists yet [G1], so it first fires on 02/20/2027 (Q4 2026). All four sectors will 404, `pipeline.py:140-145` will exit 1, and the Q1 2027 PDF's five-quarter window will recover the Q4 data three months late.
   - Severity: cosmetic plus a lag (one red run each year).
   - First seen: 09/26/2026 (this audit).
10. Lee multifamily puts unit values into square-foot columns.
    - Root cause: `extract.py:62` maps `12 Mo. Absorption Units`, `:68` maps `Sale Price/Unit` and `:75` maps `Inventory Units` into `absorption_sqft`, `sale_price_psf` and `inventory_sf`. [Q7]: multifamily sale_price_psf is 202,921 for 2026-Q2.
    - `cre-figures.mts:54-60` labels units by metric alone, so [Q9] shows 5 multifamily `sale_price_psf` rows (202,144..238,150) labelled `USD/sqft` and 5 `absorption_sqft` rows labelled `sqft`.
    - Severity: blocks a consumer. Wiring cre_figures would serve dollars per unit as dollars per square foot.
    - First seen: 07/14/2026 (first multifamily `_ingested_at` [Q7]).
11. Lee absorption is a trailing 12-month figure in a quarterly column.
    - Symptom [C6]: every Lee PDF labels the row `12 Mo. Net Absorption SF`. `extract.py:60-61` maps that label and `Qtrly Net Absorption SF` into the same `absorption_sqft` column that C&W and Colliers fill with current-quarter absorption (`loader.py:29`; registry `:1768` "net absorption (current+YTD)").
    - [B1] flags this as a disagreement, e.g. `Fort Myers / industrial / 2025-Q2 / absorption_sqft — colliers_industrial vs lee_associates spread 549585`. That is a definitional mismatch, not two firms disagreeing.
    - Severity: blocks a consumer (cre_figures confidence tiers are wrong on absorption).
    - First seen: 07/18/2026 (first cre_figures build, [Q4]).
12. cre_figures has no reader and is stale.
    - [R2]: no reader outside `scripts/build-cre-figures.mjs`. Registry `:1810` says `consuming_pack: none`. data-inventory `docs/standards/data-inventory.md:136` says "landed & unread".
    - Live 1,078 [Q4] vs rebuild 1,097 [B1]: lee_associates 95 live vs 114 rebuilt, so the missing 19 are the 08/20 Lee load.
    - The builder reads credentials only from `.dlt/secrets.toml` (`build-cre-figures.mjs:62`), so it cannot run in CI as written.
    - Severity: blocks a consumer.
    - First seen: 07/18/2026.
13. Reloading a row keeps an old human verification.
    - Root cause: `loader.py:41-45` and `:127-135` update value columns on conflict and never touch `verified` or `verified_*`. `lee_associates_swfl/pipeline.py:84-93` does the same. That is 2 sites of one shape.
    - A `--force` reload (`pipeline.py:150`) of a verified C&W quarter changes a served value while `verified` stays true.
    - Severity: blocks a served number (latent).
    - First seen: 08/27/2026 (registry `:1739` names it).
14. The MHS staleness alarm fires 20 months late.
    - Root cause: tier-2 threshold `int(cadence_days * tolerance_multiplier)` (`check_freshness.py:498-499`) = 365 x 1.5 = 547 days from 06/05/2026, which is 12/04/2027. Registry `:1789` claims "probe alerts ~March 2027". That is false.
    - Severity: blocks a served number. The 2026 book would be served until 12/2027 with no alarm.
    - First seen: 09/26/2026 (this audit).
15. The doctor paints five entries yellow. Four are healthy; the fifth (estero) is yellow because of problem 6.
    - [G7], 09/26 run 36259690113: `marketbeat_swfl ... NO_RUNS_IN_WINDOW ... yellow`, `colliers_industrial ... NO_RUNS_IN_WINDOW ... yellow`, `mhs_databook ... NO_WORKFLOW ... yellow`, `cre_figures ... NO_WORKFLOW ... yellow`, `estero_edc ... WINDOW_OPEN ... yellow`.
    - Root cause: `doctor.py:157` and `:169` (plus `gh_runs.py:130`). `rg -n dispatch_only ingest/scripts/doctor.py ingest/lib/gh_runs.py` returns nothing, so a stated manual source is always yellow. The estero yellow repeats every month because of the re-stamp in problem 6.
    - Severity: cosmetic (it trains the operator to ignore yellow).
    - First seen: 09/26/2026.
16. The vision fallback is a dead LLM leg that still carries a key.
    - `extractor.py:482-535` calls `claude-haiku-4-5-20251001` (`:491`) when page text is short, and the workflow exports `ANTHROPIC_API_KEY` (`marketbeat-pdf-ingest.yml:29`).
    - [Q12]: 0 rows with `call_type ilike '%marketbeat%'` among 6,122 logged calls, so the leg has never fired.
    - `extractor.py:586` tells the operator to set `MARKETBEAT_PDF_FORCE_VISION=1`, which nothing reads (`rg -n FORCE_VISION ingest .github` finds only `:586`).
    - Severity: cosmetic (dead code, but an unattended key path).
    - First seen: 07/05/2026 (`pipeline.py:120` operator-guard comment).
17. The `_source_model` column lies about provenance.
    - [Q6]: the column default is `'spark-1-mini'::text`. [Q8]: 329 rows carry `spark-1-mini` (colliers 132, cw 173, lee 24), though no model wrote any of them. Only MHS carries a real value.
    - Severity: cosmetic.
    - First seen: pre-06/09/2026 (column default).
18. Source PDFs are not archived.
    - `ls ingest/drops/marketbeat_pdf | wc -l` = 8, all C&W, on one Windows disk in a gitignored folder. There are 0 Colliers PDFs and 0 Lee PDFs.
    - Registry `:1732-1733`: 60 C&W 2024 rows are permanently unverifiable because their PDFs left the hub. [Q1] industrial 109 minus 49 verified = 60 agrees.
    - 6 of 7 family entries carry no `raw_landing_class`. cre_figures is the only one (`:1831`).
    - Severity: blocks a consumer. The human review that gates serving is impossible once the hub drops a quarter.
    - First seen: 08/27/2026 (registry note).
19. The public provenance page shows unverified rows first.
    - `app/r/source/[table]/page-data.ts:50-52` selects `*` with `limit(12)` ordered by `quarter` desc, with no verified filter, for `/r/source/marketbeat_swfl` (`_tables.ts:39-43`).
    - 2026-Q2 exists only in lee_associates rows (0 verified) [Q1], so the sample leads with rows the brain refuses to serve. The `verified` column does render (`page.tsx:137` takes every key).
    - Severity: cosmetic.
    - First seen: 08/20/2026 (first 2026-Q2 row).
20. Stale claims (X verified, Y needs review).
    - Registry `:1980` and data-roots `docs/standards/data-roots.md:1457` say Lee cap_rate is "silently dropped". [Q8] shows 24 of 24 Lee rows carry cap_rate, fixed by commit 4a23ff21 (07/11/2026, `git log -S cap_rate`). `refinery/tools/build-corridor-fact-pack.mts:273` and `:284` also say cap_rate is not in marketbeat_swfl, and [Q6] shows the column.
    - `marketbeat-swfl-source.mts:34` and `:176` say MHS `verified` "is always false". [Q11] shows 48 of 48 true.
    - `wiki/pipeline-census.md:128` cites cre_figures at `:1754`. The entry is at `:1808`.
    - Registry `:1791` says the MHS first run was 2026-06-09. [Q1] shows 06/05/2026.
    - The Lee note (`:1973`) says "20 rows loaded" and "Industrial 9.01% / $12.20 NNN". [Q1] shows 24 rows and [Q7] shows 2026-Q1 industrial NNN 13.67. Lee revises earlier quarters in each new PDF and the upsert overwrites.
    - Registry comments point to checks absent from the 09/26 open list [K1]: cre_figures_consumer_wire (`:1736`), marketbeat_verified_staleness_on_force and marketbeat_sector_scope_flex_multifamily (`:1739`), mhs_databook_missing_multifamily (`:1794`), cre_figures_build_cron_cadence (`:1817`), lee_associates_missing_naples (`:1980`). They closed in the 09/15 bankruptcy. This plan does not reopen them; it fixes the defects directly.
    - Severity: cosmetic.
    - First seen: as dated in each claim.
21. The newest MarketBeat red cannot be classified.
    - [G5]: run 27190021217 (06/09/2026 07:11 UTC, event push) has `jobs=0`, and `--log-failed` returns `failed to get run log: log not found`. It is the newest of 7 consecutive push-event reds between 06:01 and 07:11 UTC that morning [G1].
    - `classify-cron-failure.mjs` classifies from a log tail (`:3`), so with no log there is no class. Zero-job push runs are the shape GitHub produces when it rejects a workflow file at push time. No red since.
    - Severity: cosmetic (historical).
    - First seen: 06/09/2026.

Run-count note: the brief asks for the last 15 runs. [G1] returns only 9 for marketbeat-pdf-ingest (2 green, 7 red, 0 cancelled; newest green 07/15/2026), 3 for ingest-lee-associates-swfl (3 green, 0 red; newest green 08/20/2026) and 3 for ingest-local-cre-context (3 green, 0 red; newest green 09/01/2026). The Lee and local-context workflows have zero reds.

## 5. What is missing

- C&W Office and Retail. The hub publishes both [C1] (2026-Q1 office, 2025-Q4 retail). `extractor.py` has no parser for them. `downloader.py:54-57` lists only industrial and medical_office. Registry source_ceiling `:1746` already says so.
- The C&W 2024-Q1 medical layout is unparsed (registry `:1712-1713`). One of the 8 local PDFs is `MarketBeat_MedicalOffice_Q12024_FortMyersNaples.pdf` (the `ls` in problem 18). [Q1] shows medical starts at 2024-Q3.
- Colliers building count and direct vacancy, parsed by column position and never stored (source_ceiling `:1771`). Colliers Office/Retail are unconfirmed behind the WAF.
- MHS Multi-Family, in the same PDF (source_ceiling `:1803`; known-problems ledger `docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:83`).
- Lee & Associates Naples/Collier: 4 sectors, same vendor, same pattern. [C2]: `2026-Q2-Naples-FL-Office.pdf` returns 200 at 2,605,844 bytes. It was confirmed live earlier in `docs/handoff/2026-07-11-reliable-sources-findings.md:300-306`, and that doc also records that Lee publishes no Medical Office for either city. This is the cheapest Collier coverage in the family. [Q10] shows Lee & Associates has 0 Collier rows today.
- Estero: a live development feed exists on estero-fl.gov (the PZDB item links in [C5]). Estero permits and planned developments are already covered by other families' ingests (`lee-planned-developments-quarterly.yml` exists per `wiki/pipeline-census.md:34`). That is a reason to retire the seed feed, not to rebuild it.
- FMB: the live page's projects (Tier 1 asphalt, lighting, stormwater, parks, bridges; the 24 headings in [C5]) against 8 seeds.
- Hendry: nothing in this family covers 12051 [Q10]. No broker report for Hendry was found in any lane searched (registry source_ceilings, the reliable-sources handoff, `_RESEARCH/INDEX.md` grep for the family's sources). It stays a stated gap.
- Consumers that should exist: cre_figures has none (problem 12). The architecture already named it the forward path for unverified firms (`docs/standards/data-roots.md` marketbeat NOTE; registry `:1735-1736`).
- Verification throughput: the only writer of `verified` is a dated hand migration (`docs/sql/20260715_marketbeat_swfl_verify_reviewed_quarters.sql`, registry `:1722-1725`). There is no review packet, so every new quarter lands dark until someone opens the PDF by hand.
- Raw landing: no durable archive of any source PDF (problem 18).
- Tests: zero Python tests for any of the four ingest pipelines [T2]. The refinery side has 76 tests across the 5 files in [T1] (22 + 6 + 8 + 1 + 39).

## 6. Verdict per pipeline

- marketbeat_swfl: REPAIR. The served C&W feed is real, but the cron has never landed a row, and the served quarter goes stale on 10/18/2026. The number that changes it: the newest C&W quarter on the hub on 01/15/2027. If it is still 2026-Q1, C&W has stopped publishing this metro and the verdict becomes PARK.
- colliers_industrial: PARK. It is blocked at 403 from GHA, from this workstation and from Fedora [C3], and it feeds nothing served. The number: one Fedora browser fetch returning a file whose first bytes are `%PDF`. That flips it to IMPROVE on the Fedora runner.
- mhs_databook: GOOD ENOUGH. It is a manual annual source with 48 of 48 rows field-verified and served [Q11]. It needs only an honest alarm and the Multi-Family recipe at the next drop. The number: zero 2027 rows by 04/15/2027 makes it REPAIR.
- cre_figures: IMPROVE. The engine works (1,097 figures read-only [B1]), but it has 0 readers, a manual build, and two unit/semantic defects inherited from Lee. The number: the consumer count, now 0. If the operator declines the wire (question 1), RETIRE.
- lee_associates_swfl: IMPROVE. It is the only unattended pipeline here that lands real data (32358484270, 20 rows), with a faithful parse [C6]. It needs the Q4 URL fix, unit-honest columns and Naples. The number: 20 Naples rows landed on the next run turns it into the family's main Collier source.
- estero_edc: RETIRE (the scheduled job, not the rows). There has been no live input since 06/09, the source page is 404, and the monthly job only re-stamps 6 hand rows. The number: a machine-readable Estero development list with at least 1 row not already in the Lee permits or planned-developments lanes would make it REPAIR.
- fmb_recovery: REPAIR. The source page is live and fetched every month [G4], with 24 headings [C5], and is thrown away. The number: projects parsed from the live page, now 0 against 8 seeds.

## 7. The plan

Ordered by what protects a served number first. DO items ship on the normal push lane. ASK-FIRST items need the operator's word.

1. DO. Stop the timestamp laundering in estero and FMB.
   - What: add `WHERE (data_lake.local_cre_context.headline, detail, report_date, source_url) IS DISTINCT FROM (EXCLUDED.headline, EXCLUDED.detail, EXCLUDED.report_date, EXCLUDED.source_url)` to the ON CONFLICT clause, so `_ingested_at` moves only when content changes. Same columns, only when they are written.
   - Where: `ingest/pipelines/estero_edc/pipeline.py:169-174`, `ingest/pipelines/fmb_recovery/pipeline.py:204-208`.
   - Lane: D. Effort: S.
   - Proof: after the next monthly run, `select source_name, max(_ingested_at) from data_lake.local_cre_context group by 1` still shows 09/01/2026 for any source whose content did not change.
   - Unblocks: an honest freshness reading for both entries (problem 6).
2. DO. Age guard on served local caveats.
   - What: `.gte("report_date", <today minus 365 days>)` in the live fetch.
   - Where: `refinery/sources/local-cre-context-source.mts:64-71`, plus a unit test named `drops_local_context_older_than_365_days`.
   - Lane: D. Effort: S.
   - Proof: `bun test refinery/sources`, then [Q13]'s last query shows the 1 expired fmb row is no longer emitted in a fixture-mode build.
   - Unblocks: served caveats that can no longer carry year-old dated claims (problems 6 and 8).
3. DO. Retire the estero_edc scheduled job.
   - What: delete the "Run Estero EDC pipeline" step. In the registry entry set `workflow: none`, `dispatch_only: true`, drop `probe_mode: odd_window`, and replace the note with the facts from problem 7. The 6 rows stay. Item 2 expires them from serving on their own clock.
   - Where: `.github/workflows/ingest-local-cre-context.yml:42-49`, `ingest/cadence_registry.yaml:1988-2009`.
   - Lane: D. Effort: S.
   - Proof: `grep -n estero_edc .github/workflows/ingest-local-cre-context.yml` returns nothing. `node scripts/schedule-catalog.mjs` no longer lists it. Gate 10 passes on push.
   - Unblocks: removes the monthly WINDOW_OPEN yellow (problem 15).
4. DO. Parse the live FMB page.
   - What: turn the fetched Projects-Around-Town HTML into rows (heading = headline, the following paragraph = detail, `source_url = PROJECTS_URL`, `report_date` = run date only when the text changed). Exit 1 when the page returns 200 but 0 projects parse, printing `0 projects returned` (a DATA_EMPTY token, `classify-cron-failure.mjs:167-168`). Keep seeds only for items the page lacks. Drop `CDBG_URL` (404 [C4]). Remove `probe_mode: odd_window` from the registry entry, because an unchanged page is not an outage.
   - Where: `ingest/pipelines/fmb_recovery/pipeline.py:168-179`, `:31`, registry `:2011-2032`.
   - Lane: D (requests + stdlib HTML parsing, no model). Effort: M.
   - Proof: `python -m ingest.pipelines.fmb_recovery.pipeline --dry-run` prints more than 8 rows. Its dry-run is read-only by construction (`pipeline.py:187-191` returns before `psycopg.connect`).
   - Unblocks: the FMB source_ceiling gap (problem 8).
5. DO. Fix MarketBeat targeting and turn on every parsed C&W sector.
   - What: replace "previous quarter" with "every hub PDF whose (sector, quarter) has a parser and is not already in the lake". Reuse `_CW_PDF_URL_RE` (`downloader.py:63-68`) and `already_loaded` (`loader.py:149`). Loop sectors industrial and medical_office in `download-cw.py`. Delete the unused `from_downloads` input.
   - Where: `.github/workflows/marketbeat-pdf-ingest.yml:14-17`, `:49-76`; `.github/scripts/download-cw.py:14`; `ingest/pipelines/marketbeat_pdf/downloader.py:207-260`.
   - Lane: D. Effort: M.
   - Proof: the next run's log shows `[cw] downloaded:` or `already in DB` for each hub PDF [C1] lists. Then `select max(quarter) from data_lake.marketbeat_swfl where source_name='cw_marketbeat' and sector='industrial'` equals the hub's newest industrial quarter.
   - Unblocks: the first unattended C&W row (problems 1 and 2).
6. DO. Delete the issue-per-run step and its issues.
   - What: remove the "Create issue if manual download needed" step. Close #85 and #124 as superseded by the section 8 signal. Delete the `odd-manual-drop` label (no other user).
   - Where: `.github/workflows/marketbeat-pdf-ingest.yml:87-124`.
   - Lane: D. Effort: S.
   - Proof: `rg -n "issues.create" .github/workflows/marketbeat-pdf-ingest.yml` returns nothing. `gh issue list --label odd-manual-drop --state open` returns nothing.
   - Unblocks: problem 4.
7. DO. Delete the vision LLM leg.
   - What: remove the `anthropic` import (`extractor.py:26-32`), `_vision_extract` (`:466-535`), pass 2 (`:571-577`) and the `FORCE_VISION` sentence (`:586`). Remove `ANTHROPIC_API_KEY` from `marketbeat-pdf-ingest.yml:29`, and the `RunBudget` plumbing in `pipeline.py:28`, `:120-124`, `:132-133` once it guards nothing. A PDF whose layout the text parsers miss already raises ValueError (`extractor.py:583-587`), so the run goes red. Reword that message to start `0 rows extracted from <file>` so it classifies DATA_EMPTY (`classify-cron-failure.mjs:167-168`) and never reaches the heal model leg (section 10, leg 4).
   - Lane: D. Effort: S.
   - Proof: `rg -n -i "anthropic|haiku|RunBudget" ingest/pipelines/marketbeat_pdf .github/workflows/marketbeat-pdf-ingest.yml` returns nothing.
   - Unblocks: section 10 leg 1. A red run from a new layout routes to a Lane M interactive session that extends the parser.
8. DO. Ingest tests, named for their failure modes.
   - What: pytest files with fixture text captured from the four Lee Q2 2026 indicator blocks [C6] and the C&W sentinels: `test_lee_q4_upload_folder_is_next_year`, `test_lee_multifamily_units_never_land_in_sqft_columns`, `test_lee_absorption_is_twelve_month`, `test_cw_target_is_every_unloaded_hub_quarter`, `test_local_context_upsert_does_not_restamp_unchanged_rows`.
   - Where: `ingest/tests/pipelines/cre_reports/` (new directory under the existing tests tree).
   - Lane: D. Effort: M.
   - Proof: `pytest -q ingest/tests/pipelines/cre_reports` passes all 5. Each test fails first against today's code.
   - Unblocks: items 5, 9, 10 and 11 land test-first (RULE 3.5).
9. DO. Fix the Lee Q4 upload folder.
   - What: upload year = report year + 1 when quarter == 4. Split `{yyyy}` into `{upload_yyyy}` and `{yyyy}`.
   - Where: `ingest/pipelines/lee_associates_swfl/extract.py:29-31`, `pipeline.py:118-126`.
   - Lane: D. Effort: S.
   - Proof: the item 8 test, and `curl -s -o /dev/null -w "%{http_code}" https://www.lee-associates.com/wp-content/uploads/2026/01/2025-Q4-Fort-Myers-FL-Office.pdf` returns 200 [C2] for the URL the fixed code builds for (2025, 4).
   - Unblocks: 02/20/2027 runs green (problem 9).
10. DO. Interim cre_figures guard for Lee units and absorption.
    - What: in the normalizer, skip lee_associates multifamily `sale_price_psf`, `absorption_sqft` and `inventory_sf`, and emit Lee `absorption_sqft` under a distinct metric `absorption_12mo_sqft` that never corroborates against quarterly firms.
    - Where: `refinery/lib/derived/cre-figures.mts` (the METRIC_UNITS map at `:54-60` and the normalize loop).
    - Lane: D. Effort: S.
    - Proof: `bun scripts/build-cre-figures.mjs --dry-run` no longer prints any `colliers_industrial vs lee_associates` absorption spread. `bun test refinery/lib/derived` passes with a new case.
    - Unblocks: item 14 can be decided on clean data (problems 10 and 11).
11. ASK-FIRST. Unit-honest Lee columns.
    - What: add `absorption_12mo_sqft`, `absorption_units`, `inventory_units`, `under_construction_units` and `sale_price_per_unit` to `data_lake.marketbeat_swfl`, and point the Lee extractor at them. This changes the data_lake write shape, so it needs the operator's word.
    - Where: new `docs/sql/` migration; `extract.py:57-76`; `pipeline.py:74-93`.
    - Lane: D. Effort: M.
    - Proof: `select count(*) from data_lake.marketbeat_swfl where source_name='lee_associates' and sector='multifamily' and sale_price_psf is not null` returns 0 after the next run.
    - Unblocks: retires the item 10 interim guard.
12. DO. Add Lee Naples.
    - What: loop cities Fort-Myers and Naples through the same four sectors, with `submarket`/`report_label` set per city. The handoff states zero new extraction logic (`docs/handoff/2026-07-11-reliable-sources-findings.md:305-306`).
    - Where: `extract.py:27-31`, `:131-138`; `pipeline.py:123-138`.
    - Lane: D. Effort: S.
    - Proof: `select count(*) from data_lake.marketbeat_swfl where source_name='lee_associates' and submarket='Naples'` returns 20 after the next quarterly run (4 sectors x 5 quarters per PDF, `extract.py:5`; the Fort Myers run 32358484270 yielded exactly 20 [G3]).
    - Unblocks: first Lee & Associates Collier coverage.
13. DO. Graduate Lee out of odd_window.
    - What: remove `probe_mode: odd_window` and the "Graduate after first GHA green" clause. The first scheduled green is 32358484270. Replace the stale numbers in the note (problem 20).
    - Where: `ingest/cadence_registry.yaml:1962-1983`.
    - Lane: D. Effort: S.
    - Proof: `grep -n -A8 "name: lee_associates_swfl" ingest/cadence_registry.yaml` shows no probe_mode.
    - Unblocks: standard tier-2 freshness for Lee.
14. ASK-FIRST. Wire cre_figures into cre-swfl, or retire it.
    - What: read `cre_figures_confidence` for firms and quarters the verified gate drops, with `source_verified` shown as an attribute. This changes pack OUTPUT and key_metrics, so it needs the operator's word (question 1).
    - Where: `refinery/packs/cre-swfl.mts` (a new source beside `marketbeatSwflSource`), or deleting the entry at `:1808` and both tables.
    - Lane: D. Effort: L.
    - Proof: `rg -n "cre_figures" refinery/packs refinery/sources` finds a reader, and the cre-swfl build prints the new metric count.
    - Unblocks: 216 dark rows ([Q2] 377 minus 161 served) reach a consumer, labelled.
15. DO. Automate the cre_figures rebuild.
    - What: let the builder accept `DESTINATION__POSTGRES__CREDENTIALS` first (the same approach as `scripts/apply-fdic-sod-view.mts:15-17`). Append a `bun scripts/build-cre-figures.mjs` step to the end of both `marketbeat-pdf-ingest.yml` and `ingest-lee-associates-swfl.yml`, gated on the ingest step succeeding. Set registry `workflow:` to the Lee workflow and drop `dispatch_only`. It rebuilds an existing derived table with its existing script and guard (`build-cre-figures.mjs:5-9`, refuses an empty build), so the write shape is unchanged.
    - Where: `scripts/build-cre-figures.mjs:61-70`, both workflow files, registry `:1808-1831`.
    - Lane: D. Effort: S.
    - Proof: `select max(built_at) from data_lake.cre_figures` is at or after `select max(_ingested_at) from data_lake.marketbeat_swfl` after the next Lee run, and `select count(*) from data_lake.cre_figures` returns the dry-run figure.
    - Unblocks: closes the 19-figure lag (problem 12).
16. ASK-FIRST. Reset `verified` when a reviewed value changes.
    - What: on conflict, `verified = CASE WHEN (vacancy_rate, asking_rent_nnn, …) IS DISTINCT FROM (EXCLUDED.…) THEN false ELSE marketbeat_swfl.verified END`, and the same for `verified_*`. This can move a served row dark on a reload, which changes what the brain serves, so it needs the operator's word.
    - Where: `ingest/pipelines/marketbeat_pdf/loader.py:127-135`, `ingest/pipelines/lee_associates_swfl/pipeline.py:84-93`.
    - Lane: D. Effort: S.
    - Proof: a pytest that upserts a changed value onto a verified row, then asserts `verified is false`.
    - Unblocks: problem 13 (both sites).
17. DO. Review packet for new quarters.
    - What: a deterministic script that, for each (source_name, quarter) with `verified=false`, prints the extracted rows beside the text of the PDF page they came from (PyMuPDF page text, same call as `extractor.py:556-557`). The operator reads it. A Lane M interactive session then drafts the dated verification migration in the 20260715 pattern, and the operator signs it. The meaning of `verified` stays "a human read the PDF" (registry `:1722-1729`).
    - Where: new `scripts/cre-review-packet.mjs` or `.py`.
    - Lane: D for the packet, M (interactive) for drafting the SQL, human for the read.
    - Effort: M.
    - Proof: `select source_name, max(quarter) filter (where verified) from data_lake.marketbeat_swfl group by 1` advances for cw_marketbeat after the next quarter lands.
    - Unblocks: the served C&W quarter stays current (the section 8 marketbeat signal).
18. DO. Add the section 8 content contracts and fix the MHS registry comment.
    - Where: `ingest/quality/quality_registry.yaml` (new `data_lake.marketbeat_swfl` and `data_lake.cre_figures` blocks); registry `:1789`.
    - Lane: D. Effort: S.
    - Proof: `python -m ingest.scripts.check_data_quality --dry-run` lists the contracts. Its dry-run is documented read-only for the ledger (`check_data_quality.py:26-29`).
    - Unblocks: the one-signal-per-pipeline design.
19. DO. Kill the doctor's yellow noise.
    - What: in `run_severity`, return green for `NO_WORKFLOW` when the registry entry has `dispatch_only: true`. Return green for `NO_RUNS_IN_WINDOW` when the targeted backfill (`doctor.py:535-553`) finds a run inside `cadence_days x tolerance_multiplier`.
    - Where: `ingest/scripts/doctor.py:153-176`, `:535-553`.
    - Lane: D. Effort: S.
    - Proof: the next freshness-probe run's doctor table shows mhs_databook, cre_figures, marketbeat_swfl and colliers_industrial green, and `pytest -q ingest/tests/scripts/test_doctor.py` passes.
    - Unblocks: problem 15 (and the same noise in other families).
20. DO. Archive every source PDF on the Fedora SSD and declare raw landing.
    - What: rsync the 8 local PDFs to `fedora:/srv/swfl/research/cre-reports/cw_marketbeat/`. Add a post-extract copy to `$SWFL_RESEARCH_ROOT/cre-reports/<source>/<quarter>/` in the MarketBeat and Lee pipelines (a no-op when the var is unset). Add `raw_landing_class` to the six entries per the 08/02 taxonomy: `scrape_fragile` for cw/colliers (the hub drops old quarters [C1]), `free_refetchable` for Lee (the 2025-Q4 URL is still 200 [C2]), `paid_landed` for mhs_databook (bought annually per registry `:1803`, 403 on auto-fetch per `:1783`), and `free_refetchable` for the two local feeds.
    - Where: `ingest/pipelines/marketbeat_pdf/pipeline.py:72-83`, `lee_associates_swfl/pipeline.py:128-138`, registry entries.
    - Lane: D (Fedora). Effort: S.
    - Proof: `ssh fedora 'ls /srv/swfl/research/cre-reports/cw_marketbeat | wc -l'` returns at least 8. Gate 11 passes on push.
    - Unblocks: problem 18. Future reviews stay possible after C&W rotates the hub.
21. DO. One browser probe of Colliers from Fedora, then park it.
    - What: on the Fedora runner, fetch the Colliers research page once through `ingest/lib/crawl_client.py` (UndetectedAdapter; patchright chromium is installed per `docs/superpowers/handoffs/2026-09-20-runner-live-what-is-next.md:11`), read-only, no DB.
      - If it yields a `%PDF` link that downloads: pin the Colliers download step to `[self-hosted, swfl-local]`.
      - If it does not: remove the Colliers download step, set registry `dispatch_only: true` and note "manual drop only".
    - Where: `.github/workflows/marketbeat-pdf-ingest.yml:65-70`, registry `:1751-1775`.
    - Lane: D. Effort: S.
    - Proof: the probe's printed HTTP status and first 5 bytes, then `grep -n -A3 "name: colliers_industrial" ingest/cadence_registry.yaml`.
    - Unblocks: settles problem 5 for good.
22. DO. Correct the stale claims.
    - Where: registry `:1791`, `:1973`, `:1980`; `docs/standards/data-roots.md:1457`; `refinery/tools/build-corridor-fact-pack.mts:273`, `:284`; `refinery/sources/marketbeat-swfl-source.mts:34`, `:176`; `wiki/pipeline-census.md:128`. Also remove the registry comments naming closed checks (`:1736`, `:1739`, `:1794`, `:1817`, `:1980`) and replace them with this plan's item numbers.
    - Lane: D. Effort: S.
    - Proof: `rg -n "silently dropped|always false \(staged\)|:1754|cre_figures_consumer_wire" ingest/cadence_registry.yaml docs/standards/data-roots.md refinery wiki/pipeline-census.md` returns nothing.
    - Unblocks: problem 20.
23. ASK-FIRST. Clean `_source_model`.
    - What: `ALTER TABLE data_lake.marketbeat_swfl ALTER COLUMN _source_model DROP DEFAULT`, then `UPDATE ... SET _source_model = NULL WHERE _source_model = 'spark-1-mini'` (329 rows [Q8]). This is a data_lake write, so it needs the operator's word.
    - Where: new `docs/sql/` migration.
    - Lane: D. Effort: S.
    - Proof: `select count(*) from data_lake.marketbeat_swfl where _source_model='spark-1-mini'` returns 0.
    - Unblocks: problem 17.
24. ASK-FIRST. Write off the 60 unverifiable C&W 2024 rows.
    - What: delete them or tag them `verified=false` with a note column. The registry already says "write them off" (`:1732-1733`). The write is his call.
    - Where: new `docs/sql/` migration.
    - Lane: D. Effort: S.
    - Proof: `select count(*) from data_lake.marketbeat_swfl where source_name='cw_marketbeat' and sector='industrial' and not verified` returns 0 (delete) or 60 with the tag.
    - Unblocks: the dark-row count stops overstating a clearable backlog.
25. DO. Show verified rows first on the provenance page.
    - What: order `verified` desc, then `quarter` desc, when the table has a `verified` column, so the public sample matches what the brain serves.
    - Where: `app/r/source/[table]/page-data.ts:50-52`.
    - Lane: D. Effort: S.
    - Proof: `bunx next build`, then load `/r/source/marketbeat_swfl` and see the first row's `verified` true.
    - Unblocks: problem 19.
26. DO, 03/2027. MHS Multi-Family at the next drop.
    - What: when the 2027 book is dropped, extract Multi-Family through the same geometry recipe as the other three sectors ("Recipe 3", registry `:1794-1796`).
    - Lane: D, plus a Lane M interactive session if the recipe needs a new page map.
    - Effort: M.
    - Proof: `select count(*) from data_lake.marketbeat_swfl where source_name='mhs_databook' and sector='multifamily'` returns at least 1.
    - Unblocks: the MHS source_ceiling gap.

Count: 26 items, 21 DO and 5 ASK-FIRST (11, 14, 16, 23, 24).

## 8. Checks and balances

Design rules:
- One signal per pipeline, carried on existing seams.
- A signal fires only when a served number would be wrong or a consumer would read stale.
- It auto-closes when green.
- No GitHub issue per run, ever.

The carrier is `content_contracts` of `type: sql_expectation`, `locus: probe`, `severity: error` in `ingest/quality/quality_registry.yaml`. `check_data_quality.py` runs daily inside `freshness-probe-daily.yml` (`rg -l check_data_quality .github/workflows`). It opens exactly one `public.checks` row keyed `contract_fail_<table>_<name>` (`check_data_quality.py:335-336`, `:364-370`) and auto-closes it when the contract passes again (`:21`).

Trap, verified in code: the probe reads the contract's result as `failing = cur.fetchone()[0]` and passes only when that value is 0 (`check_data_quality.py:170-182`).
- A query that returns no rows makes `fetchone()` None. The exception is caught and the contract is reported SKIP, never FAIL (`:173-179`).
- So every contract below is written as `SELECT count(*) FROM (...)`: one integer, 0 = pass, 1 = fire.
- Each one also fires when its input set is empty. Items 16 and 24 can empty the verified set, and a silent contract at that moment would be the worst failure.

Why a checks row and not a doctor line: the daily probe has failed every day this week for other families (36259690113 on 09/26 and the four prior runs), so a doctor color alone is invisible.

Known bleed: the doctor keys content results by table (`doctor.py:139`). Any contract failing on `data_lake.marketbeat_swfl` reddens all four entries that share that table in the doctor view. The per-pipeline signal is therefore the named checks row, not the doctor color. The contract name carries the pipeline.

- marketbeat_swfl. Signal: `contract_fail_data_lake_marketbeat_swfl_cw_served_quarter_stale`. It fires when the newest verified cw_marketbeat quarter ended more than 200 days ago. That is the consumer-reads-stale condition, whatever the cause: publisher silence (problem 3), a cron miss (problem 1) or an unreviewed quarter.
  ```
  SELECT count(*) FROM (
    SELECT max(quarter) AS q FROM data_lake.marketbeat_swfl WHERE source_name='cw_marketbeat' AND verified
  ) s
  WHERE s.q IS NULL
     OR (make_date(left(s.q,4)::int, right(s.q,1)::int*3, 1) + interval '1 month' - interval '1 day')::date < current_date - 200
  ```
  [Q13] results:
  - Live on 09/26: count 0 (passing).
  - With `current_date` replaced by `DATE '2026-10-17'`: count 0.
  - With `DATE '2026-10-18'`: count 1.
  - With the verified set forced empty (`AND false`): count 1.
  It first fires on 10/18/2026 if 2026-Q2 is not landed and verified by then.
- colliers_industrial. Signal: none that opens a row, by design while PARKED. Nothing served reads Colliers (the verified gate at `marketbeat-swfl-source.mts:191` drops all 132). If question 1 wires cre_figures, add `colliers_newest_quarter_stale` (the same shape as above over all Colliers rows) in that same change.
- mhs_databook. Signal: `contract_fail_data_lake_marketbeat_swfl_mhs_annual_drop_overdue`. It replaces the 547-day tier-2 threshold that would stay silent until 12/04/2027 (problem 14).
  ```
  SELECT count(*) FROM (
    SELECT coalesce(max(quarter), '0000-Q0') AS q FROM data_lake.marketbeat_swfl WHERE source_name='mhs_databook'
  ) s
  WHERE s.q < extract(year from current_date)::int || '-Q1'
    AND current_date > make_date(extract(year from current_date)::int, 4, 15)
  ```
  [Q13] results: count 0 on 09/26; count 0 with `DATE '2027-04-15'`; count 1 with `DATE '2027-04-16'`. It first fires on 04/16/2027 if no 2027 book has been dropped. The 2026 book was published 03/13 (registry `:1783`).
- cre_figures. Signal: `contract_fail_data_lake_cre_figures_behind_upstream`. `severity: warn` until item 14 wires a reader, then `error`.
  ```
  SELECT count(*) FROM (
    SELECT (SELECT max(built_at) FROM data_lake.cre_figures) AS built,
           (SELECT max(_ingested_at) FROM data_lake.marketbeat_swfl) AS upstream
  ) s
  WHERE s.built IS NULL OR s.built < s.upstream - interval '2 days'
  ```
  [Q13]: count 1 today (built 07/18/2026, upstream 08/20/2026 per [Q4] and [Q2]). Item 15 clears it on the next Lee run.
- lee_associates_swfl. Signal: the existing checks row `cron_incident_ingest_lee_associates_swfl`, whose key the shared logger derives from the workflow name (`.github/scripts/log-cron-incident.mjs:56-58`; [K1] shows live rows of the same shape, e.g. `cron_incident_redfin_monthly`). `.github/workflows/log-cron-incident.yml:84` already lists this workflow, and the logger auto-resolves on the next scheduled success (`:1-7`).
  - What the logger also does: it opens one incident issue per workflow failure episode. It checks for an open one first (`.github/scripts/log-cron-incident.mjs:224-228`, "incident issue already open ... not duplicating") before `gh issue create` (`:257`), and the issue auto-closes on the next scheduled success. That is one per episode, not one per run. It is the shared ops-chain seam, and this family adds nothing to it.
  - The pipeline exits 1 on any sector error (`pipeline.py:154-158`) and on zero rows (`:140-145`), so every failure shape is red. The zero-row message `ERROR: No rows extracted from any sector.` already matches the classifier's DATA_EMPTY pattern (`no rows`, `classify-cron-failure.mjs:167-168`), so a Lee red gets a deterministic class.
  - Lee serves nothing today (0 verified [Q1]), so a data-age contract would be noise until item 14 lands.
- estero_edc. Signal: none, after item 3 retires the job. The served text expires on its own through item 2's 365-day guard, so no human is needed to catch it.
- fmb_recovery. Signal: the shared cron-incident row `cron_incident_ingest_local_cre_context` (`log-cron-incident.yml:85` lists `ingest-local-cre-context`). It starts firing once item 4 makes a 200 page with 0 parsed projects exit 1, with the message `0 projects returned`. That wording is a DATA_EMPTY token (`0 \w+ ... returned`, `classify-cron-failure.mjs:167-168`), so the red never falls to UNKNOWN. The served-age half is item 2's guard.
- Every deliberate red in this family must carry a DATA_EMPTY token. Items 4 and 7 change their error text to do so (`0 projects returned`, `0 rows extracted`). An UNKNOWN red routes to the heal workflow's model leg (section 10, leg 4).

Noise to delete:
- The issue-filing step `marketbeat-pdf-ingest.yml:87-124`, issues #85 and #124, and the `odd-manual-drop` label (item 6).
- The doctor yellow for dispatch_only and quarterly entries (item 19).
- The estero monthly WINDOW_OPEN yellow (items 1 and 3).
- `probe_mode: odd_window` on lee_associates_swfl and fmb_recovery (items 4 and 13).
- The six registry comments pointing at checks closed in the 09/15 bankruptcy (item 22). This plan does not reopen any of them.

Registry fields to set:
- estero_edc: `workflow: none`, `dispatch_only: true`.
- colliers_industrial: `dispatch_only: true` if item 21's probe fails.
- cre_figures: `workflow: ingest-lee-associates-swfl.yml` and remove `dispatch_only`.
- All six: `raw_landing_class` as in item 20.
- No `freshness_sla` blocks are added. The contracts above carry the signal, and an SLA breach would only add to a daily exit code that is already red for other reasons.

Why assert_landed is not used: `ingest/scripts/assert_landed.py:3-6` gates only `nightly: true` entries. Nothing in this family is nightly.

The ops site `/coverage` stays the human view. It needs no change for this family.

## 9. Box placement

- marketbeat_swfl moves to the Fedora runner (`runs-on: [self-hosted, swfl-local]`, gated by `SWFL_LOCAL_RUNNER_READY`).
  - Reason: it needs the SSD archive. The C&W hub lists only its current PDFs [C1], and 60 rows are already unverifiable because a PDF vanished (problem 18). The job must write every PDF to `SWFL_RESEARCH_ROOT=/srv/swfl/research` in the same run that downloads it.
  - No WAF reason exists. The hub fetch works from this workstation [C1]. Whether it works from GHA is unproven, because the only scheduled run predates the hub code [G2].
- colliers_industrial is PARKED, and its download step is deleted unless item 21's browser probe on Fedora clears Cloudflare. Plain curl from Fedora's residential IP is 403 [C3]. If the probe clears, it runs on Fedora, because it needs a browser plus the residential IP.
- mhs_databook stays manual. It is an annually bought PDF (registry `:1803`, "same annual cost") that returns 403 on auto-fetch (registry `:1783`). Its one box need is the archive copy in item 20. No runner job.
- cre_figures goes to GHA `ubuntu-latest` as a step appended to the Lee and MarketBeat jobs (item 15). It is DB-only and deterministic, needs no residential IP, and runs in seconds. On the MarketBeat job it runs on Fedora because the parent job moves there.
- lee_associates_swfl stays on GHA `ubuntu-latest`. Run 32358484270 downloaded all four PDFs from GHA without a block [G3]. The URLs stay live for old quarters (2025-Q4 still 200 [C2]), so an archive is a convenience, not a need. Item 20's copy is a no-op there.
- estero_edc is retired (item 3). Nothing runs.
- fmb_recovery stays on GHA `ubuntu-latest`. GHA fetched the page at 225,060 bytes [G4], with no WAF, no browser and no model.
- Already on the box and should not be: nothing from this family. All three workflows declare `runs-on: ubuntu-latest` (`marketbeat-pdf-ingest.yml:26`, `ingest-lee-associates-swfl.yml:30`, `ingest-local-cre-context.yml:23`).
- Hermes `no_agent` job on Spectre: none needed. Every job here is either on a GHA schedule or a manual drop.

## 10. Compute lane per LLM leg

The grep that proves the ingest-side list is [R1]. Its only LLM hits are `extractor.py:12`, `:28-32`, `:466`, `:483`, `:489`, `:491`, `:586`, `pipeline.py:121` (comment), and `marketbeat-pdf-ingest.yml:29`. Its other hits are non-LLM: `refinery` import paths in `scripts/build-cre-figures.mjs:6`, `:11-13`, a comment at `extractor.py:110`, and `cre-corroboration.mts:2`, which states "deterministic (code, never an LLM)". The Lee, Estero, FMB and cre_figures code has none. A second grep over the consumers of the family's tables, `rg -n -i -c "anthropic|messages\.create|claude-|callModel|generateText"` across the eight consumer files, hit only `refinery/tools/run-corridor-character-preview.mts` (1). A third check covers legs that this family's reds trigger rather than call: `rg -l "heal-cron-failure" .github/workflows` returns `heal-cron-failure.yml`, and `grep -n -E "lee-associates|local-cre|marketbeat|ANTHROPIC" .github/workflows/heal-cron-failure.yml` shows the three family workflows at `:84`, `:85`, `:93` and the key at `:191`. That is leg 4. Four legs in all: 1 in the ingest, 3 outside it.

1. MarketBeat vision fallback (in this family).
   - Code: `ingest/pipelines/marketbeat_pdf/extractor.py:482-535`, model `claude-haiku-4-5-20251001` (`:491`).
   - What it does: when a page has under 200 characters of text (`:479`), it sends the page image and asks for the submarket table as JSON.
   - Current auth: the `ANTHROPIC_API_KEY` repo secret, exported at `marketbeat-pdf-ingest.yml:29`. It has never been used: 0 logged calls [Q12].
   - Replacement lane: none, because the leg is deleted (item 7). All sources in this family are text PDFs. The only per-page text evidence here is the parsed outputs [Q1] and [C6], plus `_RESEARCH/INDEX.md:323`, which records zero scanned PDFs in the repo.
   - If a future layout defeats the text parsers, the run goes red and a Lane M interactive session extends `extractor.py`. No unattended model is involved.
2. Corridor character synthesizer (consumer-side, outside this family's ingest).
   - Code: `refinery/tools/synthesize-corridor-character.mts:47` (`@anthropic-ai/sdk`, model per `:35`), driven by `refinery/tools/run-corridor-character-preview.mts:393`. The driver reads `data_lake.marketbeat_swfl` (`:183`).
   - It is a manual preview tool. `rg -l run-corridor-character-preview .github package.json scripts` finds only `scripts/write_ops_cities.py`, and no workflow.
   - Current auth: the `ANTHROPIC_API_KEY` named in its header (`run-corridor-character-preview.mts:144`).
   - Replacement lane: Lane M, an interactive Max session authoring the corridor text directly (the Issue 001 pattern), if it is ever re-run. This family changes nothing there.
3. Downstream narrative over cre-swfl caveats (consumer-side, outside this family).
   - `cre-swfl.mts:2009-2011` injects the local-context rows as caveats "so the downstream LLM sees the redevelopment signal". That model call belongs to the narrative leg owned by the ops-chain family (narrative-bake), which is parked; its lane is that family's plan to set.
   - This family's contribution is deterministic: items 1 through 4 make sure the caveats it feeds are current and dated. No lane change here.

4. Heal-workflow diagnosis (shared, owned by the ops-chain family; this family's reds trigger it).
   - Code: `.github/workflows/heal-cron-failure.yml` lists `ingest-lee-associates-swfl`, `ingest-local-cre-context` and `marketbeat-pdf-ingest` in its `workflow_run` trigger (`:84`, `:85`, `:93`).
   - What it does: its L2 step "diagnose + comment" runs `node .github/scripts/heal-cron-failure.mjs --mode=diagnose` with `@anthropic-ai/sdk` (`:186-193`). The file header says L2 is "LLM narrative (fuzzy)" and never writes code (`:4-7`). The classifier header says only UNKNOWN routes there (`classify-cron-failure.mjs:5-6`).
   - Current auth: the `ANTHROPIC_API_KEY` repo secret (`heal-cron-failure.yml:191`).
   - This family's replacement is to never reach it. Every deliberate red here carries a DATA_EMPTY token: Lee's existing `No rows extracted`, item 4's `0 projects returned`, item 7's `0 rows extracted`. The class is then deterministic and L2 does not run.
   - The lane for the leg itself is the ops-chain family's call. This plan does not touch it.

Max-plan note: none of these legs needs an unattended model once item 7 lands. The operator's standing decision that internal pipelines may use the Max plan is recorded, and it is not needed in this family.

## 11. Double-check log

I re-read the file top to bottom. Each numbered claim below is listed with the command or file that verifies it and the result.

1. 377 rows in marketbeat_swfl, newest `_ingested_at` 08/20/2026 · [Q2] · verified.
2. cw industrial 109 (49 verified), medical 64 (64 verified), colliers 66 + 66 (0), lee 6 x 4 (0), mhs 16 x 3 (48) · [Q1] · verified.
3. 113 served C&W rows and 161 served in total · [Q1] (49 + 64 = 113; + 48 = 161) · verified.
4. 216 dark rows · [Q2] 377 minus 161 · verified.
5. MHS served through the per-field flags, 48 of 48 true · [Q11], `marketbeat-swfl-source.mts:189-190` · verified. The code comment's contrary claim is logged as problem 20.
6. County split: cw 88/73/12, colliers 88/22/22, lee 24/0/0, mhs 24/21/3, Hendry 0 · [Q10], sums 173/132/24/48 match [Q1] · verified.
7. local_cre_context: estero 6 rows (report_date 2025-12-01..2026-01-01), fmb 8 rows (2025-08-01..2026-05-01), all stamped 09/01/2026 · [Q3] · verified.
8. cre_figures 1,078 / 985, built 07/18/2026, by firm 459/344/95/180 · [Q4] · verified.
9. Rebuild dry-run gives 1,097 / 1,004, lee 114, tiers 911/45/48 · [B1] · verified. 114 minus 95 = 19 · verified.
10. Lee cap_rate on 24 of 24 rows; `cap_rate` column exists · [Q8], [Q6] · verified. This corrected my own first-draft reading, which had repeated the registry's "dropped" claim.
11. Lee Q2 2026 values match the PDF · [C6] vs [Q7] · verified.
12. Lee multifamily inventory 37,223 to 111,735 between 2025-Q2 and 2025-Q3 · [C6] shows the source PDF itself prints these values · verified, and corrected. My first reading of [Q7] took the jump for a parse error. The PDF shows it is the publisher's own series break, so it is not listed as a problem.
13. Multifamily `sale_price_psf` 202,144..238,150 labelled `USD/sqft` in cre_figures · [Q9] · verified.
14. The absorption spread of 549,585 for Fort Myers industrial 2025-Q2 · [B1] output line · verified.
15. marketbeat runs: 9 total, 2 green, 7 red; newest green 07/15/2026 · [G1] · verified.
16. Lee runs: 3 green, 0 red; 32358484270 upserted 20 · [G1], [G3] · verified.
17. local-cre runs: 3 green, 0 red · [G1] · verified.
18. 29411199476 landed zero rows · [G2] line `No MarketBeat/Colliers PDFs found to process.` · verified.
19. 27213582576's landing is not visible because the log expired. Issue #85 created 14:34:23 UTC inside it · [G6], and `gh run view 27213582576 --log` returned 1 line · could-not-verify the row count, verified the download failure via the issue.
20. Red 27190021217 has 0 jobs and no log · [G5] · verified.
21. Issues #85 and #124 are open duplicates · [G6] · verified.
22. The hub's newest PDFs are 2026-Q1 (industrial, medical, office) and 2025-Q4 (retail) · [C1] (run twice: my own crawl and the downloader's own regex) · verified.
23. 88 days from Q2 close to 09/26 · python `date(2026,9,26)-date(2026,6,30)` = 88 · verified.
24. The Colliers media URLs are 403 from this workstation. The one 302 resolves to 403 · [C3] · verified. Fedora 403 on both URLs tried · [C3] ssh · verified. A browser path is untried · stated as such.
25. Lee Q4 folder: 2025/01 is 404, 2026/01 is 200. Naples Q2 is 200 at 2,605,844 bytes. Q3 2026 in 2026/10 is 404 (not yet published) · [C2] · verified.
26. Estero page 404, estero home 200, FMB page 200, `/cdbg-dr` 404, MHS 2026 page 200, Lee research 200 · [C4] · verified.
27. GHA Estero SSL error, FMB `Live scrape OK (225,060 bytes)` · [G4] · verified.
28. FMB page has 24 headings; an Estero PZDB 09/15/2026 item link exists · [C5] · verified.
29. 1 fmb row older than 365 days · [Q13] · verified.
30. MHS silent until 12/04/2027 · python `date(2026,6,5)+timedelta(547)` = 2027-12-04; formula `check_freshness.py:498-499` · verified.
31. The cw signal first fires 10/18/2026 · python `date(2026,3,31)+timedelta(200)` = 2026-10-17, and the test is strict `<`, so 10/17 is equal and passes; [Q13] re-run with `current_date` replaced by `DATE '2026-10-17'` returns count 0 and by `DATE '2026-10-18'` returns count 1 · corrected (first draft said 10/17).
32. The proposed contracts on 09/26, in their final `count(*)` form: cw count 0, mhs count 0, cre_figures count 1 · [Q13] · verified.
33. Doctor lines for the seven entries on 09/26 · [G7] · verified. marketbeat and colliers `NO_RUNS_IN_WINDOW`; mhs and cre_figures `NO_WORKFLOW`; estero `WINDOW_OPEN`; fmb and lee `WAITING` green.
34. The doctor has no `dispatch_only` handling · `rg -n dispatch_only ingest/scripts/doctor.py ingest/lib/gh_runs.py` returned nothing · verified.
35. The doctor keys content by table · `doctor.py:135-139` · verified.
36. The contract check key shape and auto-close · `check_data_quality.py:60`, `:335-336`, `:364-370` · verified.
37. The vision leg never fired: 0 of 6,122 · [Q12] · verified.
38. `FORCE_VISION` is read nowhere · `rg -n FORCE_VISION ingest .github` (only `extractor.py:586`) · verified.
39. `_source_model` default `spark-1-mini`, 329 rows · [Q6], [Q8] (132 + 173 + 24) · verified.
40. 8 local PDFs, all C&W · `ls ingest/drops/marketbeat_pdf | wc -l` = 8 and the listing · verified.
41. `raw_landing_class` only on cre_figures among the seven · the registry blocks read at `:1690-2032` · verified.
42. Tests: 22/6/8/1/39 pass, 0 fail · [T1] · verified. 76 total: 22 + 6 + 8 + 1 + 39 = 76 · verified. Zero ingest-side tests · [T2] · verified.
43. daily-rebuild last run 08/12/2026, 31606980553 · [G8] · verified.
44. The cap_rate fix commit 4a23ff21 on 07/11/2026 · `git log -S cap_rate -- ingest/pipelines/lee_associates_swfl/pipeline.py` · verified.
45. `odd-manual-drop` used only by the MarketBeat workflow · `rg -l odd-manual-drop .github scripts ingest` · verified.
46. The log-cron-incident workflow lists the Lee and local-cre workflows · `log-cron-incident.yml:84-85`, `:93` · verified.
47. Lee Q1-2026 industrial NNN 13.67, not 12.20 as the registry note says · [Q7] (2026-Q1 query) · verified.
48. None of the family's registry-named checks is in the 09/26 open list · [K1] (21 open, none of the six names) · verified.
49. Plan item count: 26, with 21 DO and 5 ASK-FIRST · counted in section 7 · verified.
50. Problem count: 21 · counted in section 4 · verified.
51. Registry `name:` line anchors (`:1690`, `:1751`, `:1776`, `:1808`, `:1962`, `:1988`, `:2011`) · `grep -n "name: <x>" ingest/cadence_registry.yaml` · verified.
52. The Lee workflow `runs-on` line · `ingest-lee-associates-swfl.yml:30` · verified. The MarketBeat workflow `:26` · verified. The local-cre workflow `:23` · verified.
53. MarketBeat red cause "workflow-file rejected at push" · inferred from `jobs=0` + `event=push` [G5] · could-not-verify from a log (expired). Stated as a shape, not a classification.
54. The C&W publisher cause (affiliate acquisition) · `downloader.py:5-6` and the hub file names · could-not-verify. Stated as unverified in problem 3.
55. Every file:line anchor in sections 2 through 10 · re-read each with `sed -n "<n>p"` / `grep -n` after the first draft · corrected 14 anchors (13 bullets; the fmb bullet holds two). The first draft had these anchors wrong, and each is now fixed in place:
    - `extract.py:190-191` → `:197`
    - `check_freshness.py:499-500` → `:498-499`
    - `extractor.py:480` → `:479`
    - `extractor.py:522` → registry `:1768`
    - registry `:1713-1714` → `:1712-1713`
    - `:1745` → `:1746`
    - `:1774` → `:1771`
    - `:1802` → `:1803`
    - `:1823` → `:1831`
    - `:1996` → `:1999`
    - `:1732-1735` → `:1732-1733`
    - `fmb_recovery/pipeline.py:204-208` → `:203-208`, and `:186-190` → `:187-191`
    - `doctor.py:157-176` → `:153-176`

56. All seven 06/09 push-event reds had zero jobs · `gh run view <id> --json jobs -q '.jobs|length'` for 27189768749, 27189721725, 27189014732, 27188191213, 27187748076 and 27187071685 each returned 0, plus [G5] for 27190021217 · verified. Problem 1's wording was corrected to rely on this.
57. Naples proof count · `extract.py:5` (5 quarters per PDF) and [G3] (20 rows per run) · corrected from 24 to 20 in item 12 and in the section 6 verdict.
58. MHS "paid" · the registry does not say "paid". `:1803` says "same annual cost" and `:1783` says 403 on auto-fetch · corrected in sections 7 (item 20) and 9 to cite exactly that.
59. `americas_alliance` in hub file names · [C1] full link list: 3 of 4 current links (the 2026-Q1 ones) carry it · corrected in problem 3 from "the current hub file names".

60. The contract probe reads `cur.fetchone()[0]` as the failing count and reports SKIP when a query returns no rows · `ingest/scripts/check_data_quality.py:170-182` · verified. Corrected: the first-draft section 8 SQL returned quarter strings or no rows, so it would have gone SKIP instead of firing. All three are now `SELECT count(*) FROM (...)`.
61. The MHS contract fires on 04/16/2027, not before · [Q13] with `DATE '2027-04-15'` = count 0 and `DATE '2027-04-16'` = count 1 · verified.
62. The cw contract fires when the verified set is empty · [Q13] with `AND false` = count 1 · corrected. The first draft passed silently on an empty set; `s.q IS NULL` was added.
63. The shared logger opens at most one incident issue per workflow episode and auto-closes it · `.github/scripts/log-cron-incident.mjs:224-228` (dedup) and `:257` (create), header `log-cron-incident.yml:1-7` · verified. Stated in section 8 as per episode, not per run.
64. heal-cron-failure is triggered by all three family workflows and runs a model step with `ANTHROPIC_API_KEY` · `heal-cron-failure.yml:84`, `:85`, `:93`, `:186-193` · verified. Corrected: the first draft listed 3 LLM legs. Leg 4 is added in section 10 and the DATA_EMPTY wording in items 4 and 7.
65. Lee's zero-row red already classifies DATA_EMPTY · `lee_associates_swfl/pipeline.py:141` prints `ERROR: No rows extracted from any sector.`; `classify-cron-failure.mjs:168` matches `no rows` case-insensitively · verified.
66. Cron-incident checks key shape · `log-cron-incident.mjs:56-58` gives `cron_incident_ingest_lee_associates_swfl` and `cron_incident_ingest_local_cre_context` · corrected from a loose "-style" name in the first draft.
67. Problem 15's count · [G7] shows five yellow family lines · corrected. The heading said four.
68. The Section 10 leg count is 4 · the three greps in section 10 · verified.

Totals: 68 claims checked. 26 corrections applied: 14 line anchors in claim 55, plus claims 10, 12, 31, 56, 57, 58, 59, 60, 62, 64, 66 and 67. 4 claims could not be fully verified: 19, 53 and 54, and the untried browser path in 24.

Corrections applied above: claims 10, 12, 31, 53, 55 through 60, 62, 64, 66 and 67 changed the text of sections 2 through 10. The section 8 contracts were rewritten to the `count(*)` form, with the empty-set case and the 10/18 date. Leg 4 was added to section 10. The Lee multifamily jump was removed from the problem list and moved to section 3 as proof the parse is faithful. The cap_rate "dropped" claim moved from the missing list to problem 20 (stale claim). The marketbeat red was worded as a shape, not a class. The line anchors listed in 55 were fixed in place.

## 12. Questions for the operator

1. cre_figures: wire it into cre-swfl as a labelled, corroboration-scored source for the firms and quarters the verified gate drops (item 14; it changes cre-swfl's output), or retire the table and its builder? It has 0 readers today, and it is the only way the 216 dark rows ever reach a customer.
2. Should anything other than your own read of the PDF ever count as `verified` for a broker row? For example, a two-parser agreement, or Codex doing an independent second reading. Today it means a human read the PDF (registry `:1722-1729`). Item 17 keeps that meaning and only speeds up your read. Changing it changes what "verified" promises a customer.
