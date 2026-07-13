# Ingest — scrape / ODD / CRE-broker sources + cadence registry

**Health: shaky.** The scaffolding (firecrawl→spider fallback layer, ODD-window probe, freshness watchdog, MHS collision rule, ZIP-spine geocoder) is genuinely well-built and the invariants are mostly honored. But several *active* CRE-broker pipelines silently fail to reach the consumer or the probe: lee_associates writes `verified=false` rows that the marketbeat source filters out entirely (orphan substrate); the Crexi scraper bypasses the spider-fallback wrapper it was supposed to use (the exact silent-zero-rows trap); seed-only "scrape" pipelines bump `_ingested_at` every run so the probe can never see a frozen snapshot; and two documented dead-end stubs sit in the active probe where they will alarm OVERDUE forever. The model IDs were Vendor-First-verified clean (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001` both current).

---

## [HIGH] lee_associates rows land verified=false and are silently dropped by the consumer (orphan substrate)

**Location:** `ingest/pipelines/lee_associates_swfl/extract.py:138` (`"verified": False`) + `refinery/sources/marketbeat-swfl-source.mts:168-194` (`selectLatestVerifiedPerSubmarket`)

**Detail:** The Lee & Associates pipeline is ACTIVE (graduated 2026-06-10, `5908be8`; weekly... quarterly GHA cron live) and writes Fort Myers Office/Retail/Industrial/Multifamily rows into `data_lake.marketbeat_swfl` with `source_name='lee_associates'` and a hardcoded `verified: false`. But the only consumer of that table, `selectLatestVerifiedPerSubmarket`, includes a non-`mhs_databook` row ONLY when `verified === true`. Nothing in the codebase ever sets `verified=true` for a `lee_associates` row (grep confirms no post-ingest verify step). Result: every Lee & Associates row is written to Tier-2 and then never surfaced to cre-swfl/master — it is orphan substrate. This defeats the entire stated purpose of the source ("C&W covers Industrial only; Lee & Associates is the primary public source for Fort Myers Office, Retail, Multifamily"). Compounding it: `fetchLive()` filters `.in("sector", SURFACED_SECTORS)` where `SURFACED_SECTORS = ["retail","industrial","office"]` — so even if verified were flipped, Lee's `multifamily` rows are doubly excluded.

**Fix:** Decide the gate explicitly. Either (a) treat `lee_associates` like a third trusted source in the inclusion rule (e.g. include when `verified===true OR source_name IN ('lee_associates')` — but then the "verified" semantics need a real spot-check path), or (b) flip the pipeline to write `verified=true` for the sectors that passed extraction sanity checks, matching the cw_marketbeat legacy gate. Also add `multifamily` to `SURFACED_SECTORS` (or document that MF is intentionally dark). Whichever path, add a unit test asserting a `lee_associates` row reaches a fragment, since the current test fixture only exercises cw + mhs.

**Model:** opus — touches the verification-gate invariant and the cross-source collision/inclusion semantics; requires a judgment call on what "verified" means for a 3rd broker, not a mechanical edit.

---

## [HIGH] Crexi scraper calls firecrawl agent() directly — bypasses the spider-fallback wrapper (silent-zero-rows trap)

**Location:** `ingest/pipelines/crexi_listings/extract.py:17,79` (`from ingest.lib.firecrawl_client import agent` → `agent(...)`)

**Detail:** `docs/standards/pipeline-freshness.md §6` and `extract_client.py`'s own docstring mandate that `/v2/agent` callers route through `extract_client.extract()` so a firecrawl failure/empty-result falls back to spider `/ai/scrape` and otherwise raises a LOUD `ExtractError`. The Crexi pipeline instead calls bare `firecrawl_client.agent()` and, worse, its own `fetch_listings_for_city` swallows `FirecrawlError` and `return []` (extract.py:92-95). So a blocked/changed Crexi page produces zero rows with no exception, the pipeline prints "0 raw listings" and exits 0 (green). This is precisely the "ran green but wrote 0 rows for weeks" class the fallback layer exists to kill. The `ingest-crexi-listings.yml` workflow also never sets `SPIDER_API_KEY`, so even the wrapper couldn't fall back today. (Crexi is also still `probe_mode: odd_window` / "NOT YET ACTIVATED", so a quiet failure won't even trip the standard LOW_VOLUME floor.)

**Fix:** Switch `extract.py` to `from ingest.lib.extract_client import extract` and call `extract(prompt, urls=[...], schema=..., model=..., max_credits=...)`; stop swallowing the error (let `ExtractError` propagate so the GHA reds). Add `SPIDER_API_KEY: ${{ secrets.SPIDER_API_KEY }}` to the workflow env. When it graduates, give it an `expected_rows_min` recency floor.

**Model:** sonnet — well-specified mechanical swap to an existing wrapper with a clear contract; low ambiguity.

---

## [HIGH] fgcu_reri uses V1FirecrawlApp directly, no spider fallback — same silent-stop exposure on a monthly source

**Location:** `ingest/pipelines/fgcu_reri_indicators/pipeline.py:32,266-270` (`from firecrawl import V1FirecrawlApp` → `app.scrape_url(...)`)

**Detail:** This is a plain page-to-markdown scrape (`scrape_url(RERI_HOME_URL, formats=["markdown"])`) — exactly what `scrape_with_fallback()` was built to wrap per §6. It bypasses the wrapper, so if Firecrawl returns empty markdown (RERI homepage redesign, Cloudflare block) the pipeline `raise RuntimeError`s — which at least reds the cron (better than Crexi), but it gets ZERO spider fallback, so a transient firecrawl miss fails the whole monthly run with no second vendor. It also pins the legacy `V1FirecrawlApp` SDK surface while the rest of the repo is on `firecrawl-py>=4.28` `/v2`. The parser is also brittle: `parse_indicators` depends on exact markdown line structure ("Southwest Florida Economic Outlook" header, alternating name/value lines, `[MONTH` link sentinel) — a layout change yields 0 rows → RuntimeError every month until hand-fixed.

**Fix:** Route through `extract_client.scrape_with_fallback(RERI_HOME_URL, formats=["markdown"])`; drop the `V1FirecrawlApp` import. Consider a vision/LLM extraction fallback for the indicator block so a cosmetic layout change degrades gracefully instead of hard-failing.

**Model:** sonnet — swap to the existing wrapper is mechanical; the parser-robustness improvement is a smaller follow-up but still well-specified.

---

## [HIGH] Seed-upsert pipelines (estero_edc, fmb_recovery) bump `_ingested_at` every run → probe can never detect a frozen snapshot (false-FRESH)

**Location:** `ingest/pipelines/estero_edc/pipeline.py:148-179` (`_upsert_rows` sets `ingested_at = now()` then `ON CONFLICT DO UPDATE ... _ingested_at = EXCLUDED._ingested_at`) + same pattern in `ingest/pipelines/fmb_recovery/pipeline.py`; probe at `ingest/scripts/check_freshness.py:430` (`check_odd_window_entry` reads MAX(`_ingested_at`))

**Detail:** Both `local_cre_context` pipelines are pure seed snapshots (hardcoded `SEED_ROWS` from 2026-06-09). `estero_edc._try_live_scrape()` (lines 134-145) is theater — it does a `requests.get` and on success returns `[]` (never parses anything), so the "live" path adds nothing; the data is 100% static seed. Yet every monthly GHA run re-upserts the identical seed and stamps a fresh `_ingested_at`. The ODD-window probe keys freshness on MAX(`_ingested_at` WHERE source_name=...), so it will report these as FRESH indefinitely even though the underlying facts (Corkscrew Rd widening "est. completion end-2026", "Pier contract awarded Apr 8 2026") are frozen and will silently go stale. This is the "ran green, data is stale" false-signal the freshness system is supposed to prevent — defeated by self-refreshing the timestamp on unchanged rows.

**Fix:** Don't bump `_ingested_at` when the row content is unchanged — use `ON CONFLICT DO UPDATE ... WHERE local_cre_context.headline IS DISTINCT FROM EXCLUDED.headline OR detail IS DISTINCT FROM EXCLUDED.detail` (Postgres skips the timestamp bump when nothing changed). Then the probe's MAX(`_ingested_at`) reflects the true last-content-change date and OVERDUE fires when the seed goes stale. Alternatively add a `content_date`/`report_date`-based freshness column. Either also forces the operator to actually refresh the seed (the intended ODD graduation behavior).

**Model:** opus — the fix touches the freshness-signal contract (what "fresh" means for a manually-curated seed source) and interacts with the ODD-window probe semantics; needs judgment, not a rote SQL tweak.

---

## [MEDIUM] Dead-end stubs (premier_commercial, svn_florida) sit in the active probe → guaranteed recurring OVERDUE false alarms

**Location:** `ingest/cadence_registry.yaml:593-613` (both `probe_mode: odd_window`, no `first_expected_by`); stubs `ingest/pipelines/{premier_commercial_swfl,svn_florida_swfl}/pipeline.py` (both `sys.exit(1)` unconditionally)

**Detail:** The registry itself documents these as dead ends ("NO MARKET REPORTS … brokerage-only", "TRANSACTION NEWS ONLY … no structured report tables", both "Stub exits 1"). They are in the `pipelines:` block with `probe_mode: odd_window` and NO `first_expected_by` and NO data. In `check_odd_window_entry`, with `last_run=None` and no `first_expected_by`, `expected = today + cadence_days` (90d). So ~80 days from now each flips WINDOW_OPEN (👀) then OVERDUE (🚨) — a loud alert — for a source that by design will NEVER land data. The clock resets each probe run (`today + cadence`) so it oscillates rather than alarming permanently, which is arguably worse: recurring noise that trains the operator to ignore the probe. These belong in the `not_yet_running:` block (probe-excluded), exactly where `airdna_str_swfl` correctly sits, or removed.

**Fix:** Move `premier_commercial_swfl` and `svn_florida_swfl` to `not_yet_running:` (or delete them and their stub dirs). If SVN's deal-level press releases are ever wanted, that's a NEW table + pipeline, not this `marketbeat_swfl` slot. Keep the note text as a tombstone comment in `not_yet_running:`.

**Model:** sonnet — mechanical registry move with a clear destination block and precedent (airdna).

---

## [MEDIUM] active-listings consumer never prunes stale rows — listing_count and available_sqft inflate over time

**Location:** `refinery/sources/active-listings-source.mts:67-138` (`fetchLive` filters `status='available'` but no `_ingested_at` recency bound); upstream `ingest/pipelines/crexi_listings/distill.py:124-134` (`ON CONFLICT (source_name, source_url) DO UPDATE ... WHERE source_url IS NOT NULL`)

**Detail:** Two compounding decay bugs. (1) The Crexi upsert keys on `(source_name, source_url)`; for rows where `source_url IS NULL` the UNIQUE constraint does NOT dedupe (Postgres treats NULLs as distinct) and `_make_id` hashes address+city, so a re-scraped URL-less listing inserts a NEW id every weekly run → unbounded duplicate accumulation. (2) The consumer aggregates `COUNT(*)` and `SUM(sqft)` over ALL rows with `status='available'`, with no `_ingested_at >= now()-Nd` window. A listing that leased weeks ago but was simply absent from later scrapes (so never updated to `leased`) stays `available` forever and keeps counting. Net effect: `listing_count` and `available_sqft_raw` drift upward across weeks, feeding cre-swfl an inflated available-inventory signal for Estero/FMB — a quiet data-quality breach of "deterministic math, no invented numbers."

**Fix:** In the consumer, bound the aggregation to the most-recent scrape cohort (e.g. `_ingested_at >= (SELECT max(_ingested_at) FROM active_listings_cre) - interval '8 days'`, or per-city max), so only the latest run's available set counts. In the pipeline, give URL-less rows a stable dedup key (hash of address+city as the conflict target) or require `source_url` and drop rows without one. Add a "seen this run" / soft-delete pass so listings that fall out of a scrape age out.

**Model:** opus — spans the SQL upsert semantics AND the consumer aggregation contract feeding master; the right windowing strategy is a judgment call with correctness stakes.

---

## [MEDIUM] city_pulse Tier-2 (Postgres) has no recency watchdog — asymmetric with city_pulse_corridors_tier2

**Location:** `ingest/cadence_registry.yaml:145-153` (`city_pulse` tier-1 only) vs `:466-478` (`city_pulse_corridors_tier2` non-dlt recency watchdog); pipeline exit logic `ingest/pipelines/city_pulse/pipeline.py:327-343`

**Detail:** The corridors flow got a dedicated `city_pulse_corridors_tier2` recency entry specifically to catch "the cron ran green but distill wrote 0 rows to Postgres for weeks" (the comment even cites the city_pulse incident as precedent). But `city_pulse` itself has NO equivalent Tier-2 recency entry — only the tier-1 inventory entry watching the Parquet upload (`cadence_days:1`). The pipeline raises only when ALL cities fail at search/distill (`len(errors)==len(cities)`); if every city succeeds at search but distill returns 0 rows for all of them (response-shape drift, a real risk given the firecrawl-vs-anthropic dual path), `total_new=0`, `errors=[]`, exit 0 — green, Parquet uploaded, zero rows to `data_lake.city_pulse`. The very gap the corridors watchdog closes is left open on the parent flow.

**Fix:** Add a `city_pulse_tier2` registry entry mirroring `city_pulse_corridors_tier2`: `freshness_table: data_lake.city_pulse`, the correct recency column, `tolerance_multiplier` allowing a quiet day or two, no `expected_rows_min` (legit quiet days write 0 new). Optionally have the pipeline emit a non-zero exit (or a distinct warning the watchdog reads) when `total_new==0` across all cities for a run.

**Model:** sonnet — registry addition with an exact existing template (the corridors entry) to copy.

---

## [LOW] Crexi distill ON CONFLICT update is gated by `WHERE source_url IS NOT NULL` but INSERTs URL-less rows anyway

**Location:** `ingest/pipelines/crexi_listings/distill.py:124-134`

**Detail:** The `DO UPDATE ... WHERE active_listings_cre.source_url IS NOT NULL` clause is dead weight: a conflict on the `(source_name, source_url)` UNIQUE constraint can only fire when `source_url` is non-NULL in the first place (NULLs never conflict), so the guard is always true on the path it runs. Meanwhile URL-less rows bypass the constraint entirely and accumulate (see the MEDIUM above). The clause reads as if it protects something but doesn't.

**Fix:** Remove the redundant `WHERE` (or, better, fix the root issue per the active-listings finding by making URL-less rows dedupe on a stable key). Low priority on its own; fold into the active-listings fix.

**Model:** sonnet — trivial clause removal once the dedup strategy is decided.

---

## [LOW] noaa_ghcn_rainfall parked since 2026-06-04 — wired with cron but "first run pending", env-swfl metric still empty

**Location:** `ingest/cadence_registry.yaml:453-464` ("First run: pending first GHA dispatch"); pipeline `ingest/pipelines/noaa_ghcn_rainfall/` (complete: resources.py, constants.py, pipeline.py); consumer is `env-swfl` (`env_rainfall_swfl_annual_in`)

**Detail:** The pipeline is fully built and idempotent (AWS Open-Data S3, no auth, merge on `id=station|year`, QC-filtered, 4 anchor stations) and has a monthly cron workflow, but per the registry it has never run — so the `env_rainfall_swfl_annual_in` key_metric it feeds is presumably empty/absent in env-swfl. This is a built-but-not-activated hole: zero-cost data we're not capturing. `expected_rows_min: 8` will read LOW_VOLUME the moment it's added to active probing, masking the "never ran" state until someone dispatches it.

**Fix:** Trigger one `workflow_dispatch` run, confirm rows land + env-swfl picks up the metric, then update the registry "First run" stamp. If there's a blocker (e.g. the brain doesn't actually consume it yet), record it in the checks ledger rather than leaving a silent gap.

**Model:** sonnet — operational dispatch + verify; no design judgment.

---

## [LOW] Authoritative SWFL CRE/economic sources we are NOT capturing (holes)

**Location:** scope analysis across `ingest/cadence_registry.yaml` + `not_yet_running:`

**Detail:** Gaps relevant to this lane: (1) **STR revenue/occupancy** — `airdna_str_swfl` correctly parked (ODD, paid), consumer empty-tolerant; this is a known, well-scaffolded hole, not a bug. (2) **Office/Retail/MF broker surveys outside Fort Myers** — with lee_associates dark (HIGH above) and C&W/Colliers industrial-only, the only non-industrial CRE coverage is MHS (annual, manual) + Lee (broken). Naples/Bonita/Charlotte office+retail vacancy is effectively uncovered. (3) **Crexi never activated** — Estero/FMB lease listings, the stated MarketBeat-gap filler, has produced no data (still `odd_window`, "NOT YET ACTIVATED"). (4) **SVN investment-sales / deal-level comps** — explicitly declined ("if valuable, wire to a separate table") — a real signal (SWFL CRE transaction velocity) left on the table. None of these are silent — they're documented — but together they mean the CRE corridor signal feeding master is thinner than the registry's breadth implies.

**Fix:** No code change required; prioritize via the checks ledger / build queue. The highest-leverage near-term win is fixing lee_associates (already built, just gated off) — that alone restores Fort Myers Office/Retail/MF. Crexi activation is second (already built, needs the fallback fix + first green run).

**Model:** sonnet — this is roadmap/triage framing, not an implementation; low ambiguity on the inventory itself.
