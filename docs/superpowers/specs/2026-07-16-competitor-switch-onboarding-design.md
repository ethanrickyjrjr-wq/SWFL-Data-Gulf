# Competitor switch onboarding - Switch Pass + AI migration

**Date:** 2026-07-16 · **Status:** approved by operator (this session), pre-plan
**Research base:** `docs/handoff/2026-07-16-competitor-campaign-migration-onboarding-handoff.md`
(vendor/API surfaces, crawled 07/16/2026) + fresh pricing/incentive crawls this session (sources
at bottom). Per RULE 0.4, every vendor surface named here gets ONE fresh crawl4ai pass at the
moment its connector is actually built — this spec is the map, not the verification.

## Problem

Agents who already run campaigns on Mailchimp / Constant Contact / Follow Up Boss / Wise Agent /
kvCORE etc. face real switching friction: their list, their brand, their bio, and their campaign
shapes live in the old tool. Competitors attack this with **free human concierge migration**
(ActiveCampaign: free on any paid plan, up to 10 items guided; Omnisend: free, ~5 business days,
max 4 automations, full support gated to ~$400/mo plans; Kit: 5k+ subscribers; AWeber: paid
plans). Nobody in the space discounts — the switch currency is **free labor + free trial**.

Our labor is an API call. A full email build averages **$0.011** and a deliverable build
**$0.019** (production `api_usage_log`, 702 builds, $9.31 total — queried live 07/16/2026).
We can offer the flagship industry incentive at near-zero marginal cost, and deliver it in
minutes instead of 5 business days.

## Decisions locked this session (operator-reviewed with live evidence)

1. **Pricing stays as-is.** Free 50 sends/mo · Starter $19/500 · Growth $79/2k · Pro $149/10k
   (`lib/billing/tiers.ts`). Verdict from live crawls: Starter $19 sits at parity with Mailchimp
   Standard's $20 entry (which covers only 500 *stored* contacts, sends capped 12x contacts);
   Constant Contact Lite ~$12 scales by stored contacts with 10x send cap + overage fees; Wise
   Agent $49 flat; Follow Up Boss $69/user/mo. We are not underpriced at entry, and entry parity
   is a switching asset. **No percent discounts, ever, for switchers** — market evidence says
   winners give labor, not price cuts, and the operator does not want a cheap early anchor.
2. **Builds stay unlimited-free; sends stay the paywall.** Re-affirmed BY the operator after
   cost review (this is the 07/02 locked decision, revisited with numbers). Rationale: Reddit
   pain-point sweeps (rounds 1-5, `docs/steadyapi-research/`) show "correct building with real
   numbers" is the core differentiated value — so the build is the free demo; value is
   *realized* at send (agents' own trust line: AI drafts yes, autonomous outreach no), so send
   is the payment event. Canva (unlimited free designs, paywall = premium features + metered AI
   allowance) and Figma (free file caps + AI credits on every tier) both monetize *better/more
   AI*, not "you may not create."
3. **No visible build quota.** A quiet anti-abuse rate limit on free-tier builds only (worst-case
   abuser ≈ $10/mo at current costs). Tier differentiation is **pay-for-better** via the
   existing `lib/email/lab/capabilities.ts` dial (+ /insider, already planned as paid).
4. **Future-proofing = meter, not gate.** Per-user cost attribution on `api_usage_log` NOW, so
   a Canva/Figma-style "AI allowance" becomes a config flip later if per-build cost grows
   (operator expects richer multi-call builds; even 10x today = ~$0.15/build).

## Goal

A switcher can land, prove they run campaigns elsewhere, and within minutes have: their contacts
in `public.contacts`, their brand resolved, their bio seeded, **their own campaign rebuilt with
live SWFL data next to the original**, and 60 days of Starter running — without talking to a
human and without us discounting anything.

## What we're building

### 1. The offer — "Switch Pass"

Import a real list from another platform → **60 days of Starter free** (500 sends/mo +
paid-tier capabilities). Auto-activates on verified migration ("auto starts their clock" —
operator). Implementation shape: a timed tier override consulted by `resolveTier`
(`lib/email/usage.ts`) / the billing read path — NOT a Stripe coupon, NOT a price change.
Exact mechanism (override table vs `billing_subscriptions` row with `expires_at`) is a plan-time
decision. Copy anchor: *"Bring your whole list — you pay to send, never to store."* (True:
competitors price stored contacts; we don't.)

### 2. Proof lanes — what starts the clock

Only two, both verifiable server-side; a plain CSV upload does NOT start the clock (fabricable):

- **(a) Live extraction:** an OAuth/API pull from a competitor platform (connector lane below).
- **(b) Forward lane:** an email received from their current service (campaign email and/or the
  platform's own contact-export file emailed to us) — platform identified from headers/origin.

Minimum ~25 imported contacts either way (anti-gaming floor; exact number plan-time).

### 3. Forward lane (flagship, new)

One inbound address (e.g. `switch@`) on the **existing Resend Inbound webhook**
(`app/api/webhooks/resend/route.ts`) — a routing addition, not a new subsystem. Auto-detect on
arrival:

- **Campaign email** → sender domain feeds the existing Brandfetch/logo.dev brand lanes
  (07/10 outreach brand-injection research) for logo/colors/fonts into `user_brand_profiles`;
  footer "About" text → `agent_profile_facts` rows, `source: agent_upload`, `source_detail` =
  forwarded message id (NEVER written straight into the rendered bio — the 07/13 bio-interview
  gate stands); headers identify their current platform (routes them to the right connector or
  export walkthrough).
- **Contact-export attachment** (CSV/XLSX from Mailchimp/CC/FUB export) → parsed through the
  existing import pipeline into `public.contacts` via `upsertContacts`. Onboarding copy shows
  the 2-click export steps per platform ("Export your contacts in Mailchimp, email us the
  file"). **Unsubscribe/opt-out columns in the export MAP to our `unsubscribed` flag** — we
  honor prior opt-outs; this is the one real CAN-SPAM liability point in a migration (FTC
  compliance guide, verified 07/16: migrating your OWN list needs no new consent; liability for
  list quality stays with the sender).

### 4. The wow moment — rebuild their campaign

When a campaign email arrives on the forward lane, auto-build their campaign as one of ours —
their brand applied, live SWFL data filled via the existing builder — and present it
side-by-side with the original. One build ≈ $0.011. **Edit-before-send stays** (Reddit trust
line: drafting trusted, autonomous outreach not). This demo IS the incentive competitors can't
match: their equivalent is a human team, 5 business days, capped at 4 automations.

### 5. Connectors

**Phase 1:**
- **Mailchimp** — OAuth2 authorization-code, self-serve app registration, no granular scopes
  (whole-account grant — say so honestly in consent copy), access token never expires → store
  as a permanent credential. Verified 07/16.
- **Follow Up Boss** — dominant RE CRM; HTTP Basic with per-user API key the agent pastes.
  Settled research 07/05.

Both write ONLY through `upsertContacts` into `public.contacts` — no new store (07/05
unification is what makes this cheap).

**Parked (checks opened this session):** Wise Agent (cleanest OAuth + real scopes, but WE must
request a Client ID/Secret from them — fire the request early, it's a wait not a build),
Constant Contact (scoped OAuth + bulk contact export endpoint), Outlook/Graph, HubSpot
(bot-walled 07/05, re-crawl), kvCORE + BombBomb (not self-serve APIs — they land in the forward
lane meanwhile).

### 6. Instrumentation (ships with phase 1)

Per-user attribution on `api_usage_log` build rows, so free-tier AI spend per user is queryable
from day one. This is the pre-wired "AI allowance" dial — never a re-architecture later.
Plus the quiet free-tier build rate limit (decision 3).

## Explicitly parked (open `checks`, RULE 2.4 — not silent deferrals)

- **Head-to-head trial motion** (operator idea, this session): we supply 10-50 targeted email
  addresses so a prospect runs a campaign through us AGAINST their current tool while deciding —
  good click numbers, we win. **Blocked on its own research first:** address sourcing, consent
  model, deliverability/domain-reputation exposure, and how it squares with the FTC's
  purchased-list risk scenario. No build before that research lands.
- Wise Agent client-ID request; Constant Contact connector; Outlook connector; HubSpot
  re-crawl; realtor.com/Zillow agent-profile-page ToS research (bio auto-fill lane, unverified);
  AI-allowance activation criteria (what per-build cost / abuse signal flips the dial).

## Extensibility (operator: "leave room for changing or adding to")

Proof lanes and connectors are additive: the Switch Pass mechanic doesn't care which lane fed
it — a new connector or a new proof type is a new writer into the same `upsertContacts` +
pass-activation seam. The head-to-head motion, if research clears it, becomes a third proof
lane with its own activation rule.

## Sources (crawled/queried live, 07/16/2026)

- Mailchimp pricing: https://mailchimp.com/pricing/marketing/
- Constant Contact pricing: https://www.constantcontact.com/pricing
- Wise Agent pricing: https://wiseagent.com/pricing/
- Follow Up Boss pricing: https://www.followupboss.com/pricing
- Figma pricing (AI credits model): https://www.figma.com/pricing/
- Canva pricing (AI allowance model): https://www.canva.com/pricing/
- ESP migration-offer survey: https://www.emailtooltester.com/en/blog/esp-migration/
- Omnisend migration offer: https://www.omnisend.com/migrate-from-mailchimp/
- Build costs: production `api_usage_log` via lake MCP (email_build avg $0.011 n=525;
  deliverable_build avg $0.019 n=177)
- Anthropic rates as priced in our code: `refinery/agents/anthropic.mts` (crawl4ai-verified
  07/01/2026 against platform.claude.com)
- Vendor/API + CAN-SPAM detail: `docs/handoff/2026-07-16-competitor-campaign-migration-onboarding-handoff.md`
