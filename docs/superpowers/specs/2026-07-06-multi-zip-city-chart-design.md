# Multi-ZIP city ZIP-by-ZIP chart

**Date:** 2026-07-06
**Check:** `multi_zip_city_chart_live_verify`

## Problem

A city named in an email-lab build ("...for Cape Coral") that is a multi-ZIP place
gets a **wrong chart**. Two failure modes, both observed:

1. The chart routes through the shared producer `buildChartForQuestion`
   (`lib/assistant/chart-for-question.ts`), which fetches a brain at tier 2 and calls
   `computeMetricChart` (`refinery/lib/chart-from-metrics.mts`). That producer reads
   the brain's per-ZIP `detail_table` **across all of SWFL** and shows the top-12 ZIPs
   by value — never filtered to the named city. So a "Cape Coral" chart plots the
   highest-value ZIPs in the region (Naples / beach ZIPs), not Cape Coral.
2. The build's scope collapses the city to its single primary ZIP (`promptPlace.zip`),
   so the chart/dossier represent one ZIP (e.g. Cape Coral = 33904, ~1/6 of the city)
   while carrying the city's name.

The recipe text literally promises "a ZIP-by-ZIP asking-price chart," so a single-ZIP
or SWFL-wide chart is a direct contradiction of what the deliverable claims.

### Evidence (live, 2026-07-06)

- USPS audit (zippopotam.us, USPS-derived) of all 42 crosswalk ZIPs: every city's
  primary ZIP correct; all alt_zips correct EXCEPT Estero's (`33967` = Fort Myers,
  `34134`/`34135` = Bonita Springs). See the Estero exclusion below.
- Code probe: `computeMetricChart` (`chart-from-metrics.mts`) truncates a per-ZIP
  detail table to top-`MAX_BARS`(12) by value, with no place filter; the `scope`
  passed to `buildPromptChart` only tweaks the routing question string, not the data.

## Goal

A multi-ZIP-city build produces a real **ZIP-by-ZIP chart of that city's ZIPs** — one
bar per city ZIP for the routed metric — with every number a real audited brain figure
(the LLM never writes a chart number), and **zero change** to the live chat answer
engine or any existing caller until it explicitly opts in.

Scope: the five verified-clean multi-ZIP cities — **Cape Coral, Fort Myers, Naples,
Lehigh Acres, Bonita Springs**. Estero is explicitly out (see below).

## What we're building

### One root: a ZIP filter on the shared producer

Add a pure helper in `refinery/lib/chart-from-metrics.mts`:

    filterOutputToZips(output: BrainOutput, zips: string[]): BrainOutput

Returns a shallow-cloned `BrainOutput` whose per-ZIP `detail_tables` keep only rows
whose ZIP is in `zips` (match a 5-digit token in the row `label`, or a cell in a
`zip`-grain column). Non-per-ZIP tables and `key_metrics` are passed through untouched
(nothing to filter). `computeMetricChart` and the ranked-delta binder are unchanged —
they run on the filtered output.

### Plumbing (opt-in, default identical)

- `buildChartForQuestion(question, origin, opts?: { zips?: string[] })`
  (`lib/assistant/chart-for-question.ts`): when `opts.zips` is present, filter the
  fetched brain output via `filterOutputToZips` before both the ranked-delta binder and
  `computeMetricChart`. When absent, the code path is byte-for-byte today's — chat and
  every existing caller are unaffected (chat passes no `zips`).
- `buildPromptChart` / `authorDoc` (`lib/email/build-doc.ts`): pass
  `{ zips: promptPlace.zips }` **only** for a resolved city on the allowlist.

### Fail-closed allowlist

A place gets the multi-ZIP chart only if it is on an explicit allowlist:

    VERIFIED_MULTI_ZIP_CITIES = { "Cape Coral", "Fort Myers", "Naples",
                                  "Lehigh Acres", "Bonita Springs" }

- **Estero is excluded** — its crosswalk alt_zips (`33967`, `34134`, `34135`) belong
  to Fort Myers and Bonita Springs per the 2026-07-06 USPS audit, so filtering to them
  would plot neighbor-city ZIPs under an "Estero" label. Estero stays single-ZIP until
  the crosswalk correction (tracked separately) lands, at which point it joins the
  allowlist.
- Any future/unverified multi-ZIP place also stays single-ZIP rather than silently
  charting a possibly-wrong ZIP set. Single-ZIP places and explicit-ZIP scopes are
  unaffected (they never pass `zips`).

### Behavior

- Cape Coral build → one bar per Cape Coral ZIP (up to its 6), titled by the routed
  metric — a true ZIP-by-ZIP chart.
- Fewer than `MIN_POINTS`(3) of the city's ZIPs present in the brain's table → no chart
  (the values still ride the figure feed) — never a wrong-city chart, never a fabricated
  bar.
- Naples (13 ZIPs) still honors `MAX_BARS`(12) — top-12 of Naples' own ZIPs, labeled
  "(top 12)".

### Moat / grounding

Every bar remains a real audited brain number computed in code; the model never writes
a chart figure. `summarizeChartForGrounding` runs on the **filtered** chart, so the
grounding block the model reads contains only the city's ZIP figures — it cannot cite a
number outside the city.

## Tests

- `filterOutputToZips`: from a 40-ZIP SWFL detail table, a Cape Coral filter keeps
  exactly its ZIP rows; a ZIP absent from the table is simply not present (no throw);
  non-per-ZIP tables pass through unchanged.
- `computeMetricChart` on a filtered output → bars only for the city's ZIPs, correct
  title/labels/value_format.
- **Default guard:** `buildChartForQuestion` / `computeMetricChart` with no `zips`
  produce byte-identical output to today (snapshot) — the chat-regression wall.
- `build-doc`: an allowlisted multi-ZIP city passes `zips`; Estero, a single-ZIP place,
  and an explicit ZIP scope do **not**.

## Out of scope

- The crosswalk Estero data correction and the `zip-resolver` spine (separate change,
  needs operator sign-off).
- The one-narrative-across-ZIPs **dossier** read (`fetchMasterDossier` is single-ZIP) —
  a larger, separate piece; this spec covers the chart only.
- Any new chart shape (bar/table only; the chat chart-shape expansion stays parked).
- The email-lab placeholder / empty-fill build guard (already shipped this session,
  separate concern).
