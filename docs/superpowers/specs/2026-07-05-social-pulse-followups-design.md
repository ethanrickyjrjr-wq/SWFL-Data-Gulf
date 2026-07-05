# Social Pulse follow-ups — three lenses (Instagram · X · Reddit) + Pulse v2 improvements

**Date:** 2026-07-05
**Parent:** `docs/superpowers/specs/2026-07-05-social-pulse-swfl-design.md` (P1+P2 LIVE 07/05/2026 — scan cron daily, `/pulse` serving real numbers: 301 posts, median 79 / top-quartile 486 likes first digest)
**Vendor contract:** `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` (crawled 07/05/2026)
**Operator direction:** "Write the follow up… anything we can do to make it better. We have X and Reddit we can look into for different info from different types of users."

## The organizing idea — three lenses, three user types

Each platform is a DIFFERENT population telling us a DIFFERENT thing. That's the product frame, and it's why the lenses compose instead of duplicating:

1. **Instagram = the performance lens (LIVE).** Agents and creators posting SWFL real-estate content, scored by what actually earns likes. Answers: *what should our users post, in what format, under which tags?*
2. **X = the conversation lens.** Locals, investors, journalists, and market-watchers reacting in real time — rate moves, insurance news, hurricane season, migration chatter. Answers: *what is being said about SWFL markets RIGHT NOW that a deliverable should acknowledge or ride?*
3. **Reddit = the demand lens.** Anonymous, high-intent buyers/sellers/movers asking the questions they won't ask an agent — flood insurance reality, HOA horror stories, "is Cape Coral a mistake," moving-from-X threads. Answers: *what do prospects actually want to know — i.e., what content should exist?*

Performance tells you HOW to say it, conversation tells you WHEN and WHAT'S HOT, demand tells you WHAT TO MAKE. All three feed the same digest/context plumbing P1 built; every figure and quote stays cited (named platform + permalink + as-of date); paraphrases are attributed, verbatim quotes are verbatim.

## Phase order (P3–P5 inherited from parent, P6–P8 new)

**P3 — AI wiring (NEXT, parent spec §4).** `fetchPulseContext(scope)` reads the cached digest into Generate-Week, canvas fill, and the composer hashtag suggester, with receipt chips (`#capecoral · 48K posts · top-quartile likes this week`). Cache-only in the build path; empty-tolerant. Trigger: ~1 week of history (≈07/12/2026) so deltas exist. This ships BEFORE new lenses — the wiring is the seam X/Reddit plug into.

**P4 — Ladder unlocks (parent §3).** Sign-up unlocks area slices + history + the weekly Pulse email (built and sent as a normal deliverable through our own engine — dogfood + retention hook). Paid = pulse-steered calendars, already flowing from P3.

**P5 — Own-results loop (parent §5).** `social_events` comparison line: "this post: X likes · your prior median: Y."

**P6 — X conversation lens.** New scan lane on the same core:
- `GET /v1/twitter/search` over a fixed term set ("Cape Coral housing", "Naples real estate", "SWFL insurance", "Fort Myers market", "moving to Florida taxes", per-area storm/insurance terms in season). Weight 1/call — cheaper than IG search.
- `GET /v1/twitter/trends` with the Florida-area WOEID — enumerate once via `GET /v1/twitter/woeid` at build time (do NOT guess the id; the endpoint exists to look it up).
- Storage: `social_pulse_x_posts` snapshots (tweet id, text, author, engagement counts as the API returns them, matched_term, area) — mirrors `social_pulse_posts`; same scan-id snapshot pattern gives velocity for free.
- Digest additions: "what SWFL is talking about" — top tweets by engagement per area, trend list, week-over-week term volume. Product use: a cited "conversation" block available to email/social authoring ("X users are discussing flood-insurance renewals this week — source: public X posts, MM/DD/YYYY") and quote-with-permalink pull for deliverables.
- Curated-list option (v2 of this lens): `list/search` + `list/timeline` to follow a hand-picked SWFL journalists/market-watchers list — higher signal-to-noise than raw search; park until raw search proves noisy.
- Verify at build (RULE 0.4): the exact response field names for X search results (engagement count fields) against live docs — the vendor note inventories params, not response shapes, for X.

**P7 — Reddit demand lens.** The content-ideas machine:
- `GET /v1/reddit/search` (weight 1; filter=posts, sort by new + top/week) over demand terms ("Cape Coral", "Fort Myers moving", "SWFL flood insurance", "Naples HOA", "retiring Florida gulf") + `GET /v1/reddit/subreddit/comments` on the local subs. Candidate subs (VERIFY each exists via `subreddit/info` at build, don't assume): r/florida, r/CapeCoral, r/fortmyers, r/naples, r/SWFL, r/FloridaRealEstate.
- Storage: `social_pulse_reddit_posts` (title, selftext preview via the same `previewOf`, upvotes, comment count, subreddit, permalink, matched_term).
- Distill: "questions of the week" — cluster by the existing topic rules + a demand-specific bucket set (insurance, HOA/fees, relocation, flood/hurricane, cost-of-living, neighborhood-choice). Deterministic counts; LLM writes the question summaries ONLY from stored titles/previews, each linking its thread.
- Product use: this is the strongest EMAIL fuel of the three — every question is a newsletter topic, a social hook, an FAQ block a user can build with one click ("People asked this on Reddit this week; here's the cited answer from our data"). Demand lens + our lake = the answer machine nobody else has.
- Guardrail: Reddit content is pseudonymous — quotes render as "a Reddit user in r/CapeCoral asked…" + permalink; never present karma-verified users as experts.

**P8 — Peer-account tracker (parent follow-up B).** IG `profile` + `posts` over a curated/user-supplied watchlist of SWFL agents and brokerages; follower growth + engagement-per-post over time; "notable accounts" digest section. ~1–2 weighted req per account per scan. X twin later via `user/tweets` if wanted. Trigger: after P6/P7 prove the multi-lens digest, or on operator call.

## Pulse v2 — making the live lens better (cheap first)

Ordered by cost; the first four spend ZERO extra vendor requests (they mine data we already store):

1. **Engagement velocity (free).** We snapshot the same post across daily scans already — likes-per-day growth curves distinguish "big account" from "hot content." Surfaces "rising this week" on `/pulse` and in P3 context. Pure SQL over `social_pulse_posts`.
2. **Best-time-to-post (free).** `taken_at` distribution of top-quartile posts vs the rest → "top posts this week were posted Tue–Thu 8–11am" with the count as the receipt. Deterministic, data already stored.
3. **Term auto-discovery (free).** Mine stored captions for co-occurring hashtags we don't scan yet; surface the top candidates as an operator-approved term-set v2 (per-ZIP tags like #33914, style tags like #waterfronthomes, seasonal terms). Human approves; config change ships the expansion.
4. **Relevance score (free).** Some broad-tag results (#swfl) are off-topic (gyms, fishing). Measure it first: share of posts classifying to topic ≠ other, per term. If a term scores chronically low, replace it — evidence-based term hygiene, not guesswork.
5. **Outlier handling (cheap, needs design).** A mega-account (MrBeast-scale) matching a term once can distort a week's top-quartile. Options at build: median-only benchmarks (already robust), trimmed quantiles, or author-follower banding via `GET /v1/instagram/profile` on top-post authors (~10–20 weight-1 calls/week). Decide from real distortion evidence, not preemptively.
6. **Week-over-week deltas on `/pulse` (near-free).** Once ≥2 weekly digests exist, render the arrows (median likes ±, format share shifts). The bootstrap cadence exists exactly for this; land with P3 timing.
7. **Share/OG card (cheap).** `/pulse` gets an OG image stamped with the week's three headline numbers via the existing social-image rasterizer (`lib/social/render-social-image.ts`) — the page markets itself when shared. Also mint per-week permalinks (`/pulse/2026-W27`) so history is linkable once sign-up gating (P4) defines who sees it.
8. **Narrative deltas (free once key live).** The narrative prompt gains "compare to prior week's digest JSON" the moment two weeks exist — same figures-only rule.

## Cost + cadence envelope

Current: ~40 weighted req/scan, daily → ~1,200/month during bootstrap. Adding X (~20 terms × weight 1 + trends) ≈ +25/run; Reddit (~10 searches + 6 sub comment pulls) ≈ +16/run. All three lenses daily ≈ ~2,400/month — still a fraction of the Starter tier's 10,000/month social quota (re-check the per-API quota split in the dashboard before P6 go-live; the pricing page markup was ambiguous 07/05/2026). No plan change expected; the Mon/Thu flip (07/26/2026, `social_pulse_cadence_flip`) cuts steady-state to ~30%.

## Not on the menu (unchanged)

- TikTok / Facebook / LinkedIn reads: no dedicated upstream endpoints as of 07/05/2026; ScrapeFlow (`POST /v1/scraper`) is a separate research spike if ever wanted.
- No `data_lake.*` writes, no new brain — all lenses stay app-side product cache until a brain wants to SPEAK this data, which is its own registered build with a PackDefinition.
- Vendor name never surfaces; labels are "live Instagram scan", "public X posts", "Reddit threads", each with as-of date + permalinks.

## Execution rule

Each phase registers via `node scripts/new-build.mjs` at its turn (P3 = `pulse-ai-wiring` or similar) and gets its own brainstorm-confirmation + plan; this doc is the roadmap and the argument, not the implementation plan. Sequence: P3 → P4 → P6 ‖ P7 (independent lanes, either order or parallel sessions) → P5 → P8, with Pulse-v2 items 1–4 and 6 folding into P3/P4 as they're nearly free.
