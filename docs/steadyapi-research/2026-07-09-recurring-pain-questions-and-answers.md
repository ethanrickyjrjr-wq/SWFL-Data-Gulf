# Recurring-Pain → SteadyAPI Validation (Round 2) — 07/09/2026

**Operator ask:** "go through ops page, all my repeats of problems in chats and things that
constantly break and figure out what questions we need to ask to get the answers we want, then
start finding answers to the most important issues and design wants with steadyapi." This is a
distinct area from `2026-07-09-pain-point-questions-round1.md` (round 1 = product-format
assumptions; round 2 = recurring internal pain/design-want signals, filtered down to what social
listening can actually answer, then researched live).

**Live SteadyAPI calls made this round:** ~14 (Reddit `posts` + `post` + `search`, `new_steady`
key — the working key; `PHOTOS_API` is the suspended one, see `steadyapi_subscription_suspended`
check). Raw JSON for every call is in this session's scratchpad
(`steadyapi-07-09/*.json`) — not committed to the repo (same treatment as the 07/08 sweeps: raw
vendor payloads with real Reddit usernames stay local, not on GitHub).

---

## Sources scanned for "recurring problems"

- `node scripts/check.mjs list` — 200 open checks (the live checks ledger)
- `docs/cron-rebuild-failures.md` — "Recurring Patterns" section (5 documented failure classes)
- `_archive/2026-06-26-snicklefritz-and-problems-audit/CLAUDE IS STUPID AS FUCK PROBLEMS.md` +
  `PROBLEMS-SCOPED-AGAINST-CODE.md` — the operator's own 35-item running list of AI-collaboration
  failures (dated 06/25–06/26, archived, mostly shipped)
- `SESSION_LOG.md` — scanned for repeat-language ("again," "Nth time," recurring fixes)
- `docs/steadyapi-research/2026-07-09-pain-point-questions-round1.md` — cross-checked so nothing
  here duplicates an already-open or already-settled item

## The filter (this is the whole game)

**Is this answerable by what real agents/brokers/buyers/marketers actually say on Reddit/X/Insta?**
Applied first, before writing a single question. Most of the "recurring problems" pile fails this
filter — it's real, but it's not a social-listening question:

**Excluded, and why:**
- **The entire SNICKLEFRITZ "CLAUDE IS STUPID" doc** (35 items, A–H) — internal AI-collaboration
  discipline (Claude fabricating brand colors, false success reporting, date-format violations 9+
  times, missing function arguments, enforcement-hook gaps). None of this is validatable by social
  listening; it's a "did Claude follow the rule" problem, not a "do customers feel this pain"
  problem. Already mostly shipped per that doc's own status header.
- **`cron-rebuild-failures.md` "Recurring Patterns"** (bun.lock drift, vocab-slug orphans, corridor
  alias sync, flaky non-deterministic tests, secret-not-wired-to-workflow) — internal engineering
  hygiene. No Reddit thread validates or invalidates a lockfile drift.
- **`*_live_verify` checks** (the majority of the 200 open checks) — unfinished-build tracking
  ("did we confirm this shipped feature actually works in prod"), not a customer question.
- **Structural/data-gap checks** (`corridor_gap_*`, `parcels_lee_zip_source_layer`,
  `typed_client_*`) — internal data-completeness work.

**What survived the filter** — three recurring pains/design-wants that are genuinely
social-listening-answerable, all now researched live:

---

## 1. Willingness-to-pay for AI real-estate marketing tools — PARTIALLY ANSWERED

**Why this made the cut:** `paid_path_wtp` (35 days untouched, tagged "keystone") and
`highlighter_pricing_matrix` (32 days untouched) are the two oldest, most-repeated open checks in
the whole ledger. Round1 item 3 already flagged this open with zero real customer-reaction
evidence — only competitor sticker prices.

**What I found:** r/CommercialRealEstate hot, "Brokers: what are you paying on a Reonomy renewal?"
(https://www.reddit.com/r/CommercialRealEstate/comments/1up2ze2/, 9 comments, live-pulled
07/09/2026). Real quoted numbers from real CRE brokers:
- $157/mo–$700/mo per seat for Reonomy (a CRE data/comps platform — closest real comp to our
  product category)
- "Regular rate" quoted at renewal ≈ $400/seat
- CoStar (the dominant incumbent) called out as "3X this price" by one commenter (~$1000+/mo
  implied)
- API-tier access quoted at ~$30,000/year (enterprise, requires a developer to integrate)
- A self-identified proptech founder comments directly in the thread: pricing in this category is
  **deliberately opaque** — "the regular rate quoted at renewal is usually a starting point, not
  the clearing price." Negotiation/discounting at renewal is the norm, not an edge case.
- The ROI framing buyers actually use: "audit how many deals it directly helped source in the last
  12 months" — cost is justified against deals sourced, not data volume or feature count.

**What this tells us:** our $39–79/mo sits well BELOW this category's real price range
($150–700/mo+ per seat, 3×+ for the incumbent). We are not priced high relative to the comp set —
if anything the evidence suggests room to charge more, not less. It also tells us two concrete
things to design for: (1) expect renewal-time negotiation asks and build in a discount lever rather
than being surprised by it; (2) frame value around deals/time saved, not raw data access, in any
pricing page copy.

**Still open:** this is CRE-broker voice on an enterprise comps tool, not a residential agent's
reaction to $39–79/mo. Searched r/realtors + r/RealEstate (hot/new/rising) and a generic
reddit-search for "worth it"/"subscription" framing on 07/09/2026 — no residential-agent
tool-pricing threads surfaced. Residential agents evidently don't discuss SaaS tool pricing in the
general subs the way CRE brokers do in their own sub. Next attempt: r/proptech, r/newagent, or a
directly-targeted search like "what do you pay for Cloud CMA" rather than generic browsing.

---

## 2. Gmail Promotions-tab avoidance — ANSWERED (concrete playbook found)

**Why this made the cut:** round1 item 12 already flagged this as "real but no silver-bullet
solution found" from the 07/08 sweep. `gmail_shared_from_unsub_audit` (a live open check) is a
directly adjacent deliverability risk on our own shared-From sending.

**What I found:** r/Emailmarketing hot, "After months fighting the Promotions tab, my open rates
and replies have jumped. Here's what actually worked" (48↑/31💬,
https://www.reddit.com/r/Emailmarketing/comments/1uks513/, full self-text pulled 07/09/2026 — no
comment fetch needed, the post body is a complete first-person account). The author explicitly
separates what didn't move the needle from what did:

*Didn't help:* stripping to plain text; avoiding "spam trigger words" in subject lines.

*Did help, ranked by the author's own account:*
1. **Send to the most-engaged recipients first, then widen gradually** — "the single biggest
   lever, nothing else came close."
2. **Cut tracking/redirect links** — hurt deliverability more than images ever did.
3. **Real reply-to address + conversational tone + a genuine closing question** — prompts real
   replies, which snowball into better sender reputation.
4. **Consistent send cadence** — random bursts read as "campaign-y" to Gmail's reputation model.
5. **Seed-test placement before every real send** — see where the email lands before the list
   does, instead of finding out from a flat open-rate the next morning.

**What this tells us:** two of these five tactics directly conflict with things we do or plan:
- **Click-tracking** (`email_lab_tracking_live_verify` is a live open check) trades against
  deliverability per this account — that's a real tradeoff to design around, not a free feature.
- **Engagement-staggered sending** (warm/most-engaged segment first, widen after) is a genuine new
  feature candidate — nothing in our current scheduler does this.
- **Pre-send seed-testing** is also a new candidate, and it maps directly onto round1 item 14's
  already-validated "manual deliverability diagnosis is a named pain" — this is the shape a
  deliverability panel should take if we ever build one: a seed-test-before-send step, not just a
  post-hoc bounce/complaint dashboard.

---

## 3. "Showing Prep Packet" — RECONFIRMED, not re-litigated

The same r/realtors thread from the 07/08 sweep ("POV: You spent 3 hours preparing for homes your
clients no longer want to see") is still live in hot/new/rising two days later (35–36↑, ~50💬,
stable engagement) — this is a durable pain signal, not a one-day spike. No new action beyond
corroborating round1's already-HIGH-priority flagged finding.

---

## Secondary signals surfaced (logged, not chased further this round)

- **"Does anyone actually review agent email responses before they go out, or is it just send and
  hope?"** (r/realtors) — an email QA/trust pain distinct from "sounds like a robot" (settled,
  round1 item 11): this one is about *pre-send review*, not tone. Nobody has asked this specific
  question in our backlog before.
- **"Do you ever feel like you're spending more time optimizing emails than writing them?"**
  (r/Emailmarketing) — a second, independent thread reinforcing round1 item 13's time-sink finding.
- **"How do I position myself without sounding like another email marketer?"**
  (r/Emailmarketing) — a differentiation/identity pain adjacent to but distinct from the robotic-
  writing pain (item 11); open, logged for a future round.

---

## What was searched and came up empty (so it isn't blindly re-searched)

- **Listing-photo hotlink rot / broken images in old sent marketing emails.** This is a real
  internally-observed problem (checks: `email_hero_mirror_to_storage`, `rdcpix_rot_head_reprobe` —
  hotlinked CDN photos rot after a listing closes, and scheduled re-sends show broken images).
  Searched r/realtors hot/new/rising + a generic reddit-search — no matching threads. Likely too
  narrow/technical a complaint for public Reddit: agents probably don't diagnose *why* an email
  looked broken, they just silently stop sending it or complain generically (if at all). Round1
  keeps this open. A future pass should either try r/Emailmarketing "image hosting"/"CDN" specific
  threads, or accept this one is answered from vendor docs on hotlink/CDN expiry (which we already
  have) rather than social listening.
- **Residential-agent-specific pricing reaction** — see item 1 above; searched, not found, distinct
  from the CRE evidence that WAS found.

## Vendor-quirk confirmation (4th independent instance)

The generic `/v1/reddit/search` endpoint's site-wide relevance ranking (documented in
`docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` "Reddit quirks") reproduced again today: a search
for "CMA software subscription worth it" (biased to r/realtors) returned e-commerce newsletter
recaps, an Overleaf-subscription thread, and an OpenAI-Pro-pricing thread — no real-estate-tool
content. A search for "listing photos broken in old emails" returned entirely unrelated
creepypasta/relationship-drama threads. **Targeted `/v1/reddit/posts?url=<subreddit>&filter=hot|new|rising`
+ client-side filtering remains the only reliable path** for niche topics; `/search` is confirmed
low-yield a fourth time across three separate research sessions (07/05, 07/08 ×2, 07/09).

## Correction to the vendor note during this session

`/v1/reddit/post`'s comment objects use the field **`content`**, not `body`, for the comment text
(the vendor note's existing shape description doesn't specify this and the field-verified quirks
section doesn't mention it either — worth folding into `INSTAGRAM-SOCIAL-STEADY.md` in a follow-up
docs-only pass). Confirmed live 07/09/2026 against the Reonomy pricing thread's comments.

---

## Round1 file updated in the same pass

Folded items 17–18 into round1's "Also settled" section, narrowed item 3 (pricing) to the
residential-agent gap only, and updated item 12 (Gmail) to point here instead of restating the
now-superseded "no silver bullet" framing. See `2026-07-09-pain-point-questions-round1.md`.
