# Round 5 — self-marketing social listening (07/16/2026)

> **Recommended model:** ⚡ Sonnet — 7 tasks, 2 conflict groups

Rounds 1-4 in this folder researched **outreach TO agents** (cold-email pain points, CRM
landscape, compliance, send mechanics). This round is a different question: how does
**SWFL Data Gulf itself** build an organic presence on Reddit/Instagram/X — content, format,
which subs/tags, what NOT to do. Operator directive 07/16/2026: "we have a lot of SteadyAPI
runs to use this month, run it on reddit, x, instagram."

## Run stats

- **SteadyAPI Reddit:** 5 live `/v1/reddit/posts` pulls (weight 2 each = 10): r/CapeCoral,
  r/FortMyers, r/Naples_FL, r/dataisbeautiful, r/SideProject — all `filter=hot`, 25 posts each.
- **SteadyAPI Instagram:** 5 hashtag-volume checks (`/v1/instagram/hashtags/search`, weight 1
  each) + 1 content search (`/v1/instagram/search`, weight 2): swflrealestate, caperealestate,
  fortmyersrealestate, napleshomes, swflhomes.
- **SteadyAPI Twitter:** 2 `/v1/twitter/search` queries (weight 1 each) — both empty.
- **No 429s, no quota errors** on any social-listening call this session — confirms the
  operator's "plenty of runs this month" premise for the **social** endpoints specifically.
  This is a **different key/tier concern** than `steadyapi_quota_unknown` (open check) and
  `steadyapi-429-rate-limited` (open check) — both of those are about the **Real Estate /
  comps API** (`/v1/real-estate/*`, used by `lib/listings/steadyapi.ts` for on-demand comps),
  not the social-listening surface used here. Don't conflate the two; the comps-API quota
  question stays open and unresolved, it just doesn't block this work.

## NEW vendor quirk (fold into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`)

`/v1/reddit/posts?url=` requires the **full `https://www.reddit.com/r/<name>` URL**, not a bare
subreddit name. A bare name (`url=CapeCoral`) 200s with `{"success": false, "message": "Please
enter a valid subReddit URL."}` — this LOOKS like the known content-filter false-positive
documented from prior rounds (retry-once guidance) but is NOT the same failure; retrying a bare
name fails every time. Confirmed live 07/16/2026 (3 subreddits, consistent). Should be folded in
as a fourth Reddit quirk alongside the three from 07/05–07/09.

## Findings — Reddit

### R1. Local SWFL subs (CapeCoral/FortMyers/Naples_FL) are community-life feeds, not data-hungry
Hot-post samples (25 each, 07/16/2026) are dominated by local news, weather, safety, lost pets,
recommendations, jobs. **Zero housing-market or real-estate-data threads appeared organically**
in any of the three hot feeds. Residents here are not searching for market data — this is a
brand/goodwill surface, not an acquisition surface.
Source: live pulls, this session (r/CapeCoral, r/FortMyers, r/Naples_FL hot).

### R2. Humble build-in-public beats a dry cross-post, in the SAME subreddit, same week
Top r/CapeCoral hot post (28 pts, 29 comments): *"Worked SWFL restaurants for years. Watched
summer gut everyone's hours, every year. So I built something — and I'd rather locals roast it
than strangers praise it."* — a local building a SWFL-specific tool, framed as vulnerable/local,
not promotional.
Contrast: *"LeeScoop.com: The Lee County Events and News Hub"* — a flat aggregator
announcement — appears in BOTH r/CapeCoral and r/FortMyers hot feeds this same pull, at 0 and 3
points respectively. Same general category (local data/news tool), opposite reception.
**Lesson: lead with "I built this for us, tell me what's wrong with it," never "here's my
product."**
Source: live pulls, this session.

### R3. r/dataisbeautiful is a PROVEN channel for real-estate data content specifically
Current hot feed (25 posts) includes *"[OC] What $400,000 buys in square footage across 18
major US metros"* at 437 pts / 192 comments — directly comparable to a chart SWFL Data Gulf
could build (what a given price buys across SWFL ZIPs/metros, real data, `[OC]` tag). Sits
alongside other high performers (password table 6,924 pts, CO2 concentration 2,203 pts) — the
subreddit rewards curiosity-driven comparative visualizations regardless of topic; housing data
is a proven-viable genre there, not a stretch fit.
Source: live pull, this session, r/dataisbeautiful hot.
**Changes:** this is the flagship-content template — see launch plan Punchlist item 1.

### R4. r/SideProject rewards numbers + honesty over polish
Top posts: a dev whose "serious" app made $1k/year while a joke feature made $150/day (790
pts); "share your SaaS and I'll get you your first customer, free" (goodwill, no ask); a
job-search tool built "out of spite" after a layoff (453 pts, personal story framing). No
slickly-produced launch post ranks near the top. **Lesson: an honest build-in-public post about
SWFL Data Gulf's own numbers/pivots would outperform a polished announcement here too** — same
lesson as R2, different sub.
Source: live pull, this session.

## Findings — Instagram

### I1. The target hashtags are large and genuinely active
`/v1/instagram/hashtags/search` (07/16/2026): **#swflrealestate 211K posts**,
**#fortmyersrealestate 60.7K**, **#napleshomes 52.5K**, #caperealestate ~1,000+. `#swflhomes`
does not exist as a searchable hashtag (empty result) — don't use it as a primary tag.
Source: live pulls, this session.

### I2. That hashtag ecosystem is 100% agent personal-brand content — zero market-data content
`/v1/instagram/search?search=swflrealestate` top results (by engagement) are exclusively
individual agents: property tour reels, "JUST SOLD," lifestyle/boater content, top-producer
shoutouts. Top post: 45,476 likes / 888 comments on a scenic Cape Coral reel with almost no
caption. **No post in the sample surfaced a market-insight chart, price-trend callout, or
data-driven comparison.** This is a genuine whitespace: the same hashtag pool agents already use
and follow has no one posting "here's what's actually happening with prices this month."
Source: live pull, this session, `/v1/instagram/search`.
**Changes:** this is the primary acquisition channel — see launch plan. It reaches the actual
customer (agents who live in this hashtag pool) while the content itself demonstrates the
product live.

## Findings — X / Twitter

### X1. Zero organic discovery surface for this niche, confirmed a second time
Two `/v1/twitter/search` queries this session ("SWFL real estate market", "Fort Myers real
estate") both returned `total: 0` — the empty entity-object result, same failure mode
documented in round 4 (`2026-07-10-outreach-brand-injection-research.md` F-section: "SteadyAPI
Twitter: 2 `/search` queries ... entity object contained 0 users/topics"). Two independent
sessions, four total empty searches, zero hits.
Source: live pulls, this session + round-4 file.
**Changes:** don't invest organic/search-driven X effort. If X is used at all it's for direct
reactive engagement with specific known accounts, never as a discovery/growth channel — say this
plainly rather than filling an X section with generic advice unsupported by evidence here.

## What stays open / searched-and-empty ledger

- `#swflhomes` — not a real Instagram hashtag, don't reuse.
- X/Twitter niche real-estate search — 4/4 empty across two sessions; don't re-run blind.
- Reddit `/posts?url=` bare-subreddit-name failure — needs the vendor-note fold-in (see quirk
  above); flagging here so it isn't rediscovered from scratch next session.

See `docs/superpowers/plans/2026-07-16-marketing-launch-plan.md` for the launch plan this
research feeds.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 18, Task 18, Task 18, Task 18 |  |
| 🟡 | Task 9, Task 9 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
