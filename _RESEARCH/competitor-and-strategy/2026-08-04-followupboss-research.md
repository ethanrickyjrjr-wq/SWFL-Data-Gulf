# Follow Up Boss — deep crawl4ai research

**As-of: 08/04/2026.** Source: live crawl4ai deep crawl (BFS, 40-page budget) of
`followupboss.com` + 4 direct-fetch fills for pages the BFS budget missed
(`/features/deals`, `/features/leaderboard`, `/security`, `/faq`). 36 unique
pages captured, raw markdown archived at
`2026-08-04-followupboss-deep-crawl-raw.md` (965KB) +
`2026-08-04-followupboss-deep-crawl-extra{1-4}.md` in this same directory —
gitignored, never ships. Every figure below is quoted or paraphrased directly
from those pages; page URL is cited per section so a claim can be re-verified
against the live site.

Confirmed against `_RESEARCH/competitor-and-strategy/2026-07-17-buyer-seller-
agent-augmentation-landscape.md` first (RULE 0.4) — that doc names Zillow as
competitor #9 and covers Zillow's Owner Dashboard/Premier Agent lead-gen
model, but has zero prior coverage of Follow Up Boss. This is new ground, not
a duplicate.

## What it is

Follow Up Boss (FUB) is a real estate CRM/"lead follow-up" platform, founded
2011, now **owned by Zillow Group** — confirmed on the About page: "Follow Up
Boss is now part of Zillow Group. Join FUB at Zillow and enjoy these perks..."
(`/about`). It brands itself the "Real Estate Team OS," not a generic CRM —
positioning is built entirely around one wedge: an **open, API-first CRM**
that plugs into whatever lead sources/marketing tools an agent already uses,
versus "all-in-one" platforms (Zillow's own broader ecosystem competitors like
kvCORE, BoomTown) that lock agents into a closed toolset. `/open`: "All-in-one?
Master of none... Most real estate CRMs are part of all-in-one solutions that
lock you into using what they're selling."

Scale claims (all first-party, unaudited beyond what's cited): "19,000+ top
performers" run their business on FUB (`/pricing`); "36 of the 50
highest-volume teams in the US use Follow Up Boss" (`/features/ai`); "100,000+
real estate agents" served since 2011 (`/security`).

## Product architecture — three pillars

FUB organizes its entire feature set under three verbs, repeated in every
page's nav (`Organize` / `Engage` / `Coach`):

- **Organize** — 250+ lead-source integrations, custom lead distribution/
  round-robin, Smart Lists (saved segment views), calendar sync, mobile apps.
- **Engage** — integrated calling + texting + email (agents can call/text/
  email *from inside the CRM*, not a separate tool), Action Plans
  (automated drip sequences), team inbox, company number.
- **Coach** — reporting (agent + lead-source performance), deal tracking,
  team leaderboard.

## Pricing (`/pricing`, 08/04/2026)

Three tiers, monthly or annual (2 months free annually), no contracts, 7-day
free trial extended to "14-day free trial" elsewhere on the site (minor
copy inconsistency on FUB's own site, flagged not resolved):

| Plan | Monthly | Annual | Notes |
|---|---|---|---|
| **Grow** | $69/mo per user | $58/mo per user (billed annually) | Calling is a paid add-on: +$39/user monthly or +$33/user annual |
| **Pro** (most popular) | $499/mo incl. 10 users, +$49/user | $416/mo incl. 10 users, +$41/user | Unlimited calling/texting included, team inboxes, call reporting |
| **Platform** | $1,000/mo incl. 30 users, +$20/user | $833/mo incl. 30 users, +$17/user | Teams-within-teams, dedicated Success Manager |

AI features are **included at no additional charge on every plan** — but the
site is explicit that AI quality depends on Calling data, which is a paid
add-on on Grow: "Some use data from the FUB Calling feature, which is a paid
add-on for the Grow plan. We recommend adding Calling for better AI results."

## AI features (`/features/ai`) — the "follow-up agent" behavior

This is the part of the site most literally matching "follow-up agent":

- **Smart summaries** (beta) — AI summarizes calls and recaps a lead's full
  history at a glance.
- **Suggested tasks** — follow-up tasks auto-suggested, one-click activation.
- **Smart messages** — AI drafts personalized texts/emails based on the
  lead's activity history.
- **Predictive lead prioritization** — AI-powered tags surface "high intent
  Zillow buyers and qualified sellers" automatically.

Positioning against generic AI/chatbot tools is explicit and directly
relevant to how we should think about our own AI-answer positioning: *"Third
party AI tools... don't have access to your business's data like leads,
calls, texts and emails (unless you manually upload it), so the results you
get are less personalized... FUB puts personalized AI right where you're
already working."* Their moat claim is the same shape as ours — **proprietary
first-party interaction data beats a generic model with no data access** —
just applied to call/text/email history instead of parcel/deed/permit data.

Data-use promise (FAQ on the AI page): *"We don't share it with other
customers, and it's not used to train global AI models or any external
systems."*

## Zillow Pro (`/zillow-pro`) — the buyer-intent data layer

This is the closest FUB analog to a "follow-up agent" built on **behavioral
signal**, not just CRM hygiene, and the newest push (marked "NEW" site-wide as
of this crawl). Mechanism, per the "How it works" section:

1. Agent sends a "My Agent" invitation to a contact through FUB.
2. Once accepted, the agent becomes that contact's **exclusive local agent on
   Zillow** for their market — contact sees the agent's branding (photo,
   listings, name) across Zillow instead of a competing agent.
3. The contact's **Zillow browsing activity gets sent back into FUB**, where
   it powers Smart Lists, AI-generated messaging, and next-step
   recommendations.

Claimed lift: "Messages personalized using call, text, and browsing activity
drive 2x more replies." A second stat renders as an animated counter (`0x` in
the raw markdown, image filename `5.7x.svg`) captioned "more likely to buy in
the next 90 days" — **flagging this as an unconfirmed exact figure**: the
filename strongly implies 5.7x, but the live page animates the digit in via
JS and the crawl only captured the pre-animation `0` state. Don't cite "5.7x"
as a locked FUB claim without a manual page load to confirm.

Zillow Pro is described as a "premium membership" — free basic tier exists,
but the full feature set (Smart Lists, Smart Summaries, Smart Messages, branded
profile) is behind a paywall reached only via "Contact sales" (no self-serve
price shown anywhere in the crawl — pricing is gated behind a Zillow sales
conversation, not published).

## Open API / integrations ecosystem (`/open`, `/integrations`)

- 250+ integrations, organized into categories (Lead Engagement, Nurture,
  Marketing & Direct Mail, etc.) — named partners spotted in the crawl include
  Zapier, Mailchimp, Gmail/Google Apps, Microsoft/Office365, Facebook Lead
  Ads, BombBomb, Agent Image, Agent Launch.
- "Import database from any CRM" is a stated capability across all tiers.
- Positioning line, repeated near-verbatim on `/pricing` and `/open`: *"Our
  engineering team is 100% focused on building a world-class real estate CRM,
  with an open API and a thriving ecosystem of integrations."*

## Security & compliance (`/security`)

- Certifications: **SOC 3, SOC 2 Type 2, CASA Tier 2, CCPA, PCI**. Latest
  SOC-3 report linked publicly: `s3.amazonaws.com/static.followupboss.com/
  security/followupboss-SOC3-10.31.2024.pdf` (dated 10/31/2024 — note this is
  older than the crawl date, worth a live check if this becomes load-bearing
  for us).
- Stated figures: 99.5% system uptime, 256-bit encryption, 24/7/365
  monitoring, continuous backups "every second," 35-day backup retention,
  annual Google security audits.
- Vulnerability disclosure program open to external researchers
  (`/legal-pages/your-data-is-safe-at-follow-up-boss`).
- Explicit no-sell promise: *"Your data belongs to you alone, we never sell
  it... you can take it with you if you ever decide to leave."*

## Why this matters for brain-platform

1. **The "follow-up agent" the operator asked about is not a single feature —
   it's Zillow Pro's browsing-activity feedback loop**, not FUB's base AI
   (which is calling/texting/email summarization, a different data source).
   If the intent behind this research was competitive-positioning for our own
   AI-driven follow-up ideas, Zillow Pro — not base FUB AI — is the actual
   comparable to study further.
2. **FUB's core moat argument is structurally identical to ours**: first-party
   interaction data beats a third-party model with no data access. They just
   apply it to call/text/email transcripts where we apply it to
   parcel/deed/permit/market data via the four-lane sourcing model. Worth
   citing this parallel if we ever write positioning copy about "why our AI
   beats a generic chatbot."
3. **Zillow Pro pricing is not published** — it's the one meaningful gap in
   this crawl. A real comparison (cost per agent, ROI math) would need a
   sales call, which is out of scope for a passive crawl.
4. No coverage yet of FUB's competitors from *our* market (kvCORE, BoomTown,
   LionDesk, Real Geeks) in this pass — this crawl was scoped to FUB only per
   the operator's confirmed target.
