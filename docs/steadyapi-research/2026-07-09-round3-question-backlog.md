# Round 3 — Prioritized question backlog (handoff for the crawl4ai / SteadyAPI runner)

> **Recommended model:** ⚡ Sonnet — 9 tasks



**Purpose:** rounds 1–2 settled 18 items and left the rest open. This file is the triage of what's
left: which open questions are actually load-bearing for a build decision right now, the exact
question to answer, where to look, and what a found/not-found result changes. Run Tier 1 first;
Tier 2 as budget allows; Tier 3 only if a Tier 1/2 sweep passes through the same threads anyway.

**Tool split:** SteadyAPI = customer voice on Reddit (posts/comments). crawl4ai = everything
that is a *document* question (vendor docs, authoritative guidance, competitor pages, forums
SteadyAPI can't reach). Two of the four Tier-1 questions are crawl4ai-only — don't burn SteadyAPI
credits on them.

## Mechanics (read before any call — 4×-confirmed quirks)

- Key: `new_steady` (the working key; `PHOTOS_API` is suspended — see
  `steadyapi_subscription_suspended` check).
- **Never use generic `/v1/reddit/search` for niche topics** — site-wide relevance ranking returns
  junk (confirmed 4× across 07/05, 07/08 ×2, 07/09). Use
  `/v1/reddit/posts?url=<subreddit>&filter=hot|new|top|rising` per subreddit, filter client-side
  by keyword. Check `body.success`, not HTTP status — 200 can carry `{"success": false}`.
- `/v1/reddit/post` comment objects: the text field is **`content`, not `body`** (found 07/09;
  fold into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` Reddit quirks while you're in there —
  5-minute docs task carried over from the round-2 handoff).
- Full endpoint reference: `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`. Rate: 15 req/s global.
- Raw JSON with real usernames stays in the session scratchpad, never committed (standing rule).
- Findings come back into this folder as a dated answers file (round-2 file is the template), and
  anything that changes a build decision gets a `checks` entry (RULE 2.4).

---

## TIER 1 — load-bearing for an active build or open keystone check

### Q1. Residential-agent willingness-to-pay at $39–79/mo (round1 item 3 residual)
- **Why now:** `paid_path_wtp` is the oldest keystone check open (35+ days). Round 2 nailed the
  CRE band ($157–700/mo/seat) but explicitly could NOT find residential-agent voice in the general
  subs — this needs the targeted venues, not more r/realtors browsing.
- **Ask:** what do residential agents actually pay (and grumble about paying) for marketing/CMA
  tools — Cloud CMA, Lofty/Chime, kvCORE, BoomTown, Follow Up Boss, Ylopo, Curaytor? Is there a
  named "worth it / not worth it" threshold?
- **SteadyAPI recipe:** `/posts?url=` on r/proptech, r/RealEstateTechnology, r/realtors with
  `filter=top` (and hot/new), client-side filter on the tool names above + "per month", "worth
  it", "cancel". Fetch comments (`/post`) on any hit — the numbers live in comments, as in the
  Reonomy thread.
- **crawl4ai recipe:** BiggerPockets forum search pages and ActiveRain Q&A for the same tool
  names (SteadyAPI can't reach either); competitor pricing pages only if a quoted street price
  contradicts the sticker prices already pulled in round 1.
- **Changes:** pricing page copy + whether $39–79 holds, moves up, or gets an annual lever;
  closes or re-scopes `paid_path_wtp`.

### Q2. Which CMA/comp adjustments do agents actually name? (round1 §4.1)
- **Why now:** the SteadyAPI comp helper Phase 2B is SPECCED and active — this answer shapes which
  adjustment factors the helper surfaces first. Only open question feeding a currently-specced
  build.
- **Ask:** in "CMA is a black box" complaints, which factors are named most: sqft, condition,
  age, view, pool, lot size, waterfront/canal tier, garage? And is the complaint "show me the
  adjustment math" or "the adjustment values are wrong"?
- **SteadyAPI recipe:** `/posts?url=` on r/realtors, r/RealEstate, **r/appraisal** (appraisers
  discuss adjustments constantly and rank them unprompted — likely the richest sub),
  filter=top|hot, client-side on "CMA", "comps", "adjustment", "appraisal gap". Comment-fetch hits.
- **Changes:** the default adjustment set + display order in the comp helper spec.

### Q3. Does click/redirect link-tracking actually hurt Gmail placement? (crawl4ai ONLY) — ANSWERED, see `2026-07-09-round3-q3-q4-answers.md`
- **Why now:** round-2's Gmail playbook (tactic #2) claims tracking links hurt deliverability
  "more than images" — but that's one Reddit account, and we have a live tracking-link feature
  (`/api/r` wrapping, `email_lab_tracking_live_verify` open). Before speccing a
  "high-deliverability mode" toggle, verify beyond n=1.
- **Ask:** what do authoritative sources say about link-redirect/click-tracking domains and Gmail
  inbox placement — especially shared vs custom tracking domains?
- **crawl4ai targets:** Google's Email Sender Guidelines (support.google.com bulk-sender docs),
  Resend docs on click tracking + custom tracking domains, and 2–3 credible deliverability
  sources (Word to the Wise, spamresource, Postmark/Mailgun/Litmus deliverability guides). Note
  what each says verbatim about tracking domains.
- **Changes:** whether the toggle gets specced at all, and whether our wrapped-link default
  flips or just moves to a custom tracking domain (which may fully resolve the concern).

### Q4. Seed-test mechanics: vendor, API, or DIY? (crawl4ai ONLY) — ANSWERED, see `2026-07-09-round3-q3-q4-answers.md`
- **Why now:** pre-send seed-testing is the validated shape of the deliverability panel (round1
  item 14 + round2 tactic #5) and a HOLD-FOR-RESEARCH build candidate. The spec can't be written
  without knowing the mechanics.
- **Ask:** how does seed-list placement testing actually work; what do GlockApps /
  Mailreach / Warmy / mail-tester-class tools cost; do any expose an API a scheduler could call
  pre-send; is a DIY panel (a handful of owned Gmail/Outlook/Yahoo seed inboxes checked via IMAP)
  viable and ToS-clean?
- **crawl4ai targets:** the vendors' pricing + API docs pages; one or two independent comparison
  writeups.
- **Changes:** whether "seed-test before send" is a buildable in-product step, a
  recommend-external-tool doc, or dead.

## TIER 2 — shapes near-term decisions, run after Tier 1

### Q5. Market-report digest cadence + recipient frequency tolerance (round1 §2.1 + §2.7, merged)
- Same threads answer both — run as one sweep. Agent side: do people say they ignore/unsubscribe
  from automated market reports? Recipient side: "why does my realtor email me every day."
- **Recipe:** `/posts?url=` r/realtors + r/Emailmarketing (filter on "market report",
  "newsletter", "unsubscribe") and r/RealEstate + r/FirstTimeHomeBuyer (filter on "realtor
  email", "spam", "every day/week").
- **Changes:** digest cron default cadence + scheduler presets; the general "short + daily +
  curated" finding (item 16) either transfers to our domain or doesn't.

### Q6. Snowbird / out-of-state / sight-unseen buyer pain (round1 §3.4)
- SWFL-structural segment, zero research, and the local subs are proven reachable.
- **Recipe:** `/posts?url=` r/CapeCoral, r/FortMyers, r/Naples, r/AskFlorida, filter=top|hot,
  client-side on "out of state", "sight unseen", "remote", "moving to". Comment-fetch hits.
- **Changes:** whether a remote-buyer packet (Showing-Prep-shaped, but for a buyer who can't
  walk the property) is validated whitespace — it would reuse the just-shipped showing-prep
  pipeline almost wholesale.

### Q7. CRE broker pain sweep beyond pricing (round1 §3.1)
- r/CommercialRealEstate proved chatty and numbers-forward in round 2 — one dedicated sweep.
- **Recipe:** `/posts?url=` r/CommercialRealEstate filter=top|hot, client-side on "CoStar",
  "comps", "data", "marketing", "email", "tenant". Comment-fetch anything about tooling gaps.
- **Changes:** whether cre-swfl gets a deliverable surface, and pricing-page proof points.

### Q8. Forecast / direction-call trust framing (round1 §2.4)
- The master's falsifiable direction call is the product's spine; we invented the format without
  ever hearing how people talk about AI market predictions.
- **Recipe:** `/posts?url=` r/REBubble + r/RealEstate, filter on "Zillow forecast", "prediction",
  "algorithm wrong". The sentiment texture (mockery vs conditional trust) matters more than counts.
- **Changes:** presentation of the direction call — lead with the falsifier ("wrong if X") vs
  lead with confidence.

### Q9. Pre-send review QA pain (round2 secondary signal — new, never in a backlog)
- "Does anyone actually review agent email responses before they go out, or is it just send and
  hope?" (r/realtors, surfaced 07/09, not chased). One targeted pull: find the thread, fetch
  comments, gauge resonance.
- **Changes:** whether a review-before-send queue is a feature candidate; pairs naturally with Q4.

## TIER 3 — only if a Tier 1/2 sweep passes through anyway

- **Q10. Cloud CMA / Altos / Homesnap satisfaction** (round1 §2.5) — piggyback on Q1's threads;
  complaint content, not pricing.
- **Q11. Multi-tool fatigue / tech-stack threads** (§2.9) — one r/realtors "tech stack" filter
  pass; validates or kills the all-in-one pitch line.
- **Q12. Watermark free-tier sentiment** (§2.6) — model is LOCKED (builds free, send is the
  paywall); answer only tunes presentation. r/SaaS, r/Entrepreneur, "watermark" filter.
- **Q13. Chat-edit vs fixed-template preference** (§2.2) — grid builder is shipped; this only
  informs onboarding emphasis.
- **Q14. AI-authorship pride/shame in client communication** (§2.8) — marketing-copy angle.
- **Q15. Investor/landlord wants beyond rent-comp trust** (§3.2) — r/realestateinvesting via
  SteadyAPI + BiggerPockets via crawl4ai; validates product-whitespace guesses.
- **Q16. "Insurance killed my sale," said directly** (§3.5) — r/florida, r/Insurance,
  r/RealEstate; filter "insurance" + "delist/cancel/sale fell through".
- **Q17. Flood-risk score format trust** (round1 §4.2) — crawl4ai-leaning: reactions to First
  Street / Risk Factor scores (news comment threads, r/RealEstate mentions).
- **Q18. Permit history: dealbreaker vs negotiation lever** (§4.3) — deal-killer language vs
  "renegotiate" language in unpermitted-work threads.

## Explicitly NOT in this round

- **Photo hotlink rot** — searched empty twice; it's an engineering item with open checks
  (`email_hero_mirror_to_storage`). Off the social-listening list for good.
- **Manufactured-home segment** (§3.3) — data side is parked with zero pipeline code; customer
  research before we can serve the segment is premature.
- **TikTok, vendor black-box internals, condo assessment unit-counts** — per round1 §5.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 17, Task 17, Task 17, Task 17, Task 17, Task 17, Task 17, Task 17, Task 17 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
