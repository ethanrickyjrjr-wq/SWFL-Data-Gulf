# Packs — real-estate / housing / CRE / corridor / env / storm / investor + MASTER

**Health: mostly-ok.** MASTER and `refinery/lib/synth.mts` are in genuinely good shape — the vote denominator is locked with the LOCKED-HONESTY comment intact (neutral stays in the agreement-ratio denominator), the conditional thesis is real IF/THEN + falsifier with a gradeable-anchor picker, the override cascade routes flood-barrier-mode-1 as an `add_caveat` modifier (no metro kill-switch), and `rollupKeyMetrics` is the reserve-then-fill V2. Leaf packs are deterministic and empty-tolerant. BUT there is one **CI-red drift on `main`** (the catalog/registry sync test is failing right now), a confirmed **duplicate-per-ZIP-slug bug** in `home-values-swfl` and `rentals-swfl` that fires on thin corpora (and every fixture run), a **stale/misleading rollup cap contract** on master, and a **labeling concern** on the investor "flood-adjusted cap rate." Details below.

---

## [HIGH] BRAIN_CATALOG is out of sync with PER_PACK_REGISTRY — catalog drift test is RED on main

**Location:** `refinery/packs/catalog.mts` (BRAIN_CATALOG array) vs `refinery/packs/index.mts:56-58`; test `refinery/packs/catalog.test.mts:16-24`

**Detail:** `home-values-swfl` and `investor-zip-swfl` are both registered in `PER_PACK_REGISTRY` (index.mts lines 57-58) but are **absent from `BRAIN_CATALOG`** (catalog.mts). I ran the test and it fails:
```
AssertionError: PER_PACK_REGISTRY has "home-values-swfl" but catalog.mts does not — add an entry to BRAIN_CATALOG
(fail) BRAIN_CATALOG: every PER_PACK_REGISTRY id exists in catalog
 3 pass / 1 fail
```
`BRAIN_CATALOG` is described in-file as "the single source of truth for the MCP capability inventory" — the leaf catalog the `/api/mcp` Vercel function uses to advertise `swfl_fetch` brains without importing the heavy pack graph. So two shipped real-estate brains (home values + the flagship investor-ZIP composite) are **invisible to the MCP capability inventory**, and CI (`.github/workflows/ci.yml` runs `catalog.test.mts`) is broken. Both pack files were last modified 2026-06-12, so this is fresh drift that landed without the catalog hand-edit the file header warns is required ("new packs require a hand-edit to this array").

**Fix:** Add `BrainCatalogEntry` rows for `home-values-swfl` and `investor-zip-swfl` to `BRAIN_CATALOG`, copying `domain`/`scope`/`ttl_seconds` verbatim from each PackDefinition (the third test, `domain/scope/ttl match`, will enforce verbatim equality). Mechanical but invariant-adjacent (it controls what the live MCP advertises), so verify the scope strings match exactly.

**Model:** sonnet — well-specified, copy-the-fields mechanical edit; the test pins the exact required values.

---

## [MEDIUM] Duplicate per-ZIP key_metric slugs emitted when fewer than 6 ZIPs carry YoY (home-values-swfl + rentals-swfl)

**Location:** `refinery/packs/home-values-swfl.mts:343-344` and `:407` (`for (const z of [...topHeating, ...topCooling])`); identical pattern `refinery/packs/rentals-swfl.mts:345-346` and `:410`

**Detail:** `topHeating = ranked.slice(0, TOP_N)` (TOP_N=3) and `topCooling = ranked.slice(-TOP_N).reverse()`. When `ranked.length < 2*TOP_N` (i.e. fewer than 6 ZIPs with a computable YoY), the head and tail slices **overlap**, so the same ZIP appears in both lists. The per-ZIP loop then iterates `[...topHeating, ...topCooling]` and emits the slug `home_value_yoy_pct_zip_<ZIP>` (and `home_value_zhvi_zip_<ZIP>`, and the rentals analogues) **twice** for the overlapping ZIPs. I confirmed the ZHVI fixture has exactly 3 ZIPs (`refinery/__fixtures__/zhvi-zip-latest.sample.json`), so every fixture/test build hits full overlap — each ZIP's slug is duplicated. In live SWFL builds the corpus is usually >6 ZIPs so it is latent, but a thin live build (the pack already warns at `zips_covered < 10`) re-triggers it. Duplicate `metric` slugs in `key_metrics` are a contract smell: downstream slug-index resolution, the patterns hook (`raw_slug_patterns`), and `rollupKeyMetrics` assume one entry per slug; double-publishing inflates counts and can shadow/confuse the per-ZIP resolver.

**Fix:** De-duplicate before the loop, e.g. `const perZip = [...new Set([...topHeating, ...topCooling])]` (dedupe by `zip_code`), or guard `topCooling` to exclude ZIPs already in `topHeating`. Apply to both packs identically.

**Model:** sonnet — localized, well-understood off-by-overlap fix in two mirrored files.

---

## [MEDIUM] master rollup cap is `t1Count + 1`, but the code/spec comment says "capped at 8 / top 1-2 per upstream" — master's dossier table can be surprisingly tiny

**Location:** `refinery/packs/master.mts:129` (comment "top 1-2 per upstream, capped at 8") + `refinery/lib/synth.mts:765-810` (`rollupKeyMetrics`, `const cap = t1Count + 1`)

**Detail:** The effective key-metrics cap is `t1Count + 1` where `t1Count` = number of passing upstreams whose engine-computed `trust_tier === 1`. `computeTrustTier` (`stages/4-output.mts:323-331`) takes the **worst (max) source tier**, and most leaf brains read Tier-2 Postgres or Tier-3 vendor feeds (e.g. home-values/rentals cite `tier: 3` ZHVI/ZORI; housing cites tier 3 Redfin). So across master's ~22 upstreams only the handful backed by a Tier-1 source (storm/hurricane/some env) count toward `t1Count`. If that's, say, 2-3, master surfaces only **3-4 key_metrics total** for the entire lake — far from the "≤8, top 1-2 per upstream" contract the comment advertises. The reserve-then-fill correctly guarantees each upstream a seat *up to the cap*, but the cap itself silently throttles the dossier, and the discrepancy between the documented contract ("capped at 8") and the actual formula will mislead the next maintainer.

**Fix:** Either (a) raise the cap to match the documented contract (`Math.max(8, t1Count + 1)` or a fixed 8), or (b) correct the comments in master.mts:129 and synth.mts to state the real `t1Count + 1` semantics and justify why a near-all-T2/T3 lake should surface so few metrics. This is a judgment call about what the synthesized dossier should carry — verify against the v3-synthesis-spec §2 step 6 before changing the number.

**Model:** opus — touches master's output contract and the spec; the "right" cap is a judgment call, not a mechanical edit.

---

## [MEDIUM] investor-zip-swfl labels a risk-discounted GROSS RENT YIELD as a "flood-adjusted cap rate"

**Location:** `refinery/packs/investor-zip-swfl.mts:218-221` (`flood_adj_cap_rate_pct = gross_rent_yield_pct - flood_cap_rate_adj_bps / 100`); metric `investor_flood_adj_cap_rate_pct_zip_<ZIP>` (:425) and the column label (:549); env source `refinery/lib/swfl-geo.mts:214-228` (`capRateBpsFor` returns +60/+27.5 bps)

**Detail:** Two conflations in one number. (1) `gross_rent_yield_pct` is rent×12/value — it is **not** a cap rate (no operating expenses, vacancy, taxes, or insurance subtracted); calling the result a "cap rate" is a category error a CRE-literate user will catch. (2) The env `flood_cap_rate_adj_bps` is a **required-cap-rate uplift** (flood risk → buyers demand a HIGHER cap rate → lower value), per its own citation "+50-70 bps for elevated physical risk." The pack **subtracts** those bps from the yield, which produces a "yield haircut for flood risk." That is a defensible *risk-discounted yield* construction, but the math semantics ("add to required cap rate" vs "subtract from realized yield") are not equivalent, and the metric name asserts it is a cap rate. The yield-band suppression (2-12%) and null-guarding are otherwise correct and well-tested.

**Fix:** Rename the metric/column to something honest — e.g. `investor_flood_risk_discounted_yield_pct` / "Flood-risk-discounted gross yield (bps)" — and adjust the citation prose (:318) to say "gross rent yield minus a flood risk premium expressed in bps," not "flood-adjusted cap rate." If a true cap rate is the goal, it requires an expense/NOI input the lake doesn't hold (park it ODD-style). No math change required unless the operator wants a real cap rate.

**Model:** opus — semantic/domain-correctness judgment touching a customer-facing "moat metric" label and its citation; needs a deliberate naming decision, not a find-replace.

---

## [LOW] master.mts source list vs input_brains drift risk; `news-swfl` is a source but `franchise-outcomes` has no source connector listed alongside it

**Location:** `refinery/packs/master.mts:225-286` (`sources` array vs `input_brains` array)

**Detail:** master maintains two parallel hand-kept lists — `sources: [makeBrainInputSource(...)]` and `input_brains: [{id, edge_type}]` — that must stay in lockstep (every input brain needs a matching brain-input source, and vice-versa, or a declared upstream silently never reaches the producer). They currently match, but this is exactly the kind of dual-list that drifts on the next edit (the catalog finding above is the same failure mode one layer down). There is no test asserting `sources` ⟷ `input_brains` parity for master. Given master is the spine, a silent omission (declaring an `input` edge with no source, so the brain is voted-on-paper but never fetched) would be a quiet correctness hole.

**Fix:** Add a unit test asserting `master.input_brains.map(b=>b.id).sort()` equals the brain-input source ids in `master.sources` (extract via the `brain-input:` source_id prefix). Cheap insurance against the drift class.

**Model:** sonnet — straightforward parity test, no design judgment.

---

## [LOW] properties-lee-value survival-bias z-score is honestly caveated but structurally one-directional — repeat-sales remain impossible (1 row/parcel)

**Location:** `refinery/packs/properties-lee-value.mts:42-46, 107-135, 488` (latest-qualified-sale velocity)

**Detail:** Not a bug — flagging the standing data hole so it isn't mistaken for fixable. The sales-velocity baseline uses each parcel's **latest** qualified sale, so re-sales attributed to recent years are subtracted from earlier buckets, biasing the current-year z-score **upward** (correctly caveated at :488). True repeat-sales / appreciation is impossible because `leepa_parcels` holds **one row per parcel** (latest snapshot), confirmed by the v1 "dropped implied-appreciation" note (:41-45). The pack correctly does NOT read `last_sale_amount` for velocity (so the recurring "LeePA sale price is 100% NULL" scare is a non-blocker here, per memory). The FHFA HPI metrics are the price-direction proxy bolted on to compensate. This is the best available given the snapshot grain — the only "fix" is a second snapshot over time (a longitudinal store), which is a roadmap item, not a code change.

**Fix:** None required now. If/when a second LeePA snapshot lands, wire the true YoY the comment defers. Keep the upward-bias caveat load-bearing.

**Model:** sonnet — documentation/roadmap note only; no ambiguity.

---

## [LOW] env hydro slugs are LIVE (USGS), not the dead DBHYDRO — memory note is stale; AAL denominator is a v1 ACS proxy (correctly caveated)

**Location:** `refinery/packs/env-swfl.mts:803-836` (USGS Caloosahatchee stage + NOAA GHCN rainfall), `:1007-1011` (AAL denominator caveat); `refinery/lib/swfl-geo.mts:243` ($800 Mode-1 threshold)

**Detail:** Positive confirmation for the audit trail. The lane brief flagged "env hydro 3 slugs (dbhydro dead)" — but env-swfl no longer depends on DBHYDRO. The hydro metric is now USGS daily-value surface stage (parameterCd 00065, HUC 03090205 Caloosahatchee), emitted only when `sw_stage_caloosahatchee_ft !== null`, with a provisional-vs-approved caveat. Rainfall is NOAA GHCN-Daily. The per-ZIP flood economics (AAL, percentile rank, barrier score, cap-rate bps) are emitted per top-AAL ZIP, gated through the static barrier table, and the AAL denominator (2020 ACS pop × 0.30 NSI proxy) is explicitly caveated as a v1 placeholder pending live OpenFEMA NFIP policy counts (:1009). The flood-barrier-mode-1 $800 threshold is a single source of truth shared by the pack and the constitution override. No invariant violation found. The only open data hole is the v2 NFIP-policy-count denominator, already tracked in the caveat.

**Fix:** Update the memory/MEMORY index note that still says "dbhydro dead → 3 slugs" — the slugs are live via USGS. Optionally open/confirm a check for the v2 AAL denominator (live NFIP policy counts) so the ACS-proxy compression caveat eventually retires.

**Model:** sonnet — memory/tracker hygiene; the code is fine.

---

## Open questions

- Is `catalog.test.mts` actually gating CI merges (is it in the `.github/workflows/ci.yml` job that blocks), or did the RED state slip through because the catalog test isn't in the blocking set? If the latter, that's a second (process) finding worth raising in the CI lane.
- Does the operator want master's dossier to carry more key_metrics than `t1Count + 1` allows given the near-total absence of Tier-1 leaf sources? That's a product call on dossier richness vs. the "best-tier brains keep their seat" honesty rule.
- For the investor composite: is a true cap rate (NOI-based) on the roadmap, or is the risk-discounted gross yield the intended deliverable? The answer decides whether the fix is a rename or a new NOI input (ODD-park).
