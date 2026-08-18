# /go — payment/pricing handoff (Stripe)

**Status: DESIGNED, NOT BUILT.** Nothing in this doc is live. Written because the session that
produced it got cut short by scope — read this before re-deriving any of it.

## Decision (operator, 08/12/2026)

- Email-before-build on `/go` (separate handoff) means every `/go` builder already has a real
  Supabase account (OTP `signInWithOtp` creates one) before they ever hit a paywall. **So the
  payment mechanism is the account-based subscription-tier gate
  (`lib/billing/effective-tier.ts`), not the guest-cookie one-time-pay pattern
  (`lib/billing/report-unlock.ts`)** — the earlier recommendation before that gate was decided.
- Pricing, operator's numbers, to verify against nothing-invented-source before shipping:
  - **Free: 5 `/go` builds/month per account.**
  - **`go_basic`: $10/mo** — a bounded build count (NOT yet picked; propose ~50/mo, confirm with
    operator, don't invent).
  - **`go_unlimited`: $20/mo** — unlimited builds **and send unlocked**.
- These sit deliberately BELOW the main product's Starter ($19/mo) — `/go` is the separate,
  lighter, standalone product per `docs/standards/go-playbook.md`, not a discount tier on the main
  one.

## What already exists, verified live this session

- **`lib/billing/tiers.ts` is THE one price root** — comment at the top of the file: "No price
  literal may appear anywhere else." Any new `/go` tier goes in THIS file
  (`BILLING_TIERS` array or a new export next to `SELLER_REPORT`), never hardcoded in a route or
  component. Current live tiers: free 50 sends/mo (no card), Starter $19/mo·$190/yr (500 sends),
  Growth $79/mo·$790/yr (2000), Pro $149/mo·$1490/yr (10000). One-time `SELLER_REPORT` $19
  (`swfl_seller_report_once`).
- **Stripe is fully wired and live.** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISH_KEY`,
  `STRIPE_WEBHOOK_SECRET` confirmed in BOTH `gh secret list` (set 07/03/2026) and Vercel
  Production env (`npx vercel env ls production`, 41 days old — consistent, nothing stale).
  `app/api/stripe/webhook/route.ts` is documented as "the ONLY writer of billing tier state."
- **Reusable precedent #1 — subscription gate (this is the one to use):**
  `lib/billing/effective-tier.ts` (`resolveEffectiveTier`) is already live, gating paid CSV export
  in `app/api/export/[surface]/route.ts:36-46` — 402 + `upgrade_url:"/billing"` on a non-paid
  tier, explicit fail-open on a billing-read error (`degraded:true`) so an outage never blocks a
  paying customer. This is the pattern to extend for `/go`'s build-count check.
- **Reusable precedent #2 — guest one-time-pay (NOT chosen, but exists if the account
  requirement ever gets dropped):** `lib/billing/report-unlock.ts` + `app/api/stripe/
  report-checkout|report-unlock/route.ts` — Stripe Checkout `mode:"payment"`, no DB row, an
  HMAC-signed 30-day cookie is the only state. Powers the live $19 "should I sell" unlock today.
  Portable to `/go`'s planned standalone-repo carve-out if that direction changes.
- **"Stripe payment info updated today" — resolved, it was a red herring.** No Stripe secret
  changed today in `gh secret list` or Vercel env (both still dated 07/03 / weeks old). The actual
  event was `dd2ff062` (`fix(billing): stop retrying a genuinely deleted Stripe subscription
  forever`), from a stuck worktree `wf-78` that landed on `main` at 12:40 today
  (`84f3a247 log: wf-78 Stripe fix landed`). Unrelated to pricing — a webhook bug fix.

## Not yet decided / not yet built

1. The exact build count for `go_basic` ($10/mo tier) — operator said "X amount," never a number.
2. Where the `/go` build-count check actually goes. **It must NOT touch
   `app/api/projects/[id]/build/route.ts` directly if that route is shared by the rest of the
   free-forever email lab** — gating it there would silently paywall the main product, which
   violates the locked `lib/email/CLAUDE.md` rule ("Send is the paywall, builds are free ... no
   build gate, no Stripe on creation") for surfaces OTHER than `/go`. The exact POST route the
   email-lab grid's auto-build hits for a `/go`-originated build was **not fully traced this
   session** — see the companion handoff (`2026-08-12-go-launch-and-guards-handoff.md`) for why
   this matters and what's still open. A `/go`-only counter needs either a distinct tag on the
   build request (e.g. a `src=go` param threaded through `heroDestination` → the build call) or a
   separate `usage_events.action` value (e.g. `go_build`, distinct from the generic `build`) so
   counting `/go` usage can never accidentally start gating the rest of the lab.
3. Whether `go_unlimited`'s "send unlocked" grants the same send allowance as Starter (500/mo,
   reusing the existing `TIER_LIMITS` in `lib/email/usage.ts`) or something `/go`-specific —
   operator said "unlimited and sends" but the exact mechanics (does `/go` piggyback the main
   product's send metering, or get its own) were never nailed down.
4. No code has been written — no new Stripe product/price, no webhook handling for a `/go` tier,
   no route wiring the 402/upgrade flow into `OneClickHero.tsx`.

## Next step

Register via `node scripts/new-build.mjs go-paywall "/go build-count paywall"` before writing any
code (opens the tracking check in the same step). Confirm item 1 and item 3 above with the
operator — those are real open numbers, not something to invent. Item 2 is a code-tracing task,
not a decision — resolve it first, it gates where every other piece attaches.
