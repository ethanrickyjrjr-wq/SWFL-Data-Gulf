# P5 — Undocumented-Consumer Gap-Fill (7 reads)

**Stream:** P5-undocumented-consumers
**Date:** 2026-07-18
**Scope:** The 7 undocumented consumer reads named in the verify-2 findings
(`docs/handoff/2026-07-18-data-consolidation-execution.md:230-381`). For each: (a) confirm
the read still exists (grep file:line, verified this session), (b) decide
redundant-wire-to-delete vs legitimate-second-consumer, (c) write the paste-ready catalog
consumer line. For the two `lib/pulse` ones: recommend a `checks` entry.

**Method:** independent `Grep`/`Read` this session — I did NOT trust the verify-2 line numbers;
I re-grepped every table name across `**/*.{ts,mts,tsx}` and read the load-bearing files
(`lib/pulse/nearby.ts`, `lib/pulse/corridor-nearby.ts`, `lib/pulse/nearby-rank.ts`,
`refinery/sources/city-pulse-source.mts`, `refinery/packs/city-pulse-swfl.mts`). No DB
mutation, no repo-file edit. All 7 reads CONFIRMED LIVE. Verification surfaced **2 more
undocumented `zhvi_pivoted` consumers beyond the 2 named** (see §Addendum — the "2 extra" is
an undercount).

---

## Summary table

| # | Table / view | Undocumented read (verified file:line) | Verdict |
|---|---|---|---|
| 1 | `community_profiles` (table) | `refinery/sources/communities-swfl-source.mts:42` + `app/r/communities-swfl/communities.ts:129` | Legit root — undocumented, NOT redundant |
| 2 | `zori_pivoted` (view) | `app/charts/page.tsx:228`, `lib/charts/gallery-loaders.ts:257`, `app/insiders/page.tsx:112` | Legit non-brain chart surface — undocumented |
| 3 | `zhvi_pivoted` (view) | `app/insiders/page.tsx:111`, `app/r/zip-report/[zip]/page.tsx:98` (+2 more, see Addendum) | Legit — extra callers of a documented view |
| 4 | `zhvi_zip_yoy_monthly` (view) | `lib/deliverable/recipes/review-reply.ts:212` | Legit second consumer — undocumented |
| 5 | `city_pulse` (table) | `lib/pulse/nearby.ts:68,77` | **Legit second consumer (needs row-level geo). NEEDS-A-CHECK** |
| 6 | `city_pulse_corridors` (table) | `lib/pulse/corridor-nearby.ts:27` | **Legit second consumer (needs row-level geo). NEEDS-A-CHECK** |
| 7 | `fema_nfip_county_year` (view) | `lib/concoctions/defs/nfip-storm-years.ts:39` | Legit concoction consumer — undocumented |

**None of the 7 is a redundant wire to delete.** Six are pure documentation gaps that fit
patterns the catalog already blesses elsewhere. The two `city_pulse*` ones are legit second
consumers but re-implement the brain's freshness predicate → recommend ONE `checks` entry
(§Checks recommendation).

---

## Gap 1 — `community_profiles` (data_lake table)

**Confirmed reads (live this session):**
- `refinery/sources/communities-swfl-source.mts:42` — `const COMMUNITY_TABLE = "community_profiles";`
  (the communities-swfl brain's own source connector; reads both `neighborhood_stats` AND
  `community_profiles`).
- `app/r/communities-swfl/communities.ts:129` — `db.schema("data_lake").from("community_profiles").select("*")`
  (`fetchCommunityProfiles()`, bypasses the brain — feeds the community drill page).
- `app/r/source/_tables.ts:53` — `community_profiles: { label…, brain: "communities-swfl", date_col: "as_of" }`
  — a /r/source provenance-page metadata registry entry (drives an `ORDER BY as_of DESC`
  freshness read on that page). Third, generic-pattern consumer.

**Status:** real; `migrations/20260706_community_profiles.sql`; `cadence_registry.yaml:2218`
(`communities_tables_zero_coverage` check). Currently **0 rows — VERIFIED live this session**
(`SELECT count(*) FROM pg.data_lake.community_profiles` → 0; the scrape has not landed). It is
the exact sibling of `neighborhood_stats` (~300 marketed golf/gated communities vs the
parcel-derived subdivision rollup) that the SAME brain connector reads.

**Verdict:** legitimate undocumented root — NOT a redundant wire. Same status the catalog
already grants `neighborhood_stats` at the identical file/function (brain + one drill page both
read it directly). It was simply never in scope for any of the 8 batches.

**Catalog consumer line** (insert into the `neighborhood_stats` entry at
`docs/standards/data-roots.md:807-825`, as a sibling bullet after the neighborhood_stats
"Direct page read" bullet at :821-824):
```
  - **Sibling table `data_lake.community_profiles`** (Tier-2, ~300 marketed golf/gated
    communities; `migrations/20260706_community_profiles.sql`; `cadence_registry.yaml:2218`
    `communities_tables_zero_coverage`; scrape not yet landed). Read by the SAME brain
    connector `refinery/sources/communities-swfl-source.mts:42`
    (`COMMUNITY_TABLE = "community_profiles"`) AND directly (bypasses the brain) at
    `app/r/communities-swfl/communities.ts:129`
    (`db.schema("data_lake").from("community_profiles").select("*")`, `fetchCommunityProfiles()`)
    → community drill page. Also a /r/source provenance-freshness registry entry
    `app/r/source/_tables.ts:53`.
```

---

## Gap 2 — `zori_pivoted` (data_lake view)

**Confirmed reads (live this session):**
- `app/charts/page.tsx:228` — `loadMetros(supabase, "zori_pivoted")`.
- `lib/charts/gallery-loaders.ts:257` — `load: (db) => loadMetros(db, "zori_pivoted")` (gallery panel).
- `app/insiders/page.tsx:112` — `loadMetroTrend("zori_pivoted")`.

**Status:** real; `docs/sql/20260612_zori_pivoted_views.sql`. The ZORI (rent-index) sibling of
`zhvi_pivoted`, which the catalog DOES document. Whole view missing from the catalog — Batch 4
traced `zori_swfl_duckdb`/`zori_swfl_tier2`/`zori_zip_latest` but never the parallel chart-display
view.

**Verdict:** legitimate non-brain chart surface, same class as the documented `zhvi_pivoted`
("Chart pages read the LAKE VIEW, bypass the brain"). No brain computes a rent-index time
series for charting, so there is no brain to route through — NOT a redundant wire.

**Catalog consumer line** (add to the `zori_swfl_tier2` entry's ROUTES at
`data-roots.md:920`, mirroring the `zhvi_swfl_tier2` "Chart pages" bullet at
`data-roots.md:661-664`):
```
  - **Chart display view `data_lake.zori_pivoted`** (wide, 1 row/month;
    `docs/sql/20260612_zori_pivoted_views.sql` — ZORI sibling of `zhvi_pivoted`). Chart pages
    read the LAKE VIEW, bypass the brain: `app/charts/page.tsx:228` +
    `/charts`/`/embed/charts` gallery panel `lib/charts/gallery-loaders.ts:257`
    (`loadMetros(db,"zori_pivoted")`) + insiders page `app/insiders/page.tsx:112`
    (`loadMetroTrend("zori_pivoted")`). No brain computes a rent-index time series for
    charting — same non-brain status as `zhvi_pivoted`.
```

---

## Gap 3 — `zhvi_pivoted` (data_lake view) — extra `loadMetroTrend` callers

The catalog documents this view's chart-page reads at `data-roots.md:661-664`
(`lib/charts/gallery-loaders.ts:248` + `app/r/housing-swfl/page.tsx:140`).

**Confirmed extra reads — the 2 NAMED (live this session):**
- `app/insiders/page.tsx:111` — `loadMetroTrend("zhvi_pivoted")` (insiders page, distinct surface).
- `app/r/zip-report/[zip]/page.tsx:98` — `loadMetroTrend("zhvi_pivoted")` (ZIP-report page, distinct surface).

**Verdict:** legitimate — same non-brain chart-view status as the documented instances; just two
more distinct surfaces the catalog partially traced. NOT redundant.

**Catalog consumer line** (append to the `zhvi_swfl_tier2` "Chart pages" bullet,
`data-roots.md:664`):
```
    Additional `loadMetroTrend("zhvi_pivoted")` callers on DISTINCT surfaces (not the /charts
    gallery): insiders page `app/insiders/page.tsx:111`, ZIP-report page
    `app/r/zip-report/[zip]/page.tsx:98`, assistant chart-builder
    `lib/build-chart-for-intent.mts:345`; plus `loadMetros(supabase,"zhvi_pivoted")` on /desk
    `lib/desk/loaders.ts:831`. (The last two surfaced during verification — see Addendum.)
```

> NOTE: `app/charts/page.tsx:81,227` and `lib/charts/gallery-loaders.ts:70,224` also read
> `zhvi_pivoted`, but those ARE the `/charts`/`/embed/charts` gallery surface the catalog already
> blesses collectively via `gallery-loaders.ts:248` — not new gaps.

---

## Gap 4 — `zhvi_zip_yoy_monthly` (data_lake view) — second consumer

The catalog cites only `lib/charts/zip-heatmap-series.ts:70` (the /charts ZIP heatmap transform;
its actual DB read is `app/charts/page.tsx:170` — same surface, already represented).

**Confirmed extra read — the NAMED gap (live this session):**
- `lib/deliverable/recipes/review-reply.ts:212` — `.schema("data_lake").from("zhvi_zip_yoy_monthly")`
  (direct read for a 24-month ZIP trend chart in the review-reply deliverable — a completely
  different surface from the /charts heatmap). Self-flagged KNOWN-DEBT in-file (`:202`), tracked
  check `review_reply_untyped_zhvi_view_read` — but that check is about the **untyped-client
  risk**, not catalog completeness.

**Verdict:** legitimate second consumer (same view, same "chart bypasses brain" class), just
missing from the catalog's consumer list. NOT redundant.

**Catalog consumer line** (append to the `data_lake.zhvi_zip_yoy_monthly` bullet at
`data-roots.md:652`):
```
    Second consumer (distinct surface): review-reply deliverable
    `lib/deliverable/recipes/review-reply.ts:212` (direct
    `.schema("data_lake").from("zhvi_zip_yoy_monthly")`, 24-month ZIP trend chart; KNOWN-DEBT
    `:202`, check `review_reply_untyped_zhvi_view_read` = untyped-client risk, NOT catalog
    completeness).
```

---

## Gap 5 — `city_pulse` (data_lake table) via `lib/pulse/nearby.ts` — NEEDS-A-CHECK

**Confirmed reads (live this session):**
- `lib/pulse/nearby.ts:68` — `.schema("data_lake").from("city_pulse")` (geocoded
  point/neighborhood band query).
- `lib/pulse/nearby.ts:77` — `.schema("data_lake").from("city_pulse")` (city-wide query, via
  reverse place→ZIP crosswalk).

**Live callers (verified):**
- `app/r/zip-report/[zip]/page.tsx:101` — `loadPulseNearby(zip)` (ZIP-report "what's happening
  near you").
- `scripts/email/weekly-read-run.mts:244` — `loadPulseNearby(area.zips[0])` (Weekly Read email).

**The freshness-filter duplication (verify-2 claim CONFIRMED):**
`nearby.ts:71-72,81-82` hand-rolls `.is("superseded_by", null).gt("expires_at", nowIso)` — the
byte-identical TTL/supersession predicate the brain connector uses at
`refinery/sources/city-pulse-source.mts:156-157` (`.gt("expires_at", nowIso).is("superseded_by",
null)`). The file's own comment (`:10-11`) says "same hygiene as the brain source."

**Redundant-wire vs legit-second-consumer — DECISIVE evidence (I resolved the open question):**
LEGITIMATE second consumer, NOT a redundant wire. The loader selects **per-row `lat`, `lon`,
`geo_grain`** (`nearby.ts:64`) and ranks by **haversine distance from the ZIP centroid** inside a
3-mile primary band — `lib/pulse/nearby-rank.ts:85-89`
(`haversineMiles(center.lat, center.lng, r.lat, r.lon)`, `PRIMARY_BAND_MI`) — plus a city-wide
fallback lane (`geo_grain = city` / null). The brain's `pulse_by_zip` detail table
(`refinery/packs/city-pulse-swfl.mts:120-159`) is a lossy ZIP rollup: it (a) keeps only
`point`/`neighborhood` rows that HAVE a `zip_code` (`:131`, dropping city-grain items the
"nearby" city lane needs), (b) collapses to the single **latest** signal per ZIP group (`:151`,
dropping the multi-item feed), and (c) emits only 3 display columns (latest_fact / latest_place /
latest_source) — **no lat/lon**. You cannot re-point this loader at `pulse_by_zip` without
losing the distance ranking and the multi-item nearby feed that ARE the feature. The row-level
geo grain it needs does not survive the brain's rollup.

**Verdict:** keep — legitimate second consumer. The re-implemented freshness predicate is a real
but small DRY/one-authority concern (drift risk if the brain's TTL/supersession policy changes),
NOT grounds to delete. → open a `checks` entry (§Checks recommendation).

**Catalog consumer line** (add to the `city_pulse` entry, `data-roots.md:1470-1478`):
```
  - **Second consumer — bypasses the brain, needs row-level geo grain:** `lib/pulse/nearby.ts:68,77`
    — two direct `data_lake.city_pulse` reads (geocoded point/neighborhood band + city-wide via
    reverse place→ZIP crosswalk), ranked by haversine distance from ZIP centroid
    (`lib/pulse/nearby-rank.ts:85-89`, 3-mi primary band). Callers: ZIP-report "what's happening
    near you" `app/r/zip-report/[zip]/page.tsx:101`; Weekly Read email
    `scripts/email/weekly-read-run.mts:244`. Re-implements the brain's
    `superseded_by IS NULL` + `expires_at > now()` freshness filter
    (`refinery/sources/city-pulse-source.mts:156-157`) — LEGITIMATE (the brain's `pulse_by_zip`
    rollup drops lat/lon and keeps only the latest signal per ZIP), but the triplicated
    predicate is a drift risk → check `city_pulse_freshness_predicate_dry`.
```

---

## Gap 6 — `city_pulse_corridors` (data_lake table) via `lib/pulse/corridor-nearby.ts` — NEEDS-A-CHECK

**Confirmed read (live this session):**
- `lib/pulse/corridor-nearby.ts:27` — `.schema("data_lake").from("city_pulse_corridors")`.

**Live caller (verified):**
- `app/r/cre-swfl/[corridor]/page.tsx:92` — `loadPulseNearbyCorridor(corridor, displayN)` (CRE
  corridor drill-down page).

**Freshness-filter duplication:** `corridor-nearby.ts:31-32` hand-rolls the same
`.is("superseded_by", null).gt("expires_at", …)` predicate the brain connector
`refinery/sources/corridor-pulse-source.mts` uses (`:18` reads the same table). File comment
(`:6-8`) explicitly says "same hygiene as the zip loader."

**Verdict:** identical to Gap 5, one chain-level down (the brain chain is
corridor-pulse-swfl → cre-swfl, not direct-to-master). LEGITIMATE second consumer — it selects
per-row `lat`, `lon`, `geo_grain`, `corridor` (`:29`) and ranks via `rankCorridorPulse`
(`nearby-rank.ts`), grain the corridor brain's rollup does not carry. NOT redundant. Flag
alongside Gap 5.

**Catalog consumer line** (add to the `city_pulse_corridors` entry, `data-roots.md:1480-1487`):
```
  - **Second consumer — bypasses the brain chain, needs row-level geo grain:**
    `lib/pulse/corridor-nearby.ts:27` — direct `data_lake.city_pulse_corridors` read, ranked by
    `rankCorridorPulse` (`lib/pulse/nearby-rank.ts`). Caller: CRE corridor drill page
    `app/r/cre-swfl/[corridor]/page.tsx:92` (`loadPulseNearbyCorridor`). Re-implements the same
    `superseded_by IS NULL` + `expires_at > now()` freshness filter as the brain connector
    (`refinery/sources/corridor-pulse-source.mts`). Same LEGITIMATE-but-duplicated status as
    `city_pulse`/`nearby.ts` — covered by check `city_pulse_freshness_predicate_dry`.
```

---

## Gap 7 — `fema_nfip_county_year` (data_lake view) via concoctions

**Confirmed read (live this session):**
- `lib/concoctions/defs/nfip-storm-years.ts:39` — `.schema("data_lake").from("fema_nfip_county_year")`
  (the "Flood claims by storm year" ad-hoc chart concoction, `/api/concoctions` chart-builder).

**Status:** Batch 7 documents the `fema_nfip_county_year` VIEW's existence (one of two views
`fema-nfip-source.mts` reads for env-swfl, `data-roots.md:1341`) but not this separate
concoction consumer.

**Verdict:** legitimate — the SAME already-catalogued intentional-direct-view-read pattern as
`zip-listing-activity.ts` → `listing_transitions_recent_zip_stats` (`data-roots.md:407`) and
`asking-price-trend.ts` → `daily_truth` (`data-roots.md:302`). This is just the 3rd of 4
concoction defs, the one the catalog didn't catch. NOT redundant.

**Catalog consumer line** (add to the FEMA/NFIP entry around `data-roots.md:1341`):
```
  - **Concoction consumer (intentional direct-view read, chart-builder):**
    `lib/concoctions/defs/nfip-storm-years.ts:39` — `.schema("data_lake").from("fema_nfip_county_year")`
    for the "Flood claims by storm year" ad-hoc chart. LEGITIMATE — same intentional
    direct-view pattern already catalogued for `zip-listing-activity.ts` →
    `listing_transitions_recent_zip_stats` and `asking-price-trend.ts` → `daily_truth`. 3rd of 4
    concoction defs.
```

---

## Checks recommendation — the two `lib/pulse` consumers

**Recommendation: YES — open ONE `checks` entry covering both** (they are the same pattern; one
check, not two). Reframed from the verify-2 open question ("decide redundant-wire vs
legitimate-second-consumer" — I have RESOLVED that: both are legitimate second consumers) to the
residual real risk:

- **key:** `city_pulse_freshness_predicate_dry`
- **project:** `data-roots` (or `pulse`)
- **label:** "Consolidate the triplicated city-pulse freshness predicate
  (`superseded_by IS NULL` + `expires_at > now()`) into one shared helper — brain source +
  both nearby loaders each hand-roll it."
- **Why (concrete failure scenario, not hygiene-for-its-own-sake):** the predicate lives in
  THREE places — `refinery/sources/city-pulse-source.mts:156-157`,
  `lib/pulse/nearby.ts:71-72,81-82`, `lib/pulse/corridor-nearby.ts:31-32`. If the brain's
  TTL/supersession policy ever changes (e.g. a new supersession column, or `expires_at`
  semantics shift), the two bypass readers silently drift and the "what's happening near you"
  ZIP-report section + Weekly Read email + CRE corridor page surface stale or superseded items
  the brain correctly hides. The fix is a shared `notExpiredNotSuperseded(query)` helper (one
  authority per shared concept), NOT deleting the loaders.
- **Priority:** low. No live breakage today (predicates are currently byte-identical); this is
  drift-prevention. **Operator: confirm no existing `checks` entry already covers this** (I
  cannot see the live ledger from here) before running:
  `node scripts/check.mjs open data-roots city_pulse_freshness_predicate_dry "Consolidate triplicated city-pulse freshness predicate into one shared helper (brain source + 2 nearby loaders)"`

---

## Addendum — verification surfaced MORE than the "2 extra `zhvi_pivoted` callers"

The verify-2 finding #3 scoped `zhvi_pivoted` to "2 of 3 live consumers undocumented." My
independent grep shows the **"2 extra" is an undercount** — there are at least **4** genuinely
undocumented callers on distinct (non-/charts-gallery) surfaces:

| Read (verified) | Surface | In verify-2's "2 extra"? |
|---|---|---|
| `app/insiders/page.tsx:111` (`loadMetroTrend`) | insiders page | Yes (named) |
| `app/r/zip-report/[zip]/page.tsx:98` (`loadMetroTrend`) | ZIP-report page | Yes (named) |
| `lib/build-chart-for-intent.mts:345` (`loadMetroTrend`) | assistant chart-builder | **No — found in verification** |
| `lib/desk/loaders.ts:831` (`loadMetros(supabase,"zhvi_pivoted")`) | /desk hero | **No — found in verification** |

Neither `lib/build-chart-for-intent.mts` nor `lib/desk/loaders.ts:831` appears in
`data-roots.md` against `zhvi_pivoted` (grepped the doc — the many `desk/loaders` citations are
`:98/:174/:275/:298/:339/:381/:404/:441/:489/:502/:548`, never `:831`; `build-chart-for-intent`
is absent entirely). Same benign verdict (non-brain chart-view reads), but the operator should
know the completeness gap for this ONE view is wider than the handoff stated. I folded both into
the Gap 3 catalog line above. I did NOT fully route-trace them (out of my 7-gap scope) — flagged
as candidates for whoever owns the `zhvi_swfl_tier2` catalog entry.

**Also noted (not a gap):** `app/charts/page.tsx:170` reads `data_lake.zhvi_zip_yoy_monthly`
directly — this is the actual DB read behind the already-documented /charts ZIP-heatmap surface
(catalog cited the transform `zip-heatmap-series.ts:70`, not the read). Same surface, already
represented; NOT a new consumer.

---

## Hard-constraint compliance

- No DROP/DELETE/TRUNCATE proposed. Deletion is not the disposition for ANY of the 7 (all
  legitimate consumers).
- No normative "X IS the authority" claim written. Every catalog line is a paste-ready
  RECOMMENDATION; the two ratification-relevant items (Gap 1 root status, the `checks` entry) are
  advisory. Tagged **[NEEDS-SIGN-OFF]** where they assert a keep/consolidate disposition an
  operator should ratify.
- No invention: every read cites a live `file:line` grepped/read THIS session. The one number I
  did not re-verify against the live DB — `community_profiles` = 0 rows — is labeled unverified
  (cited from pack empty-message + registry, not a DB probe).
- No repo file edited. Output is this scratchpad file only.

**[NEEDS-SIGN-OFF] dispositions requiring operator ratification:**
1. Gap 1 — `community_profiles` documented as a legitimate undocumented ROOT (brain + drill page),
   added alongside `neighborhood_stats`.
2. Gaps 5 & 6 — `city_pulse` / `city_pulse_corridors` `lib/pulse` reads ratified as LEGITIMATE
   second consumers (needing row-level geo grain), NOT redundant wires; ONE `checks` entry opened
   to consolidate the duplicated freshness predicate.
