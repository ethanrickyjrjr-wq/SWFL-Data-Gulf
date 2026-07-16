# New implementations / UX sweep — beyond email, across the whole product

> **Status:** RESEARCH ONLY — nothing built, nothing registered as a build, nothing pushed beyond
> this doc. Written 07/16/2026 per operator request: spend unused SteadyAPI quota finding NEW
> IMPLEMENTATIONS — features, UX patterns, AI techniques — that make our current builds stronger and
> more user-friendly, going WIDER than the 07/08 email/deliverable-design sweeps into the AI
> assistant/chat experience, map/dashboard UX, listing/comp tooling, onboarding, mobile-friendliness,
> and notification/engagement patterns.

## Methodology (RULE 0.4 — research before build; RULE 0.5 — probe the code first)

**Do-not-duplicate check (read first, per the assignment):** confirmed against
`docs/steadyapi-research/README.md`, `docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md`,
and `docs/superpowers/plans/2026-07-08-reddit-ai-cheats-and-deliverable-hacks.md` — both 07/08 sweeps
are scoped to email/deliverable design (voiceGuard, brand voice, subject lines, Ideogram flyers,
citation-index rewrite, cadence templates). This sweep deliberately stayed off that ground and mined
the AI-assistant/chat, map/dashboard, comp-tooling, onboarding, and notification surfaces instead.

**Codebase probe (RULE 0.5) before writing any finding down:** before tiering each candidate, the
actual code was read to confirm whether the gap is real or already closed — `lib/assistant/*`,
`lib/chat/use-project-thread.ts`, `lib/project/cross-project-index.ts` + `other-projects.ts`,
`lib/citations/*`, `lib/project/lifecycle-nudge.ts`, `app/project/ShowingPrepButton.tsx`,
`lib/charts/*`, `refinery/packs/cre-swfl.mts`. Two would-be findings were caught and dropped/reshaped
by this step: the "Showing Prep Packet" idea from the 07/08 sweep is **already built**
(`app/project/ShowingPrepButton.tsx` — creates a `kind:"showing-prep"` project and builds comps +
subject + market snapshot immediately); and per-project chat threads **already persist** with an
idle-nudge mechanism (`lib/chat/use-project-thread.ts`, `chat-thread-${projectId}` in localStorage,
last-3-messages nudge after 5 min idle) and cross-project DATA overlap detection already exists
(`lib/project/cross-project-index.ts` — reuse/gap/pairing on scope-matched *data points*). Findings
below are scoped against what's actually there, not what's assumed to be missing.

**SteadyAPI (Reddit only, live 07/16/2026):** **~42 live HTTP calls** (`PHOTOS_API` key, confirmed
live and working this session). Per the advisor's pre-flight guidance and this repo's own vendor
notes, Twitter/Instagram were skipped for this sweep — `/v1/twitter/search` returns an entity object
with no tweet bodies (two-hop, expensive) and Instagram `/search` is token-only signal, not
crawlable pain-point text; re-proving that a fifth time wasn't worth the budget. All 42 calls were
Reddit: `/v1/reddit/posts?url=<sub>&filter=hot` (and one `filter=new` pass per high-density
subreddit) to surface candidate threads, then `/v1/reddit/post?url=<permalink>` to pull full comment
trees on the highest-signal threads. Comment text was read from `content` (not `body`), matching the
vendor note.

**Surface weighting (per advisor guidance):** high-density passes on r/realtors,
r/CommercialRealEstate, r/RealEstateTechnology, r/PropTech (the actual user base — agents, CRE
brokers, proptech builders); surgical single-thread pulls on r/UXDesign, r/webdev, r/SaaS
(confirmed noisy/off-target as warned — r/UXDesign this week is almost entirely portfolio/career
content, r/SaaS is MRR-flex posts, neither yielded usable product signal beyond one weak mobile-UX
thread). Real signal came overwhelmingly from the real-estate-specific subs, same pattern the 07/08
sweeps already found for email.

**Call overhead / vendor quirks (see full section below):** of the ~42 calls, 6 individual post
fetches still returned `{"success":false}` even after the standard immediate retry-once — one
thread (`r/RealEstateTechnology` "Anyone built a worthwhile RE CRM?") failed on **three separate
attempts** spanning several minutes and was never successfully pulled; its title/hot-pull metadata
is used below, its comment tree is not. A **new** quirk not in the existing vendor note: `/v1/reddit/posts?url=` needs a **trailing slash** on some subreddit URLs — `.../r/CommercialRealEstate` (no
trailing slash) 200'd with `{"success":false,"message":"Please enter a valid subReddit URL."}` on
two consecutive attempts, then succeeded immediately once `.../r/CommercialRealEstate/` was called.

**crawl4ai verification (RULE 0.4 / CLAUDE.md rule 1 — vendor claims are verified live, never taken
from a Reddit comment at face value):** every named tool cited below as a real vendor fact was
fetched live this session. One named tool ("Beside," from a realtors thread) could **not** be
verified — see the "unverifiable" note in Tier 1 — and is flagged as an honest non-finding rather
than cited.

---

## TIER 1 — small slice, maps onto a surface we already own, evidence-backed

### 1. A public, listing-scoped chat that hard-hands-off instead of guessing (grain-boundary UX made visible to buyers, not just agents)

- **Source:** live-verified vendor **AskListing** (`https://asklisting.com`, crawl4ai 07/16/2026).
  Verbatim: *"An AI assistant on every listing that answers buyer questions about the property by web
  chat and text, grounded only in your approved facts, and hands you the lead."* And: *"Only your
  approved packet. If a fact is not in the listing you signed off, it hands off instead of inventing
  one... Hands off on price. The moment a buyer asks what you want for it, you get the lead and the
  transcript."* Pricing verified: **Starter $49/mo** (up to 5 active listings, AI text concierge +
  web chat, showing booking, lead alerts), **voice AI add-on +$99/mo** (300 pooled minutes). Named,
  unprompted, in `r/RealEstateTechnology` "Looking for a recommended tech stack for a 2 person team"
  (41 comments) by u/902Sports: *"none of them answer the buyer directly at 9pm when someone texts in
  off a yard sign. That's usually the actual leak, not the CRM."*
- **The pattern, not the vendor:** a chat surface scoped to exactly ONE listing/project, answering
  only from that listing's approved facts, that explicitly **hands off** (never guesses) the moment a
  question crosses a hard boundary (here: price/negotiation) — this is our own rules-of-engagement
  rule 3 ("STOP AT THE GRAIN... say what we don't have, plainly") made into a visible, buyer-facing
  product surface instead of an internal lint. We already enforce grain-stopping and no-invention
  server-side (`lib/assistant/off-topic.ts`, `lib/assistant/gap-fill.ts`) and already have a
  per-address project flow (`app/project/[id]/`, the New-Listing project kind, `ShowingPrepButton.tsx`)
  — what we don't have is a **shareable, public link/QR surface scoped to one project's data** that a
  buyer (not our own agent-user) can chat with directly, with pricing/negotiation questions
  auto-routed to a "contact the agent" hand-off instead of an answer.
- **Concrete gap, not speculation:** confirmed via `Grep`/`Read` — `app/project/` has no public/unauthenticated
  chat route today; all chat surfaces found are behind the authenticated project shell.
- **Smallest first slice:** a read-only, public, project-scoped chat endpoint (reuse `converse.ts` +
  `off-topic.ts`) that answers only from that one project's already-built items (comps, market
  snapshot), with a hardcoded hand-off rule: any price/negotiation-shaped question returns "that's a
  question for [agent name] — here's how to reach them" instead of a model-guessed number. No new
  data pipeline, no new brain — reuses what a project already holds.

### 2. Per-client preference memory, surfaced as a pre-conversation "Brief" (not just a persisted thread)

- **Source:** `r/realtors` "Almost lost a client because I couldn't remember what they told me two
  showings ago" (24 comments). Verbatim OP: *"My memory for who wants a fenced yard versus who hates
  carpet is basically gone at this point. After four or five showings in a day, the details start
  blending together."* Real tools named in-thread: **RECOPOINT** (u/KSMO, negative: *"terrible! It
  kept saying to Eat Up Martha in the dictations"*), **Granola** (u/n0_u53rnam35_13ft: *"There is no
  competition"*), and **"Beside"** (u/RunExciting3837: *"it literally remembers every conversation +
  you get a summary after every call and can ask the app anything about your previous calls"*).
- **VENDOR VERIFICATION:** **Granola** live-verified (`https://www.granola.ai`, crawl4ai 07/16/2026).
  Verbatim, the exact load-bearing mechanic: *"**Before the meeting: Start your meeting prepared** —
  Granola syncs with your calendar and preps a Brief before every external meeting: **who's
  attending, what you discussed last time, and what matters now.**"* Pricing verified: **Basic $0/user/mo**
  (limited history, AI chat within/across meetings), **Business $14/user/mo** (unlimited history,
  advanced integrations, MCP, API access), **Enterprise $35/user/mo**.
  **"Beside" could NOT be verified** — two candidate URLs (`besideapp.com`, `beside.app`) both
  resolved to unrelated products (a social meetup app and an unrelated site respectively) on live
  crawl4ai fetch. Per the no-fabrication rule, "Beside" is named here as a Reddit claim only, not
  cited as a real product fact — an honest non-finding, not a gap in the research.
- **The pattern, not the vendor:** Granola's "Brief" isn't a transcript dump — it's a **pre-interaction
  summary surfaced automatically at the moment it's needed**, assembled from prior sessions with that
  specific counterparty. Codebase probe confirms we have the raw material (chat threads persist
  per-project) but not the extraction: `lib/chat/use-project-thread.ts` stores messages and computes
  an idle-nudge from the last 3 raw user messages, and `lib/project/cross-project-index.ts` +
  `other-projects.ts` already do scope-anchored cross-project awareness — but strictly for objective
  DATA points (a metric/fact one project has that a scope-matching other project lacks), explicitly
  NOT qualitative preferences. There is no extraction pass that turns "wants a fenced yard, hates
  carpet" mentioned in one project's chat into a structured fact carried into the next project for the
  same client.
- **Smallest first slice:** when a new project is created, do a lightweight pass over any OTHER
  projects sharing the same client contact (if one is tagged) and surface a short "what we know about
  this client" line before the first message — reusing the existing chat-thread storage and the
  cross-project index's scope-matching logic, extended from data-points to a small fixed vocabulary of
  preference tags (extracted once, at project-close, not live).

### 3. A dedicated audit-trail / provenance view, distinct from inline citations

- **Source:** `r/CommercialRealEstate` "Has anyone actually gotten compliance to sign off on AI for
  underwriting?" (52 comments, 18-19pts). Verbatim, u/MaxDmitrie: *"V7 Go was one of the few
  platforms our team didn't immediately reject. During review, people kept asking where numbers came
  from and how outputs could be verified. **Having the audit trail there made those conversations a
  lot easier.** The committee spent far more time on governance and controls than product demos."*
  Also u/Dry_Donut_4275 (discloses building a competing underwriting tool): *"What gets security
  comfortable: docs never leave their environment, zero training on borrower data (in the contract,
  not the sales deck), VPC deployment, and **outputs legal can actually audit.**"*
- **VENDOR VERIFICATION:** **V7 Go** live-verified (`https://www.v7labs.com/go`, crawl4ai 07/16/2026).
  Verbatim: *"Your firm's memory is scattered across inboxes, products, and people's heads. V7 Go
  connects the documents, data, and source evidence behind every deal, so your team works with the
  full picture, not the file in front of them."* (Private-markets/investment intelligence product —
  different vertical than CRE underwriting, but the audit-trail mechanic is the same one the Reddit
  thread is describing.)
- **The pattern, not the vendor:** this is direct validation of our four-lane-provenance model at the
  concept level — but the specific gap it points at is presentation, not data. Codebase probe
  (`lib/citations/clean-url.ts`, `lib/citations/internal-markers.ts`) confirms citation cleanup/render
  exists but is **inline-only** (numbered refs → clean links in the collapsed source list, per the
  existing citation-index-rewrite pattern from the 07/08 sweep). There's no dedicated "show me where
  every number in this answer came from" panel a skeptical user can open on demand — which is exactly
  the artifact this Reddit thread says wins compliance/trust conversations. This is a UX affordance on
  top of data we already have, not a new pipeline.
- **Smallest first slice:** a single expandable "sources for this answer" panel in the chat/deliverable
  render that lists every citation actually used in that response with its as-of date, reusing the
  existing citation renderer — no new data, no new lint, just a second, more prominent render mode for
  data that's already collapsed into the source list.

---

## TIER 2 — real, well-specified, bigger lift or a genuine new component

### 4. A lease/tenant "concentration-risk" timeline chart type (new chart, not an extension)

- **Source:** `r/CommercialRealEstate` "How do you actually visualize rollover risk when you're
  screening a deal?" (36 comments, 13pts) — an unusually rich, multi-commenter-refined spec, not a
  single claim. OP: *"Excel gives you a table of lease expiries but it's brutal to eyeball
  concentration risk."* The thread converges on a real design, argued out in public: stack lease
  expiries chronologically as a "staircase," weight bar height by **$ contribution (NOI-at-risk), not
  raw tenant count** (u/Dry_Donut_4275: *"12 inline shops rolling in Q2 reads scar[y]... [but] stack by
  $ contribution, not tenant count"*), color-code **anchor vs. inline tenant** separately
  (u/PhaseLeft9651), bucket by **exact month, not smoothed half-year windows, when concentration is
  the question** (disagreement in-thread on bucket size, both positions given), and pair the visual
  with **WALE/WALT as the one-number cross-property benchmark** (u/Helpful-Two-3230, confirmed by
  three other commenters as the standard metric). One commenter (u/Dry_Donut_4275) is building a
  two-year SaaS around exactly this and shared screenshots; others are still hacking it in Excel/Power
  BI (u/TheCroisantThief: *"we're doing this crap in power BI and it's a bit of a ball ache"*).
- **The pattern:** this is a real, currently-unserved chart type (nobody in the thread has a clean
  off-the-shelf tool for it) with a genuinely well-specified shape: stacked-by-period, colored-by-class,
  weighted-by-$-not-count, paired with a WALE/WALT summary stat. Codebase probe confirms `refinery/packs/cre-swfl.mts`
  already exists as our CRE brain and `lib/charts/` already has the right pattern to extend (named,
  single-purpose series files like `tier-divergence-series.ts`, `market-temperature-series.ts`) — but
  no lease-expiry/rollover chart exists today. This is Tier 2 not Tier 1 because it's a genuinely NEW
  chart component and needs real design/data-availability work (does the lake hold lease-expiry-level
  CRE data at all, or only permit/parcel-level facts?) before a build decision, not because the UX spec
  isn't ready — the UX spec is unusually complete for a Reddit thread.
- **Smallest first slice:** confirm what lease/tenant-level data (if any) the lake actually holds for
  `cre-swfl` before speccing the chart — this is a data-availability question first, a chart-component
  question second.

### 5. Live, personalized public demos as organic growth content (a GTM tactic, not a code change)

- **Source:** `r/RealEstateTechnology` "Return of Ugly House Finder!" (57 comments, 11-12pts). The
  builder personally ran the tool live in the comment thread for every ZIP a commenter posted,
  each with real specific numbers: *"Ran 27410 for you... Distressed candidates: of about 160 homes I
  scanned, 0 scored Hot... 34 flagged Warm."* This ran for ~15 different ZIPs across the thread,
  each a genuinely personalized answer, not a canned reply.
- **The pattern, not a code change:** this is a marketing/GTM mechanic, not a build — a live,
  personalized, real-data answer delivered directly in a public comment thread is extremely
  compelling social proof, more than any generic screenshot, precisely because it's the reader's OWN
  ZIP. We already have the underlying capability (ZIP-grain live answers over cited lake data); the
  gap is operator behavior, not code — an operator personally running "give me your ZIP, I'll answer
  live" threads on r/Naples_FL, r/CommercialRealEstate, or r/RealEstateTechnology the way this builder
  did, using our own already-built ZIP summary as the live-answer engine.
- **Not a spec skeleton** — this is a growth tactic to hand to the operator, not a code change to
  register.

---

## TIER 3 — validation of the existing model / competitive landscape / watch-only

1. **AI trust calibration language directly matches our existing [INFERENCE]-tagging rule.**
   `r/RealEstateTechnology` "Anyone else using AI to speed up property research?" (104 comments,
   14-16pts): u/Puzzled_Skill3169: *"it is great for the first 80% but suck at the last 20%"* —
   u/rastize agrees, *"the research and data gathering side is where it shines, the judgment calls at
   the end still need a human, the trick is knowing exactly where to hand off."* This is precisely
   THE-GOAL.md's Tier-1-facts/Tier-2-speculation split and the `[INFERENCE]` + falsifier convention
   already locked in `docs/THE-GOAL.md`. No action — reinforcement, worth citing internally as
   independent validation that the split matches what real users intuitively want.
2. **"Filtering/verifying is now the bottleneck, not finding" — direct validation of the
   four-lane-provenance moat.** `r/PropTech` "AI has made property research faster, but not necessarily
   easier" (20 comments): OP: *"gathering information is no longer the hard part... the challenge now
   is filtering and verifying it... I find myself spending more time validating outputs and less time
   searching for data."* u/Useless_Dolt: *"The real skill today is filtering good information from
   AI-generated noise."* Matches this repo's locked positioning
   (`project_structural-guarantee-not-ai-virtue.md`) almost verbatim — no action, strategic validation.
3. **Real agents are already DIY-building what this product does, with Claude directly.**
   `r/RealEstateTechnology` "AI in Real Estate" (125 comments, 31-33pts): u/Sa1ntAubin (Claude
   Cowork user, $100/mo, self-described non-tech "tinkerer"): *"I use Claude Cowork everyday, it
   automates a client newsletter, automates a news briefing and summarizes my emails. I upload csv of
   market data and it gets in the ballpark of what the CMA should be... saves me 10+ hours a week."*
   Built a **custom 19-skill plugin**. u/REprof (in the CRE compliance thread): *"Claude has turned my
   monthly reporting from a 2 full day grind to maybe 2-3 hours."* Strategic read, not a build item: our
   most sophisticated prospective users are already duct-taping this exact workflow together by hand in
   Claude directly — a real competitive-substitute signal, but also a market-validation signal (the
   demand for "cited data + scheduled AI deliverable" is proven, not hypothetical) and a possible
   acquisition-funnel angle ("we do reliably, out of the box, what you built yourself with 19 custom
   skills"). Worth surfacing to positioning, not a spec.
4. **Portal/MLS-sync confusion is a real, recurring client-trust problem — validates our
   single-cited-source positioning, not a build.** `r/realtors` "Which to use? Redfin, Zillow, onehome?"
   (29 comments) — real confusion traced to Compass's exclusive off-market syndication deal with
   Redfin and ~500 fragmented US MLSes. Not something we'd fix (we're not a listing portal), but a
   concrete, real example of the "why don't your numbers match theirs" confusion our cited/dated/single-
   source model is built to answer plainly.
5. **Lead-management notification-cadence pain corroborates finding #2, is NOT a CRM feature to
   build.** `r/RealEstateTechnology` "Do you use a lead management tool and what don't you like about
   it" (50 comments): u/Soggy-Base-764 (discloses working at Revive): *"The handoff is what most lead
   tools still miss. Someone finally replies then their context disappears and they get treated like a
   brand-new lead again."* u/Serious_Nebula5750: *"Almost every tool treats 'converted' as the finish
   line... think about everything you pick up about a client during nurture: their timeline, their
   financ[ing]..."* Codebase probe: `lib/project/lifecycle-nudge.ts` already nudges on LISTING
   state-transitions (price changes, market status), a different concept from CLIENT-relationship-stage
   follow-up reminders. This finding is folded into Tier-1 item #2 as corroborating evidence for
   client-preference memory — explicitly NOT recommending a general lead-nurture/CRM build, since
   that's out of this product's actual scope (a data/deliverable platform, not a lead-gen CRM).
6. **Named tools mentioned but not verified — competitive-landscape awareness only, no claims cited:**
   **PropertyAlpha.ai** (named twice, AI property-research/CMA tool), **Toriee.co** (named once, parcel/
   zoning/environmental-overlay due-diligence normalization — u/toriee-co self-identified as the
   builder), **Sohala.ai** (`parcel.sohala.ai`, self-described "trust layer for AI" proof-of-concept
   pulling APN from an address), **Relner.com** (lead-management/contract tool). None were crawl4ai-
   verified this session because none are being cited as a fact-claim or recommended for adoption —
   flagged here only so a future sweep doesn't re-surface them as "new."
7. **Mobile-UX thread was low-yield, as the advisor predicted.** `r/UXDesign` "What's the one mobile or
   SaaS app that frustrates you the most" (4 comments) surfaced only enterprise-tool complaints
   (Workday, MS Teams, Google Nest onboarding) — no real-estate-specific or otherwise transferable
   signal. Confirms r/UXDesign is currently portfolio/career-content-dominated, not a productive
   surface for this kind of sweep this week.

---

## New SteadyAPI vendor-contract findings (live-verified 07/16/2026) — pending fold into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`

1. **NEW quirk — `/v1/reddit/posts?url=` needs a trailing slash on some subreddit URLs.**
   `https://www.reddit.com/r/CommercialRealEstate` (no trailing slash) returned HTTP 200 with
   `{"success":false,"message":"Please enter a valid subReddit URL."}` on the initial call AND on
   the standard immediate retry (2 consecutive failures). Adding a trailing slash —
   `https://www.reddit.com/r/CommercialRealEstate/` — succeeded on the very next call, 200 with a
   full 25-item page. Every other subreddit hot-pull this session (`r/realtors`,
   `r/RealEstateTechnology`, `r/PropTech`, `r/UXDesign`, `r/webdev`, `r/SaaS`) succeeded WITHOUT a
   trailing slash, so this isn't a blanket requirement — plausibly camelCase subreddit names
   (`CommercialRealEstate`) trip something a lowercase name doesn't. **Recommendation: always append
   a trailing slash to the subreddit URL on `/v1/reddit/posts` calls; it's a no-op for names that
   don't need it and fixes the ones that do.**
2. **Reconfirmed (5th+ independent time): the `success:false` content-filter false-positive is not
   reliably fixed by a single immediate retry.** Of ~15 individual `/v1/reddit/post` fetches this
   session, 6 came back `{"success":false}` on the standard immediate retry; 5 of those 6 then
   succeeded on a SECOND manual retry after a longer pause (1.5-2s, not the ~400ms spacing used for
   normal pacing). **One thread (`r/RealEstateTechnology` "Anyone built a worthwhile RE CRM?",
   permalink `.../1ugbvvb/anyone_built_a_worthwhile_re_crm/`) failed on THREE separate attempts
   spanning several minutes and never returned real data** — this is the first session-documented
   case of the content-filter behaving as a persistent per-URL block rather than a transient
   flake, worth a fold-in as its own bullet distinct from the existing "retry once" guidance:
   **retry with an increasing backoff (not just one immediate retry), and treat a URL that fails 3x
   as a genuine dead end, not a client bug.**

---

## Sources

**SteadyAPI Reddit (~42 live calls, 07/16/2026, `PHOTOS_API` key):** subreddits hot/new-pulled —
r/realtors, r/CommercialRealEstate, r/RealEstateTechnology, r/PropTech, r/UXDesign, r/webdev,
r/SaaS. Individual thread permalinks cited inline above are real `reddit.com/r/...` URLs pulled from
the live API responses. Raw JSON retained in this session's scratchpad
(`steadyapi-implementations-sweep/*.json`), not committed — ad hoc research artifact, matches the
`*crawl4ai*`/ad-hoc-research convention already used by the precedent sweeps.

**crawl4ai (all live 07/16/2026):** asklisting.com (verified — pricing + product mechanic) ·
granola.ai + granola.ai/pricing (verified — product mechanic + full pricing tiers) ·
v7labs.com/go (verified — product mechanic). **Attempted, not usable:** besideapp.com and beside.app
(both resolved to unrelated products — "Beside" as named in the Reddit thread could not be confirmed
live and is not cited as fact anywhere in this doc).

**Cross-reference:** `docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md`
and `docs/superpowers/plans/2026-07-08-reddit-ai-cheats-and-deliverable-hacks.md` (email/deliverable
design — deliberately not re-covered here). `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` (vendor
mechanics reference — the two new quirks above are pending fold-in there, not yet applied).
