# Sold price pending - display split + leftover-budget backfill

**Date:** 2026-07-03 · Check: `sold_price_pending_backfill_live_verify`

## Problem

The off-market probe stamps a sold transition even when the vendor's tax history carries a
$0/absent price (deed not yet in the county record — days-to-weeks lag — or an undisclosed
land-trust sale that never posts one). That state was terminal: the daily re-check loop only
re-probed `holding` rows, so a price-less sold never updated. The only path to the real number
was a paid per-build lookup, forever. Live evidence 07/02/2026: 19 sold captured, 11 at price 0
(all <3 days old, luxury-skewed by the planner's list-price-desc sampling — recovery rate
UNMEASURED, not zero). Both parsers of `/property-tax-history` (Python `classify_off_market`,
TS `parseSoldEvent`) accept a $0 event, and the TS per-build lane persists/logs nothing, so no
evidence trail existed either.

## Goal

"Sold, price pending" becomes a true end-to-end category: confirmed sold → price pending →
price recorded — with the paid-call budget contained so backfill can never crowd out fresh
sold detection, and the $0→priced recovery rate instrumenting itself from cron logs.

## What we're building

Approach B (display split + pipeline backfill), containment per the 07/02 investigation:

1. **Display root** — `lib/listings/sold-price.ts` gains kind `sold_price_pending`: fires when a
   confirmed sold date is held but no positive price resolves (lake, then the live lookup).
   Code-owned copy: "Sold — confirmed MM/DD/YYYY. Closing price not yet in the county record;
   last listed at $X." Date binds sold_date; value is the LIST price, disclosed. No production
   consumers existed at build time (root only had its test), so additive and zero-risk.
2. **Stats view** — `listing_transitions_recent_zip_stats` + `sales_price_pending_30d/90d`
   (sold with `sold_price IS NULL OR <= 0`), APPENDED columns (CREATE OR REPLACE). `sales_*`
   stays the total; consumers subtract. Applied + verified 07/02/2026: 11 sales / 3 pending in
   the 90d digest scope, matches raw-table cross-check.
3. **Email digest** — `digestValue` splits: "9 sales (7 recorded, 2 awaiting county record)";
   all-pending and singular cases handled; pending clamped to sales.
4. **Backfill (leftover budget ONLY)** — new pure `plan_price_rechecks` /
   `apply_price_recheck_results` (transitions.py) + `load_price_pending_solds` /
   `update_sold_price` (distill.py) + a post-county-loop pass in pipeline.py. Candidates: sold
   transitions with no positive price, close anchor (sold_date, else `at`) within 60 days,
   not probed in 30 (same `sold_check_at` stamp — no new column). Departures + holding
   re-checks always eat the cap first (backfill runs AFTER the loop so leftover is global).
   A recovered positive price UPDATEs the existing sold transition in place (guarded: only
   price-less rows, only positive prices — a double-fire can't clobber a recorded price).
   NEVER demotes a sold. Past 60 days the pending line stands permanently (land-trust case).
   Gated: live api runs only — never dry-run, never catchup/seed.
5. **Instrumentation** — `[backfill] price-pending=N eligible=N probed=N recovered=N
   still_pending=N` in cron output; recovered vs still_pending over the coming weeks IS the
   measured recovery rate (replaces a separate operator-gated probe of the 11 known $0 rows —
   the loop probes exactly those once they age past 30 days).

Deliberately out (fast follows, not this build): assistant/zip-report surfaces (ask-first
answer path); TS per-build lane writing a recovered price back to the lake (new web→lake write
surface — decide separately).

## Honesty rails

Counts stay floor counts (budget-sampled, highest list first — never "all sales in the ZIP");
no new vocab slug (no brain output changes; Gates 2/5 untouched); classifier unchanged.
