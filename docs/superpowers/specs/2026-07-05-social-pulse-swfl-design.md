# SWFL Social Pulse — public engagement digest + AI tag steering

**Date:** 2026-07-05
**Check:** `social_pulse_swfl_live_verify`
**Vendor contract:** `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` (crawled live 07/05/2026)
**Operator decisions this brainstorm:** Approach 1 approved; daily scans for the first 3 weeks; AI tag-steering wiring is a first-class requirement; "importance without selling" UX delegated to design (receipts-in-place, below).

## Problem

Users build social cards and weekly calendars in the grid lab with no evidence about what actually earns engagement in SWFL real-estate social right now. Day themes are static; hashtag choices are guesses. Meanwhile the public side of Instagram — what posts in our market are winning, at what engagement, in which formats, under which tags — is one authenticated GET away and nobody in this niche is showing it.

## Goal

1. **Traction:** a public, shareable weekly digest — "what's actually working in SWFL real-estate social" — that costs nothing to view and earns sign-ups.
2. **Product:** every AI social build (Generate-Week, canvas fill, composer) chooses hashtags and content angles from live, cited engagement evidence instead of priors.
3. **Ladder:** anonymous → email sign-up → paid, with depth and automation as the levers (never a build gate; SEND stays the paywall).

## What we're building

### 1. Scan pipeline (ingest, app-side)

- **Source:** SteadyAPI Instagram Social — `GET /v1/instagram/search` (posts by term, weight 2) + `GET /v1/instagram/hashtags/search` (tag reach, weight 1). Contract facts (pagination token 15-min expiry, 20 req/15 min session cap, expiring CDN URLs) per the vendor note.
- **Term set v1:** fixed config `lib/social-pulse/terms.ts` (~12–16 slots): area tags (`#swflrealestate`, `#capecoralrealestate`, `#naplesrealestate`, `#fortmyersrealestate`, `#capecoral`, `#naplesfl`, `#fortmyers`, `#puntagorda`, `#bonitasprings`, `#lehighacres`, `#swfl`, `#floridarealestate`) + 2–4 term searches ("cape coral real estate", "naples florida homes"). Each term carries an `area` bucket (Cape Coral / Naples / Fort Myers / Punta Gorda–Charlotte / Bonita–Estero / Lehigh / SWFL-wide).
- **Cadence:** GHA cron. **Bootstrap: daily for the first 3 weeks** (history fast → week-over-week deltas exist at launch). **Steady state: 2×/week (Mon/Thu).** The flip is a cron-schedule edit, dated in the workflow file comment. `--dry-run` ships in the same PR (pipeline-freshness rule).
- **Budget:** ~16 terms × ≤2 pages × weight 2 + 16 reach lookups ≈ **~80 weighted req/run** → ~1,700 in the 3-week bootstrap, ~640/month steady. Rides the existing SteadyAPI subscription; no plan change required at this scale (pricing verified 07/05/2026: $14.95/$39.95/$89.95/$299.95 tiers). Re-check quota headroom in the dashboard before first cron (quota-per-API mapping was ambiguous on the pricing page — do not guess it).
- **Storage (Supabase `public.*`, product cache — NOT `data_lake.*`):**
  - `social_pulse_scans` — one row per run: id, ran_at, terms_scanned, requests_spent, status.
  - `social_pulse_posts` — snapshot per scan: PK `(post_id, scan_id)`; shortcode, permalink, username, is_verified, taken_at, media_type, product_type, caption (text only), like_count, comment_count, view_count, reshare_count, matched_term, area. Snapshots (not upserts) so a post's engagement growth curve is queryable.
  - `social_pulse_hashtags` — PK `(name, scan_id)`; media_count, formatted_media_count.
  - `social_pulse_digest` — one row per ISO week: computed digest JSON + narrative + built_at.
  - **No media rehosting.** We store permalinks, captions, and counts. IG CDN URLs expire and rehosting their media is a copyright risk we don't need; the public page links out.
  - Lake graduation path (explicitly deferred): if a brain should ever speak this data, that is a Tier-2 ingest + consuming `PackDefinition` in the same PR per the brain-first gate. v1 stays app-side product cache and does not touch the lake.
- **Client:** one `lib/social-pulse/steady-client.ts` mirroring the empty-tolerant posture of `ingest/pipelines/*/steady_client.py` — 401/403/404/422/429 mapped, null-safe, a gated/quiet platform yields empty arrays, never invented rows. Vendor name never appears in any user-facing string; the product-facing source label is **"live Instagram scan (MM/DD/YYYY)"**.

### 2. Digest builder (deterministic math, narrative prose)

Runs after each scan; publishes weekly (latest scan of the ISO week wins; mid-week scans refresh it).

Computed **in code** (no LLM math):
- Top N posts per area bucket by like_count (with comment_count, format, permalink).
- Format split: share of top-quartile posts by media_type/product_type (image vs reels/clips vs carousel) + median likes per format.
- Hashtag reach table (media_count per tag, week-over-week delta once history exists).
- Engagement benchmarks: median + top-quartile like_count across scanned posts, per area and SWFL-wide.
- Topic buckets v1: keyword rules over captions (waterfront/canal, new construction, open house, market stats, lifestyle/community, listing tour). Rules live in `lib/social-pulse/topics.ts`, unit-tested.

LLM (existing email-model router, `getAnthropic("other")`) writes the short weekly narrative **only from the computed figures**, same four-lane no-invention posture as `socialPostSystem`. Every number in the narrative must appear in the digest JSON.

### 3. Surfaces + the ladder

- **Anonymous — `/pulse` public page (website-builder surface):** current week's digest: headline benchmarks, format winners, top posts (stats + truncated captions + permalink link-outs), hashtag reach board. Shareable, indexable, watermarked with the platform name. This is the traction hook: the page demonstrates the data instead of describing it.
- **Email sign-up unlocks:** area-sliced views; digest history (prior weeks); the **weekly Pulse email** — built and sent as a normal deliverable through our own engine (dogfood; watermark rules unchanged); hashtag-reach chips visible in the composer.
- **Paid (existing send paywall — no new build gates):** Generate-Week and canvas fill actively steered by the pulse (below); scheduled/automated sends of pulse-informed content. Consistent with the locked builds-free/send-is-the-paywall model.

### 4. AI wiring (first-class requirement)

- `lib/social-pulse/context.ts` exports `fetchPulseContext(scope)` → a compact cited block: top hashtags for the scope's area with reach counts, winning formats with median engagement, 2–3 live topic angles, each with source label + as-of date. **Reads only the Supabase cache — zero vendor calls in the build path** (fast, zero marginal cost, no pagination-cap exposure).
- Injection points (same seam as `fetchLakeParts` today): `buildWeek`/`socialPostSystem` user context, `buildSocialCanvasFill`, and the composer's hashtag suggester. The prompt addendum instructs: choose hashtags from the pulse list when the area matches; cite the reach figure in the sources block; never invent a tag's reach.
- Empty-tolerant: no pulse rows for a scope → the block is omitted and builds proceed exactly as today (Operation Dumbo Drop posture; the feature degrades to the status quo, never blocks a build).

### 5. Showing importance without selling (design decision, as delegated)

Three mechanisms, all receipts-in-place — the number is the pitch, adjectives are banned:

1. **Receipts on every AI choice.** Each pulse-chosen hashtag/theme renders with a small chip: `#capecoral · 48K posts · top-quartile likes this week (as of MM/DD/YYYY)`. No "boost your reach!" copy anywhere. A user who sees the receipt understands why the tag was chosen; one who ignores it loses nothing.
2. **The benchmark gap tells its own story.** The digest states, from scanned data: "top-quartile SWFL real-estate posts earned N likes this week; the median post earned M." Any user comparing their own feed to those two figures self-diagnoses. We state the market; we never state their inadequacy.
3. **Close the loop with their own numbers.** We already poll engagement on posts published through us (`lib/social/engagement.ts` → `social_events`). Once a pulse-steered post has metrics, show the plain comparison: "this post: X likes · your prior median: Y." Real counts, their own account, zero salesmanship. (Wiring = one query over `social_events`; no new polling.)

This is the same structural posture as the rest of the product: the moat is cited evidence, so the marketing IS the evidence.

### 6. Testing & verification

- Unit: topic rules, digest aggregation (fixture scan → exact digest JSON), client error/empty mapping, prompt-context formatting. All deterministic, no network.
- The scan client's live call is exercised ONLY by the operator-run `social_pulse_swfl_live_verify` (paid-API rule: no live credit spend in CI or dev verification).
- Vitest/bun per Gate 5 conventions; `bunx next build` before any push touching app surfaces.

### 7. Build order (phases, each shippable)

1. **P1 — Scan + store:** client, terms, tables (idempotent migration), GHA cron (daily, dated flip note), dry-run. Operator runs first live scan → closes live-verify.
2. **P2 — Digest builder + `/pulse` public page** (anonymous view).
3. **P3 — AI wiring:** `fetchPulseContext` into Generate-Week/canvas-fill/composer + receipt chips.
4. **P4 — Ladder:** sign-up unlocks (area slices, history, weekly Pulse email as a deliverable), paid steer already live via P3.
5. **P5 — Own-results loop:** the `social_events` comparison line.

## Out of scope (v1)

- No `data_lake.*` writes, no new brain, no master routing.
- No Twitter/Reddit scanning (follow-ups below).
- No per-user live vendor calls at build time.
- No rehosted Instagram media, no oEmbed integration.
- No tier price changes (cost model says unnecessary at current scale; revisit only if scan scope grows 10×).

## Follow-up brief (operator-requested — do not re-derive later)

Both reuse P1's client/store/digest plumbing; each is its own brainstorm → `new-build.mjs` registration when triggered.

**B — Peer-account tracker.** `GET /v1/instagram/profile` + `/posts` on a named list of SWFL realtor/brokerage accounts (user-supplied or curated). Snapshots follower counts + per-post engagement over time → "which of their posts pop, which formats they win with." Surfaces: an operator/user watchlist panel; pulse digest gains a "notable accounts" section. New cost: ~1–2 weighted req per account per scan — a 50-account list adds ~100 req/run. Trigger: pulse P2 live + a user-visible place to put it (grid lab panel or /pulse section).

**D — Reddit demand mining.** `GET /v1/reddit/search` + `/subreddit/comments` over r/florida, r/CapeCoral, r/fortmyers, r/naples for buyer/mover questions (flood insurance, HOA, best neighborhoods, moving-from-X). Distill into cited "what people are asking this week" content seeds for email + social builds — same digest/context plumbing, different source tables (`social_pulse_reddit_*`). Strong email-topic generator; weaker public-page hook than Instagram. Trigger: after B or on operator call.

**Not available upstream (checked 07/05/2026):** no dedicated TikTok/Facebook/LinkedIn read endpoints on SteadyAPI; ScrapeFlow (`POST /v1/scraper`) is the only fallback lane — treat any ScrapeFlow-based surface as its own research spike, not an assumption.

## Evidence (RULE 0.4 research, crawled live 07/05/2026 via crawl4ai)

- **SteadyAPI Instagram/Twitter/Reddit contract:** `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` (this session). Load-bearing: real paths `/v1/instagram/...`; pagination token 15-min TTL + 20 req/15 min session cap; CDN URLs signed+expiring; `shortcode` is the post key; search weight 2.
- **SteadyAPI pricing** (steadyapi.com/pricing): $14.95 / $39.95 / $89.95 / $299.95 monthly tiers; per-API quota mapping ambiguous in page markup — verify in dashboard, don't guess.
- **Gating patterns** (later.com/pricing, buffer.com/pricing, flick.social/pricing): Buffer = free-forever + hashtag manager paid; Later = hashtag suggestions in all tiers, **analytics depth** (3 mo / 1 yr / 2 yr) + **metered AI credits** (5/50/100) as tier levers; Flick sells hashtag intelligence as the core paid product (validates willingness-to-pay for exactly this data). Composite tactic adopted: free taste forever, meter depth + automation, never gate the build.
