# /go build paywall — 14-day trial + tiers (design)

**Date:** 2026-08-12 · **Check:** `go_paywall_live_verify` · **Status: DESIGNED, NOT BUILT.**

Supersedes the open items in `docs/handoff/2026-08-12-go-paywall-payment-handoff.md`. That doc's
pricing/Stripe inventory is still accurate and is not repeated here; its **item 2 was a wrong
assumption about which route builds a `/go` email**, and this spec replaces it with a trace.

---

## 0. Three things measured this session that change the design

**0a. The `/go` build route is `POST /api/email-lab/ai` — NOT `app/api/projects/[id]/build/route.ts`.**
Traced end to end: `OneClickHero.build()` (`components/go/OneClickHero.tsx:115`) →
`heroDestination` (`lib/campaigns.ts:124`, re-exported by `lib/lab-entry/destination.ts:15`) →
`/email-lab/grid?recipe=&rkey=&addr=` → the grid shell's arrival auto-build
(`components/email-lab/EmailLabGridShell.tsx:689`) → `POST /api/email-lab/ai`.
The handoff's warning still holds and now has a name: that route is shared by the **entire**
email lab, so gating it unconditionally would paywall the free-forever main product.

**0b. `/go` builds are unmetered today, for two independent reasons.** The arrival call at
`EmailLabGridShell.tsx:699` sends `build: true`, which makes `isAuthor` true at
`app/api/email-lab/ai/route.ts:171`; the metering block at line 204 is `if (!isAuthor)`, so the
author lane is never metered. And `meterUserId()` returns `null` for a signed-out caller anyway.
Either one alone would be enough. **This is the funnel that spends Apify money per build**
(`OPERATOR_APPROVED_PAID_RUN` is live in Vercel Production — launch handoff), with no counter
on it at all.

**0c. The trial must NOT be expressed as a tier string. Confirmed leak path, do not design around it.**
`switch_passes` looked like the perfect reuse — a timed tier grant, already live, already read.
It is a trap. `pickEffectiveTier` (`lib/billing/effective-tier.ts:24`) returns the pass's tier, and
two live consumers read it:

- `checkBuildAllowance` (`lib/email/build-usage.ts:138`) — `if (tier !== "free") return {allowed:true}`
  → **uncaps the main lab's daily builds.**
- `checkUsageLimit` (`lib/email/usage.ts:165` → `:184` `tierLimit(tier)`) → **`starter` = 500
  sends/month of the main product.**

So a 14-day "/go trial" written as a `switch_passes` row with `tier:'starter'` would silently hand
every `/go` tire-kicker the main product's paid send allowance. (Secondary: `switch_passes` has a
`UNIQUE (user_id)` index — one pass per user ever — so a trial would also burn the Switch Pass slot
of anyone who later migrates from Mailchimp.)

---

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **14-day free trial, no card up front.** Trial clock lives in OUR DB; Stripe is not touched until first payment. | A no-card Stripe trial is possible (§4) but needs a Checkout Session + a subscription object per email-verified tire-kicker, and would create a **second writer of billing state** beside the webhook that `app/api/CLAUDE.md` names as "the ONLY writer of billing tier state." |
| D2 | **Day 15 with no payment = hard zero builds** (operator, this session). The bar, suggestions and preview still work; only the build is gated, returning the upgrade screen. | Cleanest to build, strongest conversion pressure, and it stops a free account costing Apify money forever. |
| D3 | **`go_basic` $10/mo = 50 builds/month** (operator, this session). `go_unlimited` $20/mo = unlimited builds. | ~$0.04–0.05 typical Apify cost per build → healthy margin at $10, and 50 is more than a working agent uses. |
| D4 | **`/go` tiers go in `lib/billing/tiers.ts` as their own export, NOT in the `BILLING_TIERS` array.** | That array renders `/billing` AND the homepage pricing strip; `PaidTierSlug` is a closed union mirrored by `tiers.test.ts` against `TIER_LIMITS`. `SELLER_REPORT` is the existing precedent for a price that lives in the one price root without joining the subscription ladder. |
| D5 | **The trial bounds TIME; the throttle bounds SPEND. Both are required.** | A 14-day window with no volume ceiling on an Apify-bearing funnel is the $14.08-in-one-session shape (08/05/2026) with a clock on it. The throttle + global cap are the launch handoff's pieces 1 and 2 — this spec does not replace them. |
| D6 | **`src=go` is attribution, not a gate.** | It is client-supplied and spoofable. It is the right way to COUNT `/go` builds without touching the free lab; it is not what stops abuse. D5's guards are. |

## 2. Build order (the first item is a prerequisite, not a sibling)

**No account → no `user_id` → no trial clock and nothing to attach a paywall to.** The email gate
is piece 3 of the launch handoff and it gates this entire spec.

1. **Email-before-build gate** (launch handoff §3) — must land first.
2. **`src=go` marker threaded** — §3a.
3. **Trial clock + `/go` counter** — §3b, §3c.
4. **The gate itself + upgrade flow** — §3d.
5. **Stripe products/prices + webhook tier strings** — §4.

## 3. What we're building

### 3a. The `src=go` marker (one door, extended — never a parallel builder)

Optional `src` on `heroDestination`'s `opts` (`lib/campaigns.ts:124`) and on
`anonymousLabArrival` (`lib/lab-entry/destination.ts:100`), emitted as `&src=go`, read server-side
in `app/email-lab/grid/page.tsx` alongside `rkey`/`ref` and passed to the client as a prop.
`destination.static.test.ts` already fails the suite on a raw `/email-lab` nav string outside that
directory, so the marker cannot be minted anywhere else.

**A URL-only marker is NOT sufficient, and this is a design point rather than a test.** The shell
has THREE `/api/email-lab/ai` call sites — the arrival auto-build (`:689`), the user-driven
rebuild (`:586`), and the per-block rewrite (`:832`). If `src` rides only the arrival, a `/go`
visitor gets one counted build and then unlimited uncounted rebuilds from inside the lab, which is
§0b's failure wearing a different hat. Worse, the param does not survive a save/navigation into
`/project/[id]/email-lab` at all.

So the marker gets **two homes, matching what the codebase already does with attribution**:

1. **In the shell**, `src` is held once as a shell-level value (from the prop) and sent on all
   three call sites — not re-read from the URL per call.
2. **On the project row**, durably. A signed-in `/go` visitor with no project already lands in
   `AutoCreateProject`, so every `/go` build has a real `projects` row; `src` is stamped there on
   creation the same way `subject_address` already is. The route then trusts the **project row**,
   not the request body, whenever a `projectId` is present — which also blunts D6's spoofing
   surface, since the durable copy is server-written.

`refCode` in `grid/page.tsx:39` is the existing precedent for "attribution that has to ride the
anonymous funnel past the first screen" — follow it, don't invent a second scheme.

### 3b. `go_trials` — its own root, read only by the `/go` gate

```sql
CREATE TABLE public.go_trials (
  user_id       uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```
RLS on; owner SELECT; writes service-role only (same shape as `switch_passes`). Row is minted once,
on the first `/go` build after email verification. **No tier string anywhere in it** — §0c.

### 3c. `go_usage` — a `/go`-only monthly counter

Mirrors `email_usage`/`build_usage` exactly (`user_id`, `period` 'YYYY-MM' via the existing
`billingPeriod`, `build_count`, service-role only, `increment_go_build_count` RPC with the same
`REVOKE ... FROM PUBLIC, anon, authenticated` treatment). **Deliberately a separate table from
`build_usage`** so `/go` counting can never start gating the rest of the lab.

### 3d. `lib/billing/go-entitlement.ts` — ONE root for "may this `/go` build run?"

`resolveGoEntitlement(db, userId)` → `{ lane: "trial" | "basic" | "unlimited" | "expired",
allowed: boolean, used: number, limit: number | null, degraded: boolean }`, resolved in this order:

1. `billing_subscriptions.tier` is `go_basic`/`go_unlimited` → paid lane (50/mo or unlimited).
2. Else `go_trials.trial_ends_at > now()` → trial lane, unlimited within the window (D5's throttle
   is what bounds it).
3. Else no row → mint the trial row and allow.
4. Else → `expired`, `allowed:false`.

Called from `app/api/email-lab/ai/route.ts` **only when `body.src === "go"`**, on BOTH lanes
(author and non-author — §0b is why). On deny: `402` + `upgrade_url`, matching the live precedent
in `app/api/export/[surface]/route.ts:36-46`. **Fails OPEN on `degraded`**, same doctrine as
`checkBuildAllowance` and `checkUsageLimit`.

### 3e. One-line hardening of the existing lab gate (do this in the same PR)

`lib/email/build-usage.ts:138` — `if (tier !== "free")` becomes `if (PAID_TIERS.has(tier))`
(`PAID_TIERS` is already exported from `lib/billing/effective-tier.ts:21`). Today any non-free
string uncaps the lab; after §4 writes `go_basic` into `billing_subscriptions`, a $10 `/go`
customer would otherwise get the main lab uncapped for free. `starter`/`growth`/`pro` and the
Switch Pass are unaffected. **This is the single line that keeps the two products' gates from
leaking into each other.**

**This is a correction, not a new convention — the two gates are already inconsistent with each
other today.** The paid-CSV gate at `app/api/export/[surface]/route.ts:37` reads
`allowed = degraded || PAID_TIERS.has(tier)`; `checkBuildAllowance` reads `tier !== "free"` for the
same question. `PAID_TIERS.has()` is the one that stays correct when a tier string that is neither
free nor a main-product plan exists — which is precisely what `/go` introduces. Any future non-plan
tier string (a partner tier, a comp'd account) hits the same trap.

## 4. Stripe — verified live this session, and why it is LAST

Crawled `docs.stripe.com/billing/subscriptions/trials` + `/payments/checkout/free-trials` today:

- The new **Trial Offer API is PUBLIC PREVIEW**, requires API version `2026-03-25.preview` and
  `flexible` billing mode, and is **explicitly not supported in Checkout** — the docs say to use
  legacy free trials with `trial_end` there. We use Checkout. **Do not reach for the Trial Offer API.**
- The supported no-card shape is `subscription_data[trial_period_days]`, plus
  `payment_method_collection=if_required` and
  `subscription_data[trial_settings][end_behavior][missing_payment_method]` = `cancel` | `pause`.
  Kept on the record because it is the fallback if D1 is ever reversed — not what we are building.

Work when we get here: two Products + monthly Prices with lookup keys `swfl_go_basic_monthly` /
`swfl_go_unlimited_monthly`, added to `lib/billing/tiers.ts` as a `GO_TIERS` export (D4); the
webhook (`app/api/stripe/webhook/route.ts`) maps them to tier strings `go_basic` / `go_unlimited`;
`/go` gets its own minimal checkout entry rather than `/billing`.

## 5. Failure modes and the guard for each (RULE 3.5 — no design ships without this)

| # | Failure | Guard |
|---|---|---|
| F1 | The gate is added to `/api/email-lab/ai` unconditionally and **paywalls the whole free lab**. | The `src === "go"` branch is the only caller of `resolveGoEntitlement`. Red test: a POST with no `src` on an expired-trial user still builds. |
| F2 | The marker is only sent on the author lane, so a `/go` visitor reaches the non-author lane and **sails past the gate** (this is exactly §0b's shape, one layer up). | Test both lanes. The entitlement call sits above the `isAuthor` fork, not inside it. |
| F2b | The marker rides only the arrival URL, so **rebuilds inside the lab are uncounted** and the count dies on save/navigation. | §3a's two homes: one shell-level value across all three call sites, plus the stamp on the project row. Red test: a second build in the same session, and a build after reload with no `src` in the URL, both still count. |
| F3 | A `/go` tier string **leaks into the main product's allowances**. | §3e's `PAID_TIERS.has(tier)`, plus a test asserting `checkBuildAllowance` caps a `go_basic` user and `tierLimit("go_basic")` returns the free limit. |
| F4 | A trial row is minted for a **main-lab** user who never touched `/go`. | Minting happens only inside the `src === "go"` branch. Test: a lab build creates no `go_trials` row. |
| F5 | Billing outage **blocks every `/go` build**. | `degraded` → fail open, mirroring `checkBuildAllowance`/`checkUsageLimit`. Test forces the error path. |
| F6 | Trial expiry is computed client-side or off the browser clock, so a visitor **extends their own trial**. | `trial_ends_at` is compared server-side to `now()`; the client is never asked. |
| F7 | Someone **re-mints a trial** by deleting/re-creating an account, or a second row races in. | `user_id` is the PRIMARY KEY — a second insert is a `23505`, handled the way `activateSwitchPass:36` already handles it. Email-identity abuse is accepted for v1 and named here so it is a known limit, not a surprise. |
| F8 | The counter double-counts or misses under concurrent builds. | Same row-atomic `+=` RPC pattern as `increment_build_count`, with its documented v1 race note. |
| F9 | `src=go` is **spoofed** to dodge the lab's own free-tier daily cap, or a hostile caller floods the Apify lane. | D6: the marker was never the security boundary. The cid+ip_hash throttle and the global monthly Apify cap (launch handoff pieces 1–2) are, and they are prerequisites for going live, not follow-ups. |
| F10 | The gate "works" but the underlying `/go` flow has still never rendered a real email. | Open check `address_first_signedin_live_drive`. **Drive `/go` end-to-end in a browser BEFORE closing `go_paywall_live_verify`** — a compiling gate on a broken funnel is not a shipped paywall. |

## 6. Still open (nothing here is invented — these need the operator)

1. **Does `go_unlimited` unlock sending, and at what allowance?** The handoff records "unlimited and
   sends" but never the mechanics. `tierLimit("go_unlimited")` currently falls back to the free 50 —
   conservative and safe, so this is not urgent, but it is unresolved.
2. **Annual pricing for `/go`** — never discussed. Monthly only for v1.
