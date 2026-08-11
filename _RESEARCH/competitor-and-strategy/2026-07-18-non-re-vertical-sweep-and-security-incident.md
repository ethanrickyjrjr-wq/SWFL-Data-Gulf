# 07/18/2026 — non-RE monetization sweep: vendor findings + a security incident

Companion to the committed deliverable: `docs/vertical-plays/05-non-re-monetization-sweep-2026-07-18.md`
(10 ranked, fully-planned, adversarially-verified product candidates). This file is the local-only
research/incident trail — never committed, per this folder's standing rule.

## Vendor capability matrix (live-verified 07/18/2026)

- Real-estate `/v1/real-estate/*` — LIVE, unaffected (production spine).
- Instagram `/v1/instagram/*` — LIVE, confirmed with real data.
- Twitter `/v1/twitter/*` — LIVE, confirmed with real data.
- Amazon `/v1/amazon/*` — LIVE, confirmed (keyword autocomplete, product search, product reviews).
  Never touched before this session. `products/reviews` is thin per-ASIN (`top_reviews`/`customers_say`
  often empty) — treat as best-effort, not a reliable qualitative-complaint source.
- **Reddit `/v1/reddit/*` — BROKEN.** Every endpoint (posts, post, subreddit/info, subreddit/popular)
  returns HTTP 200 `{"success":false,...}`, reproduced against the vendor's own documented example
  (`r/wallstreetbets`) and `AskReddit`. Not a URL-shape bug — tried with/without `www.`, with/without
  the `/api/` prefix, both param name variants (`sortType` vs `filter`). Looks like an account/plan
  entitlement issue on the Reddit module specifically. Worth a dashboard check (same pattern as the
  07/16 quota-screenshot ask). Routed around it via crawl4ai direct against reddit.com/old.reddit.com
  for this sweep — that worked fine and was actually the richest qualitative source of the round.

## Security incident — credential exposure during the 36-agent workflow run

The workflow's sandbox monitor flagged 5 subagents for handling `PHOTOS_API` (this repo's SteadyAPI
key) — 4 were false positives (the key genuinely does cover Twitter/Instagram/Amazon on this account,
same pattern already live in `lib/social-pulse/steady-client.ts`; the monitor doesn't know that).

**One was real and serious, and manual follow-up found it was worse than the single flagged instance:**

1. The `discover:boat-marina` agent wrote the raw `PHOTOS_API` value to a plaintext file
   (`.steadykey`) in the session scratchpad instead of piping it directly into curl.
2. On inspection, TWO MORE plaintext copies of the same key turned up independently
   (`steady.key`, `steady_key.txt` in scratchpad; another `steady_key.txt` in `/tmp`) — multiple
   agents converged on the same bad pattern without being individually flagged.
3. A broader grep for the raw key value across scratchpad + `/tmp` turned up two more, unrelated to
   the key-writing pattern:
   - A shell script in a **different session's** `/tmp` scratchpad directory with the key hardcoded.
   - **`/tmp/noai.env` — a complete plaintext copy of the entire `.env.local` file**, every secret in
     the project: Stripe live secret key, a GitHub PAT with push access to `main`, the full Supabase
     service-role key + Postgres password, Resend/Notion/Mapbox/OpenAI/Gemini/Voyage/Census/FRED/
     DataForSEO/Webshare/Firecrawl/Spider/Bridge-MLS/Vercel/Rentcast/Pexels/Figma/GSC/Brandfetch/
     Airtable keys — all of it. This is far beyond the SteadyAPI-scoped finding the sandbox caught.

**All 5 located files were deleted and verified gone** (git status confirmed clean throughout — none
of this ever touched the tracked repo). A resume attempt and a targeted grep for the two
highest-blast-radius secrets (Stripe live key, GitHub PAT) across all of `/tmp` were both blocked by
the auto-mode classifier (reasonably — it can't distinguish defensive cleanup from harvesting after
several credential-related flags in one session). Did not attempt to work around that block.

**NOT done, and flagged rather than assumed:** a full historical sweep of the hundreds of old
`/tmp/claude/<session>` directories that have accumulated on this machine over time. The `noai.env`
file and the other-session script were found incidentally via one targeted grep, not from an
exhaustive search — there could be more, older copies from past sessions that predate this one.
Rotating the exposed credentials is the fix that neutralizes this regardless of how many copies exist
or where; a full historical sweep is a separate, larger decision for the operator.

**Recommendation:** rotate at minimum the Stripe secret key, the GitHub PAT with push-to-main, and the
Supabase service-role key / Postgres password — the three highest-blast-radius items in that dump.
