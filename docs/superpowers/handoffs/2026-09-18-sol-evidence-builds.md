# Sol — build the evidence product and the honest test

Date: September 18, 2026. Execution brief; no implementation has been performed by writing it.

## Start prompt

Implement S1 below in an isolated worktree while Terra repairs and exports the sources. Read root/refinery instructions, the feature playbook, [the active plan and shared execution contract](../plans/2026-09-18-data-first-intelligence-rebuild.md), and [the assessment](../../../reports/analysis/2026-09-18-strategic-project-assessment.md). Build a reproducible comparison of real historical aviation and residential authorization observations, with explicit dates, sources and gaps. Tests may start with labeled fixtures; the deliverable must run on Terra's real exports. No paid models, new master-brain engine, email/UI redesign, or production writes. S2 follows the joint real-data checkpoint. Keep an honest comparison-only result if predictive improvement is not supported.

## Ownership and existing seams

You own small deterministic analysis code under proposed `refinery/intelligence/`, its tests, and CLI entry points under existing `refinery/tools/`. Terra owns acquisition. Read rather than rewrite Terra's exports; agree the observation v1 schema before concurrent implementation. The integrator owns shared types, migrations, public MCP and activation. Do not grow BrainOutput or globally weaken validators for this experiment.

Open these files before reusing them:

- `refinery/lib/metric-observations-log.mts`: its `observed_at` is `brainOutput.refined_at`, not an authoritative source observation/release date. Do not repurpose it as the new outcome series.
- `refinery/grade/grade-predictions.mts` and its tests: pure scoring, injectable store and atomic/idempotent persistence are useful patterns; earliest rebuild after a window is NOT the new outcome-selection rule.
- `refinery/lib/backtest/skill-baseline.mts`, `grid.mts`, `view-vintage-reader.mts`, and `refinery/tools/flywheel-backtest.mts`: inspect for reusable mechanics. Existing directional performance is not a benchmark for the new numeric target, and revised data is not necessarily point-in-time data.
- Before any later MCP work, read `app/api/CLAUDE.md`, `app/api/mcp/server.ts`, and the existing tool modules. Do not enable the egress-blocked raw SQL lake MCP.

## S1 — one real historical cross-domain evidence packet

**Outcome:** one command answers: "Across comparable historical periods, when did aviation activity and residential authorizations move together or diverge in this region? What can we actually infer, and what is missing?"

Counted implementation parts:

1. Implement observation v1 validation in `refinery/intelligence/observation-contract.mts` with tests. Follow the active plan's exact fields and identity. Reject nonfinite numbers, impossible periods, mismatched units, duplicate identities, broken raw-file references and invented release times. Null remains null; an actual zero remains zero. Preserve airport versus county scope.
2. Implement `compare-periods.mts` and tests. Calculate every series against its own exact prior-year calendar period. Use complete comparable quarters/years only when aggregation is appropriate for that metric. Never manufacture monthly values from annual FDOT data, sum rates, or join an airport count as though it counts Lee/Collier residents. Flag unmatched and partial periods.
3. Implement `refinery/tools/build-swfl-history-comparison.mts` and tests. Consume an explicit manifest path and read-only exports. Produce deterministic JSON and concise Markdown, with source/vintage selection, periods, current/prior values and computed changes, coverage matrix, release/availability caveats and source links. Keep invocation timestamps outside the deterministic analytical payload. Write only to an explicit output directory; no runtime model, DB write, or network required.
4. Reconcile an archive period, a recent period, a missing period and a revision against Terra's retained source bytes. Use real RSW + BPS data for the final artifact. Add a third domain only if a qualified existing source is cheap to reuse: historical taxable sales is suitable for a clearly retrospective packet; QCEW needs meaningful sector history, not just two quarters. A third source's failure cannot hide the useful two-source result.
5. Include a separate, dated review note: what changed, competing explanations, measurement limits, and the next observation that would distinguish explanations. The generated JSON and Markdown facts are deterministic; the human-reviewed note is outside their analytical hash, references that hash, and cannot alter computed observations. Computed observations and hypotheses must be visibly different. No causal claim, calibrated probability or grand regional bullish/bearish score follows from coincident trends.

Default comparison window: 2019 through the latest actually supported month, with earlier BPS/RSW history available for sensitivity checks. Display each source's endpoint separately. A three-source packet involving stale tax history must either use a common historical cutoff or show explicit unequal coverage, not imply all sources are current.

Proposed verification interface (new commands, implemented by this build):

```powershell
bun test refinery/intelligence/observation-contract.test.mts refinery/intelligence/compare-periods.test.mts refinery/tools/build-swfl-history-comparison.test.mts
bun refinery/tools/build-swfl-history-comparison.mts --manifest <absolute-manifest-path> --from 2019-01 --through 2026-07 --out <absolute-output-directory>
npm run refinery:typecheck
```

Replace the example end month with the qualified manifest's range; date arguments are reproducibility controls, not assertions of available data. Document the real command you ran without placeholders in the final handback.

Required tests: missing prior year; observed zero versus suppressed null; quarterly/annual mismatch; wrong geography; revision selection; unknown availability; invalid manifest hash; duplicate release; identical input produces identical analytical payload. Fixtures are labeled test-only and cannot silently substitute for real exports.

**Done:** user can open one real packet, verify several numbers against retained public releases, and see useful differences across domains. CLI, tests and source provenance work without the full nightly chain, any LLM credentials or a new database table. "A report generator exists" without a real report is not done.

## S2 — test prediction value, not storytelling quality

**Dependency:** S1 real-data joint review; Terra's qualified outcome feed. This is a local experiment, not a replacement production master.

1. Implement `forecast-contract.mts`, `seasonal-naive.mts`, `score-forecast.mts` with tests, plus `refinery/tools/run-rsw-forecast-experiment.mts`. Reuse existing pure-function/store-injection patterns where they fit. Do not rename old driver-sign predictions as successful new forecasts.
2. Freeze one target: a named future calendar month's RSW total passenger movements. Exact unit, airport scope, target month, origin, last usable release, authoritative outcome field, expected release/grace, revision policy and evaluation metric are recorded before prediction. This tests measurement/evaluation plumbing, not whether the entire SWFL business idea is proven. Forecast origin must precede the target period; an elapsed unpublished month is a separately labeled nowcast.
3. Baseline = same calendar month's value a year earlier when available by origin. Missing/unavailable seasonal reference means ineligible, not silently substituted. Evaluate MAE plus a scale-aware metric with explicit zero handling, coverage and sample count. Direction accuracy alone is insufficient.
4. Predeclare at most two plausible extra feature families before comparing models. Fit a small deterministic model only after a minimum history/coverage check; no LLM-generated numeric forecast. Own-series baseline, own-series model and external-feature model get the same eligible windows. Align county context to the airport target explicitly; reject false local precision.
5. Use chronological training/validation and a final untouched holdout; transformations fit only on training data. Check each feature against information actually available at the origin. If historical availability/vintages are unknown, label a lag-assumed retrospective analysis as exploratory, disclose revision risk, and keep it out of operational-performance claims. Do not fabricate historical release dates to make a backtest run.
6. Report incremental value and ablations, error distribution, coverage and disruptions such as pandemic/storm periods. Predeclare a practically useful improvement before tuning; explain uncertainty with the number of independent cases. No universal "60% accuracy" gate. If added domains fail, keep S1 and the baseline rather than claiming the model needs more brains.
7. Save actual forward predictions as immutable, hashed local records outside git, with input manifest, model/config version and forecast-origin timestamp. In replay mode past origins are labeled simulated, never presented as forecasts genuinely made then. Match grading only to the exact target-period outcome and frozen vintage policy. Append grades/revisions without destroying the original forecast. After review, the integrator can select persistence through the existing system; do not pre-build a second forecast platform.

Forecast states follow the plan: awaiting release, observed, scored, unscorable source failure, unscorable scope change; conditional research also distinguishes premise not met. Missing source is not zero or an incorrect forecast. Waiting/unscorable records remain in coverage denominators. Repeated scoring of identical forecast/outcome/version must be idempotent. Grading runs independently of master rebuild and narrative success.

Verification: targeted unit tests, a historical replay explicitly labeled by vintage quality, one frozen genuinely future target, and an independent scoring command. Historical replay can verify scoring now; live forecast accuracy cannot be declared before a future outcome is released. A future forecast may remain awaiting release at handoff.

**Done:** reproducible baseline comparison and honest result, or an exact evidence-backed explanation of why predictive evaluation is premature. A fancy narrative is not a passing outcome.

## Joint integration and the local-use-case checkpoint

After S1 passes, prepare a small read-only MCP comparison tool using the existing server seam, not a new brain for every dataset. Return the same structured observations/periods/sources/gaps as the CLI; avoid unbounded SQL/large history payloads. Public MCP shape changes need the existing approval and parity tests. Until then the CLI packet is the working consumer, not a claim that production MCP already supports history.

Keep the Walmart question alive through one bounded local project dossier after T2's traffic qualification: verify a project identity/location, dated construction/opening evidence, plausible nearby/comparison sites, what pre/post observations really exist, and what remains unmeasurable. Use an actual documented project, not a fictional Walmart event. A permit/license date is not an opening. Measure comparison-location losses before calling something redistribution. If local outcomes do not exist, deliver a monitored hypothesis with explicit missing measurements; do not substitute county sales for store spending.

Checkpoint verdict must distinguish three questions:

- Can we collect and compare trustworthy cross-domain history?
- Does that help answer a concrete user question beyond reciting two charts?
- Does combining qualified indicators improve a held-out forecast?

They can have different answers. The first two may justify continuing even when the third is not yet proven. Report S1/S2/MCP/local-dossier statuses separately, with artifacts and exact remaining dependencies.
