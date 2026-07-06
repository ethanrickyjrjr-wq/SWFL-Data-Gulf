# Scheduled posting to a USER's own social accounts — research + options

**Status:** research only, nothing built. Written 07/06/2026 per operator request: "figure out how we can post
on users' accounts at scheduled times if they log into their socials on our site so we don't have to go
through an entire process with each social company until we have the means to do so."

All vendor facts below were pulled live via crawl4ai in this session (RULE 0.4) — not memory. Sources cited
inline.

---

## 0. What we already have built (RULE 0.5 — probe first)

This is much further along than "not started." `lib/social/` already has the full OAuth-connect +
encrypted-token-store + scheduled-publish pipeline:

- `lib/social/connect/oauth-config.ts` — per-platform OAuth authorize/token/PKCE config for
  `x | facebook | instagram | linkedin | google_business`. Verified against live vendor docs 2026-06-20
  (endpoints quoted in the file header).
- `lib/social/oauth-tokens.ts` — AES-256-GCM encrypted token store (`social_accounts` table), per-platform
  refresh logic, disconnect/revoke.
- `lib/social/channels/{meta,x,linkedin,gbp}.ts` — direct Graph/X/LinkedIn API adapters that actually post.
- `lib/social/publish.ts` — batches + publishes `ComposedSocialPost[]` through an injectable
  `SocialPublisher` (`lib/social/types.ts:205`, `post(input) => Promise<PublishResult>`).
- Everything is gated behind `SOCIAL_PUBLISH_ENABLED` (dry-run/no-op unless `"true"`) — a second, independent
  gate inside `channels/meta.ts` besides the caller check.

**The gap is not code.** It's that `pages_manage_posts` / `instagram_content_publish` don't work for a
real user (someone with no Role on our Meta app) until Meta's App Review approves them — see §1. TikTok
isn't in the `Platform` union at all yet — no adapter exists.

**The seam that makes everything below possible:** `SocialPublisher` is one function,
`post(input) => Promise<PublishResult>`. Swapping the *implementation* behind that interface (direct Graph
API vs. a third-party aggregator, §3) requires touching one adapter file, not the scheduler, the compose
step, or the OAuth-connect UI's user-facing flow.

---

## 1. Why direct-to-platform still isn't "flip a flag" (live-verified 07/06/2026)

### Meta (Facebook Pages + Instagram)
- **App Review is required** whenever the app will be used by anyone without a Role on the app or in the
  Business that owns it — i.e. every real customer. ("If your app will be used by anyone without a Role on
  the app... it must first undergo App Review... If your app will only be used by app users who have a role
  on the app itself, App Review is not required.") — [developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review](https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review)
- **Advanced Access requires Business Verification**, in force since Feb 1, 2023: "if your app requires
  advanced level access to permissions, you might need to complete Business Verification." Standard Access
  (role-holders only) does not need it; Advanced Access (real customers) does. —
  [developers.facebook.com/docs/development/release/business-verification](https://developers.facebook.com/docs/development/release/business-verification)
- `instagram_content_publish` and `pages_manage_posts` are both Advanced-Access permissions per
  [developers.facebook.com/docs/instagram-platform/content-publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing).
- **Net:** we can post today to *our own* Page/IG account (we have a Role on our own app). We cannot post
  to a customer's Page/IG until (a) Business Verification clears and (b) App Review approves those two
  permissions. This matches what the operator already knows — it confirms nothing has changed.

### TikTok
- Confirmed live, verbatim: **"All content posted by unaudited clients will be restricted to private
  viewing mode. Once you have successfully tested your integration, to lift the restrictions on content
  visibility, your API client must undergo an audit to verify compliance with our Terms of Service."** —
  [developers.tiktok.com/doc/content-posting-api-get-started](https://developers.tiktok.com/doc/content-posting-api-get-started/)
- So even after building the adapter (not yet started — `tiktok` isn't in our `Platform` union), every post
  we make on a customer's behalf would land as **private/self-only** until TikTok audits the app. Audit is
  a separate submission at `developers.tiktok.com/application/content-posting-api`.

### X (Twitter)
- **Knowledge update vs. what's in `oauth-tokens.ts`'s 2026-06-20 notes:** X API v2 has moved to
  **pay-per-usage, credit-based pricing** — "Purchase credits, deducted per request... Same resource
  requested twice in 24 hours is only charged once." This replaces the old flat monthly
  Free/Basic/Pro subscription framing. —
  [docs.x.com/x-api/getting-started/about-x-api](https://docs.x.com/x-api/getting-started/about-x-api)
- Posting itself doesn't require an App Review process like Meta/TikTok — our existing `x.ts`/OAuth config
  already posts today (gated only by `SOCIAL_PUBLISH_ENABLED` + credentials). The open question is
  **credit cost at scale**, not approval — worth a follow-up crawl4ai pass on `docs.x.com/x-api/getting-started/pricing`
  before turning X on for many users.

### LinkedIn
- `w_member_social` (member posting) works today via our existing OAuth flow — no review gate for
  posting-as-the-member. Org-level posting / broader Community Management API scopes require LinkedIn's
  Marketing Developer Platform partner program — a separate, heavier approval than Meta's or TikTok's.
  Not currently in our scope (we only request member-level `w_member_social`).

### Google Business Profile
- Already marked `parked` in our own `oauth-config.ts` — GBP API access is allowlist-gated by Google
  (0 QPM until approved). No change from prior research.

**Bottom line, updated:** Meta and TikTok are genuinely blocked on a vendor-side review process that only
the platform owner (Meta, TikTok) can grant, not something we can code around directly. X and LinkedIn
(member-level) already work today through our own adapters.

---

## 2. The actual workaround: platforms that already cleared the review, resold as an API

This is the direct answer to "so we don't have to go through an entire process with each social company
until we have the means to do so." Several vendors have already gone through Meta App Review + Business
Verification, TikTok's audit, and equivalent processes for LinkedIn/Pinterest/etc. under *their own*
developer app, and resell posting access as a unified API with **hosted OAuth** — meaning a user still
"connects their socials" through a consent screen, it's just the vendor's approved app requesting the
grant instead of ours. All four below carry Meta/TikTok/LinkedIn/X partner badges confirming the review
already happened on their side.

| Vendor | Model | Coverage | Pricing (live 07/06/2026) | Notes |
|---|---|---|---|---|
| **Ayrshare** | Hosted API, "Business"/"Launch" plans explicitly built for **posting on behalf of your users** | 13+ networks incl. Bluesky, FB, GBP, IG, LinkedIn, Pinterest, Reddit, Snapchat, Telegram, TikTok, X, YouTube | Premium $149/mo (1 profile) → Launch $299/mo (10 profiles, "automate posting for many users") → Business $599/mo (30 profiles, tiered to 300) → Enterprise custom. One "profile" = one end-customer regardless of how many networks they connect. | [ayrshare.com/pricing](https://www.ayrshare.com/pricing/). Has an explicit "User Integration" / "API Integration for Business" doc path for exactly our shape (SaaS embeds social as a feature for its own users). Scheduling, approval workflows, auto-repost, idempotency keys all built into the `/post` endpoint — [ayrshare.com/docs/apis/post/overview](https://www.ayrshare.com/docs/apis/post/overview). |
| **Zernio** (formerly getlate.dev, rebranded) | Hosted API + hosted OAuth, dev/AI-agent-first (has an MCP server) | 15 channels: X, Instagram, TikTok, WhatsApp, LinkedIn, Facebook, YouTube, Threads, Reddit, Pinterest, Bluesky, Telegram, Snapchat, Google Business, Discord — plus ad-network APIs (Meta/Google/LinkedIn/TikTok/Pinterest/X Ads) | "Start for Free" tier advertised; full pricing not pulled this pass — verify at zernio.com/pricing before committing. | [zernio.com](https://zernio.com/) (formerly getlate.dev). Displays **Meta Business Partner, TikTok Marketing Partner, LinkedIn Marketing Partner, X Official Partner, Pinterest Partner** badges — i.e. already vetted on all four platforms that gate us. Widest single-vendor coverage of the four. |
| **Unipile** | Pay-as-you-go per linked account, hosted or "custom-auth" OAuth | LinkedIn, Instagram, WhatsApp, Telegram live; **Facebook and X listed "Coming soon"** — i.e. does not yet cover two of our five platforms | $5.50/account/month (11–50 accounts tier), $49/mo minimum for up to 10 accounts, flat — no per-request fee | [unipile.com/pricing](https://www.unipile.com/pricing/). Cheapest per-account, but **insufficient today** — no Facebook Page or TikTok posting, so it can't replace Meta+TikTok, only supplement LinkedIn/Instagram. |
| **Postiz** | Open-source (AGPL-3.0), either self-host or their hosted `platform.postiz.com` | 14 platforms incl. Instagram, YouTube, LinkedIn, Reddit, TikTok, Facebook, Pinterest, Threads, X, Slack, Discord, Mastodon, Bluesky | Self-host = free (your own infra); hosted = commercial SaaS, pricing not pulled this pass | [github.com/gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) README, verbatim: **"Postiz hosted service uses official, platform-approved OAuth flows."** This phrasing calls out the *hosted* service specifically — self-hosting almost certainly still means registering your own developer app per platform (i.e. you inherit Meta/TikTok's review requirement yourself). Needs a direct doc check before assuming self-host bypasses anything — flagging as unverified, not confirmed. |

### The mechanism, precisely
None of these vendors have some special back door Meta or TikTok don't offer everyone — they did the same
App Review / Business Verification / audit we'd have to do, once, under their own developer app. When we
call their API, our user's OAuth consent grant lands on *their* app, which already has Advanced Access /
an approved TikTok audit. We get to post on the user's behalf as a side effect of being their customer,
today, without waiting on our own review.

---

## 3. How this would actually plug into what we've already built

Because `lib/social/types.ts:205` already defines the publish boundary as one function —
`SocialPublisher.post(input: PublishInput) => Promise<PublishResult>` — adding an aggregator is an
**additive adapter, not a rewrite**:

1. New file `lib/social/channels/ayrshare.ts` (or `zernio.ts`) implementing the same `PublishInput →
   PublishResult` shape by calling the vendor's `/post` endpoint instead of Graph/TikTok/X directly.
2. The OAuth-connect UI (`app/api/social/connect/[platform]/...`) would redirect into the vendor's hosted
   consent screen for the platforms we route through them, instead of our own `oauth-config.ts` dialog for
   those platforms specifically — the user-visible experience is unchanged ("connect your socials on our
   site"), only which app is asking for the grant changes.
3. `lib/social/oauth-tokens.ts`'s encrypted store either holds the vendor's own per-user profile key
   (Ayrshare: `profileKey`) instead of a platform access token, or is bypassed entirely if the vendor
   manages token custody server-side on our behalf — needs a design decision, not a research blocker.
4. Nothing in `publish.ts`, `compose.ts`, `persist-schedule.ts`, or the cron changes at all — they already
   only know about `SocialPublisher`.
5. **The exit ramp is free**: once Meta/TikTok approve our own app, we swap the adapter file back to the
   already-built direct one (`meta.ts`, and a new `tiktok.ts` once written) and stop paying the aggregator
   per-profile fee — zero changes anywhere else.

This is the "so we don't have to go through an entire process... until we have the means to do so" answer:
route Meta + TikTok (the two platforms actually gated on a review we don't have) through an aggregator now,
keep X + LinkedIn on our already-working direct adapters (no aggregator fee needed there), and file our own
Meta App Review + Business Verification + TikTok audit in parallel so we can drop the aggregator later.

---

## 4. Open questions before writing any code

1. **Which aggregator for the Meta+TikTok gap** — Ayrshare (mature, explicit "post on behalf of your
   users" plan tier, $299–599/mo) vs. Zernio (broader single-vendor coverage incl. ad APIs, pricing not yet
   pulled, newer/AI-agent-positioned). Recommend a short paid trial of both before committing — Ayrshare
   has a documented 28-day free trial; confirm Zernio's before assuming parity.
2. **Cost model** — Ayrshare bills per end-customer profile ($8.99–$0.99/profile/mo depending on volume),
   which needs to map onto our own pricing/tier model (does the aggregator fee ride inside a paid plan, or
   gate scheduled social posting behind a specific tier?).
3. **Token custody** — do we let the aggregator hold the actual platform tokens (simpler, but means our
   `social_accounts` encryption layer stores their profile key instead of the real token), or do we still
   want our own OAuth grant recorded for when we cut over to direct posting later?
4. **File our own Meta App Review + Business Verification now, regardless** — this is a multi-week vendor
   clock either way, and running it in parallel with the aggregator means the free direct-posting path
   lands as soon as it lands, with no code changes needed to switch (per §3.5).
5. **TikTok audit** — same parallel-track logic: submit at
   `developers.tiktok.com/application/content-posting-api` now so the unaudited/private-only restriction
   lifts on its own timeline while an aggregator (or manual posting) covers the gap meanwhile.

---

## 5. Sources (all fetched live via crawl4ai, 07/06/2026)

- Meta App Review requirement — https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review
- Meta Business Verification (Advanced Access gate, in force since 02/01/2023) — https://developers.facebook.com/docs/development/release/business-verification
- Instagram content-publishing permissions (Advanced Access) — https://developers.facebook.com/docs/instagram-platform/content-publishing
- TikTok Content Posting API — unaudited clients restricted to private visibility — https://developers.tiktok.com/doc/content-posting-api-get-started/
- X API v2 pay-per-usage/credit pricing — https://docs.x.com/x-api/getting-started/about-x-api
- Ayrshare pricing + "post on behalf of your users" — https://www.ayrshare.com/pricing/
- Ayrshare Post API (scheduling, approval workflow) — https://www.ayrshare.com/docs/apis/post/overview
- Zernio (formerly getlate.dev) — https://zernio.com/
- Unipile pricing + platform coverage — https://www.unipile.com/pricing/
- Postiz README (hosted vs. self-host OAuth compliance note) — https://github.com/gitroomhq/postiz-app

Our own code, read for §0 and §3: `lib/social/types.ts`, `lib/social/oauth-tokens.ts`,
`lib/social/connect/oauth-config.ts`, `lib/social/channels/meta.ts`, `lib/social/publish.ts`.
