# 07 — PLAN C: orchestrator migration (Dagster), conditional on A

**As of 07/11/2026.** The end-state migration spec the diagnosis deferred ("revisit C after A has stabilized reality" — `00-DIAGNOSIS.md:100`). Companion to `05-BUILD-SCOPE.md` (Path A, the thing being built now) and `06-orchestrator-vendor-research.md` (the live-doc vendor verdict). Vendor mechanics below are **not re-derived** — they were crawl4ai-verified against `docs.dagster.io` on 07/11/2026 in `06`; this doc cites `06`, it does not re-fetch.

> **Read this first — the honest flag.** `06` concluded that Path A hand-rolls Dagster's *core* primitive (`@asset_check`) on infra we already run, for $0. So this is **not** a "migrate to finally get checks-on-data" plan — A gets us that. This is a narrow "should we ever adopt a real orchestrator to retire the GHA/config sprawl" plan, written so that *if* the gate below opens, we do it correctly and without undoing A. If the gate never opens, that is a valid outcome and this doc's job is done by making the gate legible. **Do not start any task in §4 until §2's gate is met and the operator says go.**

---

## 1. The honest ledger — what A already ate, what C would still uniquely buy

The whole case for C rests on this table being accurate. If it reads thin, it *is* thin — that is the finding, not a failure of the spec.

| Diagnosis root cause | Does Path A fix it? | Does Dagster (C) add anything on top? |
|---|---|---|
| **RC1 — green ≠ data** (checks measure effort not content) | **Yes.** `ingest/quality/contracts.py::evaluate_batch()` at the merge locus = a hand-rolled `@asset_check(blocking=True)`. `doctor.py` = the free `FreshnessPolicy` equivalent **plus** the rolled-up health status Dagster charges Dagster+ for. (`05` §Phase 1, §3c; `06` §"build it ourselves") | **No new capability.** Only a framework-native home for assertions A already owns. |
| **RC2 — no content contracts** | **Yes.** Same `contracts.py` + `quality_registry.yaml` content blocks. | **No.** Same assertions, different syntax. |
| **RC3 — watcher fleet sprawl / breaks** | **Partially.** `doctor` consolidates the *read* surface to one reader; watch-list manifest (`05` §3a) ends the 70% blind spot. | **Yes, more.** One orchestrator run-history pane replaces 77 disconnected GHA run pages; native retries/concurrency/timeout classification instead of hand-widened watcher gates. |
| **RC4 — config truth scattered across 6 places** | **Partially.** The Spine makes `cadence_registry.yaml` the single source; Phase-2 CI cross-check (`check-registry-identity.mts`) machine-verifies the hand-synced strings at PR time. | **Yes, more.** Schedules/deps become one Python-defined graph (`Definitions`), collapsing workflow YAML + `constants.py` + cron comments into code the framework itself reads. |
| **RC5 — red is ambient** | **Yes** (org discipline: CI-green gate, checks ledger), orchestrator-agnostic. | **No.** Not a tooling problem. |

**Bottom line of the ledger:** C buys **exactly two** things A does not — (a) retiring the 77-workflow GHA + hand-synced-config surface into one orchestrator graph (RC3+RC4, deeper), and (b) first-party `dagster-dlt` auto-wrapping of the dlt pipelines. It buys **nothing** on RC1/RC2 (the live-bleeding class), because A already owns those. The price for (a)+(b) is a persistent always-on service. That is the entire trade. Spec it honestly or don't spec it.

---

## 2. The decision gate — what must be true *after* A before C is worth a multi-week migration

C is disproportionate today (`00-DIAGNOSIS.md:100`) because the bleeding (RC1/RC2) is unstopped. Once A stops it, C is a pure *operability* investment, and pure operability investments must clear a measured bar, not a vibe.

**Open the gate only when ALL of these hold:**

1. **A is shipped and stable.** All of `05-BUILD-SCOPE.md`'s Spine + Phase 1–4 landed, and the nightly chain + `doctor --cron` have run **green for ≥ 60 consecutive days** with no manual intervention. (You cannot port assertions into Dagster that you have not first stabilized in A — see §3.)
2. **The GHA/config surface is the *measured* bottleneck.** Concretely: ≥ 3 config-drift or workflow-sprawl incidents in a rolling 90 days that the Phase-2 CI cross-check and the watch-list manifest **structurally cannot catch** (i.e. not a "we forgot to run it" miss — a genuine gap in the machine-check's reach). If the CI cross-check is catching drift at PR time, RC4 is handled and the orchestrator's headline win has evaporated.
3. **Workflow count is still growing past what codegen manages.** The watch-list manifest (`05` §3a) regenerates watcher arrays from `scheduled === true`; if that keeps the fleet honest, GHA sprawl is a solved problem. Gate opens only if the *number* of workflows or their interdependency has outgrown "one clocked head + `needs` ordering" (`05` §Phase 4).
4. **An operator is willing to run an always-on service.** OSS Dagster is **not** serverless: persistent webserver + daemon + external Postgres + a run launcher/executor, always on — a real step up from the current Vercel + Supabase + GHA-cron footprint (`06`, cites `docs.dagster.io/deployment/oss/oss-deployment-architecture`). No appetite to operate that → gate stays shut, full stop.

**Kill criteria — if ANY is true, do NOT migrate; close this doc:**
- A is green and the config/watcher surface is quiet. C would then be cost with no named pain to relieve.
- The registry-as-YAML + CI cross-check is holding drift at PR time (RC4 handled) → C's deepest win is gone.
- No one will run the always-on service → the migration ships a *new* RC3 (a watcher that breaks), one layer down. `06` flags Airflow's own docs admitting its scheduler silently hangs; Dagster's daemon is the same failure class if unattended.
- Anyone proposes rewriting `contracts.py`/`doctor` logic *inside* Dagster rather than porting it (see §3). That is a signal the migration is being driven by novelty, not need — stop.

---

## 3. The load-bearing invariant — C must not undo A

The single biggest way this migration goes wrong: someone treats Dagster adoption as a rewrite and **re-invents A's assertions inside `@asset_check` bodies** instead of calling A's existing, tested code. That would throw away 60+ days of proven contracts and reintroduce every false-positive trap `05` §Phase 1 already mapped (the 523 legit sub-$20k land lots; the 41,510 nominal-consideration LeePA transfers).

**Invariants — non-negotiable, they define "correctly":**

1. **Port, don't re-invent.** A `@asset_check` body **calls** `contracts.evaluate_batch(rows, table)` and translates its `(clean, quarantined, stats)` return into `AssetCheckResult(passed=..., metadata=stats)`. The assertion logic stays in `contracts.py`, unit-tested, DB-free. Dagster becomes a *caller*, never a *reimplementation*.
2. **The registry survives as the config layer.** `cadence_registry.yaml` (the Spine) stays the source of config truth; the Dagster `Definitions` graph is *generated from it or validated against it*, not hand-authored in parallel (that would recreate RC4 inside the new tool). `06` §bottom-line already concluded the config-truth layer should stay diffable YAML, not move to a vendor.
3. **`doctor` stays the health model.** Dagster+'s rolled-up "Asset health status" is a paid feature (`06`, tagged `dagster-plus-feature`). We do **not** pay for it — `doctor.py` already computes "worst of {freshness, volume, content, run-status}" for $0 and keeps doing so, reading Dagster run-status as one more input alongside the others. C changes where checks *run*, not who *reports health*.
4. **Views have no clean Dagster answer either — keep Locus B.** `listing_active_stats` is a bare SQL view with no materialization step to hook a check into. `06` §"one gap" is explicit: Dagster asset-checks require you to own the materialization; a raw view doesn't have one unless rewritten as a materialized asset (a bigger lift than the Act-today #2 view hotfix). So the Locus-B at-rest tripwire (`05` §Phase 1) survives migration unchanged. Do not pretend Dagster subsumes it.

---

## 4. If the gate opens — migration mechanics (reference; do not start until §2 is met)

Scoped as sequenced, independently-revertable steps per RULE 1. This is deliberately **not** expanded into per-line TDD tasks: writing granular test steps for asset code we may never author is the exact over-investment `00-DIAGNOSIS.md` criticizes. Expand a step into a full `docs/superpowers/plans/` TDD plan **only at the moment you commit to executing it.**

**What migrates, what stays, what never migrates:**

- **Migrates to Dagster assets:** the **dlt** ingest pipelines. `dagster-dlt`'s `DltLoadCollectionComponent` auto-generates assets from existing dlt pipelines/sources (`06`, cites `docs.dagster.io/integrations/libraries/dlt`) — pipeline *logic* is not rewritten, only wrapped. This is the low-friction majority.
- **Migrates by hand:** the **non-dlt** contaminated writers — `listing_lifecycle/distill.py:upsert_state`, `active_listings/distill.py:upsert_rows`, `market_aggregates/pipeline.py:run_details` (hand-rolled psycopg merges, per `05` §Phase 1 correction). `dagster-dlt` does **not** auto-wrap these; each becomes a manual `@asset` whose body calls the existing merge function, with an `@asset_check` calling `contracts.evaluate_batch` (Invariant 1). **This is where the migration's real labor is** — budget for it, don't assume `dagster-dlt` covers everything.
- **Stays on GHA:** anything non-ingest the nightly chain doesn't own — `smoke-prod`, send-verifiers, records-request engine, etc. C is an *ingest/data-asset* orchestrator, not a general CI replacement. Do not scope-creep it into owning the whole `.github/workflows/` tree.
- **Never migrates:** the Locus-B view tripwire (Invariant 4); `doctor` as the health reporter (Invariant 3); the CI cross-check (`check-registry-identity.mts`) which guards the config layer regardless of orchestrator.

**Sequence (each step revertable; SESSION_LOG + evidence per RULE 1):**

1. **Stand up OSS Dagster read-only, alongside prod — change nothing.** Webserver + daemon + a dedicated Postgres (not Supabase prod). Deploy target TBD at gate time (a small always-on VM/container; not Vercel — it is not serverless). Success = the UI renders with zero assets. Fully revertable: tear down the service, prod untouched.
2. **Wrap the dlt pipelines via `dagster-dlt`, still triggered by GHA.** Assets appear in the Dagster catalog but GHA crons remain the schedulers. Proves the wrapping without moving the clock. Verify asset materializations match the live tables the GHA runs produce (same row counts, same `_dlt_loads` status).
3. **Port A's assertions into `@asset_check` bodies (Invariant 1).** Each check *calls* `contracts.evaluate_batch`; assert parity by running both A's Locus-A gate and the new asset-check on the same batch and diffing `(clean, quarantined)`. Zero-diff is the gate to proceed.
4. **Add `FreshnessPolicy` per asset from the registry's `nightly`/`min_rows` Spine fields** (`FreshnessPolicy.cron(...)` per `06`). Advisory only — `doctor` still reports health. No blocking yet.
5. **Move the schedule for ONE low-risk dlt pipeline off GHA onto the Dagster daemon.** Delete only that one GHA cron. Run ≥ 2 weeks; confirm `doctor` and the Dagster pane agree. This is the first irreversible-ish step — **operator ask-first per RULE 1** (rewires a live schedule).
6. **Roll the remaining dlt schedules over, one at a time**, each with a ≥ 1-week soak and a `doctor`/Dagster reconciliation. Never big-bang.
7. **Migrate the nightly chain** (`05` §Phase 4) from `nightly-chain.yml`'s `needs`-ordering to Dagster asset dependencies — *last*, because it is the highest-blast-radius rewire (it gates the live email precondition). Ask-first.

**Explicitly out of scope for C, ever:** paying for Dagster+ (health rollup / Insights) — `doctor` covers it free (Invariant 3); migrating non-ingest CI; rewriting any assertion logic.

---

## 5. Cost & risk ledger

**New standing cost:** one always-on service (webserver + daemon + Postgres). Real dollars + real ops attention — the thing that must clear gate #4.

**How this goes wrong (name it before it does):**
- **Re-invention drift** (highest) — assertions rewritten inside Dagster, A's tested logic rots. Mitigation: Invariant 1 + the zero-diff gate in step 3.
- **New silent-failure surface** — the Dagster daemon hangs unattended (same class as `06`'s Airflow-scheduler-hang note). Mitigation: `doctor` keeps reading run-status independently; Dagster is one input to health, never the sole reporter.
- **Big-bang temptation** — migrating all schedules at once. Mitigation: steps 5–7 are strictly one-at-a-time with soaks.
- **Scope creep into general CI** — Dagster starts owning `smoke-prod` etc. Mitigation: §4 "Stays on GHA" list is a hard boundary.

---

## 6. Bottom line

Path A stops the bleeding and, in doing so, **hand-rolls Dagster's core primitive for free**, which is why the operator rejected the full migration in `05` and why `06`'s live-doc research says that call holds up *more* after Prefect/Airflow were ruled out. Plan C is therefore not a fix — it is an *operability upgrade* that trades a persistent always-on service for retiring the GHA/config sprawl. It earns its multi-week cost **only if** §2's gate opens (A stable ≥ 60 days *and* the config/watcher surface is a measured, structural bottleneck *and* someone will run the service). If A ships and stays quiet, the correct outcome is to never build C — and this doc will have done its job by making that a decision, not an omission.

Evidence: `00-DIAGNOSIS.md`, `05-BUILD-SCOPE.md`, `06-orchestrator-vendor-research.md` (all this folder). Vendor mechanics per `06`'s 07/11/2026 crawl4ai fetches of `docs.dagster.io` — not re-fetched here; re-verify against live docs at gate time, since spec surfaces drift.
