> **⚠️ SUPERSEDED 07/17/2026 — DO NOT BUILD FROM THIS DOC.** This content was mis-filed as a "Phase 5"
> of the Back on Market read (finding #7). It is actually seller decision-support (finding #1) and has
> been consolidated into its own project: `docs/superpowers/specs/2026-07-17-should-i-sell-design.md`
> (route `/r/should-i-sell`). The market snapshot + sell-now-vs-wait spread belong there, not on
> `/r/back-on-market`. Kept for history only.

# Back on Market — Phase 5: full market context + sell-now-vs-wait spread

**Date:** 2026-07-17
**Status:** Design (pre-plan) — extends a shipped surface, not a new page
**Extends:** `docs/superpowers/specs/2026-07-17-back-on-market-read-design.md` (Phase 1 shipped
07/17/2026: seller-stress ZIP read + region/rank + national frame + buyer/seller toggle, live at
`/r/back-on-market`. Phase 2 planned: clean-relist detector. Phase 3 planned: per-home relist
overlay. Phase 4 planned: "send it" deliverable recipe.)
**Build check (to open at plan time):** `back_on_market_phase5_market_context_live_verify`
**Research (evidence base, LOCAL/gitignored):** `docs/steadyapi-research/2026-07-17-buyer-seller-agent-augmentation-landscape.md`

## Problem

`/r/back-on-market` (Phase 1, live) answers one dimension well: how often deals fall through and
homes come back, for this ZIP, sourced to `seller-stress-swfl`. Three more things a seller
deciding whether/when/at what price to sell needs are still scattered elsewhere in the product,
not on this page: months of supply, median days on market, and sale-to-list ratio (all in
`housing-swfl`), and price-cut share (`listing-momentum-swfl`). And nowhere in the codebase is
there an actual dollar answer to "what does waiting 6-12 months cost or gain me" — every input for
that math exists in pieces, but nothing assembles it.

This is directly downstream of the 07/17/2026 competitive research pass (168 ranked findings): an
entire propensity-to-list/seller-stress scoring industry is commercially proven but every instance
withholds the read from the seller it describes — Phase 1 already answers that thesis for the
stress dimension. This phase extends the same answer to the market-timing dimension, and adds the
one piece that research flagged as the actual product ask (rank #3): a seller on Reddit got a
hand-typed answer combining months of inventory, DOM, sale-to-list ratio, price-cut share, and a
sell-now-vs-wait spread calc. This phase ships that combination for real, on the page that already
exists — not a second competing page.

## Goal

Two additions to the **existing** `/r/back-on-market` page, reusing its existing resolve/render
pattern (no new route, no new address-entry widget):

1. **Market snapshot section** — months of supply, median DOM, sale-to-list ratio (from
   `housing-swfl`), price-cut share (from `listing-momentum-swfl`), for the same ZIP Phase 1 already
   resolves. Ships whenever a ZIP is resolved, same as Phase 1's Lane 1 — zero new data, zero new
   compute, purely an additional loader + additional cards.
2. **Sell now vs. wait** — a real dollar spread, gated behind an address (uses the existing
   comp-helper personalization path), with every input independently sourced. This is new compute
   logic — the one genuinely novel piece of this phase.

## Non-goals (YAGNI)

- **Not a new page, not a new address box.** Both additions render inside the existing
  `/r/back-on-market` page and reuse its existing address/ZIP resolution — extending Phase 1's
  display-state pattern (ZIP alone → snapshot only; address resolved → snapshot + personalized
  spread), not inventing a parallel one.
- **No default insurance estimate, ever.** Florida insurance pricing is the single worst place to
  guess in this product. If the user hasn't entered their own figure, the spread section states
  plainly that insurance isn't included rather than assuming a number.
- **No second-opinion CMA / lowball-offer check, no new-construction alert** — both surfaced by the
  same research pass, both genuinely buildable off the comp helper / permits pack respectively, but
  out of scope for this phase. Logged below as open ideas for a later phase, not designed here.
- **No price-band segmentation** — none of the source brains carry it; ZIP is still the finest
  grain for these signals, stated as itself, never framed as a limitation ("the moat is four-lane at
  any grain," not a ZIP-only product).

## Architecture

```
lib/back-on-market/load-zip.ts            ← Phase 1, unchanged (seller-stress read, reconciled 07/17)
lib/back-on-market/load-market-snapshot.ts ← NEW, this phase: housing-swfl + listing-momentum-swfl
                                               for the resolved ZIP, same fetch pattern as load-zip.ts
lib/back-on-market/spread-calc.ts          ← NEW, this phase: pure function, the dollar-spread math
app/r/back-on-market/page.tsx              ← extended: two new sections, each independently
                                               empty-tolerant (a brain with no data for the ZIP just
                                               omits its card, matching Phase 1's convention)
```

### `loadMarketSnapshot(zip)` — `lib/back-on-market/load-market-snapshot.ts`

Same shape as `loadBackOnMarketZip`: loads `housing-swfl` and `listing-momentum-swfl` via the
existing `loadParsedBrain` seam, pulls the ZIP's row from each brain's per-ZIP detail table, returns
a flat typed object (`monthsOfSupply`, `medianDom`, `avgSaleToList`, `priceReducedSharePct`, each
nullable, each with its own `asOf`/`source`). No ranking logic needed here — these are already
absolute, sourced figures, not a relative score like seller-stress. An absent ZIP in either table →
that half of the object is `null`, never a guess.

### `spread-calc.ts` — the one new compute module, full methodology

This is the piece that doesn't exist anywhere in the codebase today, and the one place a wrong
default becomes a real financial claim on someone's largest asset. Every input is one of:
sourced from our own data, live-fetched and cited, or required from the user — never invented.

**V0 — current value.** From the existing comp helper (`lib/assistant/comp-helper.ts`), once an
address resolves via the page's existing address flow. No address resolved → this whole section
doesn't render; the market-snapshot section (ZIP-level) still does.

**V_future — projected value at a stated horizon (6 or 12 months, user-selectable).**
`V0 × (1 + median_sale_price_yoy × months / 12)`, where `median_sale_price_yoy` is this ZIP's own
trailing year-over-year rate, already published in `housing-swfl` (verified live in the codebase
this session — it's a real per-ZIP field, not something that needs new ingest). Rendered tagged
`[INFERENCE]` per data-protocol rule 7: cites the audited YoY base value by name, and states the
falsifier in the copy itself — "this assumes the past year's price trend continues; a market shift
would change this." Never presented as a guarantee.

**Carrying cost for the wait period — three components, three different sourcing rules:**
- *Property tax:* live-fetched from the county property appraiser/tax collector at render time
  (named web source, cited, re-fetched — never hard-coded or memorized) as the starting figure; a
  "use my real bill" field lets the user override it with their own number. Exact county
  endpoint/field to confirm at implementation time (RULE 0.5 — probe before building, both LeePA and
  the Collier appraiser may already expose this per-parcel).
- *Insurance:* **required user-entered field, no default of any kind.** We do not have Florida
  OIR ZIP-level insurance data ingested (confirmed absent this session). A generic "typical FL
  insurance" figure would be an invented number in the one domain most likely to be materially
  wrong. Until the user enters their own premium, the spread section shows the property-tax and
  appreciation pieces plus a plain note that insurance isn't included yet.
- *Mortgage interest:* optional user-entered field (their real rate/balance). If omitted, this
  component is exactly $0 and the copy says so plainly — never a default "typical mortgage" figure,
  since we have zero visibility into anyone's actual loan.

**Spread = `(V_future − V0) − total_carrying_cost`**, always rendered as its line items (projected
gain, tax, insurance if provided, mortgage if provided), never as a bare final number with the
reasoning hidden — matches Phase 1's provenance-panel precedent (every figure carries its source).

## Data flow

```
existing /r/back-on-market resolve (Phase 1, unchanged)
  → zip resolved              → loadMarketSnapshot(zip)   → market snapshot cards render
  → address + subject resolved → comp helper V0            → spread-calc (if insurance provided)
                                                             → sell-now-vs-wait card renders
```

## Error / empty handling

Matches Phase 1's convention exactly: any brain with no row for the ZIP → that card is omitted, not
an error. No address → market snapshot only, no spread section at all (not a broken/partial spread
— the section simply doesn't appear). No insurance figure → spread section renders with an explicit
"insurance not included — add your premium to complete this" prompt, never a silent guess.

## Testing

- `load-market-snapshot.test.ts` — pulls the right ZIP row from each brain; a ZIP absent from either
  table degrades that half to `null`; a ZIP absent from both returns `null` object (page omits the
  section).
- `spread-calc.test.ts` — pure function, fixed inputs → fixed outputs; verifies the `[INFERENCE]`
  tag and falsifier string are always present when a projection renders; verifies insurance omission
  produces the explicit "not included" state rather than a zero-cost assumption; verifies mortgage
  omission is stated as $0, not silently dropped.
- No-invention lint extension: every numeric string touching the spread section either traces to a
  cited source, is marked `[INFERENCE]`, or is explicitly user-entered — a string-level assertion
  alongside the existing Phase 1 guard.
- Live-verify: a real Lee/Collier address on a prod build, confirm the market-snapshot cards match
  the live `housing-swfl`/`listing-momentum-swfl` values, and the spread section correctly withholds
  a dollar figure until insurance is entered.

## Later phases (research-sourced, logged not scoped)

From the same research pass, genuinely buildable off assets we already have, deliberately not
designed in this spec:
- **Second-opinion CMA / "is this offer fair" check** — same comp helper, distinct feature, its own
  brainstorm.
- **New-construction supply-pressure alert** — off the existing Lee + Collier permits pack.

## Open decisions (resolve at plan time)

- Exact county tax-source endpoint/field for the property-tax default (RULE 0.5 probe).
- Default projection horizon: 6mo, 12mo, or both shown side by side.
- Whether the spread section's "add your premium" prompt is inline or a small modal/expand.
