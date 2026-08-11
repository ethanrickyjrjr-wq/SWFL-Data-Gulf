# Strongest real-estate email concepts + structure — cross-platform research

Date: 08/03/2026. Method: 4 parallel Sonnet agents, each web-search for candidate URLs then verbatim
fetch via **crawl4ai** (RULE 0.4 — no Firecrawl, no WebFetch, no memory-only claims). Every claim in
the four sections below carries its source tag: **[crawl4ai-verified]** (fetched live, content quoted
from the actual page) or **[search-snippet-only]** (WebSearch summary, page not independently
fetched — lower trust, flagged explicitly, do not promote to a hard rule without a follow-up crawl4ai
pass). Checked our own research first: `real-estate-market/2026-07-01-listing-lifecycle-marketing-research.md`
already covers the listing MARKETING STAGE sequence (Coming Soon → Just Listed → Open House → Price
Update → Pending → Sold) and drip cadence mechanics — this file does NOT re-derive that; it covers what
that file didn't: template anatomy, copy/subject-line craft, market-report email structure, and
email-client rendering constraints.

Purpose: inform SWFL Data Gulf's own email template build (`lib/email/`) — see `docs/standards/emails.md`
for the current pipeline (recipe-based, `authorDoc` → coded-grid recipe, `SEED_DOCS` starter templates,
slot rule). Synthesis section at the bottom ties findings to that real architecture.

---

## Part A — Platform/ESP template anatomy (10 platforms)

Agent scope: Zillow Premier Agent, Compass Marketing Center, BombBomb, kvCORE/BoldTrail, Follow Up
Boss, Sierra Interactive, LionDesk/Lone Wolf, Wise Agent, Luxury Presence, Real Geeks.

### Zillow Premier Agent
Fetch: mixed — main comms page live **[crawl4ai]**, template-gallery pages returned JS-shell/empty
**[crawl4ai-confirmed-empty]**. Two auto-drip email types confirmed: **market report** (monthly, per
saved area) and **saved-search/listing alert** (as-often-as-daily). Agent photo/name/contact
"prominently displayed at the top" of every drip email. No merge tags exposed publicly — configured
inside the app, not documented. **Notable cross-check: Zillow's nav lists Follow Up Boss as a bundled
solution, and FUB's own nav has a "Zillow Pro" entry** — Zillow now owns/bundles FUB; treat them as one
ecosystem, not two competitors, in any future competitive scan.
Source: zillow.com/premier-agent/communicate-with-contacts [crawl4ai]

### Compass Marketing Center
Fetch: full success — an **actual rendered agent newsletter email**, not marketing copy about one
**[crawl4ai]** (richest primary source in this pass). Confirmed live email types: Market Stats Email
Template (region-scoped), Agent Newsletter Template, "Promote a Listing" flyer block, "Win New
Clients"/pricing-strategy asset bundle, "Grow Your Brand" video-CTA block.

Literal block anatomy, in document order: logo/header → full-width hero photo → section-label row
→ body-copy paragraph → CTA image-button (UTM-tracked) → repeat (label → copy → CTA) stacked as a
single-column `<table>`, not flexbox.

Personalization model: **"just add in your headshot"** — the agent swaps ONE asset (headshot) into a
brokerage-fixed template; to localize stats, the agent manually "runs the stats and plugs them into
the template" — a manual, not automated, localization step.
Source: compass.com sent newsletter email, rendered [crawl4ai — primary]

### BombBomb
Fetch: JS-shell marketing site, nav-only after two attempts **[crawl4ai-confirmed-nav-only]** — all
content below is **[search-snippet-only]**, lower trust. Core mechanic (real differentiator): the
"template" is a **recorded video embedded in the email body**, not a data/property block — mobile app
lets agents record on-site. Cited "81% higher open rates / 67% more lead conversions" comes from a
third-party comparison blog, not BombBomb's own site — **not verified, treat as marketing-adjacent,
re-check before quoting.**

### kvCORE / Inside Real Estate — now rebranded **BoldTrail**
Fetch: full success on the help-center editor doc **[crawl4ai]**. **Cross-platform finding: "kvCORE"
the product name is gone — Inside Real Estate rebranded the whole suite to BoldTrail** (doc dated
March 2026). Any future competitive research should search "BoldTrail," not "kvCORE."

Editor is a row-based drag builder: rows carry a content-area layout (1-col/2-col/etc.), elements
(text/image/video/HTML/dynamic-content) sit inside rows, global content-width default 500px
(mobile-safe), background color set at canvas vs. content-area level, row-level overrides on top.
Documented rendering-bug workaround: **use separate text blocks instead of manual line breaks inside
one block** — line breaks corrupt saved-template formatting.

**Full merge-tag table (curly-brace syntax), pulled verbatim from the doc:**
- Lead: `{first_name}` `{first_lastname}` `{full_name}` `{primary_call}` `{email}` `{site_url}`
  `{site_url_as_link}` `{lead_location}` `{lead_address}` `{unsubscribe_url}` `{last_property_view}`
- Agent: `{agent_first_name}` `{agent_last_name}` `{agent_full_name}` `{agent_avatar}`
  `{agent_cell_phone}` `{smart_number}` `{agent_primary_call}` `{agent_email}` `{agent_site_url}`
  `{agent_signature}` `{agent_testimonial_link}` + 4 social-link tokens
- Lender: `{lender_first_name}` `{lender_last_name}` `{lender_full_name}` `{lender_avatar}`
  `{lender_cell_phone}` `{lender_primary_call}` `{lender_email}` `{lender_signature}`
- Office: `{office_phone}` `{office_fax}` `{office_address}` `{office_city}` `{office_state}`
- Team: `{team_name}` `{team_photo}` `{team_phone}` `{team_email}` `{team_website}` + 4 social-link
  tokens
- **Listing tokens require the agent to manually key in an MLS ID above the content box first** — the
  one merge-tag category that is NOT contact-bound, it's a manual per-send lookup.
- `{agent_signature}` and `{unsubscribe_url}` called out as the two "must-have" tags; unsubscribe
  auto-renders as a button, not a bare link.
Source: help.insiderealestate.com — BoldTrail Advanced Email Editor Overview [crawl4ai]

### Follow Up Boss
Fetch: full success, two blog posts with real copy-paste template bodies **[crawl4ai]**.

**A. Open-house follow-up, 6 templates** (immediate "what do you think?", SOI/warm-lead, conversation-
starter for a non-fit property, community-event invite, referral ask, newsletter opt-in) — every one
shares the identical skeleton: **Subject → "Hi [FIRST NAME]" → 1-2 sentence context → single bolded
mid-body CTA question → sign-off (Name/Phone/Team-Brokerage)**. The bolded CTA line is deliberate and
consistent, not incidental.

**B. "22 authentic client emails," by funnel stage:** 6 prospecting (cold intro, FSBO, expired-listing,
neighborhood-specific, newsletter invite), 7 nurturing (monthly market update built around a real-client
story not just stats, interstate-move departure/arrival variants, a documented **7-day/3-email+1-text
conversion sequence** with explicit timing: Email 1 immediate → Text 1 at +4min → Email 2 at +3 days →
Email 3 at +4 days, home-value/monthly-valuation nurture), 4 momentum (active-buyer open-house
alert/updates/follow-up), 5 post-closing (not reached this pass — gap).

**Merge-tag syntax is `#hash_delimited#`** (`#lead_first_name#` `#agent_name#`
`#buyer_inquired_listing_addr#` `#signature#`) — a THIRD distinct convention vs. BoldTrail's
curly-brace. **No universal industry token format exists; don't assume one.**
Sources: followupboss.com/blog/open-house-follow-up-email + /blog/real-estate-emails-to-clients [crawl4ai]

### Sierra Interactive
Fetch: full success **[crawl4ai]**. Email types: custom property alerts, new-listing/open-house
invites, seller-focused market alerts, automated drips, occasion-based touches (birthdays, holidays,
**closing-date anniversaries**). **Architectural outlier: Sierra explicitly defers template authorship
to connected third-party ESPs (Mailchimp, Mandrill, SendGrid) plus Zapier** — unlike every other
platform here, which templatizes inside its own proprietary editor.
Source: sierrainteractive.com/our-solutions/real-estate-email-marketing [crawl4ai]

### LionDesk → now "Lone Wolf Relationships"
Fetch: full success **[crawl4ai]** — confirms product renamed/absorbed after 2021 acquisition. AI
email composer exists, and **Lone Wolf's own FAQ explicitly warns to double-check its AI-drafted
message accuracy** — the vendor itself flags hallucination risk on its own writer. No block-anatomy
detail exposed on the marketing page (feature-list copy only, not an editor walkthrough) — flagged gap.
Source: lwolf.com/products/liondesk [crawl4ai]

### Wise Agent
Fetch: full success **[crawl4ai]**. Content library: monthly newsletters (multi-channel — email, link,
or print from one asset), auto-populated property flyers, postcards (Xpressdocs), stock multi-touch
campaigns. **Differentiator: Wise Agent treats print letters and phone-call tasks as first-class steps
inside the same drip sequence as email** — not email-only. AI Writing Assistant "powered by GPT-4™"
(vendor's own naming — flag for verification if the literal model name is ever quoted externally).
Source: wiseagent.com/features/marketing.asp [crawl4ai]

### Luxury Presence
Fetch: mixed — 16-template drip page fetched in full **[crawl4ai]**; 33-template gallery page blocked
twice by a Cookiebot consent-banner shell **[crawl4ai-confirmed-blocked]**.

**Fixed skeleton across all 16 fetched templates:** `Subject → "Hi {first name}," → 2-4 sentence body
→ sign-off "{your name}"` — plain-text-style relationship emails, no images/buttons in the copy itself
(sharp contrast with Compass's image-block newsletter).

Buyer track (8): intro → process explainer (4 steps) → new-listings digest (3 bullets) → pre-approval
education → market update (3 data points) → seasonal check-in → mistakes-to-avoid → special offer.
Seller track (8): intro → home-value education → prep/staging tips (cites Remodeling Magazine 2025
Cost vs. Value, ~96% ROI minor kitchen remodel) → market update for sellers (price-change %/DOM/buyer
demand) → agent-value-vs-FSBO (cites NAR 2024 Profile of Buyers/Sellers) → seasonal check-in → process
explainer → special offer. Both tracks: 8 emails over 3-6 months.

**Cited case-study number (single case, not a benchmark):** a 3-email drip for a Chicago agent — Email
1 = 31% open, Email 2 = 43% CTR, 0% unsubscribes across the sequence, +43% buyer engagement.
Merge tokens: `{first name}` `{area}` `{your name}` `{scheduling link}` — a FOURTH distinct
curly-brace convention (looser than BoldTrail's).
Sources: luxurypresence.com/blogs/real-estate-drip-campaign-templates [crawl4ai] · /real-estate-email-templates [crawl4ai-blocked]

### Real Geeks
Fetch: full success on both pages **[crawl4ai]**. Templates library: "Create From Library" (vendor-
authored) vs. "Create New" (custom), scopable private or team-shared. Automated products sit alongside
manual templates as distinct email PRODUCTS: **Market Reports, Saved Searches/Property Alerts, Home
Valuations** — each with its own page, suggesting they're templated as named products, not generic
drip steps. Doctrine (stated verbatim): keep templates short, merge-field the greeting, end with an
open-ended question, favor helpful info over sales pressure. Example line given: *"Are there any
specific neighborhoods or price ranges you're most interested in right now?"*
Sources: support.realgeeks.com CRM Email Templates + realgeeks.com/automated-email-drip [crawl4ai]

### Cross-platform patterns (repeats across 3+ platforms — this is the signal)

1. **Universal 5-part skeleton**, regardless of visual form (image-block HTML at Compass vs.
   plain-text relationship email at FUB/Luxury Presence): `Header/branding or greeting → context/value
   block → (optional) property/market data block → single explicit CTA → agent sign-off block (name,
   phone, team/brokerage)`.
2. **Agent identity block sits at the TOP, non-negotiable** — Zillow (photo/name/contact "at the top"),
   Compass (logo+hero leads), BoldTrail (`{agent_avatar}` modeled as a reusable content element).
3. **Market-update/report is the single most universal recurring email type** — present at Zillow,
   Compass, Sierra, Luxury Presence (both tracks), Real Geeks, Wise Agent. Every platform templates
   this in some form, out of the box.
4. **Listing/property alert is the second-most-universal type** — Zillow, Sierra, Real Geeks,
   BoldTrail, FUB all treat it as a scheduled/automatable send, distinct from one-off manual sends.
5. **Merge-tag syntax is fragmented, not standardized** — 4 distinct conventions directly observed
   (`{curly}`, `#hash#`, loose `{curly}`, none at all/manual for Sierra). **SWFL Data Gulf is free to
   pick its own without breaking an implicit standard** — but document it clearly since incoming agents
   bring muscle memory from whichever delimiter they used before.
6. **Drip/nurture arcs run 3-6 months, ~1 email every 2-3 weeks, 6-8 emails, segmented buyer/seller
   from email #1** (explicit at Luxury Presence; implied at FUB/Sierra/Real Geeks/Wise Agent). FUB's
   7-day high-frequency sequence for HOT leads, layered on top of the slow drip for cold ones, is a
   real two-speed pattern worth keeping distinct.
7. **Compliance/footer mechanics are barely public** — only BoldTrail exposed a real mechanism
   (`{unsubscribe_url}` auto-button). No platform's public marketing showed brokerage-disclosure or
   CAN-SPAM footer copy — source that from compliance/legal reference, not competitor imitation (we
   already have this: `docs/email` CAN-SPAM address requirement, see synthesis below).
8. **Two mutually-exclusive customization models**: (a) swap one fixed variable into a brokerage
   template (Compass: headshot only) vs. (b) full merge-tag/AI generation (BoldTrail's table, Lone
   Wolf's AI composer, Wise Agent's GPT-4-branded assistant). Sierra sits in between (defers to a
   connected ESP). **This is a real fork we already resolved** — our `SEED_DOCS` slot rule (open slot
   = real-data-dependent field, filled = structure/brand/CTA) is closer to (b) but constrained by the
   no-invention gate, which none of these vendors document publicly.

---

## Part B — Copy & subject-line craft

### Subject-line formulas (source: Luxury Presence, 14-type taxonomy, richest single find)
Named types with quoted real examples: pain-point (*"Worried about high interest rates? Read this."*),
sales-driven/urgency (*"Price reduced: get in before it is gone."*), informational, follow-up,
humorous (*"If this house were any more perfect, it would be illegal."*), personalized
(*"{First name}, your next home is waiting."*), exclusive-offer, event-based, testimonial,
curiosity-driven (*"This home has a secret. Find out what it is."*), local (*"The best homes in
{neighborhood} are waiting for you."*), time-sensitive, cold-email, newsletter. Just-sold formula from
their FAQ: *"Just sold in {neighborhood}: here is what it means for your home's value"* +
*"{First name}, your neighbor just sold. Curious what your home is worth?"* [crawl4ai]

**Inman (interview, Jimmy Mackin, Listing Leads co-founder)** — candid, named-source examples:
*"How much equity did you gain this year?"* (CMA/equity-check — "20-25% of responders transact within
12 months," one member got 17 CMA requests off one send); *"Will this change your plans to sell?"*
(rate-drop nudge); *"I might get fined for sending you this…"* (pre-appointment teaser — "the absence
of a CTA is actually the CTA"); *"I was wrong."* (post-appointment momentum); *"Forward to a friend."*
(referral engine, primes forwarding in the subject line itself). **Mackin's contrarian take:**
*"Segmentation has caused more harm than good. Don't say no for the prospect before they have a chance
to say yes."* — worth weighing against the segmentation-everywhere consensus below; his point is
specific to a single high-response prospecting email, not ongoing nurture. [crawl4ai]

**HousingWire** (Coffee & Contracts / Fello templates): *"Be one of the first to see this
[neighborhood] home 👀"*, *"📈Your neighbor's home value is up [XX]%"*. Claims emoji lift open rate
5-15% (citing Campaign Monitor) — **contradicted** by **The Close** citing Nielsen Norman Group: emojis
raise negative sentiment 26%, don't lift opens. **Unresolved disagreement — A/B test in-house, don't
pick a side from secondary sources.** [crawl4ai, both]

**The Close**: rule of thumb — spend twice as long on the subject line as the body. Movie-title/song-
lyric subject lines average 26% open rate (Retention Science via SuperOffice); "video" in the subject
line +6% open rate (same secondary chain). [crawl4ai]

**Placester**: prefer clarity over cleverness (*"May Market Update"* over cute copy), target 30-40
characters. Citing Adestra: the literal word **"Newsletter"** correlates with WORSE open rates; "Special,"
"Update," "Bulletin" outperform it. Subject-line consistency across sends beats novelty each time.
[crawl4ai]

### Personalization beyond first name
Behavior-triggered: saved-search hits, on-site listing views drive the follow-up content (Luxury
Presence, Placester — both crawl4ai). **Personalized "From" address** matters, not just body copy —
send from a real human address and allow replies (Placester, citing a widely-repeated but only
secondary-cited "6x higher transaction rate for personalized emails" MarketingLand/Experian stat — not
independently verified at the primary source). AI-drafted personalization framed as
draft-then-human-approve, never auto-send (Luxury Presence). [crawl4ai]

### Segmentation
Near-universal axes: geography, buyer/seller/persona type, funnel stage, past interactions, property
preferences, lifecycle stage (new/active/past client) — converges across Luxury Presence, Placester,
The Close, Constant Contact [all crawl4ai]. Quantified lift: **segmented emails drive 30% more opens,
50% more clicks** (Placester citing HubSpot 2023 — secondary citation, HubSpot not independently
crawled). Counter-view: Mackin's single-email exception above.

### Benchmarks (flagged by reliability — do not treat any of these as settled)
- Open rate 25-40% industry range (Placester, Luxury Presence) [crawl4ai]
- CTR 2-5% / ~2.5% real-estate-specific (Placester, Luxury Presence citing Mailchimp 2025) [crawl4ai]
- **Apple Mail Privacy Protection (2021+) pre-loads tracking pixels and inflates open-rate numbers
  ecosystem-wide** — independently flagged by 3 sources (Luxury Presence, Constant Contact, The Close,
  all crawl4ai) — weight CTR/reply-rate/appointment-conversion over open rate.
- 95-word email beat 170-word version by 17% CTR, same topic (Placester citing Marketing Experiments
  Blog, single A/B test) [crawl4ai]
- ≤3 images and ≤20 lines of text produced the highest CTR across a 2M+-email sample (Placester citing
  Constant Contact) [crawl4ai]
- Two DIRECTLY CONFLICTING "% who decide to open from subject line alone" numbers: 47% (The Close,
  citing FinancesOnline) vs. 33% (RISMedia, citing an unnamed HubBlog source) — **unresolved, both
  secondary citations of different studies.**
- Two CONFLICTING best-send-time claims: general emails 9-11am (HousingWire citing Mailshake) vs.
  property-specific emails 3-5pm (Placester citing Kissmetrics) — **unresolved, A/B test don't assume.**
- Frequency: 1-2/week to active leads, 1-2/month to past clients/long-nurture; if unsubscribe rate
  exceeds 0.5%/send, cut frequency (Luxury Presence) [crawl4ai]

### Top 10 concrete craft rules (source-backed, directly actionable)
1. Match subject-line type to campaign intent (Luxury Presence's 14-type table as a lookup).
2. Keep subject lines 30-40 chars (3 independent sources agree).
3. Personalize past first-name — reference the specific neighborhood/saved-search/behavior that
   triggered the send.
4. Segment at minimum past-client / active-lead / cold-lead (most-cited concrete failure: sending a
   "First-Time Buyer Guide" to someone who closed last year).
5. One CTA per email, never three.
6. Reply-ability is a feature — send from a real address, invite replies, never "do-not-reply."
7. Shorter copy measurably wins (95 vs 170 words, +17% CTR); mobile paragraphs ≤3-6 lines.
8. Cap at ≤3 images, ≤20 lines of text (2M+-email sample).
9. Treat open rate as directional only post-2021 Apple MPP; weight CTR/reply/booked-appointment.
10. A/B test one variable at a time, every send, forever — never subject AND CTA in the same test.

---

## Part C — Market-report / CMA email structure

Agent scope: Keeping Current Matters, Rev Real Estate School, EmerickTech, NAR, Tom Ferry, ATTOM/
RealtyTrac, Redfin/Zillow.

### Keeping Current Matters (KCM)
The flagship "Monthly Market Report" is a **30-min video + slide deck**, not an email — KCM aggregates
(Fannie Mae/Freddie Mac/NAR), the agent watches once/month, then lifts slides into presentations/social/
email. The actual **Email Builder product** is block-based (drag-and-drop sections), copy/paste into
any CRM, personalized with agent photo/contact/brand-color per block — content gets assembled per-send
from a block library, not a single rigid template. Their live "Deep Dive" resource page shows the real
sequence: **headline hook (behavioral, not a stat) → three parallel content pieces offered (article/
social graphic/video script) → ONE supporting stat as a plain sentence, not a chart → CTA tied to
starting a conversation**, not a dashboard. [crawl4ai, multiple pages]

### Rev Real Estate School — "Market Mondays" (best concrete find, verbatim template captured)
A named, currently-taught **weekly** seller-listing-update email, 4-section anatomy + close:
1. **Feedback** — showing/inquiry counts, "what this means for us," always "we" never "you."
2. **Market Update** — positions the listing vs. market via hard figures + links to comparable
   listings (not embedded charts): new comps, comp sales, comp price-reductions. Language rule: hedge
   ("suggests"), never assert.
3. **Marketing** — MLS view/favorite counts + non-MLS traffic (social, site visits, open-house counts),
   embedded social graphics.
4. **Recommendation** — a specific numeric ask (e.g. a price-reduction range), reasoned from §2/§3.
5. **Conclusion** — always closes pushing to a **phone call**, never stays in email.
Cadence: weekly, deliberately — the email exists to force a recurring seller touchpoint and build the
paper trail toward a justified price reduction, paced to the seller's anxiety cycle, not to data
freshness. [crawl4ai — full template captured]

### EmerickTech
Core thesis, quoted: *"A useful market update email should explain what changed, what that change may
mean for the recipient, and what they should consider doing next. It should not simply repeat market
statistics."* Named failure modes: same update to buyers and sellers; stats with no stated reporting
period; broad-market content when the contact cares about one price range/property type; predictions
the data doesn't support; no next step. [crawl4ai]

### NAR (existing-home-sales release) — cleanest "big number to a lay reader" example found
Anatomy, in order: **(1) one giant bare number first** (`-2.4%`), above any sentence — **(2)** one
plain-English "Latest News" paragraph translating it — **(3)** named-economist quotable commentary
(authority-voice layer, explicitly separated from the raw number) — **(4)** escalating-depth links,
cheapest first (full release → summary PDF → supplemental data PDF) — **(5)** forward-looking
transparency: exact date/time of the NEXT release, stated plainly — **(6)** reproduction/licensing
notice in-body, not buried in a footer — **(7)** below-the-fold expandable table + two related teaser
cards, each with its own single headline stat. Grain: national + 4-region only; ZIP/neighborhood grain
is explicitly left to local MLS/association layers — which is exactly our lane. [crawl4ai]

### Tom Ferry
Verbal "how's the market" script (not a written template): lead with blunt honesty on the market,
immediately pivot to the client's own situation ("how are YOU doing?"), use follow-ups to surface
referral/motivation rather than dumping more stats. Broader monthly-update video script library exists
behind his coaching membership — not independently retrieved [search-snippet-only for that specific
claim].

### ATTOM/RealtyTrac, Redfin, Zillow
**No verified email-anatomy claim exists for any of these three.** ATTOM's "Housing News Report" is a
quarterly trade publication (data vendor feeding OTHER companies' reports, not a per-agent client
email) [search-snippet-only]. Zillow Research and Redfin's "Housing Market Tracker" (reported weekly,
Thursdays by 1pm ET [search-snippet-only]) both live as always-on web dashboards, not discrete
newsletter templates — neither publishes a documented email format. Don't cite these as email-structure
examples; they're data-portal companies, a different genre than KCM/Rev.

### Recommended content sequence for a market-report email (synthesized across all of Part C)
1. **One headline number, alone, first** — before any sentence (NAR's bare `-2.4%`; KCM's single
   equity-figure sentence).
2. **One plain-English sentence translating it** — direction + "why," no jargon (NAR's "Latest News"
   pattern).
3. **A named-authority interpretation line** — direct, not hedged into mush, but never inventing beyond
   the audited figure (our no-invention gate applies here exactly).
4. **Local grounding, one comparable-level cut** — new/sold/reduced comps with a link OUT to the
   properties, not a full inline data table (Rev's "Market Update" section) — cite the source
   explicitly.
5. **A single supporting chart as a static image**, not an HTML data table (email-rendering consensus,
   Part D) — one chart, not a dashboard.
6. **A recommendation/"what this means for you" line, segmented by recipient type** (buyer/seller/past
   client) — EmerickTech's central complaint is exactly generic, unsegmented market emails.
7. **A close that pushes to conversation, never ends on a number** — Rev always asks for a call; Tom
   Ferry flips every stat exchange back to the client; KCM closes on "start conversations."
8. **A reporting-period stamp + next-update date, stated plainly** — doubles as provenance and
   cadence-setting (matches our own as-of-date convention exactly).

Cadence: pick by the JOB the email does, not a fixed "best practice" number — NAR's monthly mirrors the
underlying data drop (aggregate education); Rev's weekly is paced to seller anxiety during an active
listing (maintenance, not education). Two different jobs, two different correct cadences.

---

## Part D — Email-client rendering constraints (data-heavy emails specifically)

Agent scope: Litmus, Campaign Monitor, Email on Acid, caniemail.com — 19 pages fetched live.

### Tables vs. div/flexbox/grid
Outlook desktop (Windows, 2007-2019) renders via the **Word engine**, not a browser engine — it
switched to Word in Outlook 2007, and CSS support actually REGRESSED at that point vs. the pre-2007
IE-based renderer [crawl4ai — Litmus]. Verified directly against **caniemail.com's live support
table**: `display:flex`/`display:grid` show NO version cell at all for Outlook Windows (any version) —
but ARE supported on Outlook macOS, Outlook.com, Outlook iOS/Android, Apple Mail, Gmail (all surfaces),
Yahoo, AOL. Overall ecosystem support ~83%, with the entire gap concentrated in Outlook Windows desktop
— disproportionately the client real-estate brokers/agents on corporate email actually use.
**Practical rule: flexbox/grid can be a progressive enhancement, but the base skeleton must stay
table-based** if Outlook Windows recipients are plausible (assume yes for this audience). [crawl4ai —
caniemail.com, Litmus]

`max-width` shows 100% support on caniemail but with a caveat: Outlook Windows only honors it on
`<table>` elements, not `<div>`s — this is why the "ghost table" fluid-hybrid technique exists.
[crawl4ai — caniemail.com]

Nested tables: cap depth at 4-6, always set `cellpadding="0" cellspacing="0"` explicitly (clients
inject their own defaults otherwise), don't trust percentage-width math in Outlook (4× 25% cells can
render >100% and drop a column to its own row — pair with explicit MSO ghost-table pixel widths).
[crawl4ai — Litmus]

`role="presentation"` on every LAYOUT table (screen readers otherwise announce it as a data table);
leave it OFF a table that's genuinely presenting real tabular data. [crawl4ai — Email on Acid]

### 11 concrete Outlook/Word-engine bugs + fixes (Email on Acid, current as of Sept 2025 update)
1. Random white lines — convert odd font-size/height values to even; add a ghost `<br>`; or
   `border-collapse:collapse; mso-table-lspace:0pt !important; mso-table-rspace:0pt !important;`.
2. Animated GIFs render first-frame-only on Outlook 2007-2016 desktop — put the CTA in frame one.
3. CSS background images unsupported on Outlook desktop app — VML is the only real fallback.
4. Margin/padding ignored inside `<div>` — divs collapse to text-height/100%-width regardless of
   declared size; this is the whole reason ghost-table/ghost-column techniques exist.
5. 1px border added to table cells (Outlook 2016 bug) — fix with `border-collapse:collapse`.
6. Link styling stripped when there's no real `http(s)://` href — wrap in a `<span>`, style the span.
7. Image resizing ignores CSS — must set the HTML `width` attribute on every `<img>` for Outlook to
   actually scale it.
8. `<div>` width/height ignored entirely (same root cause as #4).
9. Custom web fonts fall back to Times New Roman (not the next stack entry) unless an attribute-
   selector override or MSO conditional font block is used.
10. Line-height renders taller than expected — fix with `mso-line-height-rule:exactly;` before the
    `line-height` declaration.
11. Multi-column alignment breaks — fixed via the ghost-column technique (MSO-conditional table
    constraining Outlook only).

Additional: Outlook users have **images disabled by default** — ALT text is the only pre-click signal,
not optional. MSO conditional comments (`<!--[if mso]>...<![endif]-->`) are the standard mechanism for
Outlook-only markup; Outlook Mac/iOS/Android do NOT use the Word engine and ignore MSO conditionals
entirely (they behave like modern clients). [crawl4ai — Email on Acid]

### Dark mode — three distinct behaviors, not one
| Behavior | Clients |
|---|---|
| No change (opt-in only) | Apple Mail |
| Partial invert (light backgrounds detected) | Gmail mobile app, Outlook Web App, Outlook mobile |
| Full invert, NO coding workaround | **Outlook desktop (Windows), Gmail desktop webmail** |

Required head markup (both needed together): `<meta name="color-scheme" content="light dark">` +
`<meta name="supported-color-schemes" content="light dark">` + a `@media (prefers-color-scheme: dark)`
block. For Gmail-mobile/Outlook-web/mobile, use `[data-ogsc]` (foreground) / `[data-ogsb]` (background)
attribute selectors — **must repeat the attribute on every comma-separated selector**, not just the
first (`[data-ogsc] p, [data-ogsc] p a` — NOT `[data-ogsc] p, p a`). Never use pure `#FFFFFF`/`#000000`
— multiple clients force-invert these even with `!important`; use near-white/near-black (`#FEFEFE`/
`#0E0E0E`). Logos/icons need a midtone color, stroke, or background shape to survive uncontrolled full
inversion where there's no workaround at all. Avoid CSS `filter` for dark-mode image handling — only
~45% ecosystem support per caniemail, ~15% in Litmus's own Gmail-heavy audience. [crawl4ai — Litmus,
Campaign Monitor]

### Mobile responsiveness — fluid-hybrid ("spongy") is the real pattern for stat grids
Media-query-only responsive fails silently on any client that strips `<style>`/media queries — renders
desktop-width on a phone with zero fallback. Fluid-hybrid degrades gracefully instead: build tables at
`width="100%"` (not fixed px) + `style="max-width:600px"` on the same table + an MSO-conditional
**ghost table** giving Outlook a literal fixed-pixel fallback (verbatim code pattern captured in the
full crawl output). Plain side-by-side `<td>` stacking (the older responsive pattern) misaligns on some
Android clients, especially with unequal column heights — **exactly the failure mode a 3-4-column stat
row or property-card grid would hit**; use fluid-hybrid instead. Set both the HTML `width` attribute
AND CSS `width:100%; max-width:...px` on every `<img>`. [crawl4ai — Litmus, Email on Acid]

### Hard size/weight limits
**Gmail clips any message whose HTML/CSS source exceeds ~102KB** — images don't count, but the clip
lands mid-document wherever the byte limit hits, which can (and does) sever an open `<table>`/`<div>`
tag and break visible layout, not just cut trailing content. Stay under 80-100KB in practice — ESP-
injected tracking/footer markup adds bytes after your authoring is "done." Fixes: strip HTML comments,
remove stale client hacks, audit unnecessary nested tables, check the ACTUAL sent HTML (not just
source), minify with an **email-safe** minifier only (a generic one strips MSO conditionals and breaks
Outlook). Non-ASCII characters can also trigger clipping independent of byte size if the ESP doesn't
send correct UTF-8. AMP for Email has an independently documented ~100KB ceiling too — reinforcing
100KB as the real ecosystem-wide number. [crawl4ai — Litmus, Email on Acid]

**Not independently verified (snippet-only, re-check before hard-coding):** mobile Gmail clipping
thresholds reportedly lower than desktop (~20KB iOS / ~75KB other mobile); individual image-weight
ceiling (100-500KB range varied across 7 summarized sources, none fetched live this session).

### Hard constraints checklist (do's/don'ts, source-traced — usable as a literal template lint)
- DO build the base layout in nested tables, not div/flexbox/grid (Outlook Windows has zero support).
- DO `role="presentation"` on layout tables only.
- DO `cellpadding="0" cellspacing="0"` explicitly on every layout table.
- DO cap nested-table depth 4-6.
- DON'T assume percentage-width columns sum to 100% in Outlook — pair with MSO ghost-table pixels.
- DON'T size a `<div>` with CSS width/height and expect Outlook to respect it.
- MAY layer flexbox/grid as progressive enhancement on top of the table skeleton (~83% support).
- DO fluid-hybrid (100%-width table + max-width style + MSO ghost table) for any stat grid/card row.
- DO set HTML `width` attribute AND CSS width/max-width on every `<img>`.
- DON'T rely on media queries alone for a multi-column stat row.
- DON'T use plain `<td>` stacking for 3-4 column comparisons if Android clients are in the audience.
- Bake in the 11 Outlook bug-fixes above as standing defenses, not one-off patches.
- DO both dark-mode meta tags + media query together; DO `[data-ogsc]`/`[data-ogsb]` repeated per
  selector; DON'T pure white/black anywhere; DO midtone/stroke/background-fill on logos/icons.
- DON'T exceed ~100KB HTML/CSS source (target <80KB); DO check actual ESP-sent HTML size, not source;
  DO use an email-safe minifier only.
- UNVERIFIED, don't hard-code yet: individual per-image KB ceiling.

---

## Synthesis — what this means for our build

Ties findings to the real pipeline (`docs/standards/emails.md`, `lib/email/CLAUDE.md`): recipe-based
`authorDoc`, `SEED_DOCS` starter templates with the slot rule (open = real-data-dependent, filled =
structure/brand/CTA), `buildChartForQuestion` + `assertHeroChartCoherence`, CAN-SPAM footer with a real
postal address, `lib/email/social/platforms.ts` as the one social root, segments in `lib/email/segments/`.

**Already matches what the best players do, independently arrived at:**
- Our SVG-in-Outlook fallback (`lib/email/CLAUDE.md`: "SVG icons render as text in Outlook — use the
  established fallback") is exactly Part D's finding — no new work, just confirms the existing
  workaround is the right one.
- Our chart-coherence gate (`assertHeroChartCoherence`) and "chart as one real image, not an invented
  dashboard" posture matches Part C's universal "one supporting chart as a static image, not a data
  table" pattern and NAR's "one headline number first" anatomy.
- Our CAN-SPAM footer with a real business address is the one compliance element Part A found **no
  platform publicly documents** — we're not behind here, we're ahead of the public-marketing layer of
  every vendor scanned.
- Our as-of-date convention (MM/DD/YYYY, stated once) matches NAR's "reporting period + next-release
  date stated plainly" anatomy element exactly.

**Real gaps/opportunities worth acting on:**
1. **A market-report recipe should follow the 8-step sequence in Part C's synthesis** (headline number
   → plain-English translation → authority line → local comp grounding with a link out → one static
   chart → segmented recommendation → conversation-pushing close → reporting-period/next-update stamp)
   — this is a concrete, source-backed content order we don't currently encode as a named recipe shape.
2. **Subject-line discipline**: adopt Luxury Presence's 14-type lookup table as a reference when
   authoring subject lines for any recipe/blast — currently no documented subject-line convention in
   `lib/email/`.
3. **Merge-tag/personalization convention**: we're free to define our own token syntax (no industry
   standard exists — 4 different conventions observed) but should document it once, clearly, since
   incoming agents bring muscle memory from BoldTrail/`{curly}` or FUB/`#hash#` conventions.
4. **Fluid-hybrid pattern for stat grids/property-card rows** — worth an explicit lint/check in the
   base email template if we're not already using the ghost-table technique for multi-column stat
   blocks (verify against current `lib/email/` layout code before assuming a gap).
5. **Weekly "Market Monday"-style listing-maintenance email** is a concrete, currently-taught, named
   pattern (Rev Real Estate School) distinct from our existing lifecycle stages — could be a new
   recipe candidate for active listings specifically, separate from the one-time price-improved/
   back-on-market stage emails we already ship.
6. **100KB HTML/CSS source ceiling** is a real, source-verified hard number — worth a build-time lint
   check on any recipe/template if one doesn't already exist (verify against current pipeline before
   building).

**Gaps to close with a follow-up crawl4ai pass, not yet done:**
- BombBomb's real template anatomy (site is JS-shell; only marketing-blog claims exist).
- Really Good Emails' real-estate category gallery (JS-rendered, didn't come through in either agent's
  attempt) — would need a JS-rendering crawl mode or different retrieval approach.
- Individual per-image KB ceiling for email attachments (100-500KB spread across summarized sources,
  none fetched live).
- Mobile-specific Gmail clipping thresholds (differ from the verified 102KB desktop number, per
  snippet-only sources).

---

## Full source list (representative, not exhaustive — see each Part for inline citations)

Part A: zillow.com/premier-agent, compass.com (live sent email), help.insiderealestate.com (BoldTrail),
followupboss.com/blog (×2), sierrainteractive.com, lwolf.com/products/liondesk, wiseagent.com,
luxurypresence.com/blogs (×2), support.realgeeks.com, realgeeks.com.

Part B: luxurypresence.com/blogs (subject-lines, email-marketing, metrics), inman.com (Mackin
interview), housingwire.com, theclose.com (×2), placester.com/real-estate-marketing-academy (×4),
constantcontact.com/blog, rismedia.com (blog.rismedia.com).

Part C: keepingcurrentmatters.com (mmr, email-builder, content/email-templates-download, the-deep-
dive), revrealestateschool.com, emericktech.com, nar.realtor/research-and-statistics, tomferry.com,
attomdata.com (skip/thin), zillow.com/research (skip/thin).

Part D: litmus.com/blog (×6), campaignmonitor.com/css + /resources/guides/dark-mode (×4),
emailonacid.com/blog (×5), caniemail.com/features (×3, live support-data tables),
reallygoodemails.com/categories/real-estate (attempted, JS-rendered, not usable).
