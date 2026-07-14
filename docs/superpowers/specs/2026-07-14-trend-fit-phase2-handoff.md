# Trend Fit Engine — Phase 2 handoff

> **Recommended model:** ⚡ Sonnet — keywords: breaking

**Written 07/14/2026.** Phase 1 is done and committed. Phase 2 is the wiring: four surfaces,
none of them started.

Read this before touching `lib/charts/series-fit.ts`. Everything below is verified in source
on 07/14/2026, not remembered.

---

## The one-line answer to "is there a chart on /desk yet?"

**No — not from this engine.**

`/desk` has had a **Home Price Trend** panel for a while (`app/desk/page.tsx:181`, zone
`desk-hero`, fed by `home_value_zhvi_regional_median`). It draws the ZHVI series. It draws
**no fitted line, no slope, and no trend read.**

`trendVerdict` — the thing that decides whether a direction may be spoken at all — has
**zero production consumers.** Nothing imports it but its own test. That is not an accident
and it is not a failure: phase 1 deliberately built the engine and stopped, so the prose and
the contract could be fixed *before* four renderers hardened around them. That fix happened
(see "What changed 07/14" below). The engine is now safe to wire.

---

## What EXISTS (phase 1, all landed)

| Thing | File | State |
|---|---|---|
| `fitLine` — OLS + 95% CI on the slope, real t-table | `lib/charts/fit-line.ts` | live |
| `fitWindows` — the window menu (full / 10y / 5y / 24m / 12m / ex-boom) | `lib/charts/series-fit.ts` | live, **no consumers** |
| `trendVerdict` — the trajectory word, computed in code | `lib/charts/series-fit.ts` | live, **no consumers** |
| `TierProjectionChart` migrated off `trailingSlope` | `lib/charts/tier-projection-series.ts` | live (Task 4) |
| airport chart stopped calling a moving average a "trend" | `lib/charts/airport-series.ts` | live (Task 5, commit `dc4eb864`) |
| /desk correlation heatmap stopped painting noise as signal | `lib/desk/correlation.ts` + `components/charts/DeskCorrelationHeatmap.tsx` | live (Task 6, commit `e804c772`) |

Tasks 5 and 6 had checks left open after the fixes landed. **Closed 07/14** — do not re-do them.

### The law the engine enforces

`established` = the slope's 95% CI **excludes zero**. That is the gate, and it is *not* R².
Cape Coral's 5-year window has R² 0.105 (garbage) and a slope of −$472/mo with a CI of
[−833, −111] — which excludes zero, so **the direction is real**. R² says how tightly the
points hug the line; it does not say whether the direction exists. Conflating them was the
original bug.

**If `established` is false, the sign of the slope may not be read.** Not by code, not by a
chart label, not by the narrator.

---

## What changed 07/14 (commits `3203a19d`, `6daa97df`)

A prose pass on `trendVerdict` before renderers could bake it in. Six defects, three of which
the check had not named, and **the test suite was green over all of them** — printing the
actual sentences is what caught them.

The one that matters most for phase 2:

> claim: "The last 24 months are still climbing, at **$1,500** a month."
> falsifier: "This read breaks if the next two months climb by less than **$1,674** a month."

$1,500 *is* less than $1,674. **The read refuted itself in its own second sentence.**
`reversed` was worse — it announced the market had turned and was *falling* $1,844/mo, then
staked the read on the next two months *climbing* $1,804.

Cause: a **window mismatch**. `ci` bounds the *eleven-year* pace; "the next two months" is
short-run. Cape Coral runs +$1,931/mo over eleven years and −$619/mo over twenty-four months
and **both are true** — so a short-run pace under the long-run bound is not a broken trend,
it is Tuesday.

**The rule now: the falsifier and the claim stand on the same window.** A slope always sits
strictly inside its own interval, so `|slope| > |bound nearest zero|` always — the
construction *cannot* be already-true when printed. Locked by the test
`NO FALSIFIER IS ALREADY TRUE THE MOMENT IT IS PRINTED`.

Also fixed: jargon in client copy (`fitted slope`, `95% interval`, `clears zero` — all gone);
`ci[0]` now reads as a **rate**, not a permitted wobble around the line; the voice is
"this market" on all four kinds; `plateau` no longer reports a finding about 24 months it
never fit; and both flat-band kinds quote a band **as a band** instead of dressing its edge
up as a breaking pace (a lopsided band `[−$2,000, +$15]` was printing *"a climb of more than
$15 a month"*).

---

## THE CONTRACT — read this before you render anything

### 1. Branch on `falsifier.valueLow`, **NOT** on `kind`

- `valueLow === null` → `value` is a **real one-sided threshold**. One pace, one side. **Draw the line.**
- `valueLow !== null` → the sentence names a **band that straddles flat**. `value` is its climb
  edge, `valueLow` its slide edge. **Neither edge breaks anything.** Draw the band or draw
  nothing — one line there is a lie, and you may not pick the "likelier" side, because picking
  a side means reading the sign of a slope the engine has just ruled **unreadable**.

`plateau` appears on **both sides** of that rule. That is exactly why `kind` is the wrong
discriminator, and why a renderer that badges on `kind` will get it wrong.

### 2. Hand the gate BOTH sentences

```ts
auditClaims(prose, [verdict.claim, verdict.falsifier])   // <- BOTH
```

Pass only `claim` and the gate **eats the falsifier** (it reads as `comparative` +
`unanchored-number`), the paragraph fails closed to an open slot, and the falsifier never
reaches the page. A trend read is an `[INFERENCE]`, and the rules of engagement require every
inference to carry its base value **and one falsifier** in visible copy. A falsifier the gate
deletes is a falsifier we did not ship.

### 3. Do NOT quote a band edge in the claim

The two band falsifiers (`no-direction`, and `plateau` with a recent band) have **no
comparative shape** any more. The only thing that kills them when unsettled is
`unanchored-number` — their edges appear in no other settled sentence. Quote a band edge in
the **claim** as well and you hand the gate that numeral as an anchor, and the falsifier walks
through unsettled. **The two constructions are load-bearing against each other.**
(Related: `steeper than` is in no regex. `more than` / `less than` are. Wording is not cosmetic
here.)

### 4. A window must never wear a label that outruns its data

`fitWindows` already enforces this — a window is **dropped from the menu** (not drawn faintly,
not returned with a caveat) when it has fewer than **`MIN_FIT_POINTS` = 12** points, or does
not reach back to its cut date, or (for `ex-boom`) excluded nothing. **A renderer must render
the menu it is handed and never synthesize a missing window.**

---

## Phase 2 — the four surfaces

Nothing below is started. Suggested order: **desk block first** (shortest path to a live,
visible artifact against a series we already draw), narrator last (it depends on the gate
being wired correctly everywhere else).

### A. The renderers that draw the line
Draw the fitted line + its band on an existing chart. `Fit.at(when)` gives the fitted value at
any date — **never anchor to the last observed point** (that bug is already fixed in
`tier-projection-series.ts`; do not reintroduce it). Honor the `valueLow` rule above.

### B. The desk trend block
`/desk` already renders the ZHVI series in the `desk-hero` zone (`app/desk/page.tsx:181`). The
work is to run `fitWindows` + `trendVerdict` over that series and render the verdict *and its
falsifier* as copy beside the chart. **First thing to verify:** how many monthly points that
series actually holds, and how far back it reaches — `MIN_FIT_POINTS` is 12, and trailing
windows are dropped when the data does not reach their cut date. If it only supports `full`
and `12m`, the "window menu" is two rows, and that is the honest answer.

### C. The Email Lab preset
A trend block a user can drop into a deliverable. Both sentences (`claim` + `falsifier`) ship,
or neither does — see contract §2.

### D. The narrator
The verdict is the **license**: `auditClaims` lets a trajectory word through only as a verbatim
restatement of a settled sentence, so handing the narrator `verdict.claim` is what permits it to
say "climbing" at all. **A trajectory the model invents on its own still dies in the gate, and
must.** No change to `claims.ts` is needed.

---

## Landmines (verified open)

- **`data_lake.redfin_city_swfl` is NOT SWFL.** It holds 896 regions **statewide** (Miami,
  Lakeland, Margate, Alachua) despite the `_swfl` name. Any code trusting the table name for
  scope is wrong. Check: `redfin_city_swfl_not_swfl`.
- **A foreign session dropped the `median_sale_price` not-null filter** from the
  `redfin_city_swfl` query (commit `0ce12bfa`) **without adding paging**. With the PostgREST
  `db-max-rows` row-cap, more rows now compete for the same cap and the sold series can be
  **silently cut short** — which would quietly shorten any window fitted over it. Check:
  `redfin_city_null_filter_dropped_no_paging`. Not ours; surface to whoever owns it.
- **`daily_truth.median_sale_price` rows exist but every value is NULL** (19 days × 3 cities,
  verified 07/11). The desk hero and the desk price-trend panel fall back to ZHVI monthly.
  Check: `daily_truth_median_sale_unvalued`.
- **`plateau` is one kind covering two situations** — a recent band that straddles flat, and
  **no recent window at all**. The prose is honest in both and `valueLow` tells them apart, but
  the **kind does not**: a renderer that badges on `kind` will stamp "PLATEAU" on a series it
  holds no recent window for. Decide before renderers land — split the kind, or branch on
  `valueLow` (contract §1). Check: `plateau_kind_covers_two_situations`.
- **Demo/seed copy can still hand-write trajectory words** ("found its floor", "bottomed",
  "stabilized") with no gate. `trendVerdict` is the code authority for the trajectory word but
  has **zero reach into seed/preview prose**. 4 instances removed 07/14; nothing stops the 5th.
  Check: `demo_copy_has_no_trajectory_gate`. **This is the check phase 2 most plausibly closes**
  — once the narrator is wired, the authority exists to lint against.

---

## Verification bar

`bun test lib/charts/series-fit.test.ts` — **50 tests**. The two loops that matter run across
**all four verdict kinds**: gate-survival against the real `auditClaims` (not a stand-in), and
"reads as English under the ex-boom label".

**And print the sentences.** The suite was green over every one of the six defects fixed on
07/14. Printing the actual copy is what caught them, every time. Do not trust green.
