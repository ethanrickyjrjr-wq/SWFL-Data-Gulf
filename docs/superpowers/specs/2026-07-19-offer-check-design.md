# Offer Check — a live offer checked against recorded sales, $19 same-rails unlock

**Date:** 2026-07-19 · **Route:** `/r/offer-check` · **Check:** `offer_check_live_verify`

## Problem

The 07/17 landscape research (168 ranked items) found zero consumer products that check "is this
offer fair" — sellers holding live cash offers get free-forum shrugs while investor-facing content
teaches paying 60–70% of value. The nearest engine we hold is the assistant's comp lane
(`lib/assistant/comp-helper.ts`): already MLS-scrubbed, footprint-gated (Lee/Collier), and
sold-vs-estimate honest — pointed at chat, not at the seller's decision moment.

## Goal

A seller pastes their address and the offer in hand; we show exactly where that offer lands
against recent recorded sales of comparable homes — paid on the same $19 pass as the Should I
Sell spread, with metered vendor calls spent ONLY after payment.

## What we're building

- **Free (zero metered calls):** area read for the parsed ZIP off published brains via
  `loadMarketSnapshot` (months of supply, DOM, sale-to-list, cut share — each half its own
  source + as-of, nulls omitted).
- **Paid (behind `verifyUnlock`, ≤4 metered calls per run):** `compsForAddress(address)` live →
  `buildOfferPosition` (`lib/offer-check/verdict.ts`, pure + tested): strict below/above counts
  vs recorded sales, sold band (min/median/max), $/sqft band over sold comps carrying sqft,
  offer $/sqft only when the OWNER supplies their sqft (lane-4 figure, labeled as theirs).
- **One $19 pass:** same `SELLER_REPORT` Stripe price + `sis_unlock` cookie as the spread —
  `kind` metadata ("offer_check" | "seller_report") picks the checkout cancel/return surface
  only. No new price object, no webhook change.

## Honesty invariants

1. Recorded sales and AVM estimates are never blended into one band; each renders labeled.
2. No sold comps → no position verdict (estimates render as context with an explicit caveat).
3. Every relation is computed in code; no model sees the comp array.
4. Metered lookup fires ONLY after payment (real spend on final serve only).
5. Not-an-appraisal disclaimer + domain-level citations (SWFL Data Gulf · realtor.com).

## Files

`app/r/offer-check/page.tsx` · `components/offer-check/OfferUnlock.tsx` ·
`lib/offer-check/verdict.ts(+test)` · `app/api/stripe/report-{checkout,unlock}/route.ts` (kind
passthrough) · hub row `app/r/page.tsx` · sitemap entry.
