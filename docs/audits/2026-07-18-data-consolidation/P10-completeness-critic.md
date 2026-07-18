# P10 — Completeness Critic (adversarial last look)

**Written 2026-07-18. Read-only. No repo files edited. REVISED after P2–P9 landed mid-write.**

## What changed while I worked (read first)

I began this critique against the standing artifacts (data-roots.md + its embedded 3-Sonnet verify,
data-authority-map.md, the two plan docs) because **streams P1–P9 had not landed**. Seven of them
(**P2, P3, P4, P5, P6, P8, P9 — NOT P1, NOT P7**) landed while I was writing. I then read all seven
and **re-attributed every gap I had drafted**. The honest result: **the fan-out was thorough — most
of what I flagged is now OWNED by a landed stream**, several with corrections/extensions beyond what I
had. That is the good-news finding and I report it with evidence (Part 3).

**P1 (corpse deletions) and P7 (bypass-wire sweep execution) never landed** — but P8 covered the
bypass-wire *analysis* and P4 covered the corpse *classification*, so the deletion-execution guardrails
below (Part 4) are the residual for whoever runs P1/P7.

**Diff boundary:** my table-completeness check is **`data_lake.*` only** (87 live objects). Tier-1
parquet (`redfin_swfl`, `zhvi_swfl_duckdb`, `usgs_water_swfl`, …) and **public-schema** roots
(`corridor_profiles`, `swfl_search_demand`, `new_re_agents`) are outside this diff — real consumer
surfaces the vendor-ingest gate doesn't cover; a reader should know they're not in the 87.

**P2 (front-matter) I read only for scope** — it joins P3's authority rows into doc structure; it owns
none of the data gaps below. Not deeply audited here.

---

# PART 1 — SURVIVING UNOWNED GAPS (the genuinely-new next-round work)

After re-attribution, only these survive. Each = {what · evidence · owner · action}.

## G1 [P0] — ZHVI "median" mislabel is UNTRACKED on the chart title + the brain metric label; only the email is owned
**The one clean (d) — an authority pick contradicted by a live render, that NO landed stream extended.**

- **Authority pick:** ZHVI must be labeled "typical home value, **never median**"
  (`data-authority-map.md:86`; P3 restates it at VAL-5 + caveat #4).
- **What every landed stream carried:** only the **email** instance —
  `lib/email/market-context.ts:65` labels ZHVI "Median home value," tracked by check
  `zhvi_median_mislabel_email` (P3 VAL-5, caveat #4; authority-map:42). That's it.
- **What NO stream extended (the two bigger surfaces, both documented in data-roots.md:665-671):**
  1. **Chart title** — `/charts` + `/embed/charts` panel is TITLED **"Median Home Value"**
     (`lib/charts/gallery-loaders.ts:243`) over a ZHVI source.
  2. **Brain metric label** — `home-values-swfl.mts:259-262` emits `home_value_zhvi_regional_median`
     labelled "SWFL regional median ZHVI home value"; detail column "Home value (USD)" (`:409`). This
     one **propagates to every downstream consumer** of that metric, not just one surface.
- **Why it survives:** P3 authored the authority row but only inherited the email check; P8's
  bypass-wire sweep touched `market-context.ts` for a different reason (rent/redfin figures) and never
  looked at the ZHVI label. An authority ("typical, not median") unenforced at its two biggest render
  sites is not a resolved authority.
- **Owner + action:** home-value stream. Extend `zhvi_median_mislabel_email` to a surface-family, or
  open `zhvi_median_mislabel_chart_and_brain`. Label-only fix, no data move.

## G2 [P0] — Parcels: the two GOVERNING docs are unreconciled, and the FDOR-primary branch has an un-enumerated precondition set
**P3 owns the authority table and says "present both, operator picks." The residual is the doc conflict + what must happen IF FDOR wins.**

- **The unreconciliation (survives):** the **execution handoff** walk-order item 5 says "**ONE FDOR
  parcel table (Lee+Collier)** … decide leepa vs lee_parcels" — i.e. leans consolidate-to-FDOR. **P3
  §2 + VAL-2** recommends the opposite default: "the `lee-parcels-source.mts` docstring's own framing
  (FDOR as a deliberate cross-check of LeePA) argues for **KEEPING BOTH**, not replacing one." Two
  2026-07-18 governing docs point different directions on the **highest-divergence concept** (home
  value diverges 3-14×/ZIP). **An executor reading only the handoff would delete `leepa_parcels`; an
  executor reading only P3 would keep it.** That conflict itself is the gap — neither doc is wrong, but
  they must be reconciled to one recommendation before anyone touches a parcel table.
- **P3 already caught the consumer I thought I'd uniquely found:** `lib/should-i-sell/property-tax.ts:9`
  is listed at VAL-2 as a LeePA reader. Credit P3. (It's a **product surface**, not just the brain —
  the one that breaks silently if leepa is dropped without a repoint.)
- **What P3's table does NOT enumerate — the FDOR-primary precondition set [NEEDS-SIGN-OFF]** (the "if
  the operator picks FDOR" branch; each must be true before any leepa deletion, and this IS a C1
  value-authority flip: county-appraiser → state-roll, NOT a mechanical dedup):
  1. `lee_parcels` lands **non-empty** (today: PHANTOM, confirmed absent live by me and by P3/P4).
  2. Rebuild the two LeePA-only lanes on FDOR: **sold-median-by-zip** (`leepa_sold_median_by_zip` →
     FDOR `sale_price_1`; reproducible — `collier_sold_median_by_zip` already is) and **SOH-gap**
     (derivable from FDOR `jv_hmstd − av_hmstd`).
  3. Repoint `lib/should-i-sell/property-tax.ts` + `leepa-value-source.mts` + `leepa-sold-median-source.mts`
     + `properties-lee-value.mts`.
  4. **Acknowledge the freshness REGRESSION:** LeePA = live county roll; `lee_parcels` = **dispatch-only
     annual snapshot** (cadence null, no cron — data-roots.md:765-771). FDOR-primary trades fresher for
     lagged on Lee assessed value.
  5. **Retire the code's explicit cross-check semantics with sign-off, not silently:**
     `lee-parcels-source.mts:12-18` docstring ("cross-check") + `properties-lee-value.mts:858`
     ("cross-check on scale, not reconciled"). The consolidation reverses this stated intent.
- **Owner + action:** parcel stream. Reconcile the handoff and P3 to ONE recommendation; the parcel
  check already exists (`lee_parcels_leepa_redundant_into_properties_lee`, found by P9) — attach the
  precondition list to it. **Deletion stays blocked until lee_parcels lands + all consumers repoint.**

## G3 [P1] — CRE (vacancy/rent/absorption/cap-rate/$psf) has NO authority-map row
- P3's authority table covers the 6 RE concepts + parcels + the 2 sweep dups — **CRE is absent.** P4
  registers the new `cre_figures`/`cre_figures_confidence` tables and flags `[NEEDS-SIGN-OFF]` whether
  `cre_figures` should REPLACE the `marketbeat_swfl` direct-read as the CRE-figures authority — so the
  **decision is surfaced (P4)** but there is **no concept→authority row** the operator can ratify the
  way they ratify VAL-1..5.
- **Owner + action:** CRE stream. Add a CRE row family to the authority map once the cre_figures
  consumer-wiring is decided (coupled to P4's `[NEEDS-SIGN-OFF]` #B).

## G4 [P2] — P5 flagged, but did NOT route-trace, 2 extra `zhvi_pivoted` consumers — open thread
- P5's addendum found the `zhvi_pivoted` consumer list is wider than the handoff stated: beyond the 2
  named, `lib/build-chart-for-intent.mts:345` (assistant chart-builder) and `lib/desk/loaders.ts:831`
  (/desk hero) also read it, and P5 **explicitly did not fully route-trace them** ("out of my 7-gap
  scope — flagged as candidates for whoever owns the `zhvi_swfl_tier2` catalog entry"). Benign class
  (non-brain chart reads), but it means even the "documented" consumer lists are undercounted for at
  least this view. **Action:** whoever owns the zhvi_swfl_tier2 catalog entry closes the trace.

---

# PART 2 — META completeness risk (RULE 2.4): recommendations are not yet checks

**The single biggest structural risk across the whole fan-out.** Every landed stream correctly produced
`[NEEDS-SIGN-OFF]` recommendations and "recommend opening check X" — but **a scratchpad recommendation
is not a `checks` entry**, and per RULE 2.4 / the no-silent-deferrals postmortem, a deferred finding
that lives only in prose gets rediscovered from scratch. The consolidation has generated a large batch
of parked decisions; if the session ends without converting them, they evaporate. Concretely, the
NEW checks the streams recommend but **cannot themselves open**:

- `city_pulse_freshness_predicate_dry` (P5 — triplicated freshness predicate; low priority, drift-prevention).
- `cre_figures` registry entry + a **cron gap** check (P4 #B — `build-cre-figures.mjs` has no GHA
  wrapper, violates pipeline-freshness; plus community_profiles → `not_yet_running` registry entry, P4 #A).
- A **fgcu-reri shadow-vote dedup** decision check (P6 recommends A1/drop-the-edge; no check name given, none open).
- ZHVI chart+brain mislabel (G1 above).

Already-open (verified by P9, do NOT re-open): `lee_parcels_leepa_redundant_into_properties_lee`,
`collier_parcels_parcel_subdivision_redundant_scrape`, `data_authority_single_source_registry`,
`communities_tables_zero_coverage`, `usgs_tier2_orphan`, `zhvi_median_mislabel_email`,
`rentals_latest_view_completeness_guard`. **Action for the orchestrator:** open the 3-4 new checks this
session so the parked recommendations survive.

---

# PART 3 — RE-ATTRIBUTION: my drafted gaps that landed streams now OWN (with their corrections)

Reported honestly so tracked work is not re-flagged as new, and so the corrections/extensions are captured.

| My draft gap | Owned by | Correction/extension the stream added (that I did not have) |
|---|---|---|
| fgcu-reri 8-way shadow vote into master | **P6** (thorough) | **Load-bearing mechanism I missed:** an `edge_type: input→modifier` flip in `master.mts` is **COSMETIC** — the vote survives at full weight (`synth.mts:116-182`, factor is pure time-decay, edge_type appears nowhere in `voteDirection`). Only **removing the edge** (A1) or **pack-neutralizing to magnitude:0** (A2) actually stops the vote. P6 recommends A1. |
| Untracked-ingest trio (cre_figures*, community_profiles) | **P4** (thorough, with registry drafts) | **Fact-correction to my/verify-1 framing:** `cre_figures` is **1,078 rows** and `cre_figures_confidence` **985 rows** (NOT zero) — live-built today; only `community_profiles` is 0 rows. P4 also surfaced a **second gap**: cre_figures has NO cron (manual `build-cre-figures.mjs`), a pipeline-freshness violation. |
| All 13 unmapped tables → data-roots.md | **P4** (all 13 classified, row-counted, readers traced, paste-ready catalog paragraphs) | 3 roots (all untracked) · 5 coverage-exempt · 3 dead-orphan views (`fdot_aadt_swfl_yearly`, `fema_nfip_claims_swfl`, `usgs_caloosahatchee_stage_latest`) as guarded-DROP candidates · `zori_pivoted` + `view_vintages`. |
| ZHVI mislabel (email) + employment-2× + no-canonical concepts | **P3** | P3 made them ratification-ready rows. **BUT** the ZHVI mislabel row carries only the email (see G1 — chart+brain survive). Employment-2× = DUP-2. VAL-4 (sold price) + ACT-2 (all-types count) = `NO CANONICAL`, flagged for operator DEFINITION. P3 also added the **ACT-1 rollup-row trap** (`listing_active_stats` mixes `zip_code IS NULL` region/county rollups into per-ZIP grain — any repoint MUST add `zip_code IS NOT NULL`) — a real hazard I did not have. |
| `lib/should-i-sell/property-tax.ts` LeePA reader | **P3** (VAL-2) | P3 independently caught it. |
| city_pulse / city_pulse_corridors redundant wire | **P5** (RESOLVED, not just flagged) | P5 gave **decisive evidence** it's a LEGITIMATE second consumer (the loader needs per-row lat/lon + geo_grain that the brain's `pulse_by_zip` rollup drops — `nearby-rank.ts:85-89` haversine ranking) and recommends ONE check `city_pulse_freshness_predicate_dry`. |
| usgs zombie + orphan view (my P2-2) | **P8** (far beyond me) + **P4** | P8 found the **fix I didn't have**: a live tier-1 Parquet `usgs_water_swfl` (MAX obs 2026-07-09, 4.7M rows, byte-identical 10-col schema; Caloosahatchee 3.36 ft vs the frozen 3.17 ft) — the real repoint target. Confirms my finding that BOTH usgs_daily AND the orphan view are frozen; extends it to "the Parquet is the answer." P8 also recommends promotion (A2/A3, mirrors `zori_swfl_tier2`) so citations keep naming `data_lake.usgs_daily` and `usgs_tier2_orphan` closes. |

**Net:** 6 of my 7 drafted gaps are owned; #7 (ZHVI mislabel) is owned **only for the email** — the
chart-title and brain-label instances (G1) are the real survivor.

**One high-harm item P8 surfaced that was NOT on my radar and is NOT yet a check:**
`app/api/landing-data/route.ts:5-77` — the customer homepage serves a **hardcoded 2026-06-05 market
snapshot with FALSE "Updated today"/"Updated 3 days ago" freshness strings** (frozen ~6 weeks). P8
rates it highest-harm of the 6 bypass wires; minimum interim fix is stripping the false freshness
labels. Belongs in P7's scope + a check. Flagging it here because P7 hasn't landed.

---

# PART 4 — BOUNDED-COMPLETE areas (evidence, do NOT re-open) + the residual for P1/P7

## (b) Table universe — BOUNDED and clean at 87 `data_lake` objects
I independently pulled `information_schema.tables` for `data_lake` (live, 2026-07-18): **87 objects**
(83 real + 4 system). I confirmed the objects verify-1 never named in its summary ARE documented,
resolving verify-1's own 13+70≠87 arithmetic gap: `fdot_freight_nowcast_shock_log` (data-roots.md:1410),
`listing_active_homes` (:340-347), `fema_nfip_zip_window_agg` (:1341), the parcel sold-median views
(:573,724,731,748). **P4 then classified all 13 verify-1 orphans with live row counts.** No NEW orphan
table appeared since verify-1. `lee_parcels` remains a **confirmed phantom** (absent live — verified by
me, P3, P4). **This area is complete pending P4's paragraphs being committed to data-roots.md.**

## (c) Guarded deletions — reader-preconditions the walk order states are sound; residual is P1/P7 hygiene
- **USGS zombie:** walk order correctly separates the deletable tier-1 usgs from `usgs_daily`
  (env-swfl live-reads it) — "fix the read path, not just delete." P8 confirms and supplies the fix.
  **Deletion of `usgs_daily`/`usgs_sites` stays blocked until env-swfl repoints (P8) and verifies.**
- **3 dead-orphan views** (P4): `fdot_aadt_swfl_yearly`, `fema_nfip_claims_swfl`,
  `usgs_caloosahatchee_stage_latest` — all zero *product* readers, guarded-`DROP VIEW` candidates, but
  **P4 conditions each on "confirm no out-of-repo (ops/analyst) reader"** — the correct precondition.
- **P2-1 executor hygiene (residual for P1):** the walk-order item-1 delete list names a bare
  **`active_listings`** table that **DOES NOT EXIST in any schema** (live-verified: only
  `active_listings_cre`, `active_listings_residential`, `active_listings_residential_zip_stats`).
  Tighten the delete target to exactly `active_listings_residential` + `..._zip_stats`, and add an
  explicit **"do NOT touch `active_listings_cre`"** guard — it's a **live 62-row CRE table**, not a corpse.
- **P2-2 (confirmed, independent work):** `usgs_caloosahatchee_stage_latest` (as_of **2026-05-17**, 1
  row) is just as **frozen** as `usgs_daily` (obs 2026-05-18) — I tested and killed the tempting
  hypothesis that the orphan view is the zombie fix. It is a safe drop AND not the fix (P8's Parquet is).

## (c-live) Deletion-execution guardrails (for P1/P7, which never landed)
Both destructive streams are unlanded. Before either runs, the reader-precondition per corpse must be a
**grep-proof of zero product readers in the same change** (the walk order says "verify-before-delete" —
hold them to it), and no in-flight parallel ingest may be killed (lee_parcels FDOR run is live today).

---

# Prioritized next-round stack

1. **G1** — ZHVI "median"→"typical" on the CHART TITLE (`gallery-loaders.ts:243`) + BRAIN metric label
   (`home-values-swfl.mts:259-262`); only the email is tracked. Open `zhvi_median_mislabel_chart_and_brain`.
2. **G2** — Reconcile handoff("ONE FDOR table") vs P3("keep both") on parcels to ONE recommendation;
   attach the 5-item FDOR-primary precondition set to the existing check; deletion blocked until lee_parcels lands.
3. **PART 2 meta** — Open the 3-4 recommended-but-unopened checks THIS session (city_pulse predicate,
   cre_figures cron/registry, fgcu-reri dedup) so parked recommendations don't evaporate (RULE 2.4).
4. **P8 landing-data** — Strip the FALSE "Updated today" freshness strings on the homepage now (interim);
   wire live later. Open a check. (P7 scope; P7 unlanded.)
5. **G3 / G4** — CRE authority-map row (coupled to P4 #B); close the 2 un-traced `zhvi_pivoted` callers.
6. **P2-1** — Fix the `active_listings` bare-name delete target before P1 runs (exclude `active_listings_cre`).

**This file is the last look as of the 7 landed streams.** If P1 or P7 land later, re-check Part 4's
deletion-execution and landing-data items against them.
