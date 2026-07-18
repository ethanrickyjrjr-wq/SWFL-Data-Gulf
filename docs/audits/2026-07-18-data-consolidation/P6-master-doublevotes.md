# P6 — Master Double-Vote Dedup Resolution

**Stream:** P6 (master double-votes) · **Date:** 2026-07-18 · **Status:** ratification-ready recommendations, every option tagged `[NEEDS-SIGN-OFF]`.

**Scope:** the two cross-domain duplications flagged by verify-3 (handoff doc lines 441-487) where the *same underlying concept* reaches the `master` synthesizer through **two** independently-sourced brains, letting one real-world signal count twice:
- **(a)** `fgcu-reri` as a shadow-vote engine — its blended leaf vote echoes 8 concepts that already have dedicated roots + brains + master edges.
- **(b)** SWFL employment answered by two BLS programs — `macro-swfl` (QCEW) vs `labor-demand-swfl` (OEWS), both into master.

**Method:** read the three packs (`fgcu-reri.mts`, `macro-swfl.mts`, `labor-demand-swfl.mts`), `master.mts`, and the synthesis engine (`refinery/lib/synth.mts`) end-to-end. Every code claim below carries a `file:line`. No repo file was edited. `master.mts` was read-only. No table deletion is proposed here (this stream touches vote *edges*, not lake tables).

---

## 0. Load-bearing mechanism finding — READ FIRST (corrects the middle option)

The task's three-way menu is "drop the edge / demote to a labeled cross-check only / keep with justification." **The middle option cannot be achieved by a `master.mts` edge change.** Verified in the engine:

- A brain's contribution to master's direction call is computed in `voteDirection` (`refinery/lib/synth.mts:116-182`): for **every** passing upstream, weight `w = magnitude × confidence × factor` (line 119) is added to its direction bucket.
- `factor` is **pure time-decay relevance** — `factor = 0.5 ^ (hours_old / half_life)` (`synth.mts:61-72`, `computeRelevanceFactor`). It is derived only from the upstream's age. It has nothing to do with `edge_type`.
- `edge_type` (`input` / `modifier` / etc.) appears **nowhere** in `voteDirection`, `rollupKeyMetrics` (`synth.mts:799-870`), or `detectContradictions` (`synth.mts:260-275`). The only filter before the vote is `applyRelevanceFloor` (`synth.mts:79-99`), which keys on `factor` (age), not edge type.
- `master.mts` itself documents this: env-swfl is wired `edge_type: "modifier"` (`master.mts:289`) yet its own comment (lines 274-276) states it still "counts as **one weighted voice**, not a kill-switch." freshness-pulse is a `modifier` too (line 314) and the comment (lines 304-313) is explicit that it is harmless **only because it emits `magnitude: 0` / `direction: "neutral"`** (so `w = 0` in every bucket), *not* because `modifier` suppresses the vote.

**Consequence for this stream:** demoting a *non-neutral, non-zero-magnitude* brain (which `fgcu-reri` is — see §1) to `edge_type: "modifier"` in `master.mts` is **cosmetic** — the shadow vote survives at full weight. The only two ways to actually stop such a vote are:
1. **Remove the edge** from `master.input_brains[]` (and `sources[]`) — the brain stays a standalone reporter, still queryable directly, but no longer votes; **or**
2. **Neutralize at the pack level** — change the brain's `outputProducer` to emit `direction: "neutral"`, `magnitude: 0` (the pattern investor-zip-swfl / active-listings-swfl / communities-swfl already use, which `master.mts:342-343,349-351,357-360` relies on to keep them vote-inert). This is a **pack change, not a `master.mts` wiring change.**

Wherever an option below says "labeled cross-check only," its true mechanism is #2 (a pack change), and I say so per option rather than implying an `edge_type` flip would do it.

---

## 1. Double-vote (a) — `fgcu-reri` shadow-vote engine

### 1.1 Confirmation against code

`fgcu-reri` (`refinery/packs/fgcu-reri.mts`) scrapes FGCU RERI's monthly tri-county dashboard summary and emits up to 10 YoY `pct_change` metrics (`fgcu-reri.mts:138-183`):

| RERI metric (fgcu-reri.mts line) | Concept | Canonical root → brain | That brain's master edge (`master.mts`) |
|---|---|---|---|
| `airport_activity` (138) | RSW passenger activity | `rsw_airport_monthly` → `rsw-airport` | sources:248 / input_brains:302 |
| `tourist_tax_revenues` (143) | Tourist Development Tax | `fl_dor_tdt_collections` → `tourism-tdt` | sources:234 / input_brains:288 |
| `taxable_sales` (148) | Taxable retail sales | `fl_dor_sales_tax` → `sector-credit-swfl` | sources:232 / input_brains:287 |
| `unemployment_rate` (149) | County unemployment | `bls_laus` → `macro-swfl` | sources:232 / input_brains:286 (**critical**) |
| `permits_single_family` (154) | SF building permits | `lee_building_permits`+`collier_building_permits` → `permits-swfl` | sources:241 / input_brains:295 |
| `home_sales_single_family` (159) | SF home sales | Redfin + parcel sold-median → `properties-lee-value` / `properties-collier-value` | sources:239-240 / input_brains:292-293 |
| `home_prices_single_family` Lee/Collier (164,169) | SF home price / value | `zhvi_*` → `home-values-swfl` (see note) + `housing-swfl` | `housing-swfl` sources:243 / input_brains:297 |
| `active_listings_residential` (179) | Active for-sale inventory | `listing_active_stats` → `active-listings-swfl` | sources:263 / input_brains:345 |
| `home_prices_single_family` **Charlotte** (174) | SF price, Charlotte Co. | **none** — out of Lee+Collier core scope; RERI-only | — (the one non-redundant metric) |

Home-price note: the dedicated ZHVI index brain `home-values-swfl` is **not** a direct master input — grep of `master.mts` shows no `home-values-swfl` edge; it reaches master only indirectly through `investor-zip-swfl` (`investor-zip-swfl.mts:49,323`), which is itself a `direction:"neutral"/magnitude:0` reporter and therefore vote-inert. So RERI's home-price signal double-counts against `housing-swfl` and `properties-*-value` (which *do* vote), not against the ZHVI index directly.

**How it double-votes.** `fgcu-reri` is **not** a neutral reporter. It computes its own polarity-adjusted direction tally (`fgcu-reri.mts:189-204`; `unemployment_rate` treated INVERSE at 42-46) and a non-zero magnitude (`= max(bullish,bearish)/total`, line 235). It rides master as `edge_type: "input"` (`master.mts:329`, `sources[]` line 257). Per §0, that means master's `voteDirection` adds `fgcu-reri`'s `magnitude × confidence × factor` to a direction bucket — a **second, independently-scraped voice** on 8 concepts that 8 other brains already voted on from government/vendor-primary roots.

**Characterize it precisely (do not overstate):**
- It is **one blended leaf vote** (one `direction`, one `magnitude`) that structurally **echoes 8 already-voted concepts** — not "8 votes." The redundancy is that this single vote is composed almost entirely of numbers other brains already contributed.
- It is **non-neutral-capable with non-zero magnitude**, so unlike the mag-0 reporters it genuinely perturbs the tally. Because any single bearish indicator among otherwise-bullish ones tips the brain to `"mixed"` (`fgcu-reri.mts:197-204`), its vote will often land `"mixed"` and mainly move master's agreement ratio (`synth.mts:154`) rather than flip direction. (Structural claim — I did not query the current live RERI row to assert today's direction/magnitude.)
- RERI's dashboard is a scraped **tri-county summary** that is itself almost certainly re-publishing the same underlying BLS / DOR / RSW / MLS series one county-cut removed — so this is duplication of *already-owned primary data*, not an independent measurement.
- Secondary effect: RERI metrics can also surface in master's **key-metric rollup** (`rollupKeyMetrics`, `synth.mts:799-870`) — its `key_metrics[0]` is `fgcu_reri_airport_activity_pct_change` (163) which is eligible for a reserved slot — so the same concept can also **double-display** in master's dossier next to the canonical figure.

### 1.2 Resolution options — `[NEEDS-SIGN-OFF]`

**Option A1 — DROP the master edge (recommended).** `[NEEDS-SIGN-OFF]`
- **What:** stop `fgcu-reri` from voting in master; keep the brain alive as a standalone, directly-queryable monthly regional snapshot.
- **`master.mts` wiring change:** remove the `makeBrainInputSource("fgcu-reri")` line at `master.mts:257` **and** the `{ id: "fgcu-reri", edge_type: "input" }` entry at `master.mts:329`. (Both must go — `sources[]` must mirror `input_brains[]` per `refinery/packs/CLAUDE.md`; a source-only entry becomes a fetched-never-built violation.)
- **Effect:** the shadow double-vote is fully removed. Master's read on airport / tourism / taxable sales / unemployment / permits / home sales / home prices / active listings is carried once each by the primary-sourced brain. `fgcu-reri` remains buildable and answerable on its own (and retains its one non-redundant series — Charlotte home prices — for direct queries).
- **Cost / watch-outs:** master loses RERI as a *corroboration* signal (a bullish RERI that agreed with the primaries slightly raised agreement; a divergent RERI slightly lowered it). Confirm no downstream expects `fgcu-reri` in `master.input_brains[]` (DAG scheduling: dropping it means the resolver no longer builds it *for master* — schedule it on its own cadence if direct queries must stay fresh). This is the cleanest, most defensible fix and it directly kills the largest missed duplication class.

**Option A2 — DEMOTE to a labeled cross-check only.** `[NEEDS-SIGN-OFF]`
- **What:** keep `fgcu-reri` reaching master but make it **vote-inert** and consumed only as a labeled regional cross-check.
- **True mechanism — PACK change, NOT a `master.mts` edge change:** an `edge_type: "modifier"` flip in `master.mts` would be cosmetic (§0) — the vote would persist at full weight. To actually neutralize, edit `refinery/packs/fgcu-reri.mts` `fgcuReriOutputProducer` (lines 197-235) to emit `direction: "neutral"`, `magnitude: 0` (mirroring the investor-zip / active-listings reporter pattern), while keeping its `key_metrics` as cited cross-check figures. Optionally also flip the `master.mts:329` edge to `modifier` **as a documentation label only** (with a comment that the vote-inertness is enforced in the pack, not by the edge).
- **`master.mts` wiring change:** none required for correctness. (Optional cosmetic label: `input` → `modifier` at line 329 — purely a `drivers[]` receipt label per `master.mts:310-313`.)
- **Effect:** master no longer double-counts RERI's direction/magnitude; RERI metrics remain visible as cited monthly regional cross-checks. Preserves the "one snapshot of the whole regional economy" value without the vote.
- **Cost / watch-outs:** requires a pack edit + vocab/catalog re-sync (Gate 5) and a `fgcu-reri` rebuild to take effect on served bytes. RERI's `key_metrics` still eligible for master's key-metric rollup — decide whether to also suppress them there to avoid double-display, or keep them explicitly labeled "FGCU RERI cross-check."

**Option A3 — KEEP with justification.** `[NEEDS-SIGN-OFF]`
- **What:** accept the second vote as intentional corroboration.
- **`master.mts` wiring change:** none — leave `master.mts:257` and `master.mts:329` as-is.
- **Justification that would have to be signed off:** "RERI is a deliberate independent-corroboration voice; a divergence between RERI's scraped tri-county read and our primary-sourced brains is *itself* signal worth surfacing in `contradicts[]`." **Weakness:** RERI is not an independent measurement — it re-publishes the same primary series, so 'corroboration' is largely circular, and it is non-critical/low-confidence, so its main effect is noise in the agreement ratio. Recommend **against** A3 unless the operator specifically values the single-snapshot framing over vote hygiene.

**P6 recommendation for (a):** **A1** (cleanest, removes the vote entirely, brain survives for direct queries). **A2** if the operator wants to keep RERI visible in master as a labeled cross-check — but only via the *pack-level* neutralization, never an `edge_type` flip alone.

---

## 2. Double-vote (b) — QCEW vs OEWS employment

### 2.1 Confirmation against code

Two BLS programs answer "is Lee/Collier employment growing," in two brains, both into master:

- **`macro-swfl`** (`refinery/packs/macro-swfl.mts`) emits `qcew_lee_private_employment` (line 422) and `qcew_collier_private_employment` (line 439) — private-sector covered-employment counts from `bls_qcew`. Master edge: `master.mts:286` (`input`, **critical**).
- **`labor-demand-swfl`** (`refinery/packs/labor-demand-swfl.mts`) emits `lee_total_employment_yoy_pct` / `collier_total_employment_yoy_pct` (metric built at lines 173-189) — total-employment YoY from the `bls_oews_swfl` survey. Master edge: `master.mts:299` (`input`, non-critical).

Geography is exact, not approximate: OEWS area `15980` = **Cape Coral-Fort Myers MSA = Lee County** and `34940` = **Naples-Marco Island MSA = Collier County** are single-county MSAs (OMB delineation; `labor-demand-swfl.mts:31-33,95`). So both brains measure employment for the **same two counties**, from two different survey programs (QCEW establishment reporting vs OEWS occupation/wage survey — data-roots.md:1205-1210 and 1189-1195).

### 2.2 Why (b) is materially WEAKER than (a) — the duplication is largely inert in master

This is the crux and must be surfaced honestly for sign-off:

1. **`macro-swfl`'s employment metric does not drive its vote.** `macro-swfl`'s brain-level `direction` is computed from **LAUS unemployment** (`macro-swfl.mts:458-467`) and its `magnitude` from the LAUS Lee YoY delta (`macro-swfl.mts:521`). The QCEW *employment* figures are emitted as `key_metrics` only (their per-metric `direction` uses `wageDirection(employment_yoy_pct)` at 428/444 but that never rolls up into the brain vote).
2. **`macro-swfl`'s QCEW employment almost certainly never reaches master's key-metric rollup.** `rollupKeyMetricsBase` (`synth.mts:825-870`) reserves each upstream's `key_metrics[0]` and fills from `key_metrics[1]`. `macro-swfl`'s `key_metrics[0]` is `laus_lee_unemployment_rate` (pushed first, `macro-swfl.mts:287`); the QCEW employment metrics are appended far later (index ~6+, lines 422/439), so they are neither reserved nor a likely `[1]` fill. **The literal QCEW-employment number is effectively silent in master** — it neither votes nor displays there.
3. **What master actually receives is two _distinct_ labor votes**, not one doubled one: `macro-swfl` votes the **unemployment-rate trend** (LAUS), `labor-demand-swfl` votes **employment-level growth** (OEWS, direction at `labor-demand-swfl.mts:199-209`; note its *magnitude* comes from the construction LOC_Q, line 248, not employment). Unemployment rate and employment level are genuinely different signals — both can rise together when the labor force grows — so this reads more like legitimate two-facet coverage than a true double-count.

**The tradeoff to put in front of the operator (do not pre-decide):** the duplication that *does* exist is the raw employment *number* (QCEW count vs OEWS estimate), and it is asymmetric — **the authoritative one is the silent one.** QCEW is a near-census, county-exact establishment count (it currently does **not** vote in master); OEWS is a **survey estimate** that **does** drive `labor-demand-swfl`'s vote, and it also carries unique structural detail nothing else provides (occupation mix, construction LOC_Q 2.17×/1.88×, healthcare workforce — `labor-demand-swfl.mts:92-190`). So "which employment figure is authoritative" and "which one votes" point in opposite directions. That is the decision for sign-off, not an obvious default.

### 2.3 Resolution options — `[NEEDS-SIGN-OFF]`

**Option B1 — DROP the redundant edge (NOT recommended).** `[NEEDS-SIGN-OFF]`
- **What:** remove one brain's master edge to eliminate the second labor voice.
- **`master.mts` wiring change:** would be removing `labor-demand-swfl` at `master.mts:245` (`sources[]`) + `master.mts:299` (`input_brains[]`), **or** dropping `macro-swfl` (line 232/286 — but macro-swfl is **critical** and the leaf of the macro chain, so it cannot be dropped).
- **Why not:** `labor-demand-swfl` is the **only** employment-*growth* voice in master and the **only** source of SWFL workforce composition / construction concentration / healthcare-workforce detail. Dropping it deletes unique signal to solve a duplication that is already largely inert (§2.2). `macro-swfl` can't be dropped (critical). **Recommend against B1.**

**Option B2 — DEMOTE the literal duplicate to a labeled cross-check (recommended).** `[NEEDS-SIGN-OFF]`
- **What:** keep both master edges and both distinct votes; resolve only the raw employment-*number* duplication by designating one program the displayed employment figure and the other an explicitly-labeled cross-check.
- **True mechanism — PACK change, NOT a `master.mts` edge change:** the two brains' master edges stay exactly as they are. The change is in a pack: e.g. relabel `macro-swfl`'s QCEW employment `key_metrics` (`macro-swfl.mts:421-455`) as an explicit "QCEW county-count cross-check of the OEWS survey estimate" (citation string already flexible via `makeQcewSource`, lines 116-128), **or** conversely relabel OEWS employment as a cross-check of the QCEW count. Because QCEW employment is already vote-inert and rollup-silent in master (§2.2), this is mostly a *labeling / provenance* fix so the two numbers are never presented as independent confirmation of each other.
- **`master.mts` wiring change:** **none** — implemented at pack level (`macro-swfl.mts:421-455` and/or `labor-demand-swfl.mts:173-189`).
- **Operator decision inside B2:** which program is the headline employment count and which is the cross-check. Surface the §2.2 tradeoff (QCEW = exact-but-silent; OEWS = estimate-but-voting-and-detail-rich); do **not** default to OEWS.

**Option B3 — KEEP both with justification (defensible).** `[NEEDS-SIGN-OFF]`
- **What:** accept both edges and both votes as intentional two-facet labor coverage.
- **`master.mts` wiring change:** none — leave `master.mts:286` and `master.mts:299` as-is.
- **Justification that would have to be signed off:** "unemployment-rate trend (macro-swfl/LAUS) and employment-level growth (labor-demand-swfl/OEWS) are distinct labor-market facets; the literal QCEW-vs-OEWS employment-number overlap is inert in master (doesn't vote, doesn't roll up), so no action is needed beyond documenting it." This is honest and supportable given §2.2. The only residual risk is a **surface other than master** reading QCEW employment and OEWS employment side-by-side and presenting them as agreement — B2's labeling fix closes that; B3 leaves it open.

**P6 recommendation for (b):** **B2** if the operator wants the two employment numbers explicitly disambiguated (cheap, pack-level, no master change), otherwise **B3** (document-and-accept — the master-level duplication is already inert). **Reject B1.** Either way, **no `master.mts` wiring change** — (b) is resolved (or accepted) at the pack level.

---

## 3. Summary

| # | Duplication | Enters master how | Recommended | `master.mts` change under the recommendation |
|---|---|---|---|---|
| (a) | `fgcu-reri` blended vote echoes 8 primary-sourced concepts | **votes** (non-neutral, non-zero mag) + can double-display in rollup | **A1 drop the edge** (or A2 pack-neutralize to a cross-check) | **A1:** remove `master.mts:257` (`sources[]`) + `master.mts:329` (`input_brains[]`). **A2:** none (pack change in `fgcu-reri.mts:197-235`). |
| (b) | Lee/Collier employment via QCEW (`macro-swfl`) vs OEWS (`labor-demand-swfl`) | two **distinct** votes (unemployment vs employment-growth); the literal employment-number overlap is **vote-inert & rollup-silent** in master | **B2 label one as cross-check** (or B3 document-and-accept) | **none** — pack-level (`macro-swfl.mts:421-455` and/or `labor-demand-swfl.mts:173-189`). Reject B1 (would delete unique signal / can't drop critical macro-swfl). |

**Relative severity:** (a) ≫ (b). (a) is a live, full-weight second vote on 8 concepts and is the single largest missed duplication class in the catalog; (b) is a genuine but largely inert data-level overlap that reads more like legitimate two-facet labor coverage.

**Hard constraints honored:** no `master.mts` edit; no DROP/DELETE/TRUNCATE proposed (this stream is about vote edges, not tables); no normative "X IS the authority" claim — every recommendation is an option pending operator C1/C2 sign-off; every table/root/edge claim carries a `file:line`; structural claims about `fgcu-reri`'s current live direction/magnitude are labeled as un-queried. Written only to this scratchpad path.
