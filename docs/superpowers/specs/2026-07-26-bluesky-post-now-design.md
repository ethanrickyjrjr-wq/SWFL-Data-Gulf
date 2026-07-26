# Post to Bluesky from the project Social tab

**Date:** 2026-07-26 · **Check:** `bluesky_post_now_live_verify` · **Approved:** operator, 07/26/2026 ("1 and write followup")

## Problem

Both social systems exist but neither can publish. The engine (`lib/social/`) is complete —
OAuth store, schedules, cron, 5 adapters — but every platform is blocked on an external gate
we never cleared (Meta app review + business verification, X paid tier, LinkedIn partner
approval, GBP allowlist). The lab side (project → Social tab) composes cards on the Konva
canvas but its output is display-only. Net: the operator cannot practice the compose→publish
loop anywhere.

On 07/26/2026 we claimed **@swfldatagulf.com** on Bluesky (DNS TXT verified) and proved
programmatic posting with an app password. Bluesky has **no external gate**: no app review,
no paid tier, credential already in `.env.local` (`BSKY_IDENTIFIER` / `BSKY_APP_PASSWORD`).

## Goal

The operator composes a card in the project Social tab, writes a caption, clicks **Post to
Bluesky**, and the post — image card + caption — is live on @swfldatagulf.com seconds later.
Tight practice loop; mistakes are deletable in the Bluesky app.

## What we're building (Approach 1 — sixth adapter in the engine, approved over a standalone
route [third social system, rejected] and full schedule wiring [serves cadence, not practice])

**1. Type-lift: `bluesky` joins the engine's `Platform` union** (`lib/social/types.ts`).
Atomic commit — the compiler enumerates every exhaustive switch/`Record` this ripples into
(`channels/index.ts` dispatch, `platformLabel`, schedule route, connect flow). Bluesky is
credential-based, NOT OAuth: every OAuth-driven surface (connect buttons, `socialOauthConfigured`)
must gate off `oauth-config` keys, never off the union, so no dead "Connect Bluesky" OAuth
button appears.

**2. Adapter `lib/social/channels/bluesky.ts`** — implements the existing per-platform
adapter shape. Three calls against `https://bsky.social`: `com.atproto.server.createSession`
(identifier + app password), `com.atproto.repo.uploadBlob` (the card PNG),
`com.atproto.repo.createRecord` with an `app.bsky.embed.images` embed (blob + required `alt`
+ `aspectRatio`). Session-per-post is acceptable at practice volume. Credential comes from
env, not `social_accounts` — the adapter takes it as a parameter so a per-user credential
row can slot in later without rework.

**Vendor contract (read from the live lexicons 07/26/2026 — the docs' prose "1,000,000
bytes" is stale):**
- image blob `maxSize` **2,000,000 bytes**, `accept: image/*` — `lexicons/app/bsky/embed/images.json` ("May be up to 2 MB, formerly limited to 1 MB")
- post text `maxGraphemes` **300**, `maxLength` 3,000 bytes — `lexicons/app/bsky/feed/post.json`
- `alt` is **required** on every image (empty string legal; we default it to the card headline)
- up to 4 images per post (v1 posts exactly 1)

**3. Route `app/api/social/post-now/route.ts`** — POST `{ caption, imageDataUrl, alt }`.
Gates, in order: (a) signed-in session matching the operator (reuse the repo's existing
operator-gate pattern — locate at implementation); (b) `BSKY_IDENTIFIER`/`BSKY_APP_PASSWORD`
present, else **503 "Bluesky not configured"** — never a silent no-op; (c) caption ≤300
graphemes via `Intl.Segmenter` (never `.length` — emoji); (d) decoded image ≤2,000,000 bytes;
(e) dedupe — reject if the same caption+image hash posted in the last 10 minutes. On pass:
adapter posts, then a `social_posts` row is written (platform `bluesky`,
`post_schedule_id: null`, idempotency key from the content hash) so history lives in the ONE
existing table. Deliberate: this route does NOT check `SOCIAL_PUBLISH_ENABLED` — that flag
guards the unattended cron lane; this lane's guard is the operator's explicit click + session.

**4. UI in `ProjectSocialClient` (Social tab)** — a caption field with a live grapheme
counter (300), an alt-text field pre-filled from the card headline, and a **Post to Bluesky**
button. Button disables in flight; success shows the live post URL
(`https://bsky.app/profile/swfldatagulf.com/post/<rkey>`); failure shows the adapter's error
verbatim. If the exported PNG exceeds the byte cap, the client re-encodes down a quality/scale
ladder before sending; the server cap stays the hard backstop. Styling follows the one-room
rule — existing Social-tab chrome, no new design language.

## Failure modes → guards (every break named, per the 07/20/2026 rule)

1. Union ripple breaks an exhaustive switch → compiler + existing `channels.test.ts`, shipped as one atomic commit.
2. Connect UI grows a dead "Connect Bluesky" OAuth button → platform pickers gate off `oauth-config` keys; test asserts bluesky absent from the OAuth-connect list.
3. Env credential missing in prod → 503 with "Bluesky not configured"; UI surfaces it; no silent success.
4. Image over 2,000,000 bytes → client re-encode ladder + server hard reject naming the actual byte count (lexicon-cited cap).
5. Caption over 300 graphemes → client counter + server `Intl.Segmenter` check; reject names the count.
6. Double-click double-post → button disabled in flight + server 10-minute content-hash dedupe.
7. Bad/revoked app password → `createSession` failure returns as `PublishResult.error`, shown verbatim in the UI.
8. Missing alt text (lexicon-required field) → default from card headline, editable; never omitted from the record.
9. Platform post succeeds but the `social_posts` insert fails → post-first ordering kept; insert failure logged loudly with the post URI so the row can be backfilled. Accepted v1 risk (practice lane, history-only table).
10. AI/garbage content reaching the live brand account → nothing posts except what the operator composed and clicked; zero automation touches this lane; the existing no-invention enforcement already gates card figures; the typed caption is operator-provided (a legitimate sourcing lane).

## Testing (TDD, mandatory)

Failing test first, named for the failure mode it targets: grapheme-limit reject (emoji case),
byte-cap reject, dedupe window, operator-gate 401, env-absent 503, adapter happy-path +
createSession-failure path with mocked `fetch`, bluesky-absent-from-OAuth-list. `bun test`
under `lib/social/`. Live proof: one real post through the UI closes
`bluesky_post_now_live_verify` (checks = prod evidence, not dev attestation).

## Out of scope (v1)

Scheduling/cron for Bluesky · per-user connected Bluesky accounts · Generate-Week→canvas seam
(separate known issue) · rich-text link facets in captions · multiple images · engagement
polling for Bluesky.
