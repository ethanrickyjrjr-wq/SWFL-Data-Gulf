# Handoff — finishing what the 08/11/2026 five-item re-verify opened

**Status of the re-verify itself: DONE, pushed (`a803c51f`).** Five held-back provisional items were
settled against the tree AND a live lake probe; six stale doc lines were corrected in place. This
file is only about **what is still owed**, in the order it should be done.

Read `SESSION_LOG.md` 08/11/2026 entry ("the 5 held-back provisional items re-verified") for the
evidence behind every claim below. Nothing here is a hypothesis — each item names the file, line,
and the live number it was measured at.

---

## The measurement that governs the whole list

Live lake probe, read-only, **08/11/2026**:

- `data_lake.cre_figures` = **1,078** · `data_lake.cre_figures_confidence` = **985**
  → byte-identical to the 07/18/2026 census, 24 days later.
- `data_lake.redfin_city_swfl` = **403,565 rows / 952 areas / newest `period_end` 2026-06-30**
  (`All Residential` slice: 143,029 rows, 952 areas).
- `data_lake.lee_parcels` = **556,083** · `data_lake.leepa_parcels` = **548,798**.

Re-probe before trusting these; they are a point-in-time read, not a subscription.

---

## 1. `cre_figures` — WIRE IT. This is the biggest real gap. `[NEEDS OPERATOR DECISION]`

**What is true now.** The registry half is fixed — `ingest/cadence_registry.yaml:1624` carries a real
entry (`dispatch_only: true`, `freshness_table: data_lake.cre_figures`). Writer
`scripts/build-cre-figures.mjs` and derivation `refinery/lib/derived/cre-figures.mts` +
`cre-corroboration.mts` both exist and work. Migration `migrations/20260718_cre_figures.sql`.

**What is missing, both halves measurable:**

1. **No consumer.** `consuming_pack: none`. Nothing reads the materialized tables. The refinery
   references the *derivation module*, never `data_lake.cre_figures` the TABLE.
2. **No cron.** `grep -rn "build-cre-figures" .github/` returns **nothing**. It refreshes only on a
   manual `bun scripts/build-cre-figures.mjs`.

**The proof they are real:** 1,078 / 985 rows, unchanged in 24 days. A table with a cron moves.

**The decision that blocks the build** (open since 07/18/2026, `[NEEDS-SIGN-OFF]` in
`_RESEARCH/audits/2026-07-18-data-consolidation/P4-unmapped-tables.md:114`): **should `cre_figures`
REPLACE the `marketbeat_swfl` direct-read as the CRE-figures authority, or sit beside it?** That is a
C1/C2 architecture call — it changes which root feeds a served number, so it goes through
`docs/standards/data-roots.md`, not a code edit. **Do not wire a consumer before this is answered**
or you create the second-root problem RULE 0.55 exists to stop.

**Order once answered:** (a) data-roots entry naming the authority → (b) consumer in the `cre-swfl`
pack → (c) GHA cron wrapper + `--dry-run` in the SAME PR (pipeline-freshness rule).

Open check: `cre_figures_build_cron_cadence` (re-scoped 08/11/2026 with the above).

---

## 2. The dark-roots classifier is wrong, and it mis-flagged a live page. `[FIXABLE NOW]`

**The defect.** The SessionStart "DARK ROOTS — registry entries with `consuming_pack: none` (data
lands, NOTHING reads it)" list flags `redfin_city_swfl`. **That is false.** It has a live production
consumer — `lib/desk/loaders.ts:167` `loadSoldSeries()` reads it at `:174`, called at `:906`, and it
is **rung 1** of the desk hero ladder at `:930-933` (`buildHeroFromSold`, ahead of asking and the
`zhvi_pivoted` fallback). Covered by `lib/desk/loaders.test.ts:208`. Two SQL readers exist too
(`docs/sql/20260718_realtor_geo_medians.sql:48`, `20260718_redfin_metro_sold_pivoted.sql:28`).

**Root cause.** `consuming_pack` only answers "does a BRAIN PACK read this." A page, a route, a view,
or a script consuming the table is invisible to it. So the list conflates *no pack consumer* with
*nothing reads it* — and the fix that list invites is DELETION.

**Why it matters more than one bad row:** the 08/11 cleanup commit (`cb803b1c`) deleted five
pipelines on exactly this signal. It happened to be right those five times. The classifier does not
know the difference.

**What to do.** Either rename the surface to "no PACK consumer" (honest, one-line, no false
deletions), or teach it to also scan code/SQL readers before calling a root dark. The remaining
five it flags (`listing_week`, `dbpr_re_licensees`, `cre_figures`, `swfl_search_demand`,
`realtor_geo_trends`) **have not been re-verified for non-pack consumers** — do that before acting
on any of them.

---

## 3. RULE 0.5 needs a stated carve-out — the graph produced a false negative `[NEEDS OPERATOR DECISION]`

Measured 08/11/2026, one day after the all-in-on-graphify decree:

- `gx_callers("reportToEmailHtml")` → **0**, and `gx_references("reportToEmailHtml")` → **0**, while
  the tree has `import { reportToEmailHtml }` at `lib/email/activation/sequence.ts:22` and two uses
  at `:123`/`:181`. **An import IS a reference.** The graph missed the one question RULE 0.5 says it
  beats grep at: who reads this.
- `gx_find("cre_figures")` → **0 nodes**. Table names are not code symbols, so **no `data_lake.*`
  wiring question is graph-answerable at all.**
- The hosted build answered at `149f4f6f`, **8 commits behind HEAD**, predating that day's deletion
  commit.

**This is not an argument to abandon the graph** — it found things grep would not, and the decree
stands. It is an argument that the rule's "grep is only the fallback" line needs two named
exceptions: **(a) value / default-parameter references** (`deps.render ?? fn` is invisible to a call
graph) and **(b) any lake-table question**. Plus a re-index trigger so the hosted build is not
routinely a day stale.

**Not edited into CLAUDE.md unasked** — RULE 0.5 is load-bearing and this is the operator's wording
to choose.

---

## 4. `reportToEmailHtml` — decide the 4th render path's fate `[NEEDS OPERATOR DECISION]`

**Corrected in `docs/standards/emails.md` already:** the "ZERO live callers" claim was false. Real
chain — `render.ts` ← `sequence.ts:22` (default renderer) ← `scripts/email/run-activation.mts` ←
`.github/workflows/activation-sequence.yml:41`.

**It cannot send, and that is verified in CODE not prose:** `run-activation.mts:28` defaults
`DRY_RUN` true, `:41-44` exits 1 on a non-dry run, `deps.send = liveSendNotWired()` throws at
`:32-38`, and the workflow is `workflow_dispatch` with deliberately no cron.

**The open fork.** `docs/standards/emails.md` says a convergence plan for exactly this merge exists
and was abandoned half-done: `docs/superpowers/plans/2026-06-16-deliverable-convergence/`. The spine
was extracted and **ten goldens were frozen specifically to prove the collapse is
behavior-preserving** — then it was declared green and left. Its own instruction: *"Finish it; do
not start a third design."*

**Two things gate a live Phase D flip, both pre-existing and both still open:** the 1:1 send
mechanism chosen + verified against Resend, the CAN-SPAM address swapped — and note the open defect
`applyBrand is browser-only: any non-Lab send path ships unbranded`, which this path would hit.

---

## 5. `redfin_city_swfl` scope guard `[FIXABLE NOW]`

Check `redfin_city_swfl_not_swfl` is **open, real, and has GROWN: 896 statewide regions when filed
07/13/2026 → 952 live 08/11/2026.** The table is statewide (Miami, Lakeland, Alachua) despite the
`_swfl` name.

The current consumer is safe — `loadSoldSeries` filters `.in("area", CITY_DEFS.map(...))`. **The risk
is any NEW consumer that reads it unfiltered.** Cheapest durable guard: a view or a named constant
that pins the SWFL area set, so a future reader cannot get statewide rows by accident. Updated with
the live figure 08/11/2026.

---

## 6. Residual — `identity_live_red_baseline`'s other three clauses `[NOT RE-PROBED]`

Its `redfin_city_swfl` clause ("ghost_target + dlt_never_landed / table never landed") is now
**FALSE** — 403,565 rows, live consumer. Detail updated 08/11/2026.

**Three clauses were NOT re-probed this session and stay open:** `fgcu_reri_indicators`
row_floor_breach, `dbpr_re_licensees` row_floor_breach (0 rows vs 15k), `news_swfl`
dlt_never_landed (`dlt_schema_name: data_lake` is the DATASET not the schema; real schema is
`news_swfl`). Each needs its own live probe before the check can close or the
`registry_identity_live_gating` flip happens.

---

## What was already finished — do not redo

- **Parcels leepa vs FDOR is RESOLVED and the stale docs are struck.** Operator ratified **KEEP
  BOTH** 07/18/2026. Both roots live-confirmed (`lee_parcels` 556,083 / `leepa_parcels` 548,798).
  The two 07/11 lines telling a future session to *"kill any in-flight Lee-from-FDOR ingest"* are
  struck in place with a supersession stamp — obeying them would have deleted a live ratified root.
  `lee_no_second_parcel_source` is **not** an open ledger row; this was doc-only staleness.
- **`lib/social/CLAUDE.md`'s "two systems, still unwired" is corrected.** Eight VALUE (runtime)
  imports from `lib/email/` exist, led by `design/author.ts:23-27` importing `buildVariants` from
  `@/lib/email/social-calendar/build-week`. The still-true part (the `SocialModel` vs `EmailDoc`
  MODEL seam) is preserved and separated so it is not lost in the correction.
- **`redfin_city_null_filter_dropped_no_paging` is CLOSED** — both defenses present at
  `loaders.ts:170` (`selectAllPaged`) and `:181` (not-null filter).

---

## Ledger delta for this session

Opened **0**. Closed **1** (`redfin_city_null_filter_dropped_no_paging`). Updated **3** with live
evidence (`redfin_city_swfl_not_swfl`, `identity_live_red_baseline`,
`cre_figures_build_cron_cadence`). **Net negative** per RULE 0.85.
