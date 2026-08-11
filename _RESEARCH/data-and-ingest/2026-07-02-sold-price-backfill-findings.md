# Sold-price backfill — investigation findings (07/02/2026)

Status: **decision-pending, no code written.** This is an evidence pass validating a proposed
pipeline change before building. Twin rules honored: probed our code first (RULE 0.5), consulted
advisor before committing to an interpretation.

## The concern raised

When a for-sale listing leaves the active feed, the lifecycle pipeline fires one budget-sampled
paid `/property-tax-history` probe to resolve why it left (sold / withdrawn / still-holding). A
confirmed sale stamps a sold price + close date onto the transition record.

The gap: once a listing is stamped **sold with price 0**, it is terminal. The daily re-check loop
only re-probes rows still in `holding` — a price-less sold is never revisited. So the lake never
backfills the real closing price when county deed records catch up (deed recordings lag the close
by days to weeks). The only remaining path to the real number is a per-build paid call, forever,
for every deliverable touching the listing.

## Code path (confirmed by reading, not memory)

- `ingest/pipelines/listing_lifecycle/transitions.py` — `plan_off_market_checks` has exactly two
  probe populations: fresh departures, and prior `holding` rows aged into a 21–180 day window not
  probed in the last 30 days. **Sold rows are in neither** — terminal confirmed.
- `ingest/pipelines/listing_lifecycle/extract_api.py` — `classify_off_market` calls a priced
  in-window event a sale via `price is not None`. Because `0 is not None`, a **$0 event counts as a
  valid sale** and stamps `sold_price = 0`.
- `lib/listings/sold-price.ts` — consumption root already treats 0/null as missing, never displays
  $0 as a sale, has a per-build paid re-fetch lane (same endpoint), then falls back to disclosed
  list price. Confirms the concern's framing exactly.
- Blast radius contained: market-aggregate `median_sold_price` reads a different source
  (realtor.com housing details), NOT these rows. The $0 rows corrupt no aggregate — the cost is
  purely the repeated per-build paid call.

## What the live lake showed (our data, 07/02/2026)

Query: `data_lake.listing_transitions WHERE to_state = 'sold'`.

- Total sold transitions captured so far: **19**.
- **11 at price 0, 0 null, 8 with a real price.** Every row is under 3 days old (feature just went
  live).

Clean split:
- **8 priced rows:** close date lands 1–2 days BEFORE detection; prices 85–100% of list. Deed lag
  working correctly.
- **11 zero-price rows:** close date == detection day (no lag yet), and every one is ultra-high-end
  Naples / Port Royal, $2.3M–$16M, ZIPs 34102 / 34108 / 34145 / 34103 — where undisclosed sale
  prices are common.

## What we can / cannot conclude

Initial read (leaning "ghosts") was walked back — the data does not support it:
- Same-day price-0 fits the deed-lag theory AND the undisclosed theory equally; it proves neither.
- The luxury skew is largely a sampling artifact — the planner probes highest list price first, so
  the earliest captured sold set naturally skews luxury.
- Every row is younger than the deed-recording lag itself. Zero observed $0→priced recoveries and
  zero rows old enough to expect one. **Recovery rate is unmeasured, not zero.**

## The one real flaw in the proposed fix

Priority. The $0 rows carry the highest list prices; the planner sorts list-price descending. If
sold-backfill joins as a co-equal population, those luxury $0s claim the paid budget first every
run and crowd out fresh departures — the actual waste. Containment:
- Leftover budget only (after departures and holding-rechecks).
- Window on close date at ~45–60 days (reuse existing `RECENT_SALE_BUFFER_DAYS = 45`), NOT the
  180-day holding window. Deed prices post within weeks; still-$0 at 60 days is where the disclosed
  list price becomes the honest permanent answer.
- Keep the monthly `sold_check_at` interval. Tight window + leftover-priority + interval is the
  cost bound, holding regardless of ghost rate.
- Keep rows stamped sold-price-pending, NOT reverted to holding — "sold, price pending" is a truer
  signal than "left the market," and $0 is already handled safely everywhere it is read (no
  corruption to justify the downgrade).

## Open items before any code

1. DECISION (operator): build now with the containment above and let the recovery rate instrument
   itself over a few weeks, OR wait ~4 weeks and do one operator-gated paid re-probe of the 11
   known $0 property IDs to measure the real recovery rate first, then decide.
2. TIE-BREAKER CHECK: has the per-build lane in `lib/listings/sold-price.ts` ever actually
   recovered a real price for one of these? Same endpoint — if it also returns $0 for Port Royal
   closings, there is no number to backfill for that subset and the pipeline version is moot there.

Recovery rate is the single number that decides whether this deserves any paid calls. Do not build
on "it's recoverable"; do not kill on "it's a ghost." Measure, then decide.
