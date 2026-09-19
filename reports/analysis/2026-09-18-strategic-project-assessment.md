# SWFL Data Gulf: strategic assessment

Assessment date: September 18, 2026. Decision: whether to preserve, rebuild, or abandon the project in pursuit of cross-domain local intelligence and testable predictions.

## Verdict

The intended product is feasible in a narrower, measurable form with the existing technical stack. The current system is not that product yet. It is a substantial data collection and reporting system surrounded by a large real-estate distribution application, with a heuristic synthesis engine and an unfinished evaluation loop.

Preserve the data, working collectors, provenance, geographic reference work, and useful evaluation primitives. Redesign the analytical core and reset the operating priorities. A wholesale deletion/restart would lose useful assets. Repairing today's scheduled jobs alone would restore an older reporting product without delivering the intended intelligence.

Changing coding models can improve implementation execution. It cannot substitute for a coherent target, adequate historical data, and evidence that a forecast beats a simple alternative.

## What was actually examined

- Root and scoped instructions, the stated goal, consumption contract, research/catalog material, injected priorities, and relevant historical decisions.
- Ingest collectors and schedules; source connectors; brain stages and master; public MCP/report serving; prediction logging, observations, grading, and historical tests.
- The separate `swfldatagulf-ops` repository. Its local checkout is older, but the ops review verified nine relevant source files against remote main `2faf5a22db0456fdb3850cf34239a78a4567a969` by identical Git blob hashes.
- Read-only production Postgres queries, public report requests, and actual GitHub Actions runs. Database sessions explicitly used `default_transaction_read_only=on` and a 25-second statement timeout.
- Official data-source and Carbon Arc documentation for the feasibility/data comparison.

Main local HEAD was `6a05928c`. The latest inspected nightly run used `82d5ba06148af7b2d8793e332111db49b54c7b18`; live behavior is reported separately from local code. The repository exploration and architecture-review skills guided the source-map and independent ingest/ops/evaluation reviews. Repomix indexed 828 selected files, approximately 839k tokens; that is an exploration index, not a claim that every line was audited. Its scratch output is outside the repository at `C:/Users/ethan/AppData/Local/Temp/swfl-strategic-audit.xml`.

This was not a repair or deployment. No pipelines, database records, scheduled jobs, or production settings were changed. The pre-existing edit to `_ASSISTANT/TODAY.md` was preserved. This report is the only repository addition.

## 1. The vision was understood, then subordinated

`docs/THE-GOAL.md:64` already describes the requested Walmart example: observe an opening, record starting conditions, predict effects, measure outcomes, and accumulate matched comparisons. `docs/ontology-and-roadmap.md` explicitly says there is no headline industry.

The operational instructions contradict that direction. `_ASSISTANT/NORTH-STAR.md:3` tells agents answering strategic questions to continue the standing list rather than diagnose anew. Its first priority at line 11 is the email pipeline. The following priorities concern operator verification, instruction maintenance, the obligations ledger, and avoiding new tools. `.claude/hooks/print-scratchpad.mjs:103` injects that standing plan first because it outranks the other sections.

The prediction-evaluation roadmap is even more explicit: `_AUDIT_AND_ROADMAP/Operation July/22-flywheel-calibration-parked.md:16` says it is not on the recipe/edit/schedule/send launch path and should not receive investment before launch.

This is an encoded product-priority conflict. It is not just Claude forgetting the goal. These instructions were accumulated through prior sessions, including recorded operator decisions; the evidence does not justify attributing every choice to unilateral model behavior. But an agent should have surfaced the conflict instead of repeatedly claiming that downstream features advanced the original predictive outcome.

## 2. The system is partly operational, but the final answer is stale

Live observations on September 18:

- The latest **68 Nightly Chain runs failed consecutively**, beginning August 15. The preceding success was August 14. This does not establish that every failure had the same cause.
- Run `35327539410` failed on city pulse, all three listing-lifecycle legs, the row gate, and rebuild. Bake, graph publication, and parity were skipped.
- In that rebuild, CRE, national macro, and Florida macro hit the Anthropic credit error; active rentals hit a query timeout. Many other brains were considered fresh and skipped. The claim that all 41 packs are currently failing identically is too broad.
- The public master returned HTTP 200 with freshness token `SWFL-7421-v140-20260814-617078a0`: **August 14, 2026**. It reported 39 upstreams, confidence 0.8, and an empty `conditional_claims` array.
- Traffic and airport reporters returned September 15 build dates. The airport's actual observations nevertheless ended in April 2026.

The recent session log's claim that brains are serving nothing confuses rebuild eligibility with what the deployed application serves. `refinery/lib/resilient-build.mts:110` rejects expired fallback eligibility, but `lib/fetch-brain.ts:124` reads deployed markdown files. A failed rebuild does not remove the previously deployed report. The production answer is stale, not universally empty.

Structured numeric collection often works without an LLM. But leaf triage defaults to a paid call unless explicitly skipped (`refinery/stages/2-triage.mts:44`), and synthesis has its own separate switch (`refinery/stages/3-synthesis.mts:30`). National and Florida macro skip synthesis but still take the triage path. A deterministic output producer therefore does not imply an entirely deterministic rebuild. Required upstream failures hold master.

Master itself skips both agents (`refinery/packs/master.mts:396`). The problem is unnecessary model dependence elsewhere in its required chain, combined with an architecture that freezes the final publication. A dependable numeric data/reporting path should not need an unattended paid model call. This assessment does not recommend buying Anthropic credit.

Evidence: [latest inspected chain](https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/35327539410), [public master](https://www.swfldatagulf.com/api/b/master?view=speak&tier=2&format=json), [traffic reporter](https://www.swfldatagulf.com/api/b/traffic-swfl?view=speak&tier=2&format=json), [airport reporter](https://www.swfldatagulf.com/api/b/rsw-airport?view=speak&tier=2&format=json). These links are mutable; the values above record this assessment's observations.

## 3. Master is a voting engine, not the intended research engine

`refinery/packs/master.mts:116` calls direction voting, overrides, contradiction detection, metric selection, and deterministic text composition. `refinery/lib/synth.mts:121` weights each upstream by magnitude × confidence × freshness/relevance, with a 60% agreement threshold. Conditional prose comes from domain/direction templates beginning around line 361.

That can produce a useful rule-based dashboard opinion. It does not estimate whether air freight leads construction, whether permits add predictive information beyond seasonality, or how effects vary by location. It does not learn relationships from the joint historical data.

The thin-pipe interface reads previously distilled brain OUTPUT blocks, not a common historical observation panel (`refinery/sources/brain-input-source.mts:9`). Master's rolled-up metrics are further capped and ranked. Home price and rent receive guaranteed inclusion (`refinery/lib/synth.mts:794`), and master declares real estate its primary domain (`refinery/packs/master.mts:220`). This is concrete evidence of real-estate orientation, although many non-real-estate sources do exist.

The single regional direction is also the wrong target for many questions. Rising traffic can benefit retailers and burden commuters. Housing construction can increase activity while weakening incumbent landlords' pricing. Those outcomes are not contradictions merely because their signs differ. The target must be explicit before indicators can be meaningfully combined.

Current confidence is a source-tier/freshness/upstream formula, not a measured probability that a forecast will be correct (`refinery/lib/confidence.mts:227`). Deterministic arithmetic makes a result reproducible; it does not establish its predictive validity.

## 4. The prediction loop exists in code but is not producing live evidence

Production database results:

- `predictions`: **152 rows** — 111 ungradeable synthesis records, six gradeable synthesis records, and 35 gradeable individual-metric records.
- `outcomes`: **zero rows**.
- Nine gradeable predictions had matured. Eight had at least one subsequent metric observation by the query's timestamp criterion. That is not proof those observations have the correct underlying source period.
- `metric_observations`: 14,731 rows across 891 metric identifiers, captured from late May through September 18.
- `backtest_grades`: 144 historical records, exclusively Lee and Collier unemployment families. The skill view scores 138 comparable cases: Lee 51.47% versus 48.53% persistence; Collier 32.86% versus 48.57%. Combined, approximately **42.0% versus 48.6%**, a 6.5-percentage-point deficit.

This historical result tests a narrow trend rule, not the proposed cross-domain engine. It is evidence that predictive advantage has not been demonstrated, not evidence that the idea is impossible.

The code reveals a deeper target mismatch. `deriveGradeFields()` selects the first numeric cited driver as the thing to grade (`refinery/lib/predictions-log.mts:109`). The grader checks that driver's later sign or movement (`refinery/grade/grade-predictions.mts:204`). It does not test the prose IF premise or falsifier. Individual-metric predictions explicitly say the metric retains its current sign (`predictions-log.mts:320`).

Consequently, a claim that trucking plus permits predicts retail activity has no faithful target representation here. The `ConditionalClaim` type has prose, direction, and citations, but no explicit outcome metric, event, radius, comparison group, or target observation period (`refinery/types/brain-output.mts:169`). The code acknowledges that corridor counterfactuals are deferred.

The observation logger stamps brain rebuild time as `observed_at` (`refinery/lib/metric-observations-log.mts:48`). That records when an aggregate was republished, which may differ substantially from when the measured activity occurred. Rebuilding April airport numbers in September does not create September airport observations.

Finally, grading requires the whole nightly chain to succeed (`.github/workflows/grade-predictions.yml:24`). An unrelated publication failure can suppress a zero-LLM evaluation job.

Preserve the useful parts: idempotent outcome writing, pinned baselines, release-vintage safeguards, explicit persistence comparisons, and separation of historical from live evaluation. They are scaffolding worth retaining.

## 5. The data pool has value, but its coverage does not yet match the questions

Exact production queries found the following:

| Dataset | Held now | Analytical limitation |
| --- | --- | --- |
| RSW aviation | Five monthly series; 2,580 rows, May 1983–April 2026 | Excellent long history, but a September load still ends in April. Airport throughput does not identify shoppers near a particular store. |
| FL taxable sales | 40,140 rows, January 2002–December 2025 | Useful county/category history. Current refresh logic selects the prior-year file pair throughout 2026. Not store-level spending. |
| FDOT traffic | Lee: 2,623 segment/year rows; Collier: 1,032; 2021–2025 | Annual counts. Ingest discards geometry; store-radius joins need source geometry/segment mapping restored. |
| Lee permits | 333 rows, February 25–September 14, 2026; 274 geocoded | Short and incomplete for multi-year comparison; this is not proof of complete county/jurisdiction coverage. |
| Collier permits | 14,181 rows, April–August 2026; 6,615 geocoded | Useful collection, but short history and partial spatial coverage. Issuance is not completion or opening. |
| ACS demographics | 100 rows, 2022 five-year vintage only | A fixed demographic snapshot, not a yearly local panel. |
| QCEW employment/wages | 32 rows, two quarters spanning 2024–2025, one all-industry code | Sector distinctions and most historical quarters have not been collected into this table. |
| Zillow self-captured vintages | Three monthly captures each for home-value/rent views, June–August 2026 | Historic observations exist, but only three retained snapshots of what the source said at a particular time. |
| Local event material | City pulse: 114 facts, 61 story keys, five coordinate-bearing facts; `project_events`: zero rows | Existing news/event scaffolding is not a validated opening-history/cohort dataset. |

The table describes selected canonical roots, not every source that could contribute. Listing-scoped enrichment is not a substitute for a full permit or property population.

The freight nowcast is a particularly consequential mismatch. Its connector explicitly describes a synthetic daily cadence over annual AADT, fixes the source year to 2025, applies an assumed payload, and compares executions against its own log (`refinery/sources/fdot-freight-source.mts:30`, `:62`, `:70`). Repeated calculations over annual inputs are not daily truck observations. FAF5 provides modeled annual flows for the broad Remainder of Florida zone, not observed local truck movements (`refinery/sources/faf5-source.mts:19`). These can be background covariates; they cannot support the advertised local real-time interpretation.

There is no storage-scale reason to abandon the stack. The queried 173 application/data tables totaled approximately 2.38 GB in relation storage, including indexes. That is not total account storage. Cold-object inventory exists separately; its byte totals are incomplete metadata and were not treated as a verified storage bill or object-existence check.

## 6. Ops measures many activities, but not completion of the intended product

The separate ops repo has useful source adapters, coverage/census views, and prediction/baseline/calibration readers. Preserve them. Its global green count is not proof of analytical readiness:

- `lib/ledger.ts:183` assumes a non-tier-2 pipeline is green when freshness is missing.
- `lib/ledger.ts:246` marks skipped workflows green without distinguishing expected skips from blocked work.
- `lib/ledger.ts:328` accepts endpoint 401/405 as healthy: reachability, not a successful evidence-bearing answer.
- `lib/coverage.ts:475` identifies gaps outside minimum/maximum years, not missing periods inside the interval.
- `lib/goals.ts:7` explicitly describes hand-maintained goal state.

The ingestion doctor also treats absent content contracts as green (`ingest/scripts/doctor.py:135`). Its September 18 run reported 9 red, 26 yellow, and 42 green datasets, with content contracts for only 9 of 77. See [doctor run](https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/35374787756).

The rebuild's step named Notify on failure only writes a GitHub warning (`.github/workflows/daily-rebuild.yml:258`). The external heartbeat runs even on failure and explicitly proves execution only. Other code files issues/checks; this does not establish delivery, acknowledgment, ownership, or recovery. GitHub account notifications may deliver alerts, but that was not verified.

The failure pattern is repeated: a problem gets a rule, check, dashboard, or caveat, while the path from failure to correction remains incomplete. More governance text is not the missing product capability.

## 7. What data the intended product actually needs

The essential unit is an observation with a stable place/entity, a measured quantity and unit, its measurement period, its first-available date, its revision/vintage, and its source. These should remain queryable together across sources. A build date is a separate field.

For regional cross-domain forecasts, prioritize overlapping multi-year history before adding more summary brains:

1. Preserve and refresh the existing airport, taxable-sales, traffic, tourism, employment, and permit series. Measure missing periods and changes in coverage.
2. Add traffic station/segment geometry and available daily/hourly and vehicle-class observations. FDOT publishes historical site data and daily-volume archives, but coverage at a selected corridor must be checked; not every annual segment has a continuous counter. [FDOT source](https://www.fdot.gov/statistics/trafficinfo/default.shtm).
3. Expand aviation to the relevant airport/route/carrier and freight distinctions where they help the chosen target. BTS T-100 supplies monthly passenger/freight market data; this is not individual traveler itineraries or retail visitation. [BTS source](https://www.transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=Nv4+Pn44vr45&V0s1_b0yB=D&gnoyr_VQ=FMF).
4. Backfill sector-specific employment/wages and construction/retail/logistics activity. QCEW provides historical area/industry files; current ingestion retains a narrow subset. [BLS source](https://www.bls.gov/cew/downloadable-data-files.htm).
5. Build the local development sequence: applications, approvals, starts where available, completions, opening/closure dates, and geocoded parcel/site identities. Inventory each municipality's coverage, not just the county name.

For the Walmart example, define separate outcomes: traffic at particular counters, residential completions nearby, nearby business openings/closures, and spending or visits if available. Track multiple stages of the project because announcement, construction, and opening can have different effects. Use comparable locations and pre-event trajectories.

The causal problem matters: Walmart can choose an area because it is already growing. Growth after opening is not automatically growth caused by the opening. Hurricanes, road changes, population growth, rates, and seasonality are competing explanations. A comparison design needs to address these; a persuasive LLM narrative cannot replace it.

Redistribution requires measuring losses or displaced activity elsewhere, not just gains beside the new store. Store-level visit/spending data may require commercial licensing or participating businesses. County tax data can support broader context, not identify the source of a particular store's customers. No vendor price or right to redistribute its data has been established in this assessment.

If SWFL supplies too few comparable openings, use other Florida locations as a research comparison pool while keeping the product focused on SWFL. Hyperlocal delivery need not mean refusing relevant comparison evidence outside the territory.

Carbon Arc is a useful reference for resolved entities, dataset definitions, and queryable evidence across sources. Its own documentation emphasizes entity resolution and exposes dataset dictionaries, schedules, and queryable metrics. That supports a stronger common data layer; it does not establish that any LLM over a large data collection has predictive skill. [Carbon Arc architecture](https://www.carbonarc.co/documents/Carbon-Arc-White-Paper.pdf), [developer library](https://docs.carbonarc.ai/developers/library-for-devs/library-api).

## 8. What to preserve, replace, and prove before expanding

Preserve the warehouse and archives, sound parsers/collectors, staging/upsert safeguards, source provenance, parcel/geographic references, useful report delivery, and evaluation primitives. Keep the existing app available as appropriate; it does not need to be rewritten to establish whether the intelligence works.

Replace the assumption that every dataset must first become a brain, that one regional bullish/bearish label is the analytical result, and that prose production belongs on the critical numeric refresh path. Keep brain/report labels if useful, but make their contents queryable observations and explicit analyses rather than an obligatory opinion cascade.

The public MCP currently retrieves prebuilt reports and geographic dossiers (`app/api/mcp/server.ts:219`). A separate SQL lake MCP exists, but its entrypoint is blocked by default after an egress incident (`tools/lake-mcp-server.mts:634`). That is another distinction between code existing and a capability being safely operational. MCP can expose discovery, historical series, comparisons, model results, and evidence; the protocol itself supplies none of the statistical intelligence.

Use the LLM to discover candidate explanations, retrieve the relevant evidence, extract structured events with validation, propose analyses, and communicate conclusions. Use reproducible code for joins, units, adjustments, estimation, and scoring. More useful, aligned history can improve the evidence available to the LLM; more rows do not guarantee better forecasts, and the model does not automatically learn from logged outcomes.

Before authorizing a broad rebuild, require one complete demonstration:

- A named target, place, and horizon; for example, next-quarter activity at selected traffic counters, if the local data supports it.
- Several years of overlapping source history from at least a few substantively different domains, with explicit unavailable periods and publication lags.
- Forecasts evaluated on later time periods withheld from model selection, using information available at each forecast date.
- Comparison with seasonal/persistence baselines and a check of whether each added source actually improves performance.
- A result returned through MCP with inspectable data, limitations, and uncertainty.
- A new forecast frozen in advance and later scored independently of narrative generation and unrelated publishing jobs.

The statistical result may show no improvement. That must be an acceptable finding, not a trigger to rename a metric or polish the story. A useful local evidence product can still exist without predictive advantage, but it should then be sold and scoped accordingly.

Recommendation: proceed to a bounded rebuild decision around that demonstration, not a full-platform rewrite or another expansion of brains/UI. The question to resolve is whether coherent local data can add measurable information for one important outcome. The current system has not answered that question yet.

## Recheck queries

These are read-only examples used to substantiate the central live findings. Rerun results will naturally change.

```sql
SELECT prediction_kind, grade_status, count(*)
FROM public.predictions GROUP BY 1,2;
SELECT count(*) FROM public.outcomes;
SELECT * FROM public.backtest_skill_by_slug;

SELECT metric, count(*), min(report_month) AS first_period,
       max(report_month) AS last_period, max(inserted_at) AS last_load
FROM public.rsw_airport_monthly GROUP BY metric;

SELECT count(*) AS rows, min(issued_date), max(issued_date),
       count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL) AS geocoded
FROM data_lake.lee_building_permits;

SELECT count(*) AS rows, min(date_issued), max(date_issued),
       count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL) AS geocoded
FROM data_lake.collier_building_permits;

SELECT county, min(yearx), max(yearx), count(*)
FROM data_lake.fdot_aadt_fl
WHERE county IN ('Lee','Collier') GROUP BY county;

SELECT min(period), max(period), count(*), max(retrieved_at)
FROM public.fl_dor_sales_tax;

SELECT view_name, count(DISTINCT as_of), min(as_of), max(as_of)
FROM data_lake.view_vintages GROUP BY view_name;
```
