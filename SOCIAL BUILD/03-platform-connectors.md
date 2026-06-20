# 03 — Platform connectors (LinkedIn + Bluesky + X) + token store

| | |
|---|---|
| **Model** | **Sonnet** (vendor-doc-following; mechanical once the API contracts are verified) |
| **Stage** | 2 — after 01's `types.ts` + migration merge |
| **Runs in parallel with** | 04, 05 |
| **CANNOT run at same time as** | **06** (06 edits this adapter — 06 waits for 03 to merge) |
| **Blocked by** | 01 (`social_accounts` table + `PostToChannelInput`/`PostResult` types). The pure live-API **spike** can start immediately with an env token; token-store wiring needs 01. |
| **Files** | NEW: `lib/social/channels/{index,bluesky,x,linkedin}.ts`, `lib/social/oauth/**`, `app/api/social/connect/**` |

## Goal
Direct connectors to **our own** accounts for the three v1 platforms, behind the single `postToChannel` DI seam. Phase 2 swaps in `ayrshare.ts` here with no change upstream.

## Build
1. **VENDOR-FIRST — verify live before coding (spec §8):** X API current tier/cost + posting OAuth2 scopes (re-confirm the per-link tax → that's why we link in the first comment); LinkedIn Company Page posting product access + `w_organization_social` scope; Bluesky AT-Protocol post + image-blob upload + app-password auth.
2. **`postToChannel(input): PostResult`** dispatcher (`channels/index.ts`) implementing the `Deps` interface from `lib/social/types.ts`. One module per platform:
   - `bluesky.ts` — app-password auth, blob upload then post (trivial; zero review).
   - `x.ts` — OAuth2 post; **post the link as a first reply, not in the body** (link tax). Respect rate limits.
   - `linkedin.ts` — OAuth2 Company Page post (UGC/Posts API) with media upload.
3. **Token store:** read/write `social_accounts` (encrypted `access_token`/`refresh_token`, `token_expires_at`, refresh-on-expiry). `resolveAccount(scheduleRow)` → the token row.
4. **Connect flow:** `app/api/social/connect/**` OAuth callback to insert/refresh a `social_accounts` row (our own accounts now; per-client in Phase 2 — same code path).
5. **DRY mode:** you never run in dry mode — 01's runner gates publish and only calls `postToChannel` when `SOCIAL_PUBLISH_ENABLED=true`. Add a defensive guard anyway (refuse to post if the flag is false).

## Tests & gates
Per-connector contract tests against a sandbox/mock (no live spend in CI) · token refresh test · the "link goes to first comment on X" test. **Connector spike acceptance:** one real card posted to each of the three platforms manually (operator-run, dry flag off, our own accounts) to prove the contract — log it, don't automate the spend. real-tsc 0, eslint.

## Done =
`postToChannel` posts to LinkedIn/Bluesky/X given a resolved account + caption + media, with tokens stored/refreshed, and the live spike confirmed once by hand.
