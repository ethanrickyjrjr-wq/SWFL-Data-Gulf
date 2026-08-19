# 07 — Go-live pre-post fixes (the two flags from Stage 3)

| | |
|---|---|
| **Model** | **Sonnet** (Fix A is a small wiring + Storage bucket; Fix B is verify + a U1 dependency) |
| **Stage** | Pre-go-live — OUR SIDE 01–06 are complete and on `origin/main`; this closes the two flags before the `scripts/social.mjs go-live` flip |
| **Runs in parallel with** | the USER SIDE (U1–U4); **coordinate on `lib/social/channels/x.ts`** (see Fix B — a concurrent session's v2 fix is in flight) |
| **Blocked by** | nothing — 04 (`scripts/social/run-schedules.mts`) + 02 (`renderSocialImage`) + 03 (`channels/x.ts`) are all on `origin/main` |
| **Files** | Fix A → NEW `lib/social/media-upload.ts`, EDIT `scripts/social/run-schedules.mts`, + a `social-media` public Storage bucket. Fix B → verify-only (+ confirm U1 OAuth scope + land the concurrent v2 fix) |

## Why this exists
Stage 3 shipped DRY-complete but left two go-live gaps. **DRY mode never posts, so neither blocks the push** — they block the live flip. Probe-corrected before writing (RULE 0.5).

---

## Fix A — render → public URL (FLAG 1, REAL code fix)
**The hole:** `scripts/social/run-schedules.mts:342` hardcodes `const mediaUrl: string | null = null;`. The worker renders the PNG **Buffer** (`renderSocialImage`, ~line 344) but never uploads it, so every post goes out image-less. Every adapter consumes a **URL** (`ComposedPost.media_url` / `media:[{url,ratio}]`, `lib/social/types.ts:101,159`), and **Meta + Instagram fetch the image server-side from a public URL** (IG content-publishing *requires* a publicly reachable `image_url`) — so a public URL is mandatory, not optional. `channels/x.ts:uploadMedia(imageUrl)` also fetches from a URL before upload.

**No existing Storage-upload helper in the repo** (grep found none) — write a small one.

### Build
1. **NEW `lib/social/media-upload.ts`:** `uploadSocialImage(supabase, buffer, key): Promise<string>` — `supabase.storage.from("social-media").upload(key, buffer, { contentType: "image/png", upsert: true })` → return the **public** URL (`getPublicUrl`). Key e.g. `\`${scheduleId}/${yyyy_mm_dd}.png\``. Idempotent (`upsert:true`) so a re-fire overwrites, never duplicates.
2. **Create the `social-media` Storage bucket, PUBLIC** (idempotent — console or SQL `insert into storage.buckets ... on conflict do nothing`, `public=true`). Public is required for Meta/IG server-side fetch; the burned-in watermark + no-fabrication tripwire already make the asset safe to expose.
3. **EDIT `run-schedules.mts`:** replace the `mediaUrl = null` block (lines ~338–364) with `mediaUrl = await uploadSocialImage(...)` after the render. **Keep the existing empty-tolerance:** render OR upload failure stays **non-fatal** — log and post without an image rather than skip the row (current behavior at line ~367).

### Done = DRY run validates
Run the worker in DRY (`DRY_RUN=true`, `SOCIAL_PUBLISH_ENABLED` unset/false) against a due schedule → it renders, uploads, and writes `social_posts.media_url` to a **200-fetchable public URL**, with `status='dry_run'` and **no** `postToChannel` call / no `platform_post_id`. Plus a unit test: upload helper round-trip (mock storage) + worker sets `media_url` non-null in DRY.

---

## Fix B — X v2 media + `media.write` scope (FLAG 2 — the v2 fix is IN FLIGHT, not on origin yet)
**Probe correction (important):** at OUR SIDE's pushed tip (`7ff205fe`), `channels/x.ts` still uses the **legacy v1.1** endpoint `https://upload.twitter.com/1.1/media/upload.json`, which was **sunset 2025-06-09** and now 410s on every image post. A concurrent session already wrote the fix — commit **`7b0f588e` "fix(social): X media upload v1.1 -> v2"** (moves to chunked `POST https://api.x.com/2/media/upload`, reads the id at `data.id`, requires `media.write` scope) — **but that commit is part of a separate batch HELD for diff-review and is NOT on `origin/main` yet.**

### Build (verify + land, not rewrite)
1. **Land the v2 fix:** once the concurrent session's batch lands on `origin/main`, confirm `7b0f588e`'s v2 chunked path is intact (endpoint, `data.id` read, `media_category=tweet_image`). Until then, **origin X image posts are broken** — but DRY never posts, so this is a go-live gate, not a prod break.
2. **U1 OAuth scope:** confirm U1's `oauth-config` requests the `media.write` scope for X (without it the v2 upload 401s even on a valid token). If U1 omits it, that is the real residual bug — fix it on the U1 side.
3. **Go-live spike (manual, logged):** one real image post per platform from our own connected account once `media.write` + Fix A + the v2 fix are all in — the Stage-3 "spike acceptance" criterion, deferred to go-live, no automated spend.

### Done =
v2 `x.ts` is on `origin/main`; U1 requests `media.write`; the go-live spike posts a real image on X (and the others) with no v1.1/410 error.

---

## Ledger
Tracked in `public.checks`: `social_media_storage_upload` (Fix A) + `social_x_media_v2_scope_verify` (Fix B). Close each on its DRY-run / verify evidence (RULE 2 — prod/runtime evidence, not "code looks right").
