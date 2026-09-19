# Initial Terra/Sol plan: data-first SWFL intelligence

Date: September 18, 2026. **Status: local T1/T2 acquisition and S1 historical comparison jointly reviewed after integration repairs; not merged or activated. S2 forecasting and T3 unattended operation remain next.**

Review and runnable evidence: [September 18 integration checkpoint](../../../_RESEARCH/data-and-ingest/2026-09-18-first-builds-integration-review.md). The real packet covers January 2019–July 2026, preserves Collier's missing history, and passes 23 Python plus 20 Bun tests. Full repository typecheck remains baseline-red. Historical comparison is qualified; predictive skill and unattended reliability are not established. The sections below remain the execution contract, with the review supplying current status.

Operator follow-up: focus on free/public data and existing machines, storage, Hermes, and crawl4ai; give Terra and Sol bounded builds to test whether the concept is useful. Start with the [Terra build brief](../handoffs/2026-09-18-terra-free-data-builds.md) and [Sol build brief](../handoffs/2026-09-18-sol-evidence-builds.md). They operationalize this plan; they do not authorize production migrations, public MCP changes, paid calls, or machine/service reconfiguration without the repository's existing approval gates.

Decision context: [strategic assessment](../../../reports/analysis/2026-09-18-strategic-project-assessment.md). Source evidence: [live access research](../../../_RESEARCH/data-and-ingest/2026-09-18-data-access-and-outcome-feasibility.md).

## Objective and boundaries

Build a useful SWFL evidence system that discovers relevant public data, compares history across domains, and supports specific predictions only where both the inputs and eventual outcome are measurable. Focus on Lee and Collier; distinguish regional context from local site evidence. Preserve the existing lake and useful collectors.

Confirmed constraint: **free/public sources first, $0 in new data subscriptions or paid model calls for this slice, monthly/quarterly intelligence first, finer local measurements where proven accessible.** Previously purchased data is not a dependency of the first demonstration. No provider purchases, outreach, production migration, workflow dispatch, or public capability claim is part of preparing these briefs.

The first release has three capabilities, with separate acceptance:

1. **Historical evidence:** answer a meaningful cross-domain question with correct periods, geography, sources, and gaps.
2. **Monitored hypotheses:** explain possible relationships and specify what evidence would resolve them; no invented probability or implied validated prediction.
3. **Forecasts:** freeze explicit targets and later score the corresponding observations, only for qualified targets. Lack of a suitable target does not prevent shipping useful historical evidence.

No email/UI redesign, new orchestration framework, graph database, general causal engine, broad source shopping, or requirement to add a brain for every dataset. Do not make recovery of all existing workflows a prerequisite for the selected end-to-end slice.

## Team responsibilities

**Terra: acquisition, historical data, and deterministic execution.** Own selected collectors, raw snapshots, canonical observations, backfill, release-aware scheduling, and integration with existing storage. Provide actual retrieved samples and parsed evidence; do not choose a convenient proxy and call it the desired outcome.

**Sol: meaning, analytical evaluation, and adversarial verification.** Own target definitions, temporal/geographic joins, forecast/grade contracts, baseline evaluation, and user-facing evidence requirements. Independently inspect Terra's parsed samples against raw releases. Reject mismatched outcomes even when the code passes.

Work in separate worktrees when implementation is authorized. Terra owns ingest and source-adapter changes; Sol owns analysis/evaluation changes. Freeze the shared observation/target contract together before concurrent edits. One designated integrator handles shared migrations, pack types, registry changes, public MCP, and activation. Cross-review each other's evidence; one agent's declaration of success is not the acceptance test.

## Execution contract — freeze this before the first code commit

**Storage READY:** operator completed the authorized setup of the 1 TB Samsung T5 SSD on Spectre. Independently verified ext4 `SWFLDATA`, enabled/active mount at `/srv/swfl`, writable archive `/srv/swfl/research`, approximately 973 GB available, and matching cross-machine test-file checksums. Use `SWFL_RESEARCH_ROOT=/srv/swfl/research` when configuring the collectors; no collector environment or schedule has yet been changed. See [Terra's T3 status](../handoffs/2026-09-18-terra-free-data-builds.md#t3--unattended-refresh-and-source-discovery-after-the-demonstration) for device UUID, permissions and test limitations. This supersedes the earlier unattached-card assumption below, not the requirement for mount checks and a second copy. Reboot recovery and backup remain untested.

This is a local research slice, not a parallel production lake. Source tables remain authoritative where they exist. Retained raw releases and their derived exports supply the experiment; new hot tables and new brains are not prerequisites. Historical comparison is descriptive, and experimental forecasts remain explicitly non-production. Before publishing target-specific forecasts, the integrator must resolve the existing master-only output contract in code and its mirrors; do not silently bypass it.

**Shared transport:** UTF-8 JSONL observations plus one JSON manifest in an explicitly configured local directory (`SWFL_RESEARCH_ROOT`, proposed setting, not existing functionality). Terra writes the export; Sol only reads it. No shared mutable DuckDB file across processes/machines. Parquet/DuckDB may be used internally with the dependencies already installed. Do not create a general storage framework.

Observation v1 fields, owned by Sol's validator and implemented by Terra's exporter:

| Field | Meaning |
| --- | --- |
| `schema_version` | `1` |
| `source_id`, `metric_id`, `definition_version` | Stable source, metric and semantic version; metric identifies monthly flow versus YTD/stock. |
| `geo_type`, `geo_id` | For example `airport`/`RSW` versus `county_fips`/`12071`; never silently merge them. |
| `period_start`, `period_end`, `frequency` | ISO calendar dates; end is inclusive; measurement period, not ingestion time. |
| `value`, `unit` | Finite number or null; actual zero stays zero. Missing/suppressed is null, never an invented estimate. |
| `status`, `value_basis` | Status `observed`, `missing`, `suppressed`, or `unavailable`; basis `reported`, `estimated`, `mixed`, or `unknown`. |
| `published_at`, `first_seen_at`, `retrieved_at` | UTC timestamps, publisher timestamp nullable; first-seen of this exact release/hash retained on rerun. All may be null for expected-period placeholders with no retrieved release. Never infer publication day from a URL month. |
| `available_at`, `availability_basis` | Earliest evidenced public availability of this exact vintage; nullable. Basis `publisher_release`, `first_seen`, or `unknown`. Historical lag assumptions belong to experiment configuration, not fabricated observation timestamps. |
| `source_url`, `source_sha256`, `vintage_id` | Exact publisher URL, SHA-256 of raw downloaded bytes, and release identity; hash/vintage nullable only for manifest-derived missing placeholders. |
| `quality_flags` | Explicit caveats such as partial coverage, schema break, unknown publication date. |

Natural observation identity = source + metric + definition version + geography + period + vintage. A rerun of the same release cannot duplicate it; changed bytes preserve a distinct vintage. When historical downloads are all first seen today, they do not become valid as-of inputs for past forecast origins. A descriptive latest-vintage comparison and an operational replay have different eligibility.

Manifest v1 contains schema version, run ID, source IDs, raw-file relative paths/hashes/byte sizes, requested date range, per-source observed range, expected/present/missing period counts, discovery/parse failures, and an `observation_files` array (each entry: relative path, SHA-256, row count, source ID). T1 can provide a single-source manifest; T2 supplies the combined handoff manifest referencing both immutable RSW and BPS exports, without modifying either. Paths stay below the configured archive root. Source-specific expected-period calendars prevent treating pre-opening or not-yet-due months as failures. No secrets or personal data in manifests, fixtures, or git.

**Build sequence:** Terra T1 and Sol S1 validator/tests can proceed in parallel after this contract is agreed. Terra T2 feeds the real S1 comparison. Joint review of that artifact precedes Sol S2 forecasting and Terra T3 unattended activation. A synthetic fixture passing tests is not the joint checkpoint.

**Hardware evidence (read-only, September 18):** Windows has approximately 34.2 GB installed RAM, an RTX 4060 Ti, and 736 GB free on C:. `ollama list` returned installed local models. `ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes fedora uname -a` succeeded; Fedora reported approximately 16.3 GB RAM and 484.6 GB available under `/home`. A `scout-a2a` user service was running, but its inference/provider configuration was not audited. Hermes's installed `cronjob_tools.py` supports `no_agent` script jobs. These checks establish access/capability, not unattended readiness. **Operator clarification:** Spectre is the always-on Fedora machine; qBittorrent is on Windows; a 1 TB SD card will be attached to Spectre. The card was not present in the inspected inventories. Spectre is the intended unattended collector, with retained releases on the card after mount verification and a second recoverable copy elsewhere. Windows supports development and optional local-model work. Never format, repartition, move a repository, change visibility, or expose a service to make this experiment work.

Start with an explicit non-git local directory, a proposed 10 GB experiment cap, and a 20 GB free-space floor; stop safely rather than delete existing data. These are configurable initial safeguards, not capacity estimates. Verify the SD card mount/identity and a second recoverable copy before calling the archive durable. Missing removable storage must stop scheduled capture, not silently fill the system disk beneath its mount directory. Keep serving tables where they are; do not migrate Supabase to the card. qBittorrent may transport specifically selected public/licensed archives with verified provenance; no torrent download is needed for the initial sources and no changes to existing torrent activity are authorized. Local inference is optional draft assistance, not part of numeric extraction, comparison, or grading. Do not mistake a local agent configured to call a cloud provider for free local inference.

## Phase 0 — align the work before implementing

Owner: integrator, reviewed by both. Small scope.

- Recheck current HEAD, live source periods, and relevant incidents. Do not treat September 18 measurements as permanently current.
- The existing injected NORTH-STAR and build queue were updated with the operator's September 18 direction when the briefs were prepared. Confirm the executing worktree includes that change; do not create another competing North Star.
- Explicitly resolve the existing rules that require every dataset to have a brain and every prediction to come from a single regional direction. Preserve provenance and no-invention requirements, while allowing queryable analytical datasets and target-specific forecasts.
- Mark the September 15 backend plan as recovery work rather than the product strategy. Reuse its applicable repairs, but do not dispatch paid rebuilds merely because the old plan says to.
- Inventory only the existing roots needed for this slice. Reuse source tables; add a derived observation view/materialization only where needed, with one canonical authority per measurement.

Acceptance: the active instructions and the proposed work no longer disagree about the outcome. No expansion into instruction cleanup beyond those conflicts.

## Phase 1 — qualify acquisition AND measurement

Terra probes access; Sol determines whether the result means what the proposed question needs. Start with the following bounded shortlist, reusing [source research](../../../_RESEARCH/data-and-ingest/2026-09-18-data-access-and-outcome-feasibility.md). Do not bulk-build all six immediately.

| Source | Initial role | Evidence and next gate |
| --- | --- | --- |
| RSW passenger / operations / freight releases | Monthly aviation history; passenger count is a candidate forecast target | July passenger PDF parsed successfully using existing code. Fix discovery; verify other series, history, release lag, and revisions. |
| Census BPS county residential authorizations | Construction context and year comparisons | Actual Lee/Collier rows fetched for Jan 2010 and Jul 2026. Profile intervening months, estimated vs reported fields, and revisions. Never label authorizations as completed homes or Walmart permits. |
| BLS QCEW selected sectors | Quarterly labor/activity context | Download local historical samples and inspect suppressed cells, NAICS comparability, release dates, and missing quarters. Not a weekly indicator. |
| FDOT selected continuous counters | Potential local traffic outcome; annual AADT remains context | Find real counters, coordinates, daily files, and stable access. Exclude weekly forecasting if only annual values exist. |
| FL DOR taxable sales | Historical county/category comparison | Archive works; expected current URLs returned 404. Resolve a real update path before treating as a live target. |
| DBPR food-service licenses / inspections | Optional business-activity observation | Current CSV works. Verify location fields and historical extracts; licenses/status changes are not automatically opening/closure events. |

For each selected source, record a compact qualification entry in the existing registry or source-owned documentation. This is evidence, not a new platform:

- Exact publisher, endpoint/file discovery, authentication, observed result and timestamp.
- Existing root and parser, stable natural key, field meanings, units, measured vs estimated flags.
- Exact geography and population coverage; required joins and unmatched shares.
- Observation period, publisher release date when known, first-seen timestamp, revision handling.
- Historical coverage matrix: each expected month/quarter/site, blanks, suppressed cells, duplicates, changes in coverage. Minimum/maximum year alone is insufficient.
- Publication schedule, typical/observed lag, and how a genuine missing release differs from normal waiting.
- API limits, parser/format fragility, incremental download/cache strategy, storage/egress, operating effort.
- Permitted retention/use/derived-output exposure based on actual terms or existing agreement. Unknown vendor rights remain unresolved; no inferred right to expose raw rows through MCP.
- Role: context, historical outcome, live outcome, or unsuitable. State what it cannot measure.

Bound each access investigation: one focused probe session, one alternative documented access route, then a named blocker. Do not spend days repeatedly defeating a portal before another usable source is evaluated. A possible records request or vendor inquiry is a proposed action, not an authorized message.

**Exit artifact:** one source decision per candidate: use now, history-only, manual-assisted, or defer. Select at most three core source families plus one optional context family for the first demonstration. Successful GETs qualify access today, not operational reliability.

## Phase 2 — prove the historical evidence slice

Terra leads; Sol checks raw-to-answer correctness. **RSW plus Census BPS is the minimum passing historical slice.** Add a third domain only if qualification yields a use-now source with suitable history and semantics; otherwise include its exact absence/blocker without failing the two-source slice. Tax history may support a clearly retrospective comparison even while its update path is unresolved. Do not force two-quarter QCEW or annual traffic into a monthly comparison to meet a source-count quota.

- Repair RSW URL discovery in `ingest/pipelines/rsw_airport_monthly/pipeline.py`; match actual metric identity across legitimate publisher hosts. A working old fallback must not mark the source current.
- Backfill the selected series from official archives. Retain source bytes or existing cold-storage references, content hashes, parsed release metadata, and revision distinctions. Do not replace historical vintages with the newest file silently.
- Use a shared analytical observation shape containing metric/definition version, entity/place ID, period start/end, frequency, value/unit, publisher/source reference, release/first-seen/retrieved dates, vintage, and quality/suppression flags. Unknown publication dates stay unknown.
- Keep counts, prices, rates, stocks, and flows distinct. Annual values cannot acquire monthly independent observations by being copied. If a slow covariate is carried forward, preserve its age and available-at date.
- Compare each selected series with its own matched prior period. Identify seasonal effects and breaks in collection. Do not mix state/FDOT/DOR county codes or equate airport catchment with county residents.
- Reuse the public MCP/dossier seam for an inspectable comparison when implementation/deployment is authorized. Return measurement periods and missingness, not only the brain-build timestamp. Do not reactivate the egress-blocked SQL lake MCP without repairing its read path.

First demonstration question: **How did aviation throughput and residential authorizations change across comparable historical periods in the Lee/Collier region, and where did they diverge?** Add the qualified third domain when available. Preserve airport-versus-county scope. This is descriptive evidence with possible explanations, not a claim that one caused another.

Acceptance:

1. One real archive sample, one recent release, and an identical rerun reconcile to source without duplicate observations.
2. A missing file, truncated download, changed schema, missing month, and old-file fallback produce explicit source states; previously good data remain available with correct dates.
3. One real unattended scheduled fetch succeeds where permitted; repeatability is provisional until the next actual publisher release is discovered and advances the source period. Three same-day reruns do not prove next-month reliability.
4. The MCP comparison is reproducible from the retained data, gives useful cross-domain differences, and identifies unsupported geography and dates.

## Phase 3 — define one forecast that can actually be scored

Sol leads; Terra verifies outcome retrieval. Do this only after Phase 1 qualification; it need not wait for every optional source.

**Working default:** the next future calendar month's published RSW total passenger movements, evaluated after the relevant publisher release. This is chosen because an actual current release and existing parser were verified. It is a narrow aviation target, not a proxy claim about unique tourists, SWFL prosperity, store visits, or spending. State the forecast origin, target month, and the potentially multi-month data lag explicitly. Predicting an already elapsed but unpublished month is a separate nowcast task.

**Alternative:** next-quarter traffic at a named set of counters, only if daily/monthly observations and stable site coverage pass qualification and the result has greater user value. **Deferred:** county/category taxable sales until a current repeatable release path is proven. Store-level spending and Walmart redistribution are not first targets without direct measurement access.

The first forecast contract must pin:

- Outcome metric and definition, geographic/entity scope, unit and aggregation.
- Forecast-origin timestamp, last usable input release, target period, and evaluation deadline tied to expected publication plus a stated grace period.
- Exact authoritative outcome source and observation fields, preliminary/final vintage policy, revision cutoff, and evidence retention.
- Point forecast and uncertainty where justified; numeric error metric, seasonal baseline, and optional direction/change threshold fixed before evaluation.
- Missingness/suppression rules, scope-change rule, source discontinuation handling, and explicit scenario premise handling.
- Prediction/model/feature-set versions and reproducible inputs. Source quality remains separate from forecast probability.

States: `awaiting_release`, `observed`, `scored`, `unscorable_source_failure`, `unscorable_scope_change`; add `premise_not_met` for genuinely conditional scenarios. A missing measurement is never zero. An expired deadline is an operational/data failure, not automatically a wrong prediction. If the premise itself cannot be observed, the scenario is research-only.

Preserve all forecasts, including unscorable ones. Publish eligible, scored, waiting, and unscorable counts alongside accuracy/error so difficult cases cannot disappear from the denominator. A later revision produces a versioned grade; do not erase the original outcome.

Acceptance: an independent reader can identify exactly which future published value settles the forecast. If that sentence cannot be written, do not launch it.

## Phase 4 — test whether combining domains helps

Sol leads analysis; Terra reproduces from the same source snapshots.

- Build a seasonal naive baseline before an enhanced model. Use a small, predeclared feature set with a plausible relationship to the target; do not force every collected source into the model.
- Include own-series seasonality/trend, then test qualified external domains. Candidate addition is a hypothesis, not an assumed benefit. Report results with and without each extra source.
- Use chronological training/validation/held-out periods. Fit transformations on training data only, respect publication lags, and avoid repeated tuning on the final holdout. Report stress periods separately rather than hiding them in averages.
- Vintage-safe historical inputs are preferred. If only revised historical files exist, label that analysis retrospective with revision/look-ahead risk; do not claim an operationally faithful historical forecast. Use prospective frozen runs to establish the missing evidence.
- History duration is not a substitute for independent evaluation cases. Set a minimum useful effect and sufficient evaluation design before model selection. Do not declare success from one event, a few outcomes, or a lucky directional hit rate.
- Keep a simple model if added domains do not beat the baseline. Useful explanations/comparisons may still ship, but no predictive-advantage claim follows from better prose.

Acceptance: reproducible error and uncertainty results versus the baseline on an untouched time interval, with sample size, coverage, and known hindsight limitations. A negative result is a valid outcome of the experiment.

## Phase 5 — operate the qualified slice independently

Terra owns scheduling/recovery; Sol owns evaluation and acceptance. Integrator activates reviewed changes.

- A failed optional feed or narrative generation must not prevent successful source observations from landing or supported forecasts from being scored.
- The grader runs when the authoritative outcome arrives or on its own bounded check schedule, independent of whole-chain publication success. Read measurement period/vintage, not brain rebuild timestamp.
- Preserve legacy prediction rows and labels. Do not rebrand existing driver-sign bets as validated results of the new target-specific approach. Schema changes must preserve existing consumers until repointed.
- Update the existing ops view around four facts for this slice: last usable source period, latest forecast and target, pending/scored outcomes, and open acquisition failures. Unknown is not green.
- Existing alert delivery must be verified with a named owner and one real delivery test before claiming production reliability. Do not create another unconsumed checks ledger.

Acceptance: one missing-source rehearsal preserves good data and gives an honest answer; one frozen forecast is recorded before its target period; the exact later outcome can be joined and scored idempotently. Historical replay verifies mechanics, while real future scoring remains pending until publication.

## Walmart and local redistribution: later evidence gate

Keep this use case visible as the destination. Before claiming quantitative effects, assemble verified project identities, announcement/construction/opening dates, geometries, nearby and comparison-site observations, and pre-event trajectories. Measure more than the winning location to study redistribution. Account for pre-existing growth, roads, storms, and other events. A license issue date is not necessarily an opening date; a permit is not a completed building.

Where local data is missing, publish a monitored event brief and identify the unmeasured outcome. Do not replace store spending with county sales and silently retain the store-level claim. Other Florida locations may supply comparisons while the delivered product remains SWFL-focused.

Only pursue a paid feed after writing the exact missing quantity, place/time coverage, required historical depth, sample validation, refresh reliability, retention/derived-output rights, total cost, and exit behavior. A provider sales claim is not local sample validation. No purchase or outreach is pre-authorized here.

## First assignments to hand off

**Terra:** Read the assessment and access research. Execute Phase 1 acquisition qualification for RSW, Census BPS, and one candidate FDOT continuous-counter route, using isolated changes after build authorization. Start with RSW discovery because a newer file already parses. Deliver actual source samples, period/coverage evidence, minimal proposed edits, repeatable read-only probes, and exact remaining blockers. Do not dispatch the full master rebuild or add new paid dependencies.

**Sol:** Read the same evidence. Independently validate the meaning and temporal coverage of those samples. Draft the Phase 3 target/grade contract and Phase 2 comparison acceptance tests. Specify the seasonal baseline and leakage checks. Reject the target if its future measurement is not obtainable; retain historical comparison as a valid deliverable. Do not build a replacement master opinion engine or new UI before the source/target decision.

**Joint checkpoint:** Show one cross-domain historical comparison and one source-qualified forecast contract, or an evidence-backed reason to ship comparison-only first. Decide whether to proceed with the rest from that evidence. Completion is a working, honest slice; neither a larger source count nor a greener dashboard satisfies it.
> Shipping checkpoint, 09/18/2026: RSW/Census capture, real-data historical comparison, and the frozen seasonal-naive RSW forecast are integrated through d5aa3056. The subsequent shipping repair makes both typechecks green, passes 1,820 refinery and 24 Python tests, and fixes the documentation reachability regression. Exact evidence and push boundary: SESSION_LOG.md. The original phases below describe the intended sequence; they are not evidence that unattended activation, FDOT qualification, or forward forecast scoring has completed.
