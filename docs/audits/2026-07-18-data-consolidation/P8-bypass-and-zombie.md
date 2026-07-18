# P8 — USGS Zombie Read + Bypass-Wire Sweep

Stream owner: P8. Probed live 2026-07-18. Every claim below cites a live row-count/column OR a code
file:line. Every classification is a **recommendation** tagged `[NEEDS-SIGN-OFF]` — none is a normative
"X IS the authority" claim (that is an operator C1/C2 sign-off). No DROP/DELETE/TRUNCATE is executed;
guarded SQL, where relevant, is TEXT only.

---

# PART 1 — THE USGS ZOMBIE READ (most serious)

## 1.1 Verdict (one line)

`env-swfl` serves a **frozen, mislabeled** Caloosahatchee surface-stage number: the customer-facing brain
says **"latest reading (2026-05-17)" = 3.17 ft**, sourced from `data_lake.usgs_daily`, a Postgres table
whose producing module was deleted and which has not been written since **2026-05-19**. The genuinely
current reading (a live tier-1 Parquet the pipeline still refreshes monthly) is **3.36 ft on 2026-07-09** —
53 days newer. The brain is not merely stale; it presents a two-month-old value as "latest."

## 1.2 The exact read path (traced end-to-end, code-verified)

```
data_lake.usgs_daily  +  data_lake.usgs_sites   (frozen Postgres tier-2)
   │  PostgREST paged reads, SWFL filter (county_cd IN 12071/12021 OR HUC LIKE 03090205%/03090204%)
   ▼
refinery/sources/usgs-water-source.mts
   • fetchLive()                     :196-236   ← reads DAILY_TABLE="usgs_daily" (:32), SITES_TABLE="usgs_sites" (:33), SCHEMA="data_lake" (:31)
   • swStageCaloosahatcheeLatest()   :140-172   ← filters parameter_cd '00065' + Caloosahatchee HUC, median across gages on latest obs_date
   • buildHydroSwflAggregate()       :176-186   ← emits HydroSwflAggregate { sw_stage_caloosahatchee_ft }
   • fetch() summary fragment        :296-307   ← kind "hydro-swfl-aggregate"
   ▼
refinery/packs/env-swfl.mts
   • import usgsWaterSource          :29
   • hydroAggregateFrom()            :182-194   ← picks the hydro-swfl-aggregate fragment
   • snapshot.hydro populated        :627-631
   • key_metric emitted              :881-898   ← metric "swfl_sw_stage_caloosahatchee_ft", label "…latest reading (${window.end})"
   • hydroSource() citation          :521-538   ← "USGS Water Services daily values via data_lake.usgs_daily"
   ▼
brains/env-swfl.md  (served bytes, built 2026-07-03)
   :271-282   metric swfl_sw_stage_caloosahatchee_ft = 3.17
              label  "Caloosahatchee surface stage at gage local zero — latest reading (2026-05-17)"
              citation "USGS Water Services daily values via data_lake.usgs_daily, parameterCd 00065,
                        latest dv read on 2026-05-17, HUC 03090205 (Caloosahatchee), sites: 7 gages"
   ▼
/api/b/env-swfl  +  master dossier (env-swfl edge = modifier, critical:true, master.mts:289)  +  conversation
   +  ZIP-report flood gradient web surface  +  AI-authored email chart
```

The connector docstring (`usgs-water-source.mts:11-28`) and the per-metric citation both name
`data_lake.usgs_daily` explicitly — the wire is not incidental, it is the declared source of record.

## 1.3 Freeze — confirmed by live query (2026-07-18)

`data_lake.usgs_daily` (Postgres tier-2, via `pg.data_lake.usgs_daily`):

| fact | value |
|---|---|
| row count | **605** |
| MAX(obs_date) | **2026-05-18** |
| MIN / MAX(ingested_at) | **2026-05-19 01:47:13** (single value — one-shot load, never appended) |
| distinct sites | 547 |
| distinct parameter_cd | **2** (`00065` n=530, `00045` n=75) |

The served metric, reproduced from the frozen table (Caloosahatchee HUC `03090205%` ∩ `00065` ∩ value not
null, latest obs_date, median across gages): **latest obs_date = 2026-05-17, 7 gages, median = 3.17 ft, all
qualifiers = Provisional ("P")**. This matches `brains/env-swfl.md:272` (3.17) and `:274` (2026-05-17)
exactly — the served bytes ARE the frozen read.

Note also `leecollier_sites` (county_cd IN 12071/12021) = **0**: the sites table's `county_cd` is not the
5-digit FIPS the connector's `isSwflSite` county branch compares against (`usgs-water-source.mts:107`), so
SWFL sites are selected **only** via the HUC branch (22 Caloosahatchee + 47 Big Cypress). Pre-existing
latent mismatch, not the zombie — flagged for the operator, out of P8 scope to fix.

## 1.4 Producing module deleted / no producer — confirmed

- `ingest/pipelines/usgs/**` → **glob returns zero files** (deleted; the `usgs-monthly.yml` header says it
  "supersedes the deprecated `ingest/pipelines/usgs`, deleted in PR 3" per data-roots.md:1358).
- No `.github/workflows/*` grep hit for `usgs_daily`/`usgs_sites` → **no workflow writes the frozen table.**
- Registry states the same as a FACT: `ingest/cadence_registry.yaml:776-789` — `usgs_tier2`, `workflow: none`,
  `known_drift: [zombie_target, no_producer_workflow]`, `check: usgs_tier2_orphan`.

## 1.5 The repoint target exists and is fresh — the fix is real, not aspirational

A tier-1 Parquet, still refreshed monthly by the surviving `usgs-monthly.yml`
(`python -m ingest.duckdb_pipelines.usgs.pipeline` → `s3://lake-tier1/environmental/usgs_water_swfl.parquet`),
carries the SAME data, fresher and far more complete. Lake view `usgs_water_swfl`:

| fact | frozen Postgres `usgs_daily` | fresh Parquet `usgs_water_swfl` |
|---|---|---|
| MAX(obs_date) | 2026-05-18 | **2026-07-09** |
| rows | 605 (one-shot) | **4,688,436** |
| distinct params | 2 | **4** |
| distinct sites | 547 | 580 |
| schema | site_no, parameter_cd, stat_cd, obs_date, value, unit, datum, qualifiers, source_url, ingested_at | **identical 10 columns, same types** (`describe_view` verified) |
| Caloosahatchee 00065 latest | 2026-05-17 → median **3.17 ft** | 2026-07-09 → median **3.36 ft** (7 gages) |

Sites Parquet `usgs_water_swfl_sites`: 881 rows, 22 Caloosahatchee + 47 Big Cypress — same shape the
connector already handles. **The frozen tier-2 is a degenerate 605-row stub (~1 row/site, 2 params); the
Parquet is the full series.** So the served metric is not just stale — it is drawn from a crippled snapshot.

## 1.6 Blast radius of removing/changing the metric — LOW

- `env-swfl.mts:881` already guards `snapshot.hydro && snapshot.hydro.sw_stage_caloosahatchee_ft !== null`
  and **silently omits** the metric otherwise (see the `no-data` conclusion path :1005-1034). Dropping or
  emptying the hydro fragment removes one key_metric + one optional conclusion sentence; env-swfl keeps all
  FEMA NFHL, NFIP realized-loss, rainfall, and per-ZIP flood surfaces untouched.
- The existing caveat (`env-swfl.mts:1089-1093`) covers Provisional-vs-Approved **revision**, NOT freshness.
  So a "mark stale" option needs a NEW caveat — it cannot lean on the existing one.

## 1.7 FIX-PATH OPTIONS  [NEEDS-SIGN-OFF]

Operator picks one. Deletion of the frozen table itself is separately operator-gated (RULE 1) and blocked
until a consumer no longer reads it.

**OPTION A — Repoint env-swfl to the fresh tier-1 Parquet (recommended).**
Restores a genuinely current number (3.36 ft @ 2026-07-09) with byte-compatible columns. "Repoint" is
three distinct mechanisms — the *choice among them* is the sign-off crux, not the destination:
  - **A1** — connector switches its read to a DuckDB/Parquet read of `usgs_water_swfl` (tier-1) instead of
    PostgREST against `data_lake.usgs_daily`. Smallest data-plumbing change; introduces a DuckDB read path
    into a source that today only speaks PostgREST.
  - **A2** — add a promotion pipeline Parquet → Postgres tier-2 (new `usgs_daily` load), then the connector
    reads the same table name it reads today, now fresh. **This mirrors the existing `zori_swfl_tier2`
    promotion pattern already in the repo (data-roots.md:920-936)** — not novel architecture. The registry
    entry `usgs_tier2` becomes real (gets a `workflow:`), which closes `usgs_tier2_orphan` cleanly.
  - **A3** — extend `usgs-monthly.yml` to ALSO write the Postgres table it currently skips (it writes only
    the Parquet today). Same end-state as A2 with one workflow instead of two pipelines.
  A2/A3 keep `usgs_daily` as the table of record and are the least disruptive to downstream citations
  (which name `data_lake.usgs_daily` verbatim). A1 is fastest but changes the connector's read mechanism.

**OPTION B — Mark the metric stale + empty-tolerant (keep the wire, stop lying).**
Leave the frozen read but stop labeling 2026-05-17 as "latest reading": add a freshness guard that, when the
newest `obs_date` is older than N days (e.g. > cadence tolerance), either (b1) suppresses the metric via the
existing `null` guard, or (b2) emits it with an explicit "as-of 2026-05-17, source frozen since 2026-05-19,
not current" caveat (NEW caveat — the existing A/P caveat does not cover freshness). Honest but leaves the
number useless; a stopgap, not a fix.

**OPTION C — Drop the metric entirely.**
Remove the `swfl_sw_stage_caloosahatchee_ft` key_metric + its conclusion sentence + the `usgsWaterSource`
wiring from env-swfl. Lowest surface area, but discards a real, cheaply-restorable signal (the Parquet is
fresh and free) — only justified if the operator decides surface stage isn't worth carrying.

**P8 recommendation:** Option **A2 or A3** (repoint via a Postgres promotion so citations keep naming
`data_lake.usgs_daily`, and `usgs_tier2_orphan` closes because the table finally has a producer). If the
operator wants zero new pipeline, **A1**. Do NOT leave it as-is: a customer-facing brain labeling a 53-day-old
value "latest reading" is the honesty violation, and the fresh data already exists at no new cost.

---

# PART 2 — THE 6 BYPASS WIRES

A "bypass wire" = a surface reads a raw lake table directly, skipping the brain that already carries the
concept. The operator's rule ("don't run a second wire to the chart") targets **drift**: a brain and a
surface computing the same number two different ways will diverge. So the classification test is **not**
"does a brain carry it" — it is the **divergence test**:

- **route-through-brain** — the surface RE-COMPUTES a value the brain also emits at the same grain → true
  bypass, drift risk, route it through the served brain output (or share one root).
- **acceptable-second-consumer** — the surface reads a DISTINCT grain/shape/computation the brain's OUTPUT
  does not expose → legitimate second reader off the shared tier-1/tier-2 root, no drift surface.
- **delete-the-wire** — the surface reads a corpse table, or a hardcoded snapshot presented as live.

All six confirmed reads + recommendations (every recommendation `[NEEDS-SIGN-OFF]`):

| # | Wire (surface → table) | Confirmed read (file:line) | Recommendation |
|---|---|---|---|
| 1 | email → `zori_zip_latest` | `lib/email/market-context.ts:83-113` (`zipFigures`) | acceptable-second-consumer (flag KNOWN-DEBT) |
| 2 | email → `redfin_{lee,collier}_market` | `lib/email/market-context.ts:229-294` (`countyFigures`, `REDFIN_TABLE` :40-43) | acceptable-second-consumer (flag KNOWN-DEBT) |
| 3 | /charts → `tier_divergence_pivoted` | direct reads: `lib/charts/gallery-loaders.ts:91,106` AND `app/charts/page.tsx:105,125`; mapper `lib/charts/tier-divergence-series.ts:39,88` | acceptable-second-consumer (brain is near-orphan; see note) |
| 4 | /charts HurricaneRingChart = hardcoded | const array `lib/charts/hurricane-series.ts:76-96`; render `app/charts/page.tsx:5,311` | acceptable hardcode (low priority) — route-through is impossible |
| 5 | landing-data hardcoded cre/labor snapshot | `app/api/landing-data/route.ts:5-77` (entire payload hardcoded) | **delete-the-wire / replace with live** — HIGHEST HARM |
| 6 | `market_details_swfl_latest` high-fanout | brain src `refinery/sources/market-temperature-source.mts:25,68`; charts `app/charts/page.tsx:144`; landing `lib/landing/load-home-map-data.ts:197`; email `lib/email/market-context.ts:165`; desk `lib/desk/loaders.ts:548` | acceptable second consumers — watch divergence |

## 2.1 — email → `zori_zip_latest`  (rent brain bypass)

**Confirmed:** `lib/email/market-context.ts:83-113` — `zipFigures` reads
`db.schema("data_lake").from("zori_zip_latest").select("rent_index_latest, rent_yoy_pct, latest_period")`,
emits "Typical asking rent" + "Rent YoY" figures cited "Zillow ZORI". The rent brain is `rentals-swfl`,
which reads the SAME view (`zori-zip-latest-source.mts`, data-roots.md:922-936).

**Divergence test:** the email reads a single precomputed per-ZIP figure verbatim (`rent_index_latest`,
YoY already computed in the view — no recompute). The brain also reads rates-as-written from the same view.
No two-way computation → no drift surface.

**Recommendation [NEEDS-SIGN-OFF]:** acceptable-second-consumer. The file header (`market-context.ts:1-14`)
states this is the deliberate **four-lane lane-1 cited-figure pattern** — the Email Lab pulls its own real,
cited figures rather than being spoon-fed the brain dossier. It carries an explicit `KNOWN-DEBT(data_lake…)`
tag (:14). Keep the wire; the debt is real but it is intentional design, not an accidental bypass. If the
operator wants strict one-root, the alternative is to route the email figure through `rentals-swfl`'s served
output — but that trades a clean tabular read for parsing a synthesized dossier, and the view already
precomputes the rate, so drift risk is ~nil.

## 2.2 — email → `redfin_{lee,collier}_market`  (value brain bypass)

**Confirmed:** `lib/email/market-context.ts:229-294` — `countyFigures` maps county → `redfin_lee_market` /
`redfin_collier_market` (`REDFIN_TABLE` :40-43), reads
`median_sale_price, median_sale_price_yoy, homes_sold, months_of_supply, median_dom, period_end`
filtered `property_type='All Residential'`, latest `period_end`. Cited "Redfin".

**Divergence test:** same as #1 — a direct read of precomputed per-county Redfin figures; the value brains
(`properties-lee-value` / `properties-collier-value`) consume Redfin too, but the email reads the raw
market table's own columns, not a brain recompute.

**Recommendation [NEEDS-SIGN-OFF]:** acceptable-second-consumer (same four-lane lane-1 rationale + same
KNOWN-DEBT tag as #1). Keep. Flag the debt.

## 2.3 — /charts → `tier_divergence_pivoted`  (near-orphan brain bypass)

**Confirmed:** `lib/charts/gallery-loaders.ts:91` (`loadTierIndexed`) and `:106` (`loadTierYoY`) both
`.from("tier_divergence_pivoted").select("month, median_top_tier, median_bottom_tier")`; the /charts page
ALSO reads the view directly at `app/charts/page.tsx:105,125` (two more `.from("tier_divergence_pivoted")`);
mapped by `lib/charts/tier-divergence-series.ts` (`mapTierIndexed` :39, `mapTierYoY` :88 — monthly index
rebase to 100 at 2019-01, and 12-month YoY); surfaced on the /charts "tier-gap" panel ("Luxury vs. Starter
Home Price Index").

**Brain status (extends the pre-audit, now independently confirmed):** the brain `tier-divergence-swfl`
is **absent from `refinery/packs/catalog.mts`** (grep for `tier-divergence`/`tier_divergence` → zero
matches) — it is NOT in the answer-engine catalog, so it is not directly askable in chat. Its only
brain-output consumer is zip-report rail citations. So there is no live, catalogued brain surface the chart
is "skipping" for chat purposes.

**Divergence test:** the chart performs its OWN computation (index-rebase + YoY) off the tier-1 root
`tier_divergence_pivoted`; the brain reads a different view (`tier_divergence_zip_latest`, per-ZIP) and does
a different thing (per-ZIP divergence, not a monthly regional index). Distinct grain + distinct computation
→ not a true head-to-head bypass.

**Recommendation [NEEDS-SIGN-OFF]:** acceptable-second-consumer of the shared tier-1 root — NOT a
delete/route candidate on its own. The deeper issue the operator should note is upstream of P8: the
tier-divergence BRAIN is a near-orphan (uncatalogued, single citation consumer) while its most prominent
surface (the /charts panel) reads the view directly. If the operator wants the brain to earn its keep, the
move is to catalog the brain and/or have it emit the monthly regional index the chart needs — but that is a
brain-scope decision, not a wire to cut. Cutting the chart's direct read with no brain replacement would
dark the panel.

## 2.4 — /charts HurricaneRingChart = hardcoded snapshot

**Confirmed:** `lib/charts/hurricane-series.ts:76-96` — `HURRICANE_STORM_DAMAGE` is a hardcoded const array
(Charley 2004 … Milton 2024) with per-storm `nfipPaidUsd`/`claimCount`; rendered via
`app/charts/page.tsx:5` (import) + `:311` (`<HurricaneRingChart />`). The header (:1-63) documents that the
values were lake-queried from `data_lake.fema_nfip_claims` on 2026-07-08/09 via `mcp__lake__query_lake`,
with honest caveats baked into the labels/footnote (:103-110), including that Helene/Milton are a
date-window attribution and Charlotte/Sarasota are shown for context, not coverage.

**Why this is NOT equivalent to #5:** these are **historical** storm totals (2004–2024) — stable by nature,
they do not go stale the way a "trailing 63 days" figure does. The values are real, lake-sourced, and
honestly footnoted. Route-through is **impossible**: (a) the hurricane brain `hurricane-tracks-fl` carries
no per-named-storm NFIP breakdown (header :3-6 says so, and it pre-dates the 07/07 county-scope
correction); (b) env-swfl's `stormTotals` (the one brain that computes per-storm NFIP paid totals,
`env-swfl.mts:246-263, 664-666`) is **core-scoped to Lee+Collier+Hendry** and would DROP the operator-
requested Charlotte/Sarasota that this chart deliberately includes.

**Recommendation [NEEDS-SIGN-OFF]:** acceptable hardcode, LOW priority. It is a one-time cited snapshot of
stable historical facts, not a live number pretending to be fresh. If the operator wants it wired, the only
honest target is a small dedicated lake query (like `hurricane-series` already documents) refreshed on new-
storm events — not a route through either existing brain (both would change the numbers). Leave as-is unless
a new SWFL storm lands, at which point the const needs a manual re-query (same as the env-swfl storm list).

## 2.5 — landing-data hardcoded cre/labor snapshot  (HIGHEST HARM)

**Confirmed:** `app/api/landing-data/route.ts:5-77` — the ENTIRE `GET` payload is a hardcoded literal:
`comparison[]` (four Q&A cards), `charts.corridorRents[]`, `charts.marketEvents[]`, `charts.keyMetrics[]`.
Inline comments attribute the numbers to "cre-swfl brain 2026-06-05" (:45), "cre-swfl brain 2026-06-05"
(:56), and "cre-swfl + permits-swfl + labor-demand-swfl brains" (:64). data-roots.md:1179,1298 confirms
these are **hardcoded snapshot values, NOT a live wire** to any brain output.

**Why this is the worst of the six:** unlike the hurricane historical totals, these are **current** market
metrics — "5,003 Permits / Trailing 63 days" (:20-21), "Active Permits … Trailing 63 days" (:66) — and each
`comparison` card carries a **freshness string**: `"Updated today"` (:13,:31), `"Updated 3 days ago"` (:22),
`"Updated 6 days ago"` (:41). Those strings are **false** — the payload has been frozen since 2026-06-05
(~6 weeks). This is a customer-facing homepage asserting "Updated today" over a stale snapshot: an honesty
violation, not merely a disconnected wire.

**Recommendation [NEEDS-SIGN-OFF]:** delete-the-wire → replace with a live read of the served
`cre-swfl` / `permits-swfl` / `labor-demand-swfl` brain outputs (the four-lane lane-1 pattern the email
context already uses). **Minimum acceptable interim fix if a live wire can't ship immediately:** strip the
false `freshness` strings (or make them reflect the true 2026-06-05 as-of), so the homepage stops claiming
"Updated today." This is the one item in the six where leaving it as-is is affirmatively misleading.

## 2.6 — `market_details_swfl_latest` = highest-fanout node

**Confirmed — one ingested table, five surfaces:**
- brain: `refinery/sources/market-temperature-source.mts:25` (`VIEW="market_details_swfl_latest"`), read at
  `:68` (`fetchLiveRows`) → `market-temperature-swfl` brain. Emits ONE summary fragment carrying per-ZIP
  `rows: MarketDetailRow[]` + region `sold_to_rent` (:50-56).
- charts: `app/charts/page.tsx:144` `.from("market_details_swfl_latest")` (~54 rows, one per ZIP).
- landing map: `lib/landing/load-home-map-data.ts:197` (Days-on-Market layer, realtor.com median DOM).
- email: `lib/email/market-context.ts:165` (per-ZIP median sold price).
- desk: `lib/desk/loaders.ts:548` `.from("market_details_swfl_latest")`.

**Divergence test:** each surface reads a DISTINCT, near-raw slice of the per-ZIP `_latest` view —
charts plots per-ZIP rows, the map takes `median_days_on_market`, email takes `median_sold_price`, desk
takes its own reduce. The brain (`market-temperature-swfl`) rides median sold/list/rent/DOM as cited CONTEXT
in a per-ZIP detail table (header :14-21); its headline vote is `sold_to_rent_ratio`, not these single
figures. So the surfaces are not re-deriving the brain's headline — they read specific columns the brain's
OUTPUT does not surface as clean tabular values.

**Recommendation [NEEDS-SIGN-OFF]:** acceptable second consumers, all five wires real and non-redundant.
This is a genuine one-table/many-readers hub, not a duplicated wire. The ONE thing to watch: the brain and
these surfaces both derive numbers from the SAME `_latest` view, so if a future change makes the brain
RE-EXPRESS a per-ZIP figure a surface also shows (e.g. brain starts emitting per-ZIP median_sold in its
served output), that pair should share one root to avoid drift. Today no such overlap exists. No wire to cut.
Secondary note (from pre-audit, not re-verified by P8): `market-temperature-swfl.mts:44-48` carries a stale
"cron parked" empty-message string — flag to the brain owner, out of P8 scope.

---

## Summary of recommendations (all [NEEDS-SIGN-OFF])

1. **USGS zombie — ACT.** Repoint env-swfl off frozen `data_lake.usgs_daily` to the fresh tier-1 Parquet
   `usgs_water_swfl` (2026-07-09, 4.7M rows, byte-compatible). Preferred mechanism: Postgres promotion
   (A2/A3, mirrors `zori_swfl_tier2`) so citations keep naming `data_lake.usgs_daily` and `usgs_tier2_orphan`
   closes. Interim honesty fix if repoint slips: mark the metric stale (Option B) — do not leave "latest
   reading (2026-05-17)" served.
2. **landing-data (wire #5) — ACT.** Highest-harm bypass: hardcoded 2026-06-05 market snapshot on the
   customer homepage with **false "Updated today" freshness strings**. Replace with a live brain read; at
   minimum strip the false freshness labels now.
3. **Wires #1, #2, #6 — keep** as acceptable second consumers (four-lane lane-1 / distinct-grain reads);
   #1 and #2 carry a real but intentional KNOWN-DEBT tag.
4. **Wire #3 (tier_divergence) — keep** the chart's direct read; the real issue is the near-orphan,
   uncatalogued `tier-divergence-swfl` brain (a brain-scope decision, not a wire to cut).
5. **Wire #4 (hurricane) — keep** as an acceptable historical hardcode; route-through is impossible without
   changing the numbers (core-scope would drop operator-requested Charlotte/Sarasota).

Nothing in this file executes a DROP/DELETE/TRUNCATE. The one deletion in play — the frozen
`data_lake.usgs_daily`/`usgs_sites` tables — stays operator-gated (RULE 1) and blocked until env-swfl's read
is repointed off them and verified.
