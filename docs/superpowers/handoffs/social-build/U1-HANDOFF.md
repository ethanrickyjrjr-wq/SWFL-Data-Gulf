# U1 — HANDOFF (probe-verified grounding, 2026-06-20)

**Read `U1-connect-your-socials-oauth.md` for the full assignment.** This file is the *probe-first* supplement: what I verified against the live code/docs so the next builder doesn't re-derive it — and the one drift that will bite if missed. U1 is **unblocked and ready**.

## ✅ The one thing that WILL break the build if missed
**`revokeToken` does NOT exist.** `U1` (and the spec §4) call `revokeToken(db, userId, platform[, platformAccountId])` as a build-03 seam — but the shipped `lib/social/oauth-tokens.ts` exports only `storeTokens` / `retrieveTokens` / `refreshAccessToken` / `getValidAccessToken`. **U1 must ADD `revokeToken` to `oauth-tokens.ts`** (it's the right home — never write `social_accounts` columns from the route). Minimal correct impl: look up the row, `UPDATE social_accounts SET status='revoked'` (+ best-effort platform-side token revocation where one exists — X `POST https://api.twitter.com/2/oauth2/revoke`, Google `https://oauth2.googleapis.com/revoke`; non-fatal if it fails). Do NOT touch the existing exports (atomic, additive).

## Verified precedent (clone this — symbols confirmed, no line numbers)
- **`lib/email/google-oauth.ts`**: `buildGoogleAuthUrl({state, redirectUri})` (scopes joined with `" "` via URLSearchParams), `exchangeCodeForToken({code, redirectUri})` (POST form, returns access_token), `siteBaseUrl(reqUrl?)`, `googleRedirectUri(reqUrl?)`, `googleOauthConfigured()` (graceful degrade when creds absent).
- **`app/api/email/contacts/google/start/route.ts`**: `runtime="nodejs"`, `dynamic="force-dynamic"`; per-IP rate-limit via `@/lib/rate-limit` (`checkRateLimit`, `clientIpFromHeaders`, `rateLimitHeaders`); auth via `createClient(await cookies())` from `@/utils/supabase/server` + `supabase.auth.getUser()`; `state = randomBytes(16).toString("hex")`; cookie set `{ httpOnly:true, secure: NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:600 }`, value `${state}.${flag}`; `NextResponse.redirect(buildAuthUrl(...))`. The cookie const is exported (`OAUTH_STATE_COOKIE`).
- **`app/api/email/contacts/google/callback/route.ts`**: `fail(reason)` + `finish(res)` helpers; `finish` **deletes the cookie on every outcome**; CSRF = reject unless echoed `state` === cookie state; reads the cookie via `cookieStore.get(NAME)?.value.split(".")`.
- **For U1's `[platform]` routes:** carry `${state}` (+ the PKCE `code_verifier` for X) in the `social_oauth` cookie. PKCE: `code_challenge = base64url(sha256(verifier))`, method `S256`, via node `crypto` (no new dep).

## Verified build-03 seam shapes (`lib/social/oauth-tokens.ts`)
- `storeTokens(db, userId, platform, tokens: TokenBundle, accountInfo: AccountInfo): Promise<void>` — upserts encrypted (AES-256-GCM, `SDG_CRYPTO_KEY`), `onConflict: "user_id,platform,platform_account_id"`.
- **`TokenBundle` = `{ access_token, refresh_token: string|null, token_type: string|null, expires_at: number|null, scopes: string[] }`** — ⚠ `expires_at` is **Unix epoch SECONDS** (store converts `*1000` to ISO). U1's `exchangeCode` returns `expires_in` (seconds-from-now) → convert to epoch: `Math.floor(Date.now()/1000) + expires_in`.
- **`AccountInfo` = `{ account_name: string|null, platform_account_id: string }`** — capture these in `exchangeCode` (X: `users/me` for handle+id; Meta: derive the **Page id + name** after the long-lived exchange; LinkedIn: userinfo `sub` + name).
- `Platform = 'x'|'facebook'|'instagram'|'linkedin'|'google_business'` (`lib/social/types.ts`).

## Schema state (already on `main`)
- `social_accounts` exists (cols: `platform, platform_account_id, access_token, refresh_token, token_type, expires_at, scopes[], account_name, status`; RLS `auth.uid()=user_id`).
- `social_schedules` now HAS **`project_id` (text)** + **`frozen_post` (jsonb)** — added 2026-06-20 (migration `20260620_social_user_side_cols.sql`). Disconnect's auto-pause (`UPDATE social_schedules SET status='paused' WHERE user_id=$uid AND platform=$p AND status='active'`) works as specced.

## Vendor-First (re-verify each branch live before coding — these are hypotheses)
- **X:** `media.write` scope is **REQUIRED** (verified in-session; the v2 media upload 401s without it) — include it alongside `tweet.write tweet.read users.read offline.access`. authorize `https://x.com/i/oauth2/authorize`, token `https://api.x.com/2/oauth2/token` (refresh in oauth-tokens.ts uses `api.twitter.com/2/oauth2/token` — both domains valid). PKCE mandatory; refresh token rotates → persist the new one (storeTokens already handles it).
- **Meta / LinkedIn / GBP:** see `U1` §VENDOR-FIRST + spec §4; confidential code flow for all three; GBP **parked** (allowlist-gated, 0 QPM — build the card + flow, surface "pending Google approval", don't block launch).

## Plan corrections (vs the README/build files)
- **U4 is NOT blocked** — the FINAL BOSS Piece 1 workspace shell (`app/project/[id]/workspace/*`) is already on `main`. Buildable order: **U1 ‖ U2 → U3 → U4**.
- The X media + link-handling backend issues are **already fixed on `main`** (X v1.1→v2; link-in-reply dodge removed per operator decree — caption posts verbatim, so U2's composer owns link placement).

## Gates (U1 done-bar)
real-tsc 0 · eslint clean · CSRF state-mismatch reject (no token exchange) · X PKCE S256 round-trip · oauth-config builds the right authorize URL + scope set per platform · callback calls `storeTokens` (mock 03) · disconnect calls the new `revokeToken` + pauses only that platform's active schedules · DRY (no live post). Stage only U1's own files (explicit paths); commit, do **not** auto-push.
