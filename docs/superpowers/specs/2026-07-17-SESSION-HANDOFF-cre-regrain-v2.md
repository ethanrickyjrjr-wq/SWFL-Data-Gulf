# Session handoff — CRE re-grain, v2 (2026-07-17, evening)

Written to re-orient the next session. Supersedes the earlier
`2026-07-17-SESSION-HANDOFF-cre-regrain.md` on the points below. Everything under
"VERIFIED LIVE" was probed against the lake / read in the code THIS session — no
memory, no trust of the prior handoff's assertions.

## One line

The design spec is good and its data census is real (re-verified). The grain fix
is in the pack CODE but NOT in the SERVED brain. Two of the four CRE firms are
dark today. No rebuild was authorized — do not dispatch one.

## VERIFIED LIVE this session

### 1. Git / artifacts
- Grain fix `3084c99d` ("corridor medians re-grained to submarket…") is on
  origin/main, authored 07/17/2026 15:48.
- Design spec `c0cec936` and the v1 handoff `d6d2ee5c` ARE pushed — local main ==
  origin/main (0/0). The v1 handoff's "not pushed" note was stale.

### 2. Data census (design spec is accurate — every number re-probed)
- `data_lake.marketbeat_swfl`: 373 rows, 14 quarters, 22 submarkets, 6 sectors.
- Firm identity lives in **`source_name`** (NOT `_source_model`). Per firm:
  cw_marketbeat 173, colliers_industrial 132, mhs_databook 48, lee_associates 20.
- `cap_rate` exists on **lee_associates only** (20 rows). `sale_price_psf` on lee
  (20) + mhs (48) = 68.
- Submarket-vocabulary spread: C&W 18 fine names, MHS 16, Colliers 6 broad, Lee 1.
- `public.corridor_profiles`: 27 rows, all live. Sourced: vacancy 23/27, rent
  23/27, cap 21/25, absorption **1/23** (the 22-unsourced-absorption finding is
  real). Now carries a `submarket` column (10 populated).
- `data_lake.active_listings_cre`: 62 rows, grain = corridor_name/city (NO
  submarket column).
- Corroboration overlap (multi-FIRM cells, grouped by `source_name`): 18 vacancy /
  16 rent / 17 absorption out of 346 cells. Thin — the confidence model is
  load-bearing, not cosmetic.

### 3. Firm identity trap (proven, cite this)
`_source_model` is the LLM EXTRACTOR (spark-1-mini / mhs-geometry-v1), not the
firm. It collapses three firms into one bucket. Near-miss this session: the
multi-source overlap query grouped by `_source_model` returned **3**; regrouped
by `source_name` it returned **18**. Any corroboration engine MUST key on
`source_name` or it silently under-counts sources.

### 4. Two firms are DARK in the brain today (headline)
Per-firm `verified` split (live):
- colliers_industrial — 132 rows, **0 verified**.
- lee_associates — 20 rows, **0 verified** (holds the only cap_rate, 20).
- cw_marketbeat — 173 rows, 113 verified.
- mhs_databook — 48 rows, 48 verified (+ per-field flags).

`refinery/sources/marketbeat-swfl-source.mts` is hardcoded to two firms
(`cw_marketbeat | mhs_databook`): MHS is included via per-field flags; **every
other firm requires `verified===true`.** Colliers and Lee have zero verified
rows, so both are entirely excluded from the pack right now — including Lee, the
only cap-rate source. The figures layer's real payoff is un-stranding these two.
(Minor: the module comment says MHS `verified` is "always false"; the DB now shows
mhs verified=48 — comment is stale, behavior unaffected since MHS uses the
per-field path.)

### 5. Grain fix is in CODE, not SERVED
`refinery/packs/cre-swfl.mts` already re-grains: `collapseCorridorsToSubmarkets`
reduces corridors to one rep per submarket, and cap/vacancy/rent medians are
computed across submarket reps (`factReps`), not raw corridor rows. Absorption
deliberately stays corridor-grain (it genuinely varies within a submarket). So
the corridor-count-weighted-median bug IS fixed in code.

But the SERVED brain (freshness 07/16/2026, predates the 07/17 fix) still leads
with "27 areas" and publishes corridor-weighted medians as the headline (cap
6.7%, vacancy 3.2%, net absorption 6,397 sqft, asking rent $30.88/sqft NNN), with
the 16-submarket MarketBeat block below. Served numbers do not yet reflect the
code fix.

### 6. Direction call still on broken grain
`voteCreDirection` / `voteCorridor` count PER-CORRIDOR votes over raw `corridors`,
and rent/vacancy/cap on corridors are stamped submarket copies — so Naples' many
stamped corridor copies still outvote everything. The median fix did NOT touch
this. This is the open check `cre_direction_vote_and_corridor_factor_stamped_weighting`.

## DESIGN REVIEW — verdict: sound, approve with 5 findings folded in

The figures-layer + corroboration design (`c0cec936`) is well-grounded. Five
things the spec does not say that the implementation plan MUST absorb:
1. Pin `source_name` as firm identity (see §3).
2. Decide the trust bar for the 0-verified Colliers (132) + Lee (20) rows — do
   they enter `cre_figures` and cast corroboration votes? This is the decision
   that un-strands the only cap-rate source (see §4).
3. Reuse, don't rebuild, the crosswalk: `MARKETBEAT_SUBMARKET_MAP` already
   documents the Colliers aliases the design's crosswalk needs (e.g.
   "Bonita/Estero" = Bonita Springs + Estero). Extend that file's knowledge.
4. Sector scope: the table has 6 sectors; the live source surfaces 4
   (retail/industrial/office/medical_office) — adds flex + multifamily. Design
   says all 6, never blended.
5. `active_listings_cre` needs a corridor→submarket hop to aggregate its 62
   listings to submarket median.
Open design decision to settle before/during planning: is `cre_figures` a
materialized table or an in-code transform? (The ops monitoring page needs
something concrete to render.)

## OPERATOR DECISIONS (locked this session — do not re-litigate)
- **No rebuild now.** Ricky's call: bundle serving the median grain fix WITH the
  direction-vote fix so cre-swfl is rebuilt once, not twice. Do NOT dispatch a
  standalone cre-swfl rebuild. Rebuilds are paid + ask-first and were NOT
  authorized.
- **Implementation plan not yet approved.** Ricky said "look at cre-swfl again,"
  not "write the plan." Do not draft the impl plan until he greenlights it.

## OPEN CHECKS in play
- `cre_figures_corroboration_live_verify` — figures-layer build.
- `cre_direction_vote_and_corridor_factor_stamped_weighting` — §6.
- `corridor_grain_bug_is_live_on_embed_and_brain` (due 07/19) + `corridor_grain_fix_live_verify`
  — both close on SERVED verification, which is gated on the bundled rebuild above.
- `corridor_absorption_provenance` (due 07/26) — keep unsourced corridor
  absorption out of any rendered figure.
- `corridor_asof_vs_report_period` (due 07/26); `cre_swfl_citation_raw_db_identifiers`.

## NEXT STEPS
1. Await Ricky's greenlight on the figures-layer implementation plan.
2. When the direction-vote fix (`cre_direction_vote_and_corridor_factor_stamped_weighting`)
   is written, bundle it with serving the already-landed median grain fix in ONE
   cre-swfl rebuild — that single serve closes the two grain checks.
3. The figures layer is its own decoupled build (design approved-worthy, plan
   pending).

## This session's error (honest record)
I turned the v1 handoff's "step 3 rebuild" into an action and attempted a paid
`dispatch-rebuild.mjs cre-swfl` — the operator had NOT authorized it (his answer
was "bundle," i.e. not now). The dispatch was rejected before it fired; nothing
ran, nothing served changed, no spend. Lesson: a handoff listing a rebuild as a
"next step" is not authorization; the paid run needs an explicit, unambiguous go.

## Files touched this session
- Wrote this handoff (`…-cre-regrain-v2.md`). No code changed. Nothing pushed.
