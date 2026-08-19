# 03 — Platform publish adapters + encrypted token store/refresh

| | |
|---|---|
| **Model** | **Sonnet** (vendor-doc-following; standard AES-GCM crypto — verify carefully) |
| **Stage** | 2 — after 01's `types.ts` + migration merge |
| **Runs in parallel with** | 05 |
| **CANNOT run with** | nothing directly — but **04 (cron) and the USER SIDE connect-flow both depend on this**; merge it before they build |
| **Blocked by** | 01 (`social_accounts` table + `SocialPublisher` type) |
| **Files (new)** | `lib/social/oauth-tokens.ts` (the seam), `lib/social/channels/{index,x,meta,linkedin,gbp}.ts` |

## Goal
Implement the one `SocialPublisher` seam for the four platforms, plus the encrypted token store + refresh the cron and the connect-flow share. **No paid middleman — direct APIs.** `lib/social/oauth-tokens.ts` is the seam the USER SIDE OAuth callback writes to.

## VENDOR-FIRST — verify before coding each adapter
Run / read `social-practices.json` (devdoc group) or live docs, and confirm per platform: post endpoint, required scopes, access-token TTL + refresh, app-review needed, rate limits, media-upload steps. Current knowledge to CONFIRM:
- **X:** OAuth2 PKCE, scopes `tweet.write users.read offline.access`; short access token + refresh; paid tier to post at volume; link-in-first-reply to dodge the link penalty.
- **LinkedIn:** Posts API; member (`w_member_social`) or org (`w_organization_social`, needs Community Management access); ~60-day token + ~1yr refresh.
- **Meta (Facebook + Instagram, one adapter):** post to a **Page** (personal publishing deprecated); IG needs a Business/Creator account linked to a Page + Content Publishing API; long-lived Page tokens; App Review for `pages_manage_posts`, `instagram_content_publish`, `business_management`.
- **Google Business Profile:** scope `business.manage`; location posts; quota approval.

## Build
1. **`lib/social/oauth-tokens.ts` (the seam):** `storeTokens(db, userId, platform, tokens, accountInfo)`, `retrieveTokens(db, userId, platform, platformAccountId)`, `refreshAccessToken(db, userId, platform, platformAccountId)`. Encrypt at rest: **AES-256-GCM (iv|tag|ciphertext, base64)** keyed by `SDG_CRYPTO_KEY` (new env). Never log plaintext. (No existing token-persistence precedent — the google-contacts flow does NOT store tokens — so this is the one genuinely new security primitive; keep it small and test it hard.)
2. **`lib/social/channels/index.ts`:** `postToChannel(input): { ok, platform_post_id? , error? }` dispatcher implementing `SocialPublisher`. One module per platform (`x.ts`, `meta.ts`, `linkedin.ts`, `gbp.ts`): refresh-if-expired → upload media → publish → return platform post id. Platform-specific `callPlatformRefresh()` per the TTLs above.
3. **DRY guard:** the worker (04) gates on `SOCIAL_PUBLISH_ENABLED` and only calls `postToChannel` when live. Add a defensive refuse-if-flag-false here too.

## Tests & gates
AES-GCM round-trip + tamper-rejection test · token-refresh-before-expiry test per platform (mock) · `postToChannel` contract test per platform (mock; no live spend in CI) · X link-in-first-reply test. real-tsc 0, eslint. **Spike acceptance:** one real post to each platform from our own connected account, by hand, logged — not automated spend.

## Done =
`postToChannel` posts to X / Meta(FB+IG) / LinkedIn / GBP given a resolved account; `oauth-tokens.ts` stores + refreshes encrypted tokens; the connect-flow (USER SIDE) and cron (04) can both call it.
