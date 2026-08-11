# STEADY PAINS — the distilled buyer/seller/agent pain reference (LOCAL ONLY)

> **What this is:** the one durable, weighted distillation of every SteadyAPI/crawl4ai research
> round in this folder — the pains home buyers, home sellers, buying agents, and listing agents
> actually voice, with the real numbers and quotes to speak to them, and what WE already hold
> against each one. The dated files are the evidence trail; this file is what you load when you
> need to talk pain.
>
> **Standing rules:** this folder is gitignored (commit 99c724f0, 07/17/2026) — this file NEVER
> goes to GitHub. Never surface the SteadyAPI name to end users (it's plumbing). Raw payloads with
> Reddit usernames stay in session scratchpads, never here. Update this file (and re-weight) after
> every new research round — it goes stale the moment a round lands that isn't folded in.
>
> Last folded round: 07/17/2026 (buyer/seller agent-augmentation landscape, 168 ranked items).

---

## TIER 1 — THE HEADLINE WHITESPACE (lead with these; the pitch spine)

### 1. An entire industry scores seller stress — and deliberately hides the score from the seller
Propensity-to-list / seller-stress scoring is proven commercially viable at scale: **Homebot**
(8M+ homeowners, "Likely to Sell Score" on 150M+ rows — but the score displays on the agent/loan
officer's clients tab, never the homeowner's own report), **CoreLogic Realist "Sell Score"**
(0–1000, a searchable MLS field for agent farming), **Datazapp "Home Seller Score"**
($0.025–$0.04/record, sold to nine buyer types — agents, lenders, investors, roofers, recruiters —
everyone EXCEPT the homeowner it describes). One industry source states the score is "deliberately
not included in shared reports, since those exist specifically to help agents negotiate, not to be
shown to the person they describe." **Nobody works FOR the seller.**
**Our match:** seller-stress signals (delisting rate, price-drop rate, cancellation rate by ZIP) +
the listing-lifecycle state machine are ALREADY BUILT and under-surfaced. Facing them to the seller
needs zero new data acquisition. Check filed: `marketing_seller_stress_signals_face_the_seller`.
Source: `2026-07-17-buyer-seller-agent-augmentation-landscape.md` items 1, 8, 13, 14.

### 2. Nobody sells agent-independent decision support for the stress moments
Every "augmenting" company found either replaces the transaction (iBuyers), replaces the agent
(rebate brokerages), or monetizes through a referral fee / attached-service margin
(HomeLight/UpNest ~30%+ commission cut, Curbio/Revive renovation markup). **No company is paid
directly and only by the consumer** for independent whether/when/at-what-price judgment. In four
separate real threads, the only source of that judgment was an anonymous Redditor typing it for
free — one literally offered "DM me if you want to discuss more." Sellers structurally CAN'T fire
their agent mid-listing (two-broker risk), so parallel data/checks — not a competing broker — is
the lane "just switch agents" advice never closes.
Source: landscape items 2, 16, 17, 24.

### 3. Sellers ask, by hand, for exactly the dashboard we already generate
A seller asking "what metrics should I watch when deciding to sell" got the answer hand-typed:
months of inventory, median DOM, sale-to-list ratio, share of listings taking price cuts in your
exact ZIP/price band. OP: *"Dude. Thank you. This is the type of answer I was looking for!"*
That is our delisting/price-drop/cancellation-by-ZIP output, described by a stranger for free.
Redfin's own data: record 112,788 delistings in one December, ~45,000 relisted the following
January — a huge population of mistimed listings nobody tracks the outcome of (our lifecycle state
machine already holds the substrate: new/active/price-cut/holding/relist + sold price/date).
Source: landscape items 3, 5, 6.

### 4. Augment-don't-replace is now the institutionally validated position
**Realtor.com RealAssist** (launched 06/02/2026, on Gemini) states it verbatim: "It does not
replace the agent, but raises the quality of every client conversation." AI does the early
homework; the human does the high-stakes moments. Our stricter never-invent/four-lane bar is the
differentiator, not the shape. Counter-benchmark: **HomeBuyer Copilot** (prepaid ~$9 credits, no
lead-selling) is the one genuinely consumer-paid buyer tool found — proof the model is legible.
Source: landscape items 18, 19.

### 5. The agent trust line: automate the boring middle, never the client-facing send
Agents draw one consistent line, unprompted, across threads: *"Full automation? Nah... people
smell a bot instantly and once it feels canned, trust is dead"* — but comps, drafts, deadlines,
CRM updates, transaction back-office is "where hours actually vanish" and they WANT it handed off.
The part clients pay for (negotiation, local judgment, being trusted) stays human. **Keep the
pre-send edit gate non-negotiable forever.** Corroborated by the pre-send-QA whitespace: *"In 23
years, I have never heard of a brokerage reviewing anything whatsoever except contract documents"*
— pre-send review is structurally absent industry-wide (independent-contractor structure), genuine
product whitespace.
Source: `2026-07-16-round5-recurring-problems-solutions.md` finding 1; round3 Q9.

---

## TIER 2 — PAIN VOCABULARY WITH REAL NUMBERS (the speak-to-pain ammo)

### Insurance is the emotional center of the SWFL seller story
First-person, named-number testimony (r/AskFlorida, live-pulled 07/16/2026):
- *"My homeowners insurance was $1,800 ten years ago... it's now $5,900."* [31↑]
- *"From 2010–2020 my HOI was $900/yr. From 2020–2026 it increased to $4,800. FOR NOTHING...
  I 100000% am looking to leave FL."* [26↑]
- Insurer-of-last-resort quote of **$11k/yr against an $883/mo mortgage**: *"I'm not sure I can
  sell the house if new homeowners can't insure it."* (386↑/363 comments, zero product mentioned)
- Aggregates: FL premiums **+102% in 3 years**, ~$6k average, **3× national** (III data);
  SWFL median +72% since 2020 to $3,249/yr; a Cape Coral trajectory $700→$5,200 peak.
- Retirees with paid-off mortgages are dropping coverage entirely; named neighbor/family
  departures to Michigan, South Carolina.
This upgrades the insurance-delisting thesis from inference to testimony. Roof-age insurability
(Citizens non-renews shingle >25yr; insurers balk past 15–20yr) is a real sell-timing trigger
nobody has ever reframed as "your insurability is degrading, consider listing now."
Source: round5 finding 3; landscape items 60, 61, 65.

### The lowball gap — sellers have no way to check an offer
Owner-occupant buyers pay **76–84% of value; investors pay 60–70%** — a $100K+ gap on typical
properties, stated matter-of-factly in investor-facing content that teaches targeting overwhelmed
heirs. iBuyers pay ~8–10% below eventual resale with a 7–10% total fee load; "we buy houses"
flippers pay 50–70% of FMV. A seller with a live cash offer asked what to look out for and got
only informal Reddit advice. **Zero consumer product checks "is this offer fair"** — our unnamed
comp helper is the nearest existing engine (also fits second-opinion CMA and the buyer-side "is my
agent's suggested offer reasonable" — all three are confirmed product gaps).
Source: landscape items 15, 20, 21, 22, 31.

### Sellers doubt their agents mid-listing and have nowhere to go
A seller discovered her agent's listing-timing advice was **undisclosed ChatGPT output** and wrote
her own MLS blurb (41↑/114c). Community consensus in a second thread: the seller's agent was
simply wrong to discourage a kick-out clause. The market's actual answer to seller stress is
**BAM/BAMx** — coaching AGENTS with scripts to talk sellers out of delisting ("What price are you
willing to wait for?") — i.e., manage the seller's emotions, never arm the seller with data.
FSBO context: sellers going alone close ~3.8% below list vs. agents ~1.8% above (Sellable's data).
Source: landscape items 24, 35, 37.

### New-construction supply pressure — a seller alert nobody built
New-home median ($403,200) has undercut existing-home median ($404,600) for **four consecutive
quarters** — historic reversal. 40% of builders cutting prices monthly (3 straight months, not
seen since May 2020); 65% using incentives for 10 straight months; completed-unsold inventory at a
16-year high. Zero product warns a resale seller "a builder incentive wave near you is about to
suppress your comps." **We already ingest Lee+Collier permits** — this maps onto our permits pack.
Source: landscape item 32.

### Investors read price cuts as MOTIVATION, not valuation — match their language
The community's own shared mental model, repeated near-verbatim by independent commenters:
*"treat them as a motivation signal, not a valuation signal."* Cut HISTORY/pattern (count +
interval) is named as more useful than the current list price. People already subscribe to
price-drop alert lists; one investor: *"I just closed on a deal almost 30% below asking"* off
extended-DOM screening. Design pull for `logistic_regression_listing_outcome`: frame as
motivation/softening, never "fair price"; show the cut pattern. Buyer side of the same coin:
relisted-after-fallthrough homes read as "tainted" and no product explains why a contract fell
through — our stress data answers it.
Source: round5 finding 2; landscape items 7, 11.

### AVM distrust + provenance is the trust currency
Zestimate/Redfin-estimate distrust is "extremely recurring" — buyers want to know **where a number
came from**. *"Gathering information is no longer the hard part... I spend more time validating
outputs than searching for data."* An agent's AI hallucination story: *"it basically made up
numbers... it's telling you what you want to hear."* r/REBubble rewards falsifier-first framing
and calls unconditional forecasts "mostly BS" — our [INFERENCE]-tag + falsifier convention IS what
this audience already trusts. A compliance thread: *"having the audit trail there made those
conversations a lot easier"* — a dedicated show-your-work provenance panel wins trust
conversations (Tier-1 UX candidate, distinct from inline citations).
Source: round1 settled item 4; UX sweep Tiers 1&3; round3 Q8.

### Comp adjustments — what agents actually argue about, ranked
From a 255-comment appraisal-gap thread: **condition first** (dominant), comp-selection /
arm's-length exclusion second (3-comp minimum; take-5-drop-high-low), sqft third, garage+bed/bath
fourth, lot fifth. View/landscaping: rare, large-swing only — de-prioritize. The complaint is
"this comp should have been excluded / the condition adjustment is wrong," NOT "the math is
opaque." Feeds the comp helper's default adjustment order directly.
Source: round3 Q2 / round1 item 20.

### Out-of-state / snowbird buyers can't evaluate remotely
r/Naples_FL: newcomers can't vet agent trustworthiness ("a lot of 'part time' realtors here who do
less than 4-5 deals a year") or block-by-block fit ("two completely different areas, very very
different" block to block); local advice is "rent first / drive the neighborhoods yourself."
A remote-buyer packet substituting for that drive = validated whitespace, reuses the showing-prep
pipeline. Venues: r/Naples_FL + r/AskFlorida (NOT r/CapeCoral, r/FortMyers).
Source: round3 Q6 / round1 item 21.

### Showing prep — the 3-hour pain (BUILT, cite as proof we listen)
*"POV: You spent 3 hours preparing for homes your clients no longer want to see"* (r/realtors,
durable multi-day engagement). Agents manually pull comps, permits, tax records before every
showing. **Shipped 07/08** as the Showing Prep Packet — the single best "we heard you, we built
it" story in the corpus.
Source: round1 item 10.

---

## TIER 3 — AGENT-SIDE ECONOMICS (pricing, leads, tooling)

### Willingness to pay — we sit inside the validated band
Residential: **$50–100/mo/seat cluster, $80/mo cited as a ceiling** for a fully-loaded single
tool; "under $50/month" is the solo-agent comfort point; **Saleswise.ai's CMA tool is exactly
$39/mo** (live competitor at our price point). CRE: Reonomy $157–700/mo/seat, CoStar "3× this
price," API tier ~$30k/yr; pricing deliberately opaque, renewal negotiation is the norm; ROI is
justified by deals sourced, not data volume. **The stronger lesson is switching cost:** agents
weigh data lock-in (activity history never migrates, API gated behind expensive tiers) as much as
sticker price — "your data, exportable, no lock-in" is a value line distinct from price.
Source: round3 Q1; round2 finding 1.

### Lead economics — why organic + owned data wins
Google LSA home-listing leads run **~$60–75/lead** (nationwide rollout 06/2026, HouseCanary data
partnership); seller-keyword Google Ads run **$150–400/click**. Small operators are burned out on
shared-lead marketplaces ($27–30/lead sold to 5 competitors, no refunds). The consistent
"what still works" answer: **narrow + personalized beats broad + generic** (5% reply rates on
genuinely personalized cold email; "the spray-and-pray era is dead") — validates the DBPR
clean-list spine. Highest-leverage $0 channel, repeated independently across niches: **Google
Business Profile + immediate post-job reviews** (we have none — check filed). Permit filings are a
proven 2–6-week pre-hire timing signal — we already ingest Lee+Collier permits (hypothesis check
filed, not a commitment).
Source: `2026-07-17-leadgen-landscape-and-inhouse-organic.md`.

### Agents are already DIY-building our product inside Claude
*"I use Claude Cowork everyday... automates a client newsletter, a news briefing, summarizes my
emails... saves me 10+ hours a week"* (non-tech agent, built a 19-skill custom plugin). CRE family
office: *"Claude has turned my monthly reporting from a 2 full day grind to maybe 2-3 hours."*
Enterprise CRE adoption is compliance-gated (VPC, no-training contracts, audit trails) — the
receptive persona is the solo broker / family office, bottom-up. Acquisition angle: "we do
reliably, out of the box, what you built yourself with 19 custom skills."
Source: UX sweep Tier 3; round3 Q7.

### Client-preference memory + listing-scoped public chat (validated UX patterns)
- *"My memory for who wants a fenced yard versus who hates carpet is basically gone... after four
  or five showings the details blend"* — Granola's pre-meeting "Brief" (who's attending, what you
  discussed last time) is the verified pattern; we have per-project threads but no preference
  extraction.
- **AskListing** ($49/mo, verified): listing-scoped public chat grounded ONLY in approved facts,
  hard hand-off on price questions ("you get the lead and the transcript"). The named leak it
  fixes: *"none of them answer the buyer directly at 9pm when someone texts in off a yard sign."*
  This is our grain-stopping rule made into a buyer-facing surface; we have no public
  project-scoped chat route today.
Source: UX sweep Tier 1.

### Email deliverability — the settled playbook
Gmail Promotions playbook, ranked by a first-person account: (1) send most-engaged first, widen
gradually — "the single biggest lever"; (2) cut third-party tracking links; (3) real reply-to +
conversational tone + closing question; (4) consistent cadence (bursts read campaign-y);
(5) seed-test placement pre-send. Verified nuance: OUR first-party tracked links
(`${origin}/api/r/<token>`, aligned domain) do NOT match the harm mechanism — the constraint only
bites when per-agent custom sending domains ship (alignment check filed). Seed-testing = vendor
API (GlockApps ~$59/mo or MailReach), parked on operator vendor choice.
Source: round2 finding 2; round3 Q3/Q4.

---

## TIER 4 — KNOWN GAPS, DEAD ENDS, AND VENUE CRAFT (don't overclaim, don't re-search)

### Pains we CANNOT currently back with data — never pitch as if we can
- **HOA/condo reserves (SB 4-D):** the most emotionally vivid pain in the corpus (1-in-5 reserves
  <50% funded; up to $400K/unit special assessments; $100K–$224K surprise assessments settled in
  round 1) — but "no HOA/condo fee or reserve data" is a named PERMANENT gap for us. Lane-3 path
  if ever pursued: DBPR's public SIRS database (live since 01/2025) + the stealable reserve-funding
  threshold framework (<70% = special-assessment risk; 80%+ preferred for older coastal FL).
- **Multi-hazard risk scoring:** commoditized — First Street (flood/fire/heat/wind) is FREE inside
  Redfin/Zillow/Realtor.com. Our environmental brain is flood-only (NFIP AAL). The open adjacent
  gap: nobody bundles windstorm+flood into one pre-offer cost estimator — but it needs insurer
  data we don't hold.
- **Insurance-carrier-triggered alerts, SOH "cost of waiting," TRIM-timing links:** confirmed gaps
  but need feeds/data we don't have. Cite as market context, not roadmap.

### Searched and EMPTY — do not blindly re-run
- Digest cadence / email-frequency tolerance: **6 independent empty searches** across rounds 1–5.
  Likely only answerable by our own funnel instrumentation.
- Permit history as dealbreaker-vs-lever language: 4 subreddit snapshots, zero hits.
- Email-gating/forced-registration resentment: 5 snapshots, zero hits.
- Photo-hotlink rot: too narrow/technical for public Reddit; answer from vendor docs.
- X/Twitter organic discovery for this niche: zero, confirmed twice. r/newagent is dead
  (`meta.total: 0`).

### Venue craft (hard-won, reuse it)
- r/AskFlorida for FL-statewide sentiment (r/florida and r/Insurance are off-target); r/Naples_FL
  for local (r/Naples redirects there); r/CapeCoral + r/FortMyers are hyperlocal daily-life only.
- Generic `/v1/reddit/search` is site-wide-ranked and low-yield (confirmed 5+ times): use
  `/v1/reddit/posts?url=<subreddit>/` (ALWAYS trailing slash) + client-side keyword filter.
- `success:false` content-filter false positives: retry with increasing backoff; 3 failures = a
  genuine per-URL dead end. Comment text lives in `content`, not `body`. Check top-level
  `json.success` AND `json.body.success`.
- Instagram: #swflrealestate (211K) / #fortmyersrealestate (60.7K) / #napleshomes (52.5K) are 100%
  agent listing content, zero market-data posts — real organic whitespace. r/dataisbeautiful is a
  proven channel for real-estate data viz. Local subs reward humble build-in-public framing.
- Live personalized demos ("give me your ZIP, I'll run it") are the single most compelling organic
  proof pattern observed (Ugly House Finder thread, ~15 ZIPs answered live in-comments).

### SWFL-specific competitive clearance
Zero SWFL/Gulf-Coast seller-advisory startups exist (every result was brokerage blog content).
Pacaso is the asked-about fractional brand for Naples/Marco exits; the one local fractional
competitor found (affordableluxuryproperty.com) had a broken SSL cert on crawl. The home market is
unoccupied before we ship.
Source: landscape items 12, 54, 168.

---

## Cross-reference map (where the evidence lives)

- `2026-07-17-buyer-seller-agent-augmentation-landscape.md` — 168 ranked items; Tier-1 spine.
- `2026-07-16-round5-recurring-problems-solutions.md` — trust boundary, motivation signal, insurance testimony.
- `2026-07-09-round3-q1-q2-tier2-answers.md` + `2026-07-09-round3-q3-q4-answers.md` — WTP, comps, QA whitespace, deliverability.
- `2026-07-09-pain-point-questions-round1.md` — the settled-items ledger (23 items; don't re-ask).
- `2026-07-09-recurring-pain-questions-and-answers.md` — CRE pricing, Gmail playbook.
- `2026-07-16-new-implementations-ux-sweep.md` — AskListing/Granola/audit-trail patterns.
- `2026-07-17-leadgen-landscape-and-inhouse-organic.md` — lead costs, GBP, permit timing, local SEO.
- `2026-07-16-self-marketing-social-listening-round5.md` — organic-channel whitespace.
- `2026-07-10-outreach-brand-injection-research.md` — cold-send shape, DBPR spine, brand lanes.
- `2026-07-16-data-reliability-and-sourcing-sweep.md` — new source candidates (FL OIR, DOE grades, Redfin Migration).
- `2026-07-16-realtor-full-scope-audit.md` — vendor field ceilings (no year_built/HOA/MLS# anywhere).
