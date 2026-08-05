## Enforced
- Claim: the vacant lot never reaches the chart, the table, or the math (comp must have beds AND sqft)
  Test: lib/deliverable/recipes/market-comps.test.ts > "the vacant lot never reaches the chart, the table, or the math"
- Claim: a month-grain lake sale prints its MONTH, never a fabricated day-of-month
  Test: lib/deliverable/recipes/market-comps.test.ts > "a month-grain lake sale never renders a fabricated day"
- Claim: a day-grain vendor sale still prints its exact date (the fix above did not flatten everything)
  Test: lib/deliverable/recipes/market-comps.test.ts > "a day-grain vendor sale still renders its exact date"
- Claim: when the extreme tier fires, the position is stated ONCE — compareToSet does not restate it,
  and the drop is direction-symmetric (keyed on isExtreme alone)
  Test: lib/deliverable/recipes/market-comps.test.ts > "the extreme tier states the position ONCE — compareToSet does not restate it"

## Unenforced
- market-comps is deliberately given NO community facts (its location ban is absolute, not
  fact-gated) — open design question tracked separately, check `market_comps_community_deliberately_unwired`.
- The CTA and hero photo fall through to our own homepage: the recipe does not use
  `listingButtonUrl` and pays for an Apify area query that by vendor design cannot return the
  subject's own record. Named in playbook §2.3.5, check `market_comps_cta_points_at_homepage`.
- NO CHART is asserted only by `scripts/email/render-market-comps.mts` (exactly one image block when
  a subject photo exists), not by a unit test — the acceptance run is the guard. Proven red
  08/05/2026 by pushing a chart block into `compsMiddle`: exit 1.
- PAIRED WITH THE ROW RENDERER, and a future session will break this first: `priceKindPhrase`,
  `sourcedDates` and `sourcedDigits` ALL carry the `dateGrain` rule now. `mdy` survives at exactly
  one call site (`sourcedDates`) and is correct there ONLY because it is guarded by a day-grain
  check. Change one, change all three.
