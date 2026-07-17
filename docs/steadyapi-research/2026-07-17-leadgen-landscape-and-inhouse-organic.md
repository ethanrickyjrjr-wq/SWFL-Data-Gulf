# Lead generation landscape + in-house/organic playbook (07/17/2026)

> **Recommended model:** ⚡ Sonnet — 6 tasks, 2 conflict groups

Operator directive: "run steadyapi on reddit and crawl4ai until you understand lead generation
and how we create it ourselves in house." Picks up directly from the marketing-launch-plan's
"tomorrow's SteadyAPI listening targets" item 1 (agent-professional subreddits) plus a fresh
question this round asks explicitly: how leads work industry-wide, and how SWFL Data Gulf grows
its own pipeline without buying lists (four-lane moat — no purchased list, per the outreach-engine
design already specced in rounds 1-4).

## Run stats

- **SteadyAPI Reddit:** 5 `/v1/reddit/posts` hot pulls (weight 2 each = 10): r/realtors,
  r/RealEstateTechnology (failed — see quirk note), r/CommercialRealEstate, r/sales,
  r/smallbusiness. 5 `/v1/reddit/search` queries (weight 1 each = 5). 3 `/v1/reddit/post`
  full-thread pulls with comments (weight 1 each = 3). **Total weight: ~24 + 3 = 27 live calls.**
- **crawl4ai:** 1 live fetch (`blog.google/products/ads-commerce/new-real-estate-ads-formats/`),
  plus a WebSearch pass for real-estate LSA cost-per-lead benchmarks that fed the crawl target.
- **Known quirk reproduced, not new:** `/v1/reddit/posts?url=` against r/RealEstateTechnology
  returned the documented bare-top-level `{"success": false, "message": "Please enter a valid
  subReddit URL."}` on all 3 attempts this session (1 try + 2 retries at 1.8s spacing) — matches
  the 07/16 finding that this transient content-filter false-positive can survive multiple
  retries on a given thread. Not folding in as new; already in the vendor note.

## Part A — the lead-generation landscape (industry-wide, what's actually working in 2026)

### A1. Real estate lead-buying is expensive and getting more so — and Google just entered it directly
Live crawl4ai of Google's own Ads blog (published 06/11/2026, verified live 07/17/2026):
Google rolled out **enhanced Local Services Ads for Home Listings nationwide** (all 50 states),
powered by a data partnership with **HouseCanary** — buyer-side ads now surface price, photos,
and core home features directly in the search ad, with call/message/book-appointment inline.
Existing LSA agents are auto-enrolled; portal partners can bulk-enroll agents.
Source: https://blog.google/products/ads-commerce/new-real-estate-ads-formats/ (crawled live).

Cost context (WebSearch, 2026 benchmark reporting, several independent sources): real-estate
Google LSA leads run **~$60-75/lead** (call-only, pay-per-lead not pay-per-click); traditional
Google Ads run **$20-60/click on buyer keywords** but **$150-400/click on seller keywords**
because every listing agent in a market bids the same seller terms. This is the paid alternative
agents already live with — expensive, competitive, and Google is now vertically integrating
property data (HouseCanary) directly into the ad unit, which is the same "cited property data in
the moment of intent" shape as our own product, just paid and buyer-side. Not an immediate
competitive collision (we're not selling placement/ads), but worth tracking: Google is moving
into "data-rich real estate at the search layer," a direction our four-lane provenance approach
already occupies on the organic/analysis side.

### A2. The generic "what's working" answer: personalization + clean targeting, not volume
r/LeadGeneration, "Is Any Lead Generation Method Still Working in 2026?" (69 pts, 91 comments,
full thread read live): the consistent, upvoted answer across a noisy thread is **narrow +
personalized beats broad + generic**, specifically:
- Scrape a city+niche (e.g. "plumbers in Dallas"), filter to businesses *without* a website or
  with an obvious gap, send a genuinely personalized cold email — one commenter reports a
  consistent 5% reply rate this way, "the key is personalization, not volume."
- A second, independently-upvoted comment: cold email is "weirdly having a moment again" because
  AI has made *most* senders lazier (generic AI-templated blasts), so real personalization now
  stands out more, not less.
- An agency workflow mentioned by name: Apify's Google Maps Scraper (local) or LinkedIn Scraper
  (B2B) + Hunter for email enrichment, then hyper-targeted outreach — "the spray-and-pray era is
  dead... few people can send 500 hyper-relevant [emails]."
- This directly validates our own cold-outreach engine design (rounds 1-4, already specced): the
  DBPR `RE_rgn7.csv` licensee spine × brokerage-directory crawl IS the "clean, targeted list"
  this thread says wins over a purchased/generic one — we're already doing the thing this
  community says is the only thing still working.

### A3. Small/local service businesses are burned out on pay-per-lead marketplaces
r/sweatystartup, "how are you finding new clients without relying on thumbtack or paying for
ads?" (16 pts, 28 comments, full thread read live) — direct, repeated frustration with
Thumbtack/Angi/Google LSA: shared leads ("5 other guys also got it"), no refunds for bad leads,
race-to-the-bottom pricing ($27-30/lead cited, "way off" leads not refunded). This is the same
economic pain point A1's cost data confirms from the vendor side. The thread is a working list of
what real operators do INSTEAD — folded into Part B below since it's directly the "in-house"
answer to the operator's question.

## Part B — the in-house/organic playbook (how WE generate our own pipeline, no purchased list)

Three genuinely new, evidence-backed additions to `2026-07-16-marketing-launch-plan.md` — not
contradicting that plan, extending it. Two are filed as `checks` (RULE 2.4): `idea` class,
not committed to yet.

### B1. Google Business Profile + immediate post-job reviews — the highest-leverage $0 channel, repeatedly, independent of niche
Across the r/sweatystartup thread, this specific tactic gets independently upvoted multiple
times as the top answer, phrased almost identically by different commenters: *"Google business
profile with real reviews is the best free lead gen there is — ask every happy customer for a
review right after you finish the job while they're still pumped about it."* Compounds for free,
works regardless of vertical. **We don't have a Google Business Profile for SWFL Data Gulf today.**
Filed: `marketing_gbp_setup_swfl_datagulf` (idea).

### B2. Building-permit filings as a timing signal — and we already have the raw data
From the same thread: *"building permit filings... when a homeowner pulls a permit for an HVAC
replacement or plumbing rough-in, they've committed to spending money but haven't hired anyone
yet. That 2-6 week window between filing and first call is exactly [the high-intent timing
window]."* Several service pros manually check city permit portals weekly for exactly this
signal. **We already ingest Lee + Collier permit data** (the permits pack, built for a different
purpose entirely). This is worth a real look — not as a new ingest, but as a possible new
angle on data we already hold: does a filed renovation/addition permit correlate usefully with a
near-term listing or a homeowner in "getting ready to sell" mode? That's a hypothesis to test
against our own historical data before it becomes any kind of claim, product feature, or content
angle — filed as `marketing_permit_timing_signal_leadgen` (idea), explicitly not a commitment
to build anything yet.

### B3. Local-SEO location-page structure — validates (and extends) the existing "reuse /r/ pages" call
r/weddingvideography, "New Year's Guide to More Bookings (without ads)" (59 pts, 28 comments,
full thread + 15 years of first-hand operator experience, real $700K case cited, read live) is
the most detailed single artifact found this round. Core structure, generalizable past weddings:
- **Homepage = primary local market page** (not a mixed, multi-service, multi-city page).
- **Location pages = secondary markets actually served**, each independently optimized, no
  keyword overlap/cannibalization with the homepage.
- **"Venue pages"** — a page built around a specific *named, high-search-volume entity* (a wedding
  venue) that "rides the coattails" of brand-name searches, with genuine content (own work shot
  there, objective facts) rather than a thin SEO wrapper.
- **Kick the blogging habit** unless a post is a genuine strategic pillar/backlink asset —
  "just blog more" is explicitly called out as a debunked 2011 Google-update myth. One dissenting
  commenter (blogs every wedding, gets leads fast) turns out to run a DR55 celebrity-photography
  site — an outlier by authority level, not a counter-example for a new domain.
- **Pricing page filters bad-fit leads on purpose**; **contact page minimizes fields** to reduce
  the drop-off point ("start from the money and work backwards").
- **SEO and AI-answer visibility are complementary, not zero-sum** — the operator's own
  observation is that being well-optimized for Google search *is* what makes a site show up in
  ChatGPT-style answers too.

This is direct, independent confirmation of the launch plan's existing call (Punchlist item 6:
reuse `/r/` report pages instead of a new blog CMS) — our `/r/` pages already ARE the
homepage/location-page structure this thread describes. The one net-new idea: a **"venue page"
equivalent** — a page built around a specific named, high-search-volume local entity (a
well-known corridor, subdivision, or school district name) rather than only a ZIP/market grain —
worth keeping in mind for a future SEO pass, not filed as its own check yet (too speculative
without a concrete named-entity candidate and search-volume evidence to back it, unlike B1/B2
which have a specific, checkable next step).

## What stays open / searched-and-empty ledger

- r/RealEstateTechnology `/posts` — known transient content-filter false-positive, survived 3
  attempts this session (matches 07/16 finding); genuinely didn't clear, not re-attempted further
  this round to stay proportional.
- `search "self promotion rules" @RealEstateTechnology` — same failure mode, not retried further.
- Generic `/v1/reddit/search` relevance-ranking-is-site-wide problem reconfirmed a fourth+ time:
  "lead generation" and "how do you get leads" searches surfaced mostly unrelated viral/AITA
  content alongside the real hits (r/LeadGeneration, r/DigitalMarketing, r/Entrepreneurs,
  r/RealEstateTechnology, r/HowToEntrepreneur, r/AskMarketing, r/weddingvideography,
  r/sweatystartup all DID surface genuine signal in the noise) — consistent with the
  already-documented "generic `/search` is low-yield for niche topics, use `/posts` + client-side
  filtering" guidance. Not treating this as new; confirms existing guidance.

## Checks opened this session

- `marketing_gbp_setup_swfl_datagulf` (idea)
- `marketing_permit_timing_signal_leadgen` (idea)

See `docs/superpowers/plans/2026-07-16-marketing-launch-plan.md` for the plan this extends.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 1, Task 1 |  |
| 🟡 | Task 2, Task 2, Task 2 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
