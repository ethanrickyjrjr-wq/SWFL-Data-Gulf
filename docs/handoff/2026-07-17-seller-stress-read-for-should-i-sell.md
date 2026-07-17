# Handoff → the `/r/should-i-sell` builder — seller-stress read + hard-won honesty findings

**From:** the seller-stress-facing-page session (now superseded by should-i-sell)
**Date:** 07/17/2026
**Why:** my standalone seller-stress page folded into your `/r/should-i-sell` product. This is what's
already built + the non-obvious traps I already hit, so you don't re-discover them. Nothing here is a
rebuild — the `seller-stress-swfl` pack is untouched; everything reads already-published output.

---

## 1. Already built + on main — reuse it, don't rebuild it

**Commit `ab2e8215`** (clean, only these two files): `lib/seller-stress/read.ts` + `read.test.ts`.

`buildSellerStressRead({ zip, place, output, freshnessToken })` — a PURE, tested function (5 tests,
green) that turns published `seller-stress-swfl` output into a seller read. It imports nothing at
load; drop it straight into should-i-sell as the stress facet. Current shape:

- `region: { direction, stateLabel, median }` — the region's honest absolute state, **relayed from
  the brain's own `direction`** (seller-plain words), plus the published median score.
- `area: { score, rank: {position, total}, vsMedian: above|near|below }` — the ZIP's own score +
  where it sits in the region's scored distribution.
- Placeholder fields (`drivers`, `caveats`, `headline`, `flipLine`, `actionable`, `dataPeriod`,
  `refreshedAt`) are typed but not yet filled — Tasks 2–3 below fill them; **complete code for those
  is already written** in `docs/superpowers/plans/2026-07-17-seller-stress-facing-page.md` (Tasks 2
  and 3). Lift it or re-shape it into your product; don't re-derive.

## 2. The honesty findings you MUST inherit (these cost real time to find)

1. **Do NOT re-band the score with absolute cutoffs.** The pack deliberately decouples the published
   0–100 score (clamped at `SCORE_CEIL_SIGMA = 3.0`) from `direction` (read off the raw composite at
   0.6 / -0.2 / -0.6). The per-ZIP detail table publishes only the **compressed score, not the raw
   composite.** So the old "65/45/35" score gates are stale (raw 0.6 now maps to score ~52, not 65),
   and banding the score would drift on the next ceiling retune — and could label a
   regionally-stressed area "calm." **Relay the brain's `direction` for the region; rank the area
   relatively.** `read.ts` already does this correctly — copy the approach.

2. **The 34145 / Marco Island trap.** The brain ships a caveat: *"SB 4-D special assessment
   delistings inflate stress in condo-heavy ZIPs (e.g., Marco Island corridor)."* Marco Island is
   34145 — which is ALSO the single most-stressed ZIP (score ~84). If should-i-sell tells a
   single-family seller in 34145 "you have the most seller pressure in the region" while dropping that
   qualifier, the product hides the one thing it exists to show. **Carry the seller-material caveats
   verbatim** (the condo one when the area is condo-flagged; the ~50%-all-cash one always — it's why
   national stress thresholds don't apply here).

3. **`asOfFromToken` gives the PULL date, not the data period.** The token is
   `SWFL-7421-v8-20260712` → `asOfFromToken` returns 07/12/2026 (when we fetched), but the data's
   labeled period is 2026-03-01 (Redfin rolling-3-month). Showing "As of 07/12/2026" over March data
   is an open ledger defect (*"as-of is OUR verify date, not the source period"*) and worse on a
   consumer honesty surface. **Surface the data period ("Data through March 2026") as the currency;
   the refresh date is a distinct secondary "last checked" line.** Parse the period from the
   detail-table title or the metric labels (the pack embeds `2026-03-01` in both).

4. **Suppressed ZIPs are honest, never faked.** 3 of 55 core ZIPs have a null score
   (insufficient 2019–2021 baseline). Render "not enough history to score your area yet" + nearby
   scored areas — never a fabricated number.

5. **Citations = "SWFL Data Gulf"** (label), Redfin Data Center (underlying). MM/DD/YYYY dates. No
   competitor names in copy. Never frame the product as "ZIP-level" — say "your area" + name the
   place.

6. **Framing (operator-locked): truth-first, made actionable.** Don't sand off "elevated pressure" —
   the honesty IS the differentiator. Lead with the real read, then what it means for pricing/timing.

## 3. Entry / HeroBar — pick ONE, don't add a mode per feature

My original plan added a **new "Seller Pressure" 4th mode** to the one-bar homepage. **Withdraw
that** — your back-on-market design already routes a sibling seller-read through the **existing
"Market Report" mode**. Two adjacent seller reads with two different front doors would crowd the
operator-locked one-bar into a collage. should-i-sell should choose a **single** homepage entry
(most likely the existing Market Report mode, or one deliberate new mode that covers the whole
seller-decision product — operator's call), not one per sub-read.

## 4. One read seam, not two

My `read.ts` reads `brains/seller-stress-swfl.md` **directly** (via `parseBrainMarkdown`).
back-on-market's `load-zip.ts` reads the same brain via the **`lib/zip-report/` seam**. Two paths to
one brain. should-i-sell should pick one seam for the stress facet. My direct read is the simplest
path for the composite score + drivers; the zip-report seam is what back-on-market already uses for
the cancellation/relist/delist rates. Converge them.

## 5. Reference (do not build from these — superseded)

- Superseded spec (design thinking, all findings above in full): `docs/superpowers/specs/2026-07-17-seller-stress-facing-page-design.md` (marked SUPERSEDED).
- Plan with complete Task 2/3 code (drivers, caveats, dates, IO shell): `docs/superpowers/plans/2026-07-17-seller-stress-facing-page.md`.
- The live seller-stress output being read: `brains/seller-stress-swfl.md`.
