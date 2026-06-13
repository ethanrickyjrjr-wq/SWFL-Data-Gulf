# Task 04 — Stripe billing (the `/pricing` → paid path)

**Check key:** `email_stripe_billing` · **Order:** after go-live · **Risk:** medium (new vendor surface;
payment-critical).

## Goal

Make the `/pricing` CTA (now linked from the welcome footer) a real paid path: Stripe Checkout →
webhook → upgrade `email_usage.tier`, so the usage gate actually unlocks higher send limits.

## Grounded refs

- `docs/sql/20260612_email_product.sql:118-126` — `email_usage` (`tier` defaults `'free'`; `billing_period`).
- `lib/email/usage.ts` — `checkUsageLimit` reads tier/limit (free 50 / starter 500 / growth 2000 /
  pro 10000 per the Unit E plan); nothing writes `tier` today.
- `app/welcome/WelcomeChat.tsx:130` — footer "See pricing →" links `/pricing`.
- `docs/superpowers/specs/2026-06-11-conversion-funnel-design.md` — existing Stripe-checkout design to
  **reconcile, not re-invent**.
- No Stripe code exists yet (grep: doc/spec mentions only).

## Steps

1. **Vendor-First (RULE 1):** WebFetch the live Stripe Checkout + webhook + subscription docs
   in-session before coding. Confirm event shapes (`checkout.session.completed`,
   `customer.subscription.updated/deleted`).
2. Checkout route: create a Checkout Session for the chosen tier; map Stripe `customer` ↔ Supabase
   `user_id` (store `stripe_customer_id` on a profile/usage row).
3. Webhook route (`app/api/stripe/webhook`): verify signature; on subscription create/update/cancel,
   upsert `email_usage.tier` (and downgrade to `free` on cancel). Idempotent on event id.
4. `/pricing` page: real tier cards → Checkout; the `{error:'limit_reached', upgrade_url}` gate CTA
   resolves here (the engine plan shipped a static `/billing` stub — reconcile the two URLs).
5. Reconcile tiers: the spec's plan names ↔ the `email_usage.tier` enum used by `lib/email/usage.ts`.

## Done when

- Checkout completes → webhook flips `email_usage.tier` → `checkUsageLimit` reflects the new limit.
- Cancel → downgrade to `free`. Signature verified; replays idempotent.
- `/pricing` renders real tiers; the limit-reached CTA lands on a working upgrade page (no 404).

## Correctness flags

- **Vendor-First:** never trust memory of Stripe's event/SDK surface — WebFetch in-session.
- **Security:** verify the webhook signature; never trust client-reported tier.
- **Reconcile:** carry forward `2026-06-11-conversion-funnel-design.md`; don't fork a second billing design.

> Status lives in the `checks` ledger (`email_stripe_billing`), not in this file.
