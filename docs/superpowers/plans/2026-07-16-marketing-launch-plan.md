# SWFL Data Gulf — self-marketing launch plan (07/16/2026)

Operator directive: use this month's spare SteadyAPI runs on Reddit/X/Instagram, figure out how
to bring it together and get it off the ground, build punchlists for new users, and lay out
email + social marketing ideas — blogs, Reddit posting, Loom, where/when/how.

Evidence base: this plan sits on top of **five rounds of research**, not a fresh guess —
`docs/steadyapi-research/2026-07-09-*` through `2026-07-10-outreach-brand-injection-research.md`
(outreach-to-agents track: cold-email mechanics, CRM landscape, compliance, DBPR licensee
spine) plus `2026-07-16-self-marketing-social-listening-round5.md` (this session: our own
organic presence). Read the round-5 file for the raw findings; this doc is the plan built on
top of both tracks.

## Who "new users" are

Everything already built points at one answer: **SWFL real estate agents in Lee + Collier**.
The deliverable factory, send-on-behalf domain work, agent-bio propagation, and all four rounds
of outreach research target agents as the paying customer. Residents (local subreddits) and the
general Reddit audience (r/dataisbeautiful) are **not** the acquisition audience — they're brand
and proof surfaces that feed the agent motion indirectly. Keep these separate; don't let broad
"go after new users" collapse them into one undifferentiated push.

## The spine — one funnel, not five disconnected channels

```
ORGANIC CONTENT  →  FREE PRODUCT BUILD  →  COLD-OUTREACH ENGINE  →  SEND PAYWALL
(awareness/proof)   ("builds free")        (rounds 1-4, specced)    (revenue)
```

Every channel below maps onto one of these four stages. A channel that doesn't feed the next
stage isn't worth the effort right now, no matter how "on-brand" it feels.

- **Organic content** (Instagram primary, r/dataisbeautiful secondary, local subs tertiary) →
  proves the product does real analysis and puts it in front of agents who are already
  scrolling these exact hashtags.
- **Free product build** — a prospect who sees the content can go build a real, cited deliverable
  for free (locked decision: builds free, SEND is the paywall). This is the "come try it"
  landing moment.
- **Cold-outreach engine** — already specced across rounds 1-4: DBPR `RE_rgn7.csv` licensee
  spine (Lee+Collier, weekly, free) × brokerage-directory email crawl → text-forward + 1 chart
  cold demo → reply-focused KPIs → domain-verify UI (backend built, no UI yet) for send-on-behalf.
  This plan does not re-spec that track — it's the conversion engine already designed, sitting
  behind the content/awareness work below.
- **SEND paywall** — the free build is the hook; sending it (drip, scheduled, at scale) is where
  revenue starts. Nothing in this plan touches that gate.

## Infrastructure reality (read this before assigning any task)

- **Auto-posting is NOT live.** `lib/social/` is a complete publish/schedule engine
  (`SOCIAL_PUBLISH_ENABLED` defaults to dry-run) but real posting needs, per platform:
  Meta App Review + **Business Verification** + a professional IG account linked to a FB Page;
  X needs a **paid API tier** (~$200/mo) for volume; LinkedIn needs partner approval. None of
  that is done. **Every post in Phase 0/1 below is posted by a human, by hand**, through the
  normal Instagram/Reddit apps — the engine is a Phase 2 automation unlock, not a blocker to
  starting.
- **No blog surface exists in the app.** Building one is a real, undecided scope item — see
  Punchlist item 6. Don't imply a blog is "basically there."
- **X has zero organic discovery value for this niche** (round-5 finding X1: 4/4 empty searches
  across two independent sessions). Don't spend build or posting effort chasing X search/growth;
  the paid API tier is explicitly NOT recommended on current evidence.
- **The comps API (Real Estate `/v1/real-estate/*`) has an open, UNSETTLED quota question**
  (`steadyapi_quota_unknown` check) and a live 429 issue on the new key
  (`steadyapi-429-rate-limited` check) — separate from the social-listening surface used for
  this research, which had zero errors this session. Don't read "plenty of SteadyAPI room" as
  covering the comps API too; that's a distinct open problem, tracked separately, not blocking
  this plan.
- **Never surface "SteadyAPI" or "realtor.com" in any public-facing post, caption, or citation.**
  Locked product rule. Any chart/number sourced through it cites "SWFL Data Gulf" only.

## Punchlist

Phased: what a human can do this week with zero new infrastructure, vs. what needs a build or an
approval first. Each numbered item below is filed as a `checks` entry (RULE 2.4) — see the IDs.

### Phase 0 — this week, manual, $0

1. **Build the flagship chart: "What $X buys across SWFL" (Lee + Collier ZIPs vs. national
   metros), real listing/ZHVI data, `[OC]`-tagged.** This is the r/dataisbeautiful template
   (round-5 finding R3) — a direct proof-of-concept for the exact post that already scores
   400+ points in that subreddit for this content genre. `check: marketing_flagship_dataviz_chart`
2. **Post that chart to r/dataisbeautiful.** Data-first title, link in a comment not the post
   body (subreddit norm), no promotional language in the post itself.
   `check: marketing_reddit_dataisbeautiful_post`
3. **Start posting market-insight content to Instagram under #swflrealestate /
   #fortmyersrealestate / #napleshomes** (211K / 60.7K / 52.5K active posts — round-5 finding
   I1) — the whitespace lane next to agent listing-tour content (finding I2). Use
   `render-social-image.ts` (already builds branded, watermarked PNGs at 4 platform sizes) to
   generate the asset; post by hand via the Instagram app until auto-post is live.
   `check: marketing_instagram_content_cadence_start`
4. **Record one Loom: a 90-second product walkthrough for the funnel landing page** — screen
   capture of a real build (address in, cited deliverable out). This is the single highest-fit
   Loom use: round-4 finding F1 says data-specific, non-generic content is the one thing that
   isn't ignored — a real live build beats any written pitch.
   `check: marketing_loom_landing_walkthrough`

### Phase 1 — 2-4 weeks, still mostly manual

5. **Weekly Instagram cadence** (1 market-insight post/week minimum) — establish the account
   before any paid/automated push. `check: marketing_instagram_weekly_cadence`
6. **Blog decision: reuse existing `/r/` report pages before building a new surface.** No blog
   route exists today (verified — RULE 0.6 says don't build net-new when something reusable
   exists). Recommendation: publish the weekly market-insight write-up as a public, cited `/r/`
   report (the surface already renders citations + freshness tokens correctly) and syndicate
   excerpts to Reddit/Instagram, instead of standing up a parallel `/blog` CMS. Revisit a
   dedicated blog only if `/r/` pages prove they can't carry SEO weight on their own.
   `check: marketing_blog_decision_r_pages`
7. **Personalized Loom walkthroughs for the first cold-outreach cycle** ("here's YOUR market
   this week," addressed to a named agent/brokerage from the DBPR spine) — attach to the T1 cold
   demo email once the rounds 1-4 outreach engine sends its first real batch. Ties directly to
   round-4 F1 ("generic automation is ignored, data-specific is the exception").
   `check: marketing_loom_personalized_outreach`
8. **Resume the cold-outreach engine build** (DBPR licensee CSV spine + brokerage email crawl +
   domain-verify UI) — already specced in rounds 1-4, not re-specced here. This is the
   conversion stage the content above feeds.
   `check: marketing_coldoutreach_engine_resume` (tracks against the existing rounds-1-4 specs,
   not a new design)

### Phase 2 — unlock automation (ask-first: cost or new vendor surface)

9. **Meta Business Verification + professional IG account linkage** — required before
   `lib/social/`'s engine can auto-post to Instagram. Ask-first (verification process + timeline
   unknown; not a code task). `check: marketing_meta_business_verification`
10. **Do NOT pursue X's paid API tier** on current evidence (round-5 finding X1: zero discovery
    value, two independent sessions). Revisit only if a future finding shows organic reach there
    — don't spend the ~$200/mo blind. No check opened; this is a deliberate non-action, logged
    so it isn't re-proposed without new evidence.
11. **Wire `social_media_storage_upload`** (existing open check — render-social-image PNG →
    Supabase Storage URL in the cron worker) — needed before the publish engine can go live even
    once credentials clear. Already tracked; referenced here for sequencing, not re-opened.

## Email marketing — grounded in what's already specced/built

Nothing new to design here; rounds 1-4 already answered most of this. Summarized for this
punchlist's sake:

- **Cold send shape:** text-forward + exactly one branded chart PNG, never a full designed grid
  email cold (round-4 F5) — full grid beauty is for the warm/opted-in track, not first touch.
- **Send-on-behalf:** each agent's own subdomain via the domain-verify backend (built, no UI —
  Phase 1 item 8 depends on this UI landing). Our own cold outreach stays on our dedicated
  outreach domain, warmed with value sends before volume (round-4 F4/F6).
- **Contact list:** DBPR `RE_rgn7.csv` (weekly, free, Lee+Collier+6 more counties, filter to
  active sales associates/brokers in our two core counties) × brokerage-directory email crawl —
  no purchased list needed (round-4 C3).
- **Cadence:** 4 touches over ~3 weeks, first follow-up carries most of the reply rate (8.4%),
  don't push past 4 unanswered (pinned 07/02 evidence, reconfirmed round-4 F10 — this question
  has been searched 5 times and stayed empty; stop re-litigating it).
- **KPI:** replies and clicks, not opens — open-rate tracking is regulatory-dying in the EU and
  community consensus everywhere treats it as a weak signal anyway (round-4 F8). Keep EU
  addresses out of any list.
- **Differentiator to state in copy:** "every email passes a compliance lint" (voice-guard.ts is
  real and shipped) — pre-send review is a documented industry whitespace (round-4 F9,
  reconfirmed 3 independent times).

## Social marketing — where/when/how, per platform

| Platform | Priority | Why | What to post | Cadence |
|---|---|---|---|---|
| **Instagram** | Primary | Agents already live in #swflrealestate (211K)/#fortmyersrealestate (60.7K)/#napleshomes (52.5K); zero market-data content there today | Market-insight charts, price-trend callouts, "what $X buys" comparisons — branded PNGs via `render-social-image.ts` | Weekly minimum, Phase 0 |
| **Reddit — r/dataisbeautiful** | Secondary | Proven genre fit (437pt housing-data post live in current hot feed); general-audience brand/proof, feeds outreach ammo | The flagship `[OC]` chart, one strong post, not a cadence | One-off flagship post, repeatable ~monthly if the first lands |
| **Reddit — r/CapeCoral / r/FortMyers / r/Naples_FL** | Low | Residents, not the customer; brand/goodwill only; self-promo reads badly here (LeeScoop.com got 0-3pts) | ONE humble build-in-public post ("I built this, tell me what's wrong") once there's something demo-able — never a product announcement | Rare, high-effort-per-post |
| **X / Twitter** | Deprioritized | Zero organic discovery, confirmed twice (round-5 X1) | N/A for growth; reactive engagement only if ever used | None planned |
| **Blog** | Deferred | No surface exists; reuse `/r/` report pages first (Punchlist 6) | — | Revisit after Phase 1 |
| **Loom** | Two concrete uses | Landing-page walkthrough (Phase 0) + personalized per-agent "your market this week" attached to cold outreach (Phase 1) | Screen-recorded real builds, never a scripted pitch | Landing: once, refresh quarterly. Personalized: per outreach cycle |

## What this plan deliberately does NOT do

- Does not re-spec the cold-outreach engine (rounds 1-4 already did — resume, don't redesign).
- Does not propose a TikTok/LinkedIn/YouTube push — no evidence gathered here supports it, and
  TikTok specifically has no adapter built + needs its own content-posting audit.
- Does not recommend paid X access.
- Does not build a new blog CMS before testing whether `/r/` report pages can carry the same
  weight.

---

## Addendum 07/16/2026 (late) — Insiders Issue 001 as the drop + beta tease

Operator directive tonight: figure out the best way to drop the Insiders Edition on
socials/Reddit/Instagram groups; tease or encourage beta testing with feedback in exchange for a
free month or two; determine how far off full use is. SteadyAPI authorized as needed. This
addendum extends the plan above — same funnel, the Insider becomes the flagship content atom.

### Why the Insider changes the content plan

The issue architecture (`_FABLE5/collection/2026-07.md` §6) produces, monthly and as a
by-product, exactly the assets the channel table above needs — no separate content pipeline:

- **The Tape → Instagram.** 12–15 sourced one-line numbers per issue = a carousel or
  single-stat card series for #swflrealestate / #fortmyersrealestate / #napleshomes — the
  211K/60.7K/52.5K-post hashtag pool where finding I2 shows ZERO market-data content today.
  Branded PNGs via `render-social-image.ts`, hand-posted (Phase 0 reality).
- **The fact-check franchise → Reddit, split by audience.** r/dataisbeautiful gets the CHART
  (July: the bifurcation tier-divergence viz — this can BE the flagship `[OC]` chart already
  tracked as `marketing_flagship_dataviz_chart`; one asset serves both obligations). The local
  subs get ONE humble build-in-public post per the R2 lesson ("I built a data desk for SWFL and
  its first issue says the papers have the story half-right — roast it"), never a product
  announcement.
- **The issue page is the only link destination.** Every drop points at the canonical issue page
  (which carries subscribe capture) — never a PDF, never the homepage.
- **Sequencing rule: the issue ships first.** No teaser goes up before Issue 001's page is live.
  Every channel drop is a pointer at a real artifact, not a coming-soon.

### The beta tease (design sketch — operator is still mulling; nothing publishes without sign-off)

- Frame: founding-reader/beta seats, capped and numbered like the issue itself — full access
  free for a month or two in exchange for structured feedback. Scarcity mirrors the
  limited-edition framing (seat count = operator decision, not set here).
- Where the ask rides: (a) the /insiders subscribe confirmation, (b) the one local-sub
  build-in-public post, (c) the issue's receipts closer. Never as a standalone promo post.
- The R2/R4 evidence says the beta ask WORKS as "tell me what's wrong with it" and dies as
  "sign up for my product" — the feedback request is the pitch, the free month is the thanks.

### How far off is full use? (audit seeds — verify, don't trust this sketch)

Hypotheses to test in the readiness audit, from today's estate: the BUILD experience is already
usable by outsiders (builds free, watermark only — locked); the CONTENT lane (Issue 001) is
days away, gated on compose + operator approvals; the SEND motion is the far edge (payments not
wired, domain-verify UI missing, several send-path live-verifies open, insiders author never run
live). If that holds, the honest beta shape TODAY is concierge: beta readers get the issue +
builds + us running sends for them, feedback calls in return — not self-serve full use. Filed as
`beta_readiness_and_offer`; punch list lands there, not here.

### Tomorrow's SteadyAPI listening targets (new questions only — don't re-run round 5)

1. **Agent-professional subreddits** — r/realtors, r/RealEstateTechnology, r/CRE and siblings:
   round 5 covered resident subs + r/dataisbeautiful but never the subs where the CUSTOMER
   talks shop. Question: does market-data content land there, and how is self-promo policed?
2. **SWFL agent-influencer graph on Instagram** — `/users/search` + `/similar-accounts` walks
   from the top #swflrealestate accounts: who holds the audience, whose comment sections are
   worth being genuinely useful in. Output: a named account list for engagement, not for DM spam.
3. **Post-timing/engagement patterns** on the three target hashtags (taken_at + like_count over
   a sample) — when the pool actually engages, to time the Tape drops.

Checks opened tonight (RULE 2.4): `insiders_issue001_distribution` ·
`beta_readiness_and_offer`.
