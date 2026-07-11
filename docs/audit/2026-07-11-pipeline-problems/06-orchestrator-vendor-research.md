# 06 — ORCHESTRATOR VENDOR RESEARCH: Prefect vs Airflow vs Dagster, and the self-build path

**As of 07/11/2026.** Two parallel crawl4ai deep-dives (Prefect, Airflow) against live vendor docs, plus direct re-verification of Dagster's OSS-vs-paid boundary — following up `00-DIAGNOSIS.md`'s Dagster citation and `05-BUILD-SCOPE.md`'s open "Prefect vs Airtable" line. Per RULE 0.4, nothing below is from training memory; every claim cites the doc URL it came from, fetched today.

**Scope flag before anything else:** `05-BUILD-SCOPE.md` literally says **"Prefect vs Airtable"** twice (line 3 and line 118) — not Airflow — for "the config-truth layer" decision. When this session started I asked which was meant; operator confirmed **Airflow**, so that's what got researched below. But reading that doc now, "Airtable" (the no-code spreadsheet/database SaaS) is used opposite Prefect specifically for *where the registry itself should live*, not as an orchestrator candidate — a coherent question ("should `cadence_registry.yaml` become an Airtable base with a nice UI, or stay code") that "Airflow" doesn't actually answer. Likely either a genuine typo in that doc (same failure class CLAUDE.md already warns about — one wrong word, weeks of confusion) or the two questions got conflated when it was written. I did not research literal Airtable this session. Say the word if you want that pass too — it's a small, different research task (no orchestration story, just "is a hosted spreadsheet a good source of config truth").

---

## The one-line answer

The specific capability the diagnosis pointed at — **an assertion bound to a specific data asset, evaluated at materialization time, rolled into one per-asset health status, with blocking + alerting** — is a Dagster-specific primitive. Neither Prefect nor Airflow ships it, confirmed independently against both vendors' own docs today. This isn't "Dagster is more mature at the same thing" — the artifact (a check that travels with the asset) doesn't exist in the other two products' core model at all.

---

## What Dagster actually gives you (re-verified fresh, not re-quoting the diagnosis)

- `@asset_check(asset=X, blocking=True)` → returns `AssetCheckResult(passed: bool, metadata={...})`. Runs in the same framework as the load, can block downstream materialization on failure, can be scheduled separately with its own failure-alert sensor. Source: `docs.dagster.io/guides/test/asset-checks`, fetched 07/11/2026.
- `FreshnessPolicy.time_window(fail_window=...)` / `.cron(deadline_cron=..., lower_bound_delta=...)` — declarative "this asset must be no older than X" contracts, settable per-asset or as a repo-wide default. Source: `docs.dagster.io/guides/observe/asset-freshness-policies`.
- **Both of those are core Dagster OSS — free, self-hosted, no Cloud dependency.** Checked the actual page metadata: `asset-checks` and `asset-freshness-policies` carry no `dagster-plus-feature` tag.
- What **is** paid: the rolled-up "Asset health status" dashboard/catalog and "alert when health status changes" — `docs.dagster.io/guides/observe/asset-health-status` is explicitly tagged `dagster-plus-feature`, as is Insights/cost analytics. So the free tier gives you the check primitive; the pretty aggregated one-pane-of-glass view costs money.
- Self-hosting OSS Dagster is **not** serverless: persistent webserver + daemon + Postgres/MySQL (their own deployment docs: SQLite is dev-only) + a run launcher/executor. A real always-on service, a step up from our current Vercel + Supabase + GHA-cron footprint. Source: `docs.dagster.io/deployment/oss/oss-deployment-architecture`.
- There's an official, Dagster-maintained `dagster-dlt` integration (`dagster_dlt.DltLoadCollectionComponent`) that auto-generates Dagster assets straight from existing dlt pipelines/sources. Source: `docs.dagster.io/integrations/libraries/dlt`. So a real Dagster migration would not mean rewriting all 77 ingest pipelines — dlt pipelines slot in largely as-is; the migration cost is infra + wrapping, not pipeline logic.

## Prefect — verdict: partial. Fixes orchestration sprawl, not content-health.

Full agent report has the citations; condensed here.

- Has an Assets feature (`@materialize`), but health is **binary green/red/gray purely off whether the wrapped task raised an exception** — their own docs, verbatim: "Green = last materialization succeeded, Red = last materialization failed, Gray = no materialization recorded." No schema/null/row-count/freshness assertion primitive attached to an asset — you'd hand-write the assertion inside the task body and raise to flip it red, which is what we already do ad hoc today.
- Assets and SLAs (the closest thing to freshness policies) are **both Prefect Cloud-gated** — confirmed by the CLI reference living under `prefect.cli.cloud.asset` ("Manage Prefect Cloud assets"), and the SLA doc states outright "only available in Prefect Cloud," plus marks it Experimental.
- What it genuinely does fix: root causes 3 and 4 from `00-DIAGNOSIS.md` — the watcher-fleet sprawl and the hand-synced config strings. One Python-defined schedule registry replaces 77 GHA workflow files, with real retries and concurrency limits and one dashboard instead of 77 disconnected run pages. Self-hostable via their own docker-compose (Postgres + prefect-server + prefect-services + worker) — a reasonable lift for a single operator, no Kubernetes needed.
- No official `prefect-dlt` package; dlt documents Prefect as a supported target via generic `@task` wrapping (call the dlt pipeline inside a task) — works, no dlt-aware metrics surfaced automatically.

## Airflow — verdict: no. Doesn't touch content-health, heaviest to self-host of the three.

- "Asset" (renamed from "Dataset" in 3.0) is explicitly scoped to scheduling/dependency-triggering off a URI string. Their own docs: "Airflow makes no assumptions about the content or location of the data represented by the URI, and treats the URI like a string." No schema, no assertion, no health field on it at all.
- Real SQL check operators exist and are genuinely useful — `SQLColumnCheckOperator`, `SQLTableCheckOperator`, `SQLValueCheckOperator` from the official `common-sql` provider — but each is **its own separate DAG task**, wired by hand next to the load task, not bound to the asset the way Dagster's check is bound to `@asset_check(asset=X)`. Exactly the "you have to remember to wire it every time, and nothing stops you from forgetting" problem we already have.
- The SLA concept was **removed** in Airflow 3, replaced by "Deadline Alerts" — still purely time-based (did the run start/finish/queue late), never content-based. Historically an SLA miss didn't even fail or cancel the task, just fired an email — the task ran to completion regardless. Deadline Alerts generalize the trigger reference but keep the same limitation: a load can finish exactly on time with an empty or wrong table and nothing fires.
- Heaviest self-host footprint of the three: mandatory external Postgres/MySQL, a dedicated Dag-processor process (security-motivated isolation from the scheduler, mandatory in Airflow 3), an API server — and Airflow's **own** docs admit the scheduler is known to silently hang without a trace, recommending you bolt on an external heartbeat monitor. Same failure class as our own root cause 3 (the watcher fleet itself breaks), one layer down.
- Official first-party dlt integration exists and is mature — `dlt deploy {pipeline}.py airflow-composer` generates a DAG via dlt's own `PipelineTasksGroup` wrapper. More turnkey than Prefect's story.
- Dagster's own marketing states data-quality checks are something Dagster adds "incrementally... on top of Airflow" via their migration tool — framing consistent with what's independently verifiable in Airflow's own docs (no native asset-level health rollup exists in Airflow itself).

## Side by side

| | Dagster (OSS) | Prefect (self-hosted) | Airflow (self-hosted) |
|---|---|---|---|
| Content check bound to a specific asset, runs at load | Yes — `@asset_check`, free/OSS | No — Assets health is try/except only, and the Assets feature itself is Cloud-gated | No — Assets are pure scheduling triggers, no health field exists |
| Freshness policy on an asset | Yes — `FreshnessPolicy`, free/OSS | Closest analog (SLAs) is Cloud-only, experimental, and time-only | Deadline Alerts — time-only, blocks nothing |
| Rolled-up per-asset health dashboard + alert-on-change | Dagster+, paid | N/A — no check primitive to roll up | N/A |
| Official dlt integration | Yes, first-party, Dagster-maintained | No official package; generic `@task` wrapping works | Yes, first-party, dlt-maintained, more turnkey |
| Self-host footprint beyond current Vercel+Supabase+GHA | Persistent webserver + daemon + Postgres | Persistent server: Postgres + prefect-server + prefect-services + worker | Heaviest — scheduler + dedicated Dag-processor + API server + Postgres; own docs flag scheduler-hang risk |
| Fixes which root cause from `00-DIAGNOSIS.md` if adopted | Root cause 1 (green ≠ data), natively | Root causes 3 + 4 (watcher sprawl, config drift) well; not root cause 1 | Root causes 3 + 4 partially, at higher ops cost; not root cause 1 |

---

## What this means for "build it ourselves"

You already have this scoped, in more depth than a Dagster migration would even need. `05-BUILD-SCOPE.md` Phase 1 ("Content contracts") is, structurally, a hand-rolled version of Dagster's exact `@asset_check` primitive — built on infra already running:

- Dagster: `@asset_check(asset=orders, blocking=True)` → `AssetCheckResult(passed, metadata)`, same-process as the load, can block downstream materialization.
- Our Phase 1 spec: `ingest/quality/contracts.py::evaluate_batch(rows, table) -> (clean, quarantined, stats)`, called from the merge orchestrator right before the merge call (Locus A), with a `quarantine`/`abort` policy — same-process, blocking-capable, bound to a specific table. Same shape, zero new framework, zero new host.
- Dagster: `FreshnessPolicy` + the paid rolled-up health dashboard. Our Phase 3c `doctor` entrypoint: "one health line per dataset = worst of {freshness, volume, content, run-status}" — that's building both the free OSS primitive *and* the part Dagster charges for, natively, for $0, on GHA + Postgres/Supabase we already pay for.

One gap worth naming plainly, not glossing over: Dagster's check runs synchronously inside the same process as the load, before the write commits. Our Locus A matches that. But Locus B — the tripwire for `listing_active_stats`, which is a bare SQL **view** with no pipeline of its own — is necessarily after-the-fact/at-rest, because a view has no materialization step to hook a check into. Dagster doesn't actually have a clean answer for this case either; their asset checks require you to own the materialization step, which a raw view consumed downstream doesn't have unless you rewrite it as a materialized Dagster asset — a bigger lift than the Act-today #2 hotfix already scoped (add the property-type filter directly to the view SQL). So this isn't us being cheaper than Dagster on that one; it's a structural limit Dagster would hit too.

## Bottom line

- The diagnosis's actual claim holds up under direct verification: the checks-on-data gap is real and Dagster-specific, not something "any real orchestrator" gives you. Both Prefect's and Airflow's own docs confirm they don't have it in self-hosted/OSS form.
- The operator's prior call — reject full Dagster migration (Path C), build Path A on GHA instead — holds up *more* now that Prefect and Airflow are ruled out as shortcuts. There's no orchestrator swap that buys you checks-on-data for free; you'd hand-write the same assertions either way, just inside someone else's framework — with Airflow adding the most new infrastructure to operate for zero content-health benefit, and Prefect requiring a Cloud subscription for even its weaker, time-only SLA equivalent.
- `05-BUILD-SCOPE.md` Phase 1 + Phase 3c is the correct "build it ourselves" answer. It already exists as an approved spec, is more complete than what Prefect ships for free, and costs nothing beyond engineering time on infra already running.
- On the genuinely-open thread in that doc (line 118, "Prefect vs Airtable for the config-truth layer" — i.e., where `cadence_registry.yaml` itself should live): this session's research leans toward *neither*. The Spine's registry-as-YAML-in-repo already gives version control, PR-diffability, and machine-checkability by the Phase 2 CI cross-check. Moving it to Prefect deployment metadata doesn't apply (Prefect isn't being adopted per the above), and moving it to Airtable would trade the diffable/machine-checked property away for a nicer editing UI — worth a real look only if hand-editing YAML becomes the actual bottleneck, which nothing in the evidence so far says it is.

Evidence: this session's crawl4ai fetches (`docs.dagster.io/guides/test/asset-checks`, `.../observe/asset-health-status`, `.../observe/asset-freshness-policies`, `.../deployment/oss/oss-deployment-architecture`, `.../integrations/libraries/dlt`, `dagster.io/pricing`; `docs.prefect.io/v3/concepts/{assets,slas,schedules,...}`, `prefect.io/compare/{airflow,dagster}`; `airflow.apache.org/docs/apache-airflow/stable/{core-concepts,authoring-and-scheduling/assets,ui}.html`, `apache-airflow-providers-common-sql` operators docs, `dlthub.com` Airflow/Prefect deploy walkthroughs) plus `00-DIAGNOSIS.md`, `05-BUILD-SCOPE.md` in this folder.
