# 08d — Nightly-chain timing envelope + the cron-cleanup list

**As-of:** 07/11/2026 · **Source:** research fan-out for `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §13 (25 opus + 2 sonnet agents, read-only).
**Status:** evidence for Fable 5's build. Every claim below was produced by an agent that read the live files / queried the live DB (SELECT-only) / fetched live vendor docs. Numbers anchored to `03-lake-live-state.md` as the canonical 07/11/2026 fixture.

Spec §13.4 asked for live confirmation of the timing envelope before deleting the rebuild cron. **Operator constraint (07/11/2026): the whole chain starts after 11 PM–12 AM Eastern and MUST finish before 6:00 AM Eastern.** That 6 AM bar — stricter than the spec's email deadline — is the pass/fail test applied below. Durations are measured from real `gh run` history (read-only; no run was ever triggered).

---

## Measured run durations (real history)

| workflow | runs sampled | p50 | max | recent conclusions |
|---|---|---|---|---|
| `active-listings-daily.yml` | 20 | 11.4 min | 13.2 min | 20 success, 0 failure/cancelled in this window (range 2026-07-07 to 2026-07-11, 4x/day cadence). Broader history has 3 cancelled runs per 01-workflows-issues.md:308-309 (2026-07-03 schedule, 2026-06-26 x2 dispatch) but none fall inside this 20-run sample — currently on a long success streak. |
| `listing-lifecycle-daily.yml` | 20 | 3.1 min | 11.3 min | 18 success, 2 failure (both 2026-07-07: 14:35 UTC=69s, 11:51 UTC=66s). Both failures are fast (~66-69s vs p50 185s) — pattern matches a config/assertion fail-fast, not a timeout-kill. No cancelled/timed_out conclusions observed. |
| `city-pulse-daily.yml` | 20 | 4.0 min | 24.3 min | 20 success, 0 failure/cancelled (range 2026-06-04 to 2026-07-11, ~1x/day). Duration is bimodal: 17 runs cluster 120-400s but 3 runs (2026-06-15, 2026-06-28, 2026-07-05) ran 1199-1455s — 5-8x the typical duration despite all reporting 'success'. Worth flagging as a hidden slow-path even though conclusion is clean; no cancelled/timed_out seen. |
| `live-search-daily.yml` | 20 | 1.8 min | 2.0 min | 19 success, 1 failure (2026-06-23, only 4s — a near-instant fail, not a timeout/cancel). Tightest duration distribution of the 8 members (104-120s for all successes). No cancelled/timed_out conclusions observed. |
| `daily-rebuild.yml` | 20 | 27s | 20.1 min | 14 success, 6 failure. 5 of the 6 failures cluster on a single bad day, 2026-06-29, with long durations (336s, 462s, 517s, 971s, 1059s, 1208s = 5.6-20min) versus the typical ~20-30s 'already fresh, skip rebuild' success path — consistent with the job actually attempting work and dying partway (job timeout-minutes is 30/1800s, so none of these hit the hard GH timeout, but 1208s is 67x the p50). Cross-check against 01-workflows-issues.md:160-164: full lifetime history is 72 total runs, 42 success/29 failure/1 cancelled — so this 20-run recent window (14/6) is NOT representative of the workflow's overall flap rate, it's a recency-biased slice. No literal 'cancelled' conclusion in this 20-run sample even though 1 exists in the full 72-run history. |
| `narrative-bake.yml` | 4 | 28s | 2.4 min | TOO FEW RUNS for a reliable p50/max — only 4 runs exist in the workflow's entire history (all 2026-07-10 to 2026-07-11). This is a brand-new workflow; its own YAML header says it 'chains on daily-rebuild's completion' per spec 2026-07-10-batch-narrative-bake-design.md. Conclusions: 3 success, 1 failure (142s, 2026-07-10 07:18 UTC). |
| `graphify-republish.yml` | 2 | 41s | 44s | TOO FEW RUNS and ALL FAILING — only 2 runs exist, ever (2026-07-10 10:36 UTC=44s, 2026-07-11 09:09 UTC=38s), both conclusion=failure. 0% success rate. This extends 01-workflows-issues.md:78 ('1/1 failed, never succeeded... Only 1 run ever') — a second consecutive failure landed 2026-07-11 since that line was written, so the record is now confirmed 0-for-2, still never succeeded. Highest-priority member of this nightly-chain sample: it is not flaky, it is dead. |
| `gate-a-parity.yml` | 20 | 1.3 min | 9.8 min | 19 success, 1 failure (590s, 2026-06-28 — 6-8x longer than the typical ~70-90s successful run, consistent with a hang-then-fail rather than a fast config/syntax error). No cancelled/timed_out conclusions observed in this window. |

---

## Nightly-chain timing envelope — verdict (vs 6 AM Eastern ceiling)

**Bar (operator, 07/11/2026):** the whole chain starts after 11 PM–12 AM Eastern and **nothing** is still running at **6:00 AM Eastern** (= 10:00 UTC EDT / 11:00 UTC EST). Stricter than spec §8's 11:00 UTC email deadline.

**Verdict in one line: the chain's *execution* fits the window with ≥2.5 h to spare — even at every job's YAML timeout. What breaks the ceiling is GitHub's `schedule:` trigger, which fires this repo's overnight cron 2 h 07 m to 5 h 29 m late (median +3 h 07 m). The fix is not an earlier head or a trimmed timeout; it is to stop triggering the head with `schedule:`.**

---

### 0. Three corrections to the measured-durations JSON (each changes the answer)

**(a) rebuild p50 = 27 s is the SKIP path — unusable as the chain's rebuild cost.** Step-level read: 07-09 (run `29008401541`) "Run refinery (resilient)" = **1 second**; 07-04 (`28700584559`) = 1 s. Those runs built nothing. The gate is `ingest/scripts/rebuild_due.py`, whose docstring (lines 11-16) states the one question it answers: *"has any registered source ingested data more recently than the brains were last built?"* — YES → exit 0 (rebuild), NO → exit 10 (skip). **In the chain, the ingests land fresh rows immediately before the gate, so the gate fires every night and the rebuild always does full work.** Measured real-work refinery steps: **410 s** (07-07 `28856263640`, success), 874 s (06-28, fail), 949 s (06-29, fail), **963 s** (06-29 `28353096175`, success = 16 m 03 s). Ceiling `timeout-minutes: 30` (daily-rebuild.yml:36).

**(b) bake p50 = 28 s is the CADENCE-SKIP path — the largest term in the chain has never been measured.** `BAKE_CADENCE` is **unset** (`gh variable list` returns only CRON_INCIDENT_*, DIGEST_*, ENGINE_ENABLED, SELFHEAL_*), so the default gate is weekly/Mondays-UTC (narrative-bake.yml:2-5) and all 4 sampled runs are skips. A **real** bake polls an Anthropic Message Batch to completion: `POLL_DEADLINE_MS = 80 * 60_000` → **80 min** (`scripts/bake-narratives.mts:96`), under `timeout-minutes: 90` (narrative-bake.yml:44); the workflow comment says "results typically land within the hour." The documented **"LAUNCH FLIP"** (`BAKE_CADENCE=daily`, narrative-bake.yml:4-5) makes this an **every-night** term.

**(c) "warm" (= graphify-republish, per spec §8's 8-member list) has never executed its work.** Both runs ever die at step 3, *Checkout swfldatagulf-ops* (28 s / 30 s) — the cross-repo `REBUILD_PAT` scope gap its own comment predicted (graphify-republish.yml:38-44). Steps 4-9 (Setup Bun → `bun run graphify:publish`) are **`skipped` in both runs**. Its 41 s p50 is *time-to-fail*, not time-to-run. True successful duration is **unknown**; ceiling `timeout-minutes: 20`.

---

### 1. Critical path, term by term (execution, measured from the moment the head actually fires)

| # | Term | Typical | Worst observed | YAML ceiling | Basis |
|---|---|---|---|---|---|
| T1 | max(4 parallel ingests) | **11.4 min** — active-listings binds (p50 685 s) | **24.3 min** — city-pulse hidden slow path (1455 s; 3 of 20 runs at 1199-1455 s, all reporting `success`) | 60 min (listing-lifecycle) | scheduled runs are per-county; chain = Lee+Collier matrix, so the block ≈ the slower county |
| T2 | row-gate (`assert_landed.py`) | **~2 min** | **~5 min** | n/a — **NOT BUILT, 0 runs** | proxy: the existing `rebuild_due.py` gate step runs in **1 s**; the cost is runner acquisition + `pip install -r ingest/requirements-probe.txt` (10-25 s observed) |
| T3 | rebuild (**real work**) | **~7-16 min** (use 10) | **16.4 min** (963 s) | 30 min | correction (a) |
| T4 | bake | **0.5 min** skip night · **~60 min** real-bake night | **80-90 min** | 90 min | correction (b) — *never measured* |
| T5 | max(warm, gate-a) | **>=1.3 min** (gate-a p50 80 s; warm unknown) | **20 min** (graphify ceiling); gate-a max 590 s = 9.8 min | 20 min | correction (c) |
| T6 | step overheads (5 runner acquisitions) | **~1 min** | **~10 min** | — | measured queue: ~2 s typical, but **5 m 03 s** on 07-09 (run created 09:30:06, job started 09:35:09) |

**Execution totals**
- **Typical, non-bake night** (6 of 7 today): 11.4 + 2 + 10 + 0.5 + 1.5 + 1 = **~26 min**
- **Typical, bake night** (Mondays now; **every night** post-launch-flip): 11.4 + 2 + 10 + 60 + 1.5 + 1 = **~86 min (1 h 26 m)**
- **Worst observed** (every term at its measured max): 24.3 + 5 + 16.4 + 80 + 20 + 10 = **~156 min (2 h 36 m)**
- **Worst permitted** (every job runs to its YAML timeout): 60 + 5 + 30 + 90 + 20 = **205 min (3 h 25 m)** — this is what GitHub will allow before killing anything.

---

### 2. Answer to the prescribed question: head at 04:05 UTC = 00:05 EDT, on time

| Scenario | Exec | Finish (UTC) | Finish (Eastern) | vs 6 AM EDT |
|---|---|---|---|---|
| typical, non-bake night | 26 m | 04:31 | **00:31 EDT** | PASS — 5 h 29 m margin |
| typical, bake night | 86 m | 05:31 | **01:31 EDT** | PASS — 4 h 29 m margin |
| worst observed | 156 m | 06:41 | **02:41 EDT** | PASS — 3 h 19 m margin |
| every job to its YAML ceiling | 205 m | 07:30 | **03:30 EDT** | PASS — 2 h 30 m margin |

**With an on-time head, even the worst case clears 6 AM Eastern by 2.5 hours.** (Note the all-ceilings finish, 07:30 UTC, lands exactly on spec §8's "worst ~07:30 UTC" — §8's *execution* estimate is sound. What §8 missed is the trigger.) **The chain's execution is not the problem.**

---

### 3. The term §8 omitted: the head does not fire when the cron says

`5 4 * * *` = 04:05 UTC is when the cron *asks* to fire. Measured on this repo's overnight slot (`created_at` = when GitHub actually created the run; `created_at == run_started_at` on every run sampled, so this is scheduler-side, not runner-queue-side):

- **`0 6` cron, 06-21 → 07-09 (16 fires):** actually fired **08:19-11:29 UTC** → **+2 h 19 m to +5 h 29 m late**, median **+3 h 07 m**.
- **`23 4` cron** (landed 07-10, commit `a8f92737`), 1 fire so far: 07-11 fired **06:30 UTC** → **+2 h 07 m late**. Moving off the top of the hour did **not** fix drift.
- **Scheduled fires are not guaranteed at all:** the 06-23, 06-24 and 06-25 overnight fires produced **no run record**. Caveat, stated honestly: I cannot distinguish "GitHub dropped them" from "the workflow was disabled that window" — the workflow's `updated_at` (2026-06-25T18:32:25Z) lands 2 s before a manual dispatch, which is consistent with a re-enable. Do not lean on this. It does not need to carry the verdict, and narrative-bake.yml:13-16 independently cites GitHub's documented drop behavior ("heavily-loaded schedules can be DROPPED entirely") as the reason it carries a backstop cron.

The repo already knows about drift — daily-rebuild.yml:8-10 ("observed drift here was 2.3-4.1 h on the old 06:00 slot") and narrative-bake.yml:15-18 ("whenever GitHub's drifting scheduler actually ran it"). It simply was never carried into the §8 envelope.

**Decisive counter-evidence: `workflow_dispatch` runs start immediately.** 06-29 run `28353096175`: created 06:29:37, job started 06:29:41 — **4 seconds**. Drift is specific to `schedule:`.

---

### 4. Finish in Eastern, with drift applied (6 AM EDT = 10:00 UTC)

| Scenario | Head fires (UTC) | Finish (UTC) | Finish (Eastern) | vs 6 AM |
|---|---|---|---|---|
| best drift (+2 h 07) + typical exec | 06:12 | 06:38 | **02:38 EDT** | PASS — 3 h 22 m |
| median drift (+3 h 07) + typical exec | 07:12 | 07:38 | **03:38 EDT** | PASS — 2 h 22 m |
| median drift + bake night (86 m) | 07:12 | 08:38 | **04:38 EDT** | PASS — 1 h 22 m |
| median drift + worst exec (156 m) | 07:12 | 09:48 | **05:48 EDT** | PASS — **12 min** |
| **worst drift (+5 h 29) + typical exec** | 09:34 | 10:00 | **06:00 EDT** | **FAIL** — exactly at the ceiling |
| **worst drift + a normal 60-min bake** | 09:34 | 11:00 | **07:00 EDT** | **FAIL** — 1 h over |
| **worst drift + worst exec** | 09:34 | 12:10 | **08:10 EDT** | **FAIL** — 2 h 10 m over |

**Typical finish: 03:38-04:38 EDT — clears with 1.5-2.5 h of comfortable margin. Worst case: 08:10 EDT — misses by 2 h 10 m.**

Honest probability texture: this is a **minority-of-nights** failure, not an always-fail. At *median* drift even worst-execution squeaks in (05:48 EDT). The misses come from the **drift tail** (roughly the top quartile, >4 h) — but note that **after the launch flip** (nightly bake) you no longer need a worst-execution night to blow it: worst-drift plus a perfectly *normal* 60-minute bake already lands 07:00 EDT. Against an absolute "nothing running at 6 AM" bar, a minority of nights is still disqualifying.

In winter (EST, ceiling 11:00 UTC) every row gains an hour — but worst case still lands **07:10 EST**, still over.

**Drift also violates the *other* half of the operator's constraint.** They asked the chain to *start* after 11 PM–12 AM Eastern. With drift, a 00:05 EDT head actually starts **02:12-05:34 EDT**. The chain does not begin when they asked, either.

---

### 5. RULE-1 flag — is it safe to delete daily-rebuild's `23 4` cron and comment out the daytime ingest crons?

**ASK-FIRST, WITH CAVEATS. Do not land the cron deletions in the same PR as the chain.**

The underlying bug is real and the chain is the right fix (ingests run 09:00-18:00 UTC while the rebuild fires 04:23 → the nightly rebuild consumes *yesterday's* data). But four things block a blind deletion:

1. **A late-or-missing head plus deleted daytime crons = no data landed at all.** Today's daytime crons at least *land the data*, even though the rebuild misses it. Deleting them converts "the rebuild consumed yesterday's data" into "**nothing ingested today**, and the email still ships green." Strictly worse.
2. **Worst case misses the ceiling** (08:10 EDT). The bar is *nothing still running at 6 AM*; that cannot be certified today.
3. **The biggest term has never been measured.** No real narrative bake has ever been observed (80-min in-script deadline, 90-min job ceiling). You cannot certify a 6 AM ceiling against an unmeasured 80-minute term — least of all with the launch flip making it nightly.
4. **The chain's tail contains a job that has never succeeded once** (graphify/"warm", 0-for-2, dead at the cross-repo checkout). Either it reddens the chain every night, or it is `continue-on-error` and decorative.

**What has to change — one fix dominates:**

- **(a) THE FIX: stop triggering the head with `schedule:`.** The two remedies the task floated do *not* work: an **earlier head** buys nothing against +2-5.5 h of drift (and the operator's 11 PM floor caps how early you can even go), and a **trimmed timeout** shortens execution, which was never the binding term. Fire `nightly-chain.yml` by `workflow_dispatch`/`repository_dispatch` from an external clock — **Supabase `pg_cron` or a Vercel cron, both already in-stack** — which starts the run in ~4 s (proven: 06-29 dispatch, created → job in 4 seconds). Cost ~$0. This single change fixes **both** halves of the operator's constraint: the chain starts when asked *and* finishes hours before 6 AM, in every scenario in section 2.
- **(b) Bound the bake inside the chain.** Set `BAKE_POLL_DEADLINE_MS` explicitly on the nightly path (e.g. 45 min). The script already exits 0 loud on overrun and the next run collects the persisted batch (narrative-bake.yml:40-43), so a bounded bake is safe by design.
- **(c) Trim the ingest ceilings for chain use.** listing-lifecycle carries `timeout-minutes: 60`, active-listings 30 — a Lee+Collier-only matrix needs neither. Cap chain ingests ~20 min so one hung ingest cannot eat the window.
- **(d) Land the §8 email preflight FIRST** (refuse to send unless master's `freshness_token` is today's). That makes a dropped/late head fail **loud** instead of shipping yesterday's numbers — it is the precondition that makes deleting the daytime crons survivable at all.
- **(e) Fix or drop graphify** from the tail (`REBUILD_PAT` appears to have no scope on `swfldatagulf-ops`) before it becomes load-bearing.
- **(f) Sequence:** ship the chain → run it **alongside** the existing crons for ~1 week → confirm green finishes before 6 AM → *then* comment out the daytime ingest crons and delete `daily-rebuild.yml`'s `23 4` cron, in a separate, revertable PR.

---

### 6. The strongest argument FOR the chain, independent of the ceiling

Today all 8 members are separately scheduled and **each pays its own independent drift** — measured: active-listings ~+1 h, listing-lifecycle +45 m to +1 h 19, city-pulse +1 h 17 to +3 h 07, live-search +57 m to +3 h 12, gate-a +1 h 38 to +3 h 58, rebuild +2 h 07 to +5 h 29. **The effective execution order is therefore random** — which is precisely the mechanism by which the rebuild ends up consuming yesterday's data. One clocked head plus `needs` ordering pays drift **once** and makes the internal order deterministic. That is a real win even before the ceiling question is settled — and it is why the right build is the chain, but the *safe* chain is an **externally-dispatched** one.

---

**Footnotes (so they are not hidden errors):**
1. T1/T3/T5 use run-level durations, which already include each run's own runner-queue; the separate T6 overhead therefore slightly **double-counts** queue time. Immaterial to every verdict above (it makes the estimates conservative), but stated.
2. The proposed head minute `:05` sits in exactly the top-of-hour congestion band the repo's own `:23`/`:37` convention exists to avoid (daily-rebuild.yml:8-10) — a further argument for not trusting `schedule:` for the head.
3. `assert_landed.py` (T2) does not exist yet — its 2 min / 5 min terms are the only *estimated* rather than *measured* numbers in the table, proxied from the existing `rebuild_due.py` gate step.
