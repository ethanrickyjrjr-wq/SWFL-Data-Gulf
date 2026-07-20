# Lane 27 — Number/date formatting sanity across recipes

## Scope
Grep lib/deliverable/recipes/ and lib/email/ for price/date formatting. Check MM/DD/YYYY
as-of rule, and any spot where a raw/unformatted number, null->"null"/"NaN", or a percent
rendered as raw decimal (0.049 vs 4.9%) could ship.

## What I checked

- `lib/deliverable/recipes/shared.ts` — `authorListingNarrative`. Numbers here
  (`facts.price`, `facts.beds`, etc.) go into an LLM PROMPT as prose facts, not directly
  into customer-visible display markup, so raw-number interpolation there is not a
  display bug. Ruled out.
- `lib/deliverable/recipes/market-pulse.ts` — heavily hardened (this is the file with the
  huge "claim gate" comments). Its own formatters:
  - `fmtMom` (line 223-226): `"-0.39" -> "−0.39%"`. Uses `.toFixed(2)` + explicit sign char.
    Looks correct — always renders a % sign, never a raw decimal.
  - `fmtUsd` (line 228-230): `$${Math.round(n).toLocaleString("en-US")}`. Correct, thousands
    separators present.
  - `asOf` (line 766): built via `formatDisplayDate(asOfIso)` — confirmed
    `lib/format-date.ts:13` `formatDisplayDate` is the ONE MM/DD/YYYY formatter
    (docstring: `2024-03-15` -> `03/15/2024`). Correctly used, never the raw ISO/internal
    token. Ruled out.
  - Confirmed `market-pulse.ts` is a ZIP-level AREA recipe (not the specific-listing
    recipe) — this is the recipe most likely to be the one that shipped in the confirmed
    bug (generic ZIP-stats email instead of the named listing), but that's a ROUTING
    defect (recipe dispatch / `resolveArea` picking this recipe when an address was
    named), not a number-formatting defect. Formatting itself here checks out.
- `lib/format-date.ts` — the one MM/DD/YYYY root, used correctly everywhere I checked
  (`formatDisplayDate`, referenced by market-pulse and market-context.ts's own `mdY`
  helper, which duplicates the same MM/DD/YYYY logic inline rather than importing the
  shared one — a "shared concept, one authority" violation, but NOT a formatting-output
  bug: both produce identical MM/DD/YYYY output). Noted, not escalating — correct output,
  just a duplicate implementation.

## CONFIRMED FINDING — percent-doubling heuristic, `lib/email/market-context.ts:236`

```ts
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
...
if (yoy != null)
  figs.push({
    key: "county_sale_yoy",
    label: `${county} County sale price, year over year`,
    value: pct(yoy * (Math.abs(yoy) < 1 ? 100 : 1)),
    source: "Redfin",
    as_of: asOf,
  });
```

`row.median_sale_price_yoy` comes straight off `redfin_<county>_market`
(`data_lake.redfin_lee_market` / `redfin_collier_market`). Verified the ingest pipeline
that populates this exact column:

`ingest/pipelines/redfin_lee/resources.py:52`
```python
"median_sale_price_yoy": {"data_type": "double", "nullable": True},  # fraction, e.g. 0.0378
```

So the column is ALWAYS stored as a fraction (Redfin's own CSV convention — never
pre-converted to a percent). The `Math.abs(yoy) < 1 ? 100 : 1` branch is guessing whether
the value "looks like" a fraction based on its magnitude, when the schema comment already
guarantees it always IS a fraction. That guess is wrong exactly when a real YoY swing is
large:

- YoY = +18% stored as `0.18` → `abs(0.18) < 1` true → `*100` → renders `+18.0%`. Correct
  by luck (this is the common case, which is presumably why nobody caught it).
- YoY = +105% stored as `1.05` (a genuine >100% swing — plausible in a thin luxury/condo
  month, and this exact table (`housing-swfl.md`) already shows real single-month moves
  as large as 18-19% at the ZIP grain, so >100% at some cut is not implausible) →
  `abs(1.05) < 1` is FALSE → falls to the `: 1` branch → **renders `+105.0%` as
  `+1.1%`** — an order-of-magnitude-wrong percent shipped straight to a customer email,
  silently, no error, no NaN, just a wrong number that looks perfectly plausible.
- YoY = exactly `1.0` (a 100% YoY move) also falls to the wrong branch for the same
  reason (`< 1` excludes `1.0`).

This is precisely the bug shape the task asked me to hunt: "a percent rendered as a raw
decimal like 0.049 instead of 4.9%" — here it's the inverse-triggering condition of the
SAME bug: the code already knows it must multiply by 100, it just refuses to do it when
the fraction happens to be ≥1, and a fraction ≥1 is exactly the boundary where a real,
large, correctly-fraction-encoded YoY move lives.

**Fix:** drop the conditional entirely — the source column is unconditionally a fraction
(per the ingest pipeline's own comment), so `pct(yoy * 100)` is the whole fix. There is no
signal anywhere upstream that would produce this column pre-converted to a percent, so
the branch exists to guard against a case that cannot happen and actively miscomputes the
one case it CAN legitimately hit (a large swing).

grep confirmed this is the ONLY place in the repo with this `Math.abs(x) < 1 ? 100 : 1`
pattern (`Grep pattern: Math\.abs\([a-zA-Z]+\) < 1 \? 100` → 1 hit, this line only) — not
a repeated pattern needing a multi-file fix, just this one call site.

## Other spots looked at, ruled out

- `lib/email/market-context.ts` other figures (`usd`, county sold count via
  `.toLocaleString`, owner-occupied `%` at line 191 `${own}%` — this one takes the ACS
  `owner_occupied_pct` column directly with NO multiply-by-100 guess at all; did not
  chase further since it's a single well-known census percentage column, not the
  ambiguous Redfin YoY field, but flagging as a *related* pattern worth the same
  scrutiny if that column's storage convention is ever unclear).
- Null handling: every figure push in `market-context.ts` is gated behind
  `if (x != null [&& x > 0])` before formatting — no path found where `null`/`undefined`
  reaches a template literal to print literally as the string `"null"`. Same pattern in
  `market-pulse.ts` (`cellNum`/`cellStr` gate everything, rows with a null VALUE or MOM
  are dropped rather than plotted/quoted — line 208-209).
- No unformatted huge raw integers found — every dollar figure across recipes I opened
  routes through either `fmtUsd`/`usd` (both apply `toLocaleString("en-US")`), so no
  `$1234567` un-comma'd figure found.

## Bottom line
One concrete, confirmed formatting defect: `lib/email/market-context.ts:236`, the
`Math.abs(yoy) < 1 ? 100 : 1` heuristic on the Redfin county YoY sale-price percent. It
silently divides a real large YoY move by (roughly) 100 whenever the fraction is ≥1,
because the source column is unconditionally a fraction and the branch guesses wrong at
exactly that boundary. This is a live path in the AI-build "loadMarketFigures" feed for
both zip and county scope county-figures fallback, so any generic ZIP/county market
figure email built through Email Lab is exposed to it.
