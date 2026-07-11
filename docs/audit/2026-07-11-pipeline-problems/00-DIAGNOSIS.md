# 00 — DIAGNOSIS: why data-in keeps breaking here

**As of 07/11/2026.** Written after four parallel evidence sweeps (files `01`–`04` in this folder), a live ops-page read, in-session verification of the SteadyAPI client path and GHA run history, and a same-day read of the current Dagster and Great Expectations docs for the industry mirror. Every claim below cites its evidence file; nothing is from memory.

---

## The answer in one paragraph

Nothing here is one broken pipeline, and it is not bad luck. The system is built to verify **effort, not outcomes**: a cron reporting green, a brain being inside its TTL, a build report saying "0 failed" — all of these can be (and today, are) true while the table underneath is empty, missing, or 10x wrong. Around that core defect sit three amplifiers: every pipeline is bound together by half a dozen hand-copied strings that no machine ever cross-checks (one wrong word = weeks of silence or false alarms); monitoring is a fleet of separate watchers, each covering a different partial slice, several of them broken themselves; and red is ambient — CI stayed red through 35 consecutive pushes, so a new red means nothing. Companies where "data just works" do not have smarter people or fewer failures. They put the checks **on the data itself, in the same process that loads it**, keep **one** source of config truth, keep **one** health model per dataset, and treat a red main as stop-the-line. We have the inverse on all four.

---

## Root cause 1 — Green ≠ data. Every signal measures process, not content.

The defining failure class, confirmed independently on the producer side, the consumer side, and in the code:

- `redfin_city_swfl`: the cadence registry says "confirmed via live dry-run 07/11/2026." The table **does not exist** in the database. A dry run writes nothing — the "confirmation" confirmed the fetch, never the landing. (`03`, Never Loaded)
- `dbpr_re_licensees`: registry note claims "30,100 rows observed live 07/10." Live count on 07/11: **0 rows**. No audit trail exists to say whether it was wiped or never landed. (`03`)
- The SteadyAPI client (`ingest/pipelines/rentals/steady_client.py:25-45`) returns a "gap" sentinel on any non-200 **by design** — so a suspended subscription produces a green run with missing data, indistinguishable from "market was quiet." Both consuming crons last fired 07/06 and 07/04, *before* the 07/07 suspension; nothing has re-tested the vendor since, and when the crons fire next they will pass green either way. (in-session `gh run list` + code read)
- Lee permits: two runs reported green while a dry-run/live-path bug made them **silent no-ops**; the pipeline has exactly one real successful write in its life (06/16/2026). (`02` §Lee-permits)
- Two brains (`communities-swfl`, `franchise-outcomes`) pass every freshness check while their content says "no community data yet" / "no real SBA FOIA load yet." The rebuild report for the same day reads clean: 6 built, 35 skipped-fresh, **0 failed, 0 held**. (`04`)
- `franchise-outcomes` served a synthetic 15-brand fixture under a real SBA citation for 36 rebuild cycles before a human noticed. (`02`)

**Industry mirror (fetched today):** Dagster's model attaches "asset checks" — assertions like *column has no nulls, table matches schema, data needs refreshing* — to each dataset, runs them at materialization time, and rolls them into one per-asset health status with alerts (docs.dagster.io/guides/test/asset-checks). Great Expectations is the same idea as a library: declarative "expectations" validated at checkpoints, with actions on failure (docs.greatexpectations.io). The load and the check are one unit. Ours are separate universes.

## Root cause 2 — No content contracts where data lands. Contamination has no owner.

Your "rentals mixed in with home sales" is real, live, and worse than you said:

- The view the product actually reads for active-listing stats (`listing_active_stats`) has **no property-type filter**. Land parcels are ~21% of active "sale" rows region-wide and up to 69% in Lehigh Acres ZIPs. Result shipping right now: ZIP 33972 reports **median asking price $35,000**; the single-family median there is **$354,999**. Decomposition: 918 land rows at $29,500 vs 385 houses at $354,999, blended. Second ZIP (33974) same shape: $31,000 reported. (`03` §4a)
- 91 non-land rows priced $600–$9,900 are tagged as *sales* — including a 7-unit Marco Island condo cluster at $6K–$9K that is obviously seasonal rentals — feeding the same view. (`03` §4b)
- The same root cause leaks into a second table: `market_details_swfl` shows 33972 "median sold $30,000" against median rent $1,950. (`03` §4e)
- An older raw table (`active_listings_residential`) mixes sale and rental **by design** — its own code comment admits a residual of $50k+/season luxury rentals stays mislabeled — and it nearly got wired into a new feature last week ($309k vs the correct $610k for Collier; check `price_source_wire_off_stale_seed_table`). The cleanup view built for it in June is dead code with zero consumers. (`02`, `03`)
- The one data-quality gate that exists (`ingest/quality/quality_registry.yaml` via `check_data_quality.py`) covers **4 tables — none of them the listing tables**. (`03` §8)
- Same class, different domain: our BLS PPI series are labeled "single-family/multi-family construction" but BLS says those series are warehouse and industrial construction — nonresidential. The label is the contamination. (cadence registry, confirmed 07/08/2026)
- The condo→single-family collapse fix (07/07) is code-correct but **unverified in the stored data** — ingest died the same day it landed, and merge never revisits unscanned rows. (`02`)

There is no place in this codebase where a sentence like "a sales table must not contain rental-priced rows" or "median asking price counts only homes" is written down as an executable assertion. So every normalizer change, vendor quirk, and filter omission lands directly in public numbers.

## Root cause 3 — Monitoring is a fleet of partial watchers, and the fleet itself breaks.

Count the watchers: freshness probe, incident auto-capture, heal-cron, tripwire, smoke-prod, data-readiness, data-targets, SLA fields, ops dashboard. Each was added after an incident. Each covers a different partial slice:

- Both `log-cron-incident.yml` and `heal-cron-failure.yml` trigger only on `conclusion == 'failure'`. A **timeout-killed run reports `cancelled`** — invisible to both. 30 cancelled runs exist repo-wide; that is exactly how corridor-pulse died for 3 weeks *after spending the API money each run*, and how `leepa-parcels-annual` is 4-for-4 cancelled — a 0% completion rate, with live data existing only because of a manual out-of-band backfill. (`01` §2, §6)
- **53–55 of 77 actively-scheduled workflows (~70%) are outside both auto-capture watch lists.** Inside that blind spot: 3 workflows that have never once succeeded and 5 on live failure streaks, including `zhvi-tier2-monthly` silently broken for 18 days. (`01` §5)
- Tripwire has been red for 6 days (issue #106, 37 comments) — a **false positive** from a hardcoded pipeline list inside `tripwire-scan.mjs` that nobody updated when city-pulse was legitimately re-enabled. (`01` §4)
- Stale caveats never expire: master is serving a "macro-florida failed to rebuild on 06/29/2026" warning on today's build; macro-florida has been fine for almost two weeks. ~20 of 38 sources in master's citation table *look* expired due to a rendering artifact applying the wrong TTL. False reds train everyone to ignore red. (`04` §4, §8)
- The problem records themselves rot: the SteadyAPI suspension check cannot be re-verified by any automated path; the cron-failure ledger contains 3 OPEN rows aged 19–36 days in a mechanism the doc itself says was superseded; a disabled cron's re-enable condition lives only in a YAML comment. (`02` §8)
- And the watchers break: the freshness probe itself threw Tracebacks on 06/02, 06/05, 06/06 (incident ledger).

One health model per dataset — freshness + volume + content checks rolled into a single status, evaluated where the data loads — replaces most of this fleet. That is precisely what the Dagster/GX pattern is *for*.

## Root cause 4 — Config truth is scattered and hand-synced. The "wrong letter" is structural.

Each pipeline's identity is spelled out in up to six places that must agree by hand: the workflow YAML (env, cron, timeout), the pipeline's `constants.py`, the dlt `pipeline_name` vs the actual `schema_name` it lands as, the cadence-registry entry (`dlt_schema_name`, `count_table`, `freshness_column`), and the consuming pack. Documented one-word kills:

- `source_name` vs `source_tag` — two weeks of false-RED on live-search. (registry note, fixed 07/05/2026)
- `pipeline_name="tier1_inventory"` landing as `fema_nfip_tier2` / `leepa_parcels_tier2` — kept honest only by comments saying "read directly from the live table." (registry)
- Secret in repo but not in the workflow `env:` block — three separate incidents (FRED, S3 ×6 workflows, Firecrawl). (`02`, incident ledger)
- `actions/checkout@v6` (nonexistent version) — two workflows, three incidents. (incident ledger)
- 7 registry entries say "First run: \<fill\>"; 6 are stale — the run already happened. The registry is a hand-written diary, not a system of record. (`01` §7)
- Drift in both directions: `parcel_subdivision` (220,875 live rows, active 07/06) has **zero** registry coverage; `communities-swfl`'s only two upstream tables are equally unmonitored; meanwhile `env-swfl` still live-queries a table the registry excluded as "legacy, will be dropped." (`03` §7, `04` §6-7)
- `tier-divergence-swfl` is fully coded, tested, with monitored fresh upstream data — and was never wired into the rebuild DAG. It 404s in production. Nothing noticed a finished brain that never shipped. (`04` §2)

None of these strings is ever machine-checked against the others. Every one of these incidents is a `assertEqual(a, b)` that was never written.

## Root cause 5 — Red is ambient. Nothing forces red back to green.

- `ci.yml` red for **35 consecutive pushes (~37 hours)** on main; started as 1 failing test, grew to 7 because commits kept landing on an already-red main. No gate stopped them. (`01` §3)
- 314 open checks, 83 in the data domain, age-ranked into overdue. Four stacked open checks on the same permits pipeline. (`02`)
- 6 workflows disabled at the API level while 4 still carry live cron lines in source — state that exists nowhere in the repo. (`01` §9)

When red is normal, every new red — including the $35,000 median — is noise until a human trips over it.

---

## What is actually fine (so this stays honest)

Master is v100, built this morning, token matches the repo byte-for-byte. All 40 brains are within their declared freshness contracts. No phantom crons — all 18 zero-run workflows resolve to too-new or deliberately paused. The incident auto-capture did capture real failures, the no-invention guarantee held everywhere we probed (the $35k number is real rows mis-aggregated, not a fabricated figure), and the four sweeps found the registry's own recent `source_scope` notes to be the best data-discovery documentation in the repo. The raw material of a healthy system is here. It is assembled wrong.

## Why other companies "just work" — the honest comparison

They run **fewer, more boring pipelines** on one orchestrator, where each dataset carries its checks with it (freshness policy + volume + content assertions, evaluated at load, one health status, alert on fail — the Dagster/GX pattern above). Config exists once. A red main blocks merges. Their teams see one pane with one truth; ours checks 5+ surfaces (ops page, checks ledger, incident issues, SESSION_LOG, registry comments) that disagree with each other — today the ops page says two reds, the checks ledger says 83, the lake says the worst problem (the $35k median) appears on **none of them**. The difference is not talent or tooling budget; it is that we verify effort and they verify outcomes.

---

## Act today (operator-only items)

1. **SteadyAPI billing page** — reactivate or consciously drop it. No code can test the account; the next cron runs will pass green either way. 2 minutes.
2. **Approve the contamination hotfix** — property-type filter + rental-price guard on the active-listing stats path, then re-check the ZIP numbers. This is a live, public, ~10x error.
3. **CI red on main** — say the word and it gets fixed to green as its own task before anything else lands.
4. **Tripwire's hardcoded list** — 5-minute fix ends a 6-day false RED and buys back trust in the one hourly watcher.

## Three paths for the build (pick one; my recommendation is A)

**A. Checks-on-the-data (recommended).** Extend the existing-but-tiny `quality_registry.yaml` into per-table content contracts — enum allowlists, price ranges, row floors, and semantic rules ("sales tables contain no rental-priced rows," "median asking price counts homes only") — executed **inside each pipeline run after load** (the Dagster/GX pattern, built on our seams, no new framework). Add one CI test that machine-verifies the six hand-synced strings (registry ↔ workflow ↔ constants ↔ live schema ↔ packs) so the wrong-letter class dies at PR time. Wrap the existing probes + these contracts in one `doctor` entrypoint that prints prescriptions (the last30days pattern) — absorbing watchers, not adding one. Fix the cancelled-run blind spot in the two watcher workflows while there.

**B. Doctor-only.** Just the on-demand omniscient probe + prescriptions. Cheapest, immediately useful, but it is one more out-of-band watcher: it doesn't stop bad data at the door, and it rots the same way tripwire did.

**C. Orchestrator migration (Dagster).** The full industry answer — assets, checks, freshness policies, one pane. It is the right end-state shape but a multi-week migration of 77 workflows; disproportionate while the bleeding above is unstopped. Revisit after A has stabilized reality.

Evidence files: `01-workflows-issues.md` · `02-known-problems-ledger.md` · `03-lake-live-state.md` · `04-brains-consumers.md`
