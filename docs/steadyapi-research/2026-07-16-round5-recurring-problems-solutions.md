# Round 5 — Recurring-Problem Validation via Live SteadyAPI Reddit Sweep — 07/16/2026

**Operator ask:** unused SteadyAPI monthly call quota spent finding real solutions to OUR recurring
problems by mining Reddit/X/Instagram — round 5 of a series that started 07/09/2026. Scope for this
round: NEW ground only — problems that surfaced or stayed open SINCE round 4 (07/10/2026), or
load-bearing round-1/2/3 items those rounds explicitly left open/unresolved (the Tier-3 backlog in
`2026-07-09-round3-question-backlog.md` that was triaged but never actually run).

**Live SteadyAPI calls made this round:** 21 (Reddit `/v1/reddit/posts` + `/v1/reddit/post`,
`PHOTOS_API` key — confirmed live via a probe call before the full sweep; no 429s or quota walls
hit). Raw JSON for every call is in this session's scratchpad
(`steadyapi-round5-recurring/*.json`), not committed to the repo — same standing rule as every
prior round (raw payloads carry real Reddit usernames).

---

## Sources scanned for "constant problems"

- `node scripts/check.mjs list` — full ~300-row open checks ledger, read in full.
- `docs/cron-rebuild-failures.md` "Recurring Patterns" section — 6 documented failure classes
  (secret-not-wired, corridor-alias sync, vocab-orphan, bun.lock drift, egress flake, flaky test,
  pack/catalog drift).
- `SESSION_LOG.md` grepped for repeat-language ("again," "STILL," "recurring," "never once
  completed," etc.), focused on entries from 07/10/2026 (round 4's cutoff) through today.
- Rounds 1–4 (`2026-07-09-pain-point-questions-round1.md` through
  `2026-07-10-outreach-brand-injection-research.md`) read in full so nothing here re-treads
  already-settled or already-searched-empty ground.

## The filter (unchanged from round 2 — this is the whole game)

**Is this answerable by what real agents/brokers/buyers/investors/marketers actually say on
Reddit/X/Insta?** Applied before writing a single question.

**Excluded, and why:**
- **Pure internal AI-collaboration-discipline items** — none surfaced fresh this round (the
  archived SNICKLEFRITZ doc from round 2 is the historical example; nothing new of this class in
  the 07/10+ window).
- **Pure internal engineering hygiene** — `cron-rebuild-failures.md`'s Recurring Patterns
  (bun.lock drift, vocab-orphan, corridor-alias sync, pack/catalog drift, egress flake, flaky
  tests) — no Reddit thread validates a lockfile.
- **`*_live_verify` checks** — the majority of the ~300-row ledger; unfinished-build tracking, not
  a customer question. Examples skipped on this basis alone: `campaigns_end_to_end_scheduled`'s
  sibling live-verify checks, `deliverability_diagnostic_panel_live_verify`,
  `desk_v2_additions_live_verify`, dozens more.
- **Pure internal data-completeness/structural checks with no public-facing pain angle** —
  `condo_multiunit_grain_systemic`, `active_stats_zip_median_dup_rows`, `listing_state_streetless_
  address_key_collision`, `parcels_lee_zip_source_layer`, the entire `typed_client_*` family, the
  self-heal (`selfheal_*`) family, `check_freshness_local_vs_utc_age` — all real, all internal,
  none social-listening-answerable.
- **`land_manufactured_swfl_graduation`** — explicitly out of scope per round 3 ("data side is
  parked with zero pipeline code; customer research before we can serve the segment is
  premature"). Still true; not re-opened.
- **`vertical_plays_xig_deepmine`** (insurance/mortgage/contractor vertical expansion, opened
  ~07/11) — considered and set aside for this round: it's a market-*expansion* question (new
  customer segments entirely outside real estate), not a *recurring problem in the current
  product*, and it's broad enough to deserve its own dedicated round rather than a slice of this
  one's budget.

**What survived the filter** — five candidates, ranked by how directly they're load-bearing for an
**active, currently-open build decision** (per the round-3 backlog's own Tier-3 "never run" items,
now elevated because a live check or a 07/13 operator-priority build depends on the answer):

1. **Automation-trust tension** for `campaigns_end_to_end_scheduled` (round1 §2.9 / Q11, never
   run) — reframed per pre-sweep review: round 4's F1 already found agents distrust *canned*
   automation ("people smell a bot instantly, trust is dead"), yet the 07/13 operator vision for
   campaigns is full lifecycle-sequence automation ("the user schedules the FIRST one and WE TAKE
   CARE OF THE REST"). Does agent sentiment support *that* specifically, or does it collapse back
   into the bot-distrust finding?
2. **Motivated-seller / listing-outcome signal** (round1 §3.2 / Q15, never run) — load-bearing for
   the open check `logistic_regression_listing_outcome` ("will this listing cut price / sell
   within 30 days").
3. **Permit history: dealbreaker vs. negotiation lever** (round1 §4.3 / Q18, never run) —
   load-bearing for `city_permits_ingest_odd` (new permit-ingest investment).
4. **Insurance-driven sale/departure, said directly** (round1 §3.5 / Q16, never run) — narrows
   round1 §1 items 7–8 (aggregate premium-shock data already settled) to first-person testimony of
   the causal link, not just inferred from volume.
5. **Email-gating / forced-registration resentment** — a reframe of `alert_signup_conversion_funnel`
   (opened 07/10, "deferred why-no-signups question"). The literal "why don't readers subscribe"
   framing already failed 5 empty searches across rounds 1–4 (cadence/frequency angle); the
   untried angle is resentment at being *asked to register* to see content at all.

---

## Findings

### 1. Automation-trust splits cleanly along a line — and it draws the exact boundary `campaigns_end_to_end_scheduled` needs

**Why this made the cut:** the 07/13 operator priority for scheduled campaigns is explicit —
"DO NOT build the whole campaign at once... the rest of the path is SHOWN, not built... built
automatically from saved info, user can edit." That is full lifecycle automation of a
client-facing send sequence. Round 4's F1 already flagged the opposite risk ("people smell a bot
instantly... trust is dead") from a *generic outreach* angle. Nobody had asked agents to draw the
line between the two directly.

**What I found:** r/RealEstateTechnology, **"AI in Real Estate"** (32↑/125💬,
https://www.reddit.com/r/RealEstateTechnology/comments/1uk2biq/ai_in_real_estate/, live-pulled
07/16/2026). The top comments converge on the same boundary independently, unprompted:

- *"Full automation? Nah. Models still make dumb mistakes, and lead nurture is exactly where they
  fall apart — people smell a bot instantly and once it feels canned, trust is dead. Bad combo for
  a trust business. But for the boring stuff — listing descriptions, CRM updates, drafting docs,
  summarizing comps — it's already a huge time saver."* [2↑]
- *"The real, unsexy win is the transaction back-office: contract extraction, deadline checklists,
  the routine escrow/lender emails, compliance checks. That's where hours actually vanish."* [2↑]
- *"The 'complete automation vs overhyped' framing misses where it actually lands: the boring
  middle. What gets automated first isn't the agent, it's the 20 hours of transaction
  coordination, follow-up, listing copy, and comp pulls nobody wants to do. That's real and
  happening now. What doesn't automate is the part clients actually pay for — negotiation, local
  judgment, and being the person they trust."* [2↑]

Corroborating, from r/RealEstateTechnology, **"We're building an AI-native operating platform for
real estate transactions. I'd love your feedback."**
(https://www.reddit.com/r/RealEstateTechnology/comments/1urtqqn/, 29💬, live-pulled 07/16/2026) —
a founder soliciting feedback on exactly this shape of product got:
- *"Try not to do everything. Do one thing well and then build another tool that does one thing
  well. Interconnect them."* [3↑]
- *"Most B2B real estate AI pitches gravitate toward transaction ops (documents, deadlines,
  compliance) because those are bounded, verifiable tasks — an AI can be graded on 'did it catch
  the deadline,' and mistakes are visible and correctable. Lead generation is a much messier
  problem: success depends on distribution, timing, and trust, not just task completion."* [2↑]

And a live example of an agent already doing the boring-middle version successfully, from
r/RealEstateTechnology, **"Anyone else using AI to speed up property research?"** (14↑/49💬,
https://www.reddit.com/r/RealEstateTechnology/comments/1u5v7qt/, live-pulled 07/16/2026):
- *"I use Claude Cowork everyday, it automates a client newsletter, automates a news briefing and
  summarizes my emails... It saves me 10+ hours a week."* [6↑]
- *"I think AI is really useful for speeding up the research side of things. The part I still
  don't trust it with is making the actual investment decision for me... at the end of the day, I
  still want a human making the call on whether the deal works."* [2↑]
- A caution directly validating the product's no-invention/citation stance: *"I tried to have [it]
  do basic 'from my house to this address, how far is it' for tax reasons, with a massive list of
  addresses, and it basically made up numbers. It's not doing real research, it's telling you what
  you want to hear."* [1↑]

**What this tells us:** the trust line agents draw is not "automated vs. not automated," it's
**"admin/back-office vs. client-facing send."** A campaign that assembles comps, drafts, deadlines,
and scheduling automatically is squarely on the trusted side of that line — that's the "boring
middle" agents already want handed off. Where `campaigns_end_to_end_scheduled` risks crossing it is
if the SEND itself goes out with zero human touch on a client-facing message; every quote above
draws the line at the human staying in the loop for anything that reaches the client relationship.
This validates the 07/13 spec's own design (email 1 built immediately + user edits before every
send date, "user can edit," "the rest of the path is SHOWN, not built") — the plan already sits on
the trusted side. It's a concrete argument FOR keeping the "user can edit before send" gate
non-negotiable as campaigns scale, not a reason to relitigate the automation itself. Secondary
signal: "one thing well, interconnect" reinforces round 4's F2/this track's standing "coexist,
never pitch as a CRM" positioning — a full all-in-one pitch invites the same "why not just use
[X]" pushback this founder got.

---

### 2. Investors already use price-cut/DOM as a "motivation signal," explicitly distinct from a valuation signal — direct design input for `logistic_regression_listing_outcome`

**Why this made the cut:** `logistic_regression_listing_outcome` (open check) proposes exactly this
feature — "will this listing cut price / sell within 30 days" — but the check's own note says the
blocker is a labeled training set, not validated demand. Round1 §3.2 (investor pain beyond
rental-comp trust) was flagged in round 1 and never actually swept in any round.

**What I found:** r/realestateinvesting, **"Anyone else paying more attention to price cuts
lately?"** (21↑/26💬,
https://www.reddit.com/r/realestateinvesting/comments/1umlvrw/anyone_else_paying_more_attention_to_price_cuts/,
live-pulled 07/16/2026):

- *"Price cuts and DOM are useful as a screen, but treat them as a motivation signal, not a
  valuation signal... A seller who's cut twice is telling you they're softening, but that doesn't
  mean the new number pencils."* [2↑] — the SAME framing ("motivation signal, not a valuation
  signal") is repeated near-verbatim by a second, independent commenter [1↑] later in the same
  thread — this is a named, shared mental model in the community, not one person's opinion.
- *"What I find more interesting is the pricing history. Seeing how often a home has been reduced,
  and over what timeframe, will start to tell you a lot more than the current list price by
  itself."* [1↑] — a direct vote for showing cut PATTERN/history, not just the current cut amount.
- *"I am on a list with realtor.com for new listings, sales, and price drops in my town... the
  number of price drops tends to be larger than the number of new listings that come on the
  market."* [2↑] — confirms real people already subscribe to price-drop alert lists as a category;
  this isn't a novel behavior to introduce, it's an existing habit to serve better.
- *"I'm looking for extended DOM and then making an offer based on my projected cash flow, not
  even paying attention to whatever price the seller and their agent dreamed up. I just closed on
  a deal almost 30% below asking."* [3↑]

Corroborating, from the same subreddit, **"Why I stopped spending 30 minutes underwriting every
Pittsburgh deal."** (5↑/22💬,
https://www.reddit.com/r/realestateinvesting/comments/1usrhbe/, live-pulled 07/16/2026) — confirms
appetite for an AI-assisted FIRST-PASS filter specifically:
- *"Some of the ai underwriting tools now do that first filter, they'll flag the obvious problems
  before you even get into the details. Still have to make the call yourself but it saves you
  getting attached to something that was never going to work."*
- *"Do a 10-second gut filter first (price per sqft vs. rent, or a rough all-in-to-ARV ratio)
  before you ever open a spreadsheet, and only run the full cash flow / DSCR / stress test on the
  ones that survive that."* [1↑]

**What this tells us:** this closes the demand-validation half of `logistic_regression_listing_outcome`
— investors already reason in exactly this shape (cut count + DOM = motivation score, not a price
prediction) and already track cut history manually via other tools. Two concrete design pulls: (1)
frame the feature as a **motivation/softening signal**, explicitly NOT a valuation or "fair price"
claim — that framing is what the community already uses and trusts, and claiming valuation would
invite the same skepticism the "motivation signal, not a valuation signal" quote is pre-emptively
drawing against; (2) surface **cut history/pattern** (count + interval), not just a single current
cut amount — that's the specific data shape named as more useful than raw list price. The remaining
blocker (labeled training set) is unchanged by this research — it validates WHY to build it, not
HOW to source the labels.

---

### 3. Insurance is now surfacing as a first-person reason people are actually leaving — not just inferred from volume

**Why this made the cut:** round1 §1 items 7–8 already settled the AGGREGATE insurance-shock data
(premium +72% since 2020, r/capecoral trajectory). What's never been swept is round1 §3.5 — a
seller/owner saying directly that insurance is why they're selling or leaving, as opposed to us
inferring it from delisting/inventory volume.

**What I found:** r/AskFlorida, **"home insurance is out of control -- might have to sell my
house?"** (60↑/173💬,
https://www.reddit.com/r/AskFlorida/comments/1uwh4rs/home_insurance_is_out_of_control_might_have_to/,
live-pulled 07/16/2026). OP, first-person: *"My insurance is going up hundreds of dollars this
year... I don't see how we can stay in our home."* Top reply with real numbers: *"My homeowners
insurance was $1,800 ten years ago when we bought our house, it's now $5,900. Crazy."* [31↑]

Second, richer thread, r/AskFlorida, **"Are property insurance costs actually pushing longtime
Floridians out of the state?"**
(45↑/114💬, https://www.reddit.com/r/AskFlorida/comments/1utgphr/, live-pulled 07/16/2026) — this
one moves past "might have to" into named departures:
- *"Bought my home in 2010. From then until 2020, my HOI was $900 a year. From 2020-2026, it has
  increased to $4800 a year. FOR NOTHING... I 100000% am looking to leave FL."* [26↑]
- *"My neighbor left. Retired husband and wife... his largest yearly expense was insurance. Moved
  to Michigan. He had owned the home for about 9 years and sold for $300K more than he paid. He
  had been in Florida for decades."* [9↑]
- *"My sister and her husband (teacher and firefighter) were lifelong Palm Beach County residents
  who couldn't keep pace with the taxes and overall lack of affordability. They moved to South
  Carolina 4 years ago."* [11↑]
- *"A lot of old timers have paid off the mortgage and basically are forced to drop homeowner's
  insurance."* [4↑]

Note: this is r/AskFlorida statewide, not SWFL-specific — the same venue-selection lesson round 3
already learned for snowbird/relocation research applies here (r/CapeCoral and r/FortMyers
returned zero hits for this angle this round too, see empties below; r/AskFlorida is the working
venue for this class of question).

**What this tells us:** this upgrades the existing insurance narrative from "aggregate data implies
this is happening" to "named individuals say this is why they left, with real before/after
numbers." That's a stronger citation for master's dossier framing on the insurance/delisting
thesis than the aggregate CHMA data alone — it's first-person testimony, not inference. No product
change here; this is evidence to cite, not a build decision, but it directly strengthens the
falsifiable-direction-call material (round1 §2.4/item 23's already-locked format) the next time
insurance-driven inventory shifts are part of a master synthesis.

---

## What was searched and came up empty (so it isn't blindly re-searched)

- **Permit history: dealbreaker vs. negotiation lever (round1 §4.3 / Q18).** Tried r/RealEstate
  hot, r/realtors hot, r/FirstTimeHomeBuyer hot, r/RealEstate new — four separate subreddit
  snapshots (100 posts total), client-side filtered for "permit," "unpermitted," "renegotiate,"
  "dealbreaker." Zero hits. r/FirstTimeHomeBuyer's hot/new lists remain almost entirely "I did
  it!"/"Got the keys!" celebration posts (same pattern round 3 already documented for the cadence
  question). Stays open. Next-attempt idea (logged, not run): a home-inspection-specific sub, or a
  targeted `/v1/reddit/search` on "unpermitted addition" despite that endpoint's known low yield
  for niche topics — worth one try since browsing four general subs found nothing.
- **Email-gating / forced-registration resentment (reframe of `alert_signup_conversion_funnel`).**
  Tried r/RealEstate (hot + new), r/realtors hot, r/FirstTimeHomeBuyer hot, r/zillow hot — five
  subreddit snapshots, filtered for "sign up," "email required," "register," "gate," "lead form."
  Zero hits; r/zillow's hot list is almost entirely app-support questions (rentals, saved-home
  filters), not sentiment about registration friction. Combined with the cadence-framing version of
  this question already failing 5 independent searches across rounds 1–4, this specific pain
  either doesn't surface unprompted on Reddit or needs a much more targeted venue (a real-estate
  lead-gen/marketing-specific sub we haven't tried, or a direct search once quota allows testing
  `/v1/reddit/search` despite its low-yield reputation). Stays open — this is now the SIXTH empty
  angle on subscription/registration friction across the whole research track; worth considering
  this question class as low-yield for Reddit specifically and answerable only by our own funnel
  instrumentation (which the check itself already proposes).
- **r/florida hot and r/Insurance hot as venues.** Both tried first for the insurance-departure
  topic and both came back entirely off-target: r/florida's hot list is general FL news/meme
  content with zero real-estate or insurance-selling threads; r/Insurance's hot list is dominated
  by auto-insurance claims questions, not property/home insurance. r/AskFlorida is confirmed (again,
  matching round 3's finding for the snowbird question) as the working venue for FL-relocation- and
  cost-of-living-adjacent sentiment — use it first for any future FL-statewide (not SWFL-specific)
  social question, skip r/florida and r/Insurance.

## Vendor-quirk note (consistent with prior rounds, no new behavior)

The content-filter false-positive (`/v1/reddit/post` 200s with
`{"success": false, "message": "Please enter a valid subReddit URL."}` on a well-formed URL, then
succeeds on an immediate identical retry) reproduced twice this round — once on
`r/RealEstateTechnology/comments/1urtqqn/` and once on `r/AskFlorida/comments/1utgphr/`. Both
retried clean on the first attempt. One new observation not previously documented: on the first
occurrence, the failure body was NOT wrapped in the usual `{meta, body}` envelope — it came back as
a bare `{"success": false, "message": "..."}` at the top level, matching the generic 404-error shape
from the Basics section rather than the nested `body.success === false` shape most prior rounds'
guard code checked for. A retry/guard that only checks `json.body.success` will miss this variant;
check `json.success` too. Worth folding into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`'s Reddit
quirks section in a follow-up docs-only pass (not done here — kept this file research-only per
scope).

---

## What this round leaves for a future round

- **Cloud CMA / Altos / Homesnap satisfaction specifically** (round1 §2.5 / Q10) — not attempted
  this round (budget went to the five higher-priority candidates above); still genuinely open,
  distinct from the pricing evidence round 3 already closed.
- **Vertical expansion beyond real estate** (`vertical_plays_xig_deepmine`) — set aside as
  out-of-scope for a "recurring problem" round; deserves its own dedicated round with its own
  framing rather than a slice of this one.
- **AI-authorship pride/shame in client communication** (round1 §2.8 / Q14) and **watermark
  free-tier sentiment** (round1 §2.6 / Q12) — both still open, neither attempted this round, both
  lower-priority (marketing-copy angle / presentation-only, not load-bearing for an active build
  decision the way this round's five candidates were).
