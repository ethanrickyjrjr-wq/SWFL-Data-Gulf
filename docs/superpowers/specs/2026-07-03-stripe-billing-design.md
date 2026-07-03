# Stripe checkout + billing for send tiers

**Date:** 2026-07-03
**Status:** APPROVED by operator 07/03/2026 (annual = 2-months-free; keep-tier-through-dunning).
**Parent:** `2026-07-02-commercial-spine-design.md` (D1 pricing) — Lane A.
**Check:** `stripe_billing_live_verify` (closes on live evidence only: real checkout → webhook → tier flip → portal round-trip on production).
**Research basis:** docs.stripe.com crawled 07/03/2026 — build-subscriptions guide, checkout quickstart, customer-portal integration. Verified: hosted Checkout Session `mode=subscription`; prescribed webhook events `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`; portal sessions are short-lived URLs created server-side per authenticated customer; prices referenced by lookup keys.

## Problem

Builds are free and send is the paywall, but there is no register: `/billing` is a static "coming soon" page, `email_usage.tier` has no writer, and every tier resolves to free. All five commercial lanes dead-end here.

## Goal

A user on any tier can pay for Starter/Growth/Pro (monthly or annual), their tier flips automatically via webhook, the send quota enforces the new limit within the existing fail-open semantics, and they can self-serve upgrade/downgrade/cancel through Stripe's customer portal. Zero card UI on our site.

## Prices (final)

- Starter: $29/mo · $290/yr — 500 sends/mo
- Growth: $79/mo · $790/yr — 2,000 sends/mo
- Pro: $149/mo · $1,490/yr — 10,000 sends/mo
- Free stays 50 sends/mo, no card, no trial clock (the free tier IS the trial).
- Annual = 2 months free (16.7% off), badged "2 months free" in UI.
- Derivation: parent spec D1 (measured unit costs + crawled vendor prices; comps as ceiling).

## What we're building

### 1. Data — `billing_subscriptions` (new, tier source of truth)

Idempotent migration `migrations/20260703_billing_subscriptions.sql` (run via Bun.SQL, `.dlt/secrets.toml` creds, verify row count after):

- `user_id uuid PRIMARY KEY` (auth.users)
- `stripe_customer_id text UNIQUE NOT NULL`
- `stripe_subscription_id text`
- `tier text NOT NULL DEFAULT 'free'` (one of free/starter/growth/pro — same slugs as `TIER_LIMITS`)
- `status text NOT NULL DEFAULT 'none'` (Stripe subscription status verbatim: active, past_due, canceled, …)
- `current_period_end timestamptz`
- `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`

RLS enabled, no row policies (service-role only writer/reader — matches `api_usage_log` pattern). `GRANT SELECT, INSERT, UPDATE ON ... TO service_role; NOTIFY pgrst, 'reload schema';`

`email_usage` is untouched as a counter. Its `tier` column stops being read (KNOWN-DEBT note, removed later, not in this build).

### 2. One price root — `lib/billing/tiers.ts`

Exports `BILLING_TIERS`: slug, display name, monthly sends (mirrors `TIER_LIMITS` — a unit test asserts they never diverge), `priceMonthlyUsd`, `priceAnnualUsd`, `lookupKeyMonthly` (`swfl_<tier>_monthly`), `lookupKeyAnnual` (`swfl_<tier>_annual`). The /billing page reads it; Lane B's homepage pricing strip imports the SAME file. No price literal appears anywhere else.

### 3. Pure core — `lib/billing/stripe-sync.ts` (unit-tested, no I/O)

- `tierFromLookupKey(key)` → tier slug or null (unknown → null, never guess).
- `subscriptionRowFromEvent(input)` → the `billing_subscriptions` mutation for each handled event type, or null for ignored events. The pure core receives NORMALIZED input (event type + the fields it needs); the webhook adapter does any Stripe fetches first — in particular, `checkout.session.completed` does not carry the price lookup key, so the adapter retrieves the subscription (or expands line items) and passes the lookup key in. Policy encoded here:
  - `checkout.session.completed` → store customer id + subscription id; tier from the passed-in lookup key; status active.
  - `customer.subscription.updated` → tier from current price lookup key; status verbatim. **Keep-through-dunning:** `past_due` keeps the paid tier.
  - `customer.subscription.deleted` → tier free, status canceled.
  - `invoice.paid` / `invoice.payment_failed` → status + `current_period_end` only; tier unchanged.
- All tests in `lib/billing/stripe-sync.test.ts` (bun:test) with fixture events.

### 4. Adapters — three routes (nodejs runtime, mirror `app/api/webhooks/resend/route.ts` shape)

- `app/api/stripe/checkout/route.ts` POST `{tier, interval}` — authed Supabase user required; create-or-reuse Stripe customer (lookup by `billing_subscriptions.stripe_customer_id`, else `customers.create` with email + `metadata.user_id`); create Checkout Session: `mode=subscription`, price resolved by lookup key, `client_reference_id=user.id`, `success_url=/billing?status=success`, `cancel_url=/billing`; return `{url}`. Free tier and unknown tier/interval → 400.
- `app/api/stripe/portal/route.ts` POST — authed user; 404 if no `stripe_customer_id`; create `billing_portal.sessions` with `return_url=/billing`; return `{url}`.
- `app/api/stripe/webhook/route.ts` POST — raw body, `stripe.webhooks.constructEvent` signature verification (401 on failure, 500 if `STRIPE_WEBHOOK_SECRET` unset — same refuse-to-process pattern as the Resend route); pass event to pure core; apply the returned mutation via service-role upsert; always 200 on handled/ignored events so Stripe doesn't retry-storm. Idempotent by construction (upsert on user_id; replayed events converge).

User resolution in the webhook: `client_reference_id` on checkout events; `customer` id → `billing_subscriptions` row for subscription/invoice events. Unresolvable user → log + 200 (never invent a row).

### 5. Quota read — one change in `lib/email/usage.ts`

`checkUsageLimit` resolves tier from `billing_subscriptions` (single select by user_id) instead of `email_usage.tier`; missing row or any error → free (existing fail-open + never-throw semantics preserved; existing tests updated, new tests for the resolution path).

### 6. `/billing` page upgrade

Server component: current tier + live usage (`checkUsageLimit` shape: sent/limit meter), tier cards from `BILLING_TIERS` with monthly/annual toggle ("2 months free" badge), upgrade buttons → POST checkout → redirect; "Manage subscription" (visible when a customer id exists) → POST portal → redirect. Free card shows "current plan" when applicable. Keep the existing contact-us block for enterprise.

### 7. Setup script — `scripts/stripe/setup-products.mts`

Idempotent (find-by-lookup-key first, create only missing): 3 products, 6 prices with the lookup keys from `tiers.ts`. Runs against whatever mode `STRIPE_SECRET_KEY` is (test first). Prints a summary; `--dry-run` supported.

### 8. Secrets + config

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — operator creates the Stripe account + test keys; `gh secret set` first, Vercel env second (pre-push gate 3). Hosted Checkout means NO publishable key / Stripe.js needed. `stripe` npm package added (lockfile gate: `bun install` + commit `bun.lock` same push).

## Go-live checklist (blocks closing the check, not the build)

1. Test-mode e2e: checkout with test card → webhook flips tier → send quota reflects it → portal cancel → tier reverts at period end.
2. **Resend Free → Pro ($20/mo) upgrade BEFORE the first paid customer** (parent spec: Free's 100/day cap can't serve a Starter's 500/mo). Also resolve: broadcast sends bill under Resend transactional or marketing pricing.
3. Live keys swapped in Vercel prod env; webhook endpoint registered in Stripe Dashboard (live mode) with the prescribed event list.
4. Operator runs the live verify; closes `stripe_billing_live_verify` on evidence.

## Testing

- Pure core: full bun:test coverage of event→mutation mapping incl. keep-through-dunning, unknown lookup keys, unresolvable users.
- `tiers.ts` ↔ `TIER_LIMITS` mirror test.
- `usage.ts` tier-resolution tests (subscription present / absent / DB error → free).
- Routes: auth-required and signature-refusal paths unit-tested with mocked Stripe client; the full flow is the test-mode e2e above (Stripe test mode is free; the LIVE verify is operator-run per house rule).

## Non-goals

Coupons, seat pricing, metered/overage billing, Stripe Tax, time-boxed trials, plan-management UI beyond the portal handoff, dunning emails (Stripe's own dunning handles retries), removing `email_usage.tier` (later cleanup).
