# Desk trend window menu — zoom + per-window fitted read

**Date:** 2026-07-14 · **Shipped.**

## Problem

Operator: *"Can we focus in on less amount of years if we want? Is there a toggle?"* There wasn't. The
`/desk` price panel drew the full eleven years, which is exactly why the recent turn was a sliver — the
coral 24-month line is 18% of an eleven-year axis.

The engine was already computing the answer and throwing it away. `fitWindows` fits a MENU — full, 10y,
5y, 24m, 12m, ex-boom — and the desk drew two rows of it (the long window and the last 24 months) and
discarded the other four. All three cities earn all six.

## Goal

Let a reader pick a window, and show them **that window's data, that window's fit, and that window's
read** — without ever drawing a trajectory no sentence licensed.

## The fork, and why it mattered

A "year toggle" can mean two things, and they carry different honesty costs:

- **Zoom only** — crop the x-axis; the fitted lines stay the same two lines. Nothing new is claimed, so
  no new sentence is needed. Cheap and safe, and it throws away the comparison the engine exists to make.
- **The window menu** — draw the *selected window's own fit*. This is a NEW TRAJECTORY CLAIM, because
  **a drawn line IS a trajectory**: a reader follows it and hears "climbing" whether or not a word says
  so. It may only be drawn if a sentence licenses it.

We built the menu. Which means every row ships its own claim and its own falsifier.

## What we built

| Thing | File |
|---|---|
| `windowRead(w)` — one window's claim + falsifier, read on its own terms | `lib/charts/series-fit.ts` |
| `windowViews(fits)` — the menu as a render model (same `layerFor` branch) | `lib/charts/fit-overlay.ts` |
| `yDomain` override + `<YAxis/>` on zoomed views | `components/charts/vendor/bklit/` |
| The `FIT OVER` button row, the zoom, the per-window copy | `app/desk/_components/DeskHero.tsx` |

**There is still exactly ONE place that decides whether a line may be drawn** — `layerFor` in
`fit-overlay.ts`. `windowViews` calls it. The menu did not get its own copy of the branch.

## The two rules that travel with the menu

**1. Render the menu you are handed.** `fitWindows` has already dropped every window this series does
not honestly earn — under 12 points, not reaching back to its cut date, or (for `ex-boom`) excluding
nothing. The UI **never synthesizes a missing row**. A city with a short series gets a short menu, and
that is the honest answer.

**2. Every row carries its own two sentences.** `windowRead` reuses `trendVerdict`'s two constructions:

- **established** → a rate, and a one-sided threshold keyed to **that window's own interval**. A slope
  sits strictly inside its own CI, so `|slope| > |bound nearest zero|` **always** — the falsifier cannot
  be already-true when printed. (That was phase 1's shipped bug, from keying a short-run claim to a
  long-run bound. Every read here stands on its own window, so the mismatch has nowhere to enter.)
- **not established** → **no direction**, and the band quoted **as a band**. The claim carries no band
  numerals *at all*, and that is load-bearing: the band falsifier has no comparative shape, so the only
  thing keeping it settled is `unanchored-number` — its edges appear in no other settled sentence. Quote
  an edge in the claim and you hand the gate that numeral as an anchor, and the falsifier walks through
  unsettled and is deleted.

## The zoom is a chart-honesty problem, not a UI problem

bklit gives any all-positive series a **zero baseline**. Correct for an area chart — the fill's height
IS the magnitude. Ruinous for a zoomed price window: two years of Cape Coral lives between $350k and
$410k, so a real **$1,201-a-month slide rendered as a flat line**. Zooming in to see the turn and being
shown a flat line is worse than not zooming at all.

So a zoomed window truncates the axis — and takes on the obligation that comes with it:

- **Y labels ON.** A truncated axis is honest only if the reader can see where it starts.
- **No fill.** An area whose base is not zero overstates every movement by the height of the crop. The
  zoomed view is a LINE.

A line on a labelled, cropped axis is a normal chart. An area on a cropped axis with no labels is the
oldest lie in the business.

## Verified live (07/14/2026)

- **Trend** (default) — the long run vs the last 24 months. The verdict, unchanged.
- **2 yr** — axis `Jun 2024 → May 2026`, y `340k–400k` labelled, the coral fit visibly falling from
  ~$385k to ~$358k. The turn you could not see on the eleven-year axis.
- **1 yr** — a **FAN, no line**, and copy that refuses: *"does not establish a direction either way …
  its pace still runs anywhere from a $1,174 a month slide to a $1,935 a month climb."* You can see why
  we won't call it.
- **Ex-boom** — the button is short; the tooltip and the printed claim both carry the full disclosure
  ("full history, excluding the 2021–2022 run-up"). The short label shortens a button, never a
  disclosure.

## Two defects caught by looking, again

1. **The fan rendered GREY** on the dark panel (neutral-gold at 0.16 over `#0f1d24` washes out). Grey is
   this app's colour for MISSING DATA — a washed-out fan silently refiles our own finding under "we
   don't know." Raised to 0.28 on the dark surface.
2. **The 1-year axis lost its years** (`Jun 29 … May 30`, spanning two calendar years). The first fix
   thresholded on SPAN, which is wrong twice over: a 12-month window is only ~365 days, and lowering the
   threshold to catch it would hit short DAILY series, where month+year collapses every tick in a month
   to one string and the axis dedupes them away (`seenLabels`, `x-axis.tsx`) — losing ticks to fix years.
   **The test is cadence, not span.**
