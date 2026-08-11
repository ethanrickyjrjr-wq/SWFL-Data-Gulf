# Social copy + graphics + clicks — the numbers behind lib/social/CLAUDE.md §0.4

**08/04/2026. Answers the handoff at `_ASSISTANT/2026-08-04-social-copy-and-graphics-RESEARCH-HANDOFF.md`.**
3-agent crawl4ai/WebSearch fan-out (Q1 copy, Q2 graphics, Q3 clicks+Reddit+Apify). Every claim below
names a source + as-of date. Where sources disagree, both are reported — never averaged. Anything
without a traceable primary/methodology-stated source is marked **UNVERIFIED**, not passed off as fact.

Scope: platforms we can actually publish to — Bluesky (proven live), X, LinkedIn, Instagram, Facebook.
Not TikTok — we can't execute a TikTok strategy (RULE 11).

---

## Q1 — HOW TO WRITE THE POST

### Hook
- No platform publishes an official hook formula. The one mechanically-real lever: **truncation
  points force the hook to be self-contained.** LinkedIn clips mobile at ~140 chars / desktop ~210
  chars before "see more" (AuthoredUp, 372,126 posts, Sept 2025–Feb 2026,
  https://authoredup.com/blog/linkedin-character-limit). Instagram feed captions truncate at ~125
  chars (multiple 2025-2026 vendor observations of the same UI — UNVERIFIED as one dated study, but
  the truncation point itself is a UI fact, not folklore).
- The "you have 1.7 seconds to hook someone" genre of claim traces back to a 2015
  Microsoft-commissioned "8-second attention span, shorter than a goldfish" stat that has since been
  debunked by follow-up research (real sustained attention: 30-76s). **Do not use in the rules card.**
- Sprout Social's Q2 2025 pulse survey (named methodology, dated):
  76.56% of marketers say authenticity now matters more than production quality; users want to see
  real people (front-line staff 48%, team members 42%, real customers 42%).
  (https://sproutsocial.com/insights/the-state-of-social-media/)
- **Practical rule, grounded in the truncation mechanics above, not hook psychology:** lead with the
  concrete fact (price, address, days-on-market delta) inside the platform's truncation window.

### Length — per platform
- **Bluesky:** hard cap 300 graphemes / 3,000 UTF-8 bytes (official AT Protocol lexicon,
  `app/bsky/feed/post.json`). Links are NOT auto-shortened — budget for the URL eating into the cap.
- **X:** 280 chars free tier, 25,000 chars Premium (still previews at 280 then "Show more"). A
  70-100-char "sweet spot" claim exists in secondary sources — **UNVERIFIED**, could not trace to
  Buffer's raw data.
- **LinkedIn:** 3,000 char max. **1,301-2,500 chars = highest median engagement (2.61-2.67%), a 27%
  lift vs. under-400-char posts** (AuthoredUp, 372,126 posts, Sept 2025-Feb 2026). This is the
  opposite of "keep it short" — LinkedIn rewards length, uniquely among these platforms.
- **Instagram:** 2,200 char max. Two sources disagree: Socialinsider says under-30-words wins, but
  that dataset is **Jan-Jul 2023** (published 02/2024) — stale, exactly the kind of pre-2024 claim
  to distrust. A newer 150-220-word claim is UNVERIFIED (untraceable to a named study). **Flag as
  unresolved, do not pick a side.**
- **Facebook:** 40-80 chars cited for a "66% interaction increase" — **UNVERIFIED**, single
  aggregator, no visible methodology.
- Buffer's "State of Social Media Engagement 2026" (52M+ posts, through 12/03/2025,
  https://buffer.com/resources/state-of-social-media-engagement-2026/) doesn't report length at
  all — it reports FORMAT: LinkedIn carousels 21.77% engagement vs. video 7.35% / images 6.52%;
  Instagram carousels beat Reels on engagement (+12%) but Reels win reach (+36%).

### CTA / link placement — the strongest-sourced finding in this doc
- **X: verified, real numbers, named methodology.** Buffer analyzed 18.8M X posts / 71,000 accounts
  through 08/2025 (published 10/14/2025,
  https://buffer.com/resources/links-on-x/). Link posts from regular accounts: **effectively 0%
  engagement rate.** Text posts ~0.40%, video ~0.25%. Buffer's own recommendation: **put the link in
  a reply, never the post body.**
- **LinkedIn: platform denies it, independent data disagrees, real conflict.** LinkedIn's own Sr.
  Director of Product (Rishi Jobanputra) states publicly there is **no intentional link penalty**,
  with the caveat the post should stand alone without the link. Independent analyses report 18.8-60%
  reach reduction with a link in-body — the 60% figure (Forbes, 07/30/2026) traces to an unsourced
  third-party blog with no stated methodology. **Report both positions, do not pick one.**
- **Instagram/Facebook: no official statement found either way.** Link-in-bio/first-comment is
  standard practice, not proven by a cited Meta study.
- **Bluesky: no known penalty, no formal study** — inference from a largely chronological/
  algorithm-light feed, not a dated finding.
- **SWFL Data Gulf implication:** X — link in reply, well-sourced. LinkedIn — write it to stand
  alone, don't assume immunity. IG/FB — link-in-bio/first-comment, unverified but standard.

### Reading level, sentence length, emoji, hashtags
- Reading level: industry convergence on **Flesch-Kincaid grade 6-9** — long-standing readability-
  vendor consensus, not a single fresh study.
- Sentence length: no dated study found — practitioner consensus only ("short, punchy").
- Emoji: one real peer-reviewed 2025 study (Wiley, *Human Behavior and Emerging Technologies*,
  https://onlinelibrary.wiley.com/doi/10.1155/hbe2/9048904) found facial/emotional emoji boost
  engagement on food content, food/drink emoji do not — content-type matters. Broader "30% lift"
  numbers are UNVERIFIED aggregator claims.
- **Hashtags — confirmed, dated platform drift.** Instagram's Adam Mosseri, on record: *"hashtags
  are not a way to get more reach"* — framed as search/categorization only. Instagram cut per-post
  hashtags 30→5 and killed hashtag-follow in 12/2024 (Later,
  https://later.com/blog/ultimate-guide-to-using-instagram-hashtags/, updated 04/21/2026). No
  comparable dated statement exists for X or LinkedIn. **Bluesky: hashtags cost budget (eat into the
  300-grapheme cap) with zero known discovery benefit** — pure cost, no proven upside.

### AI/bot tells — the strongest single data point in the whole report
- **Pangram** (AI-detection vendor) scanned 1,002,627 posts across LinkedIn/X/Reddit/Substack/Medium,
  collected from 04/24/2026, published 07/09/2026
  (https://www.pangram.com/blog/ai-in-your-feed). **LinkedIn: over 40% of long-form posts flagged
  fully AI-generated** — the single worst platform, nearly two-thirds of all detected AI content
  despite being a third of scanned posts. X: 23.9% fully AI, 22.9% mixed. Reddit: 98.1% human
  (cleanest). Overall average 13.8%. **Direct implication: LinkedIn is where readers are most primed
  to smell AI copy — the guard has to be tightest there.**
- Vocabulary tells (convergent across many independent sources, no single study):
  delve, leverage, synergy, optimize, streamline, empower, innovative, groundbreaking, transformative,
  utilize, landscape, harness, unlock, unleash, seamless, cutting-edge, game-changer, paradigm shift,
  unprecedented, elevate, treasure trove, embark, realm, tapestry, testament, "in today's fast-paced
  world," "notable works include."
- **The fix for AI-tell and the fix for fabrication (RULE 0.7) are the same fix:** specificity —
  a real address, a real percentage, a real day-count — beats generic, safe, adjective-stacked prose.

### Real-estate-specific
- **NAR 2025 Technology Survey** (fielded 07/2025, 1,241 responses, published 09/18/2025, primary PDF,
  https://cms.nar.realtor/sites/default/files/2025-09/2025-realtors-technology-survey-report-09-18-2025.pdf):
  **39% of Realtors name social media their #1 quality-lead source**, ahead of CRM (23%), MLS (17%).
- **Real conflict worth flagging:** Zillow's own **2025 Consumer Housing Trends Report** (published
  12/30/2025, primary PDF,
  https://www.zillowstatic.com/bedrock/app/uploads/sites/33/2024/09/2025-Consumer-Housing-Trends-Report-for-Agents.pdf)
  says only **7% of buyers discover their agent via social media/search**. This directly contradicts
  widely-repeated "47% of buyers discovered their agent through social" / "71% choose agents with
  strong social presence" figures from real-estate-marketing-tool blogs (resimpli.com etc.) that
  trace to no named study. **Trust Zillow's primary 7% over the vendor-blog 47-71% family.**
  "403% more inquiries," "12x more shares" video-vs-static claims: same UNVERIFIED vendor-blog class.

---

## Q2 — WHAT MAKES A POST LOOK GOOD (graphics)

### The 32px legibility floor — falsifier result: NO SOURCE EXISTS EITHER WAY
Checked Meta's ad-image spec, LinkedIn's spec, X's spec, WCAG (SC 1.4.12/1.4.4 set only *relative*
multipliers, no floor), and NN/g's glanceable-fonts research (real study, MIT AgeLab/Clear-IP,
3mm vs 4mm in-vehicle display — "bigger wins" qualitatively, no px/pt number, no phone-in-feed
downscale factor). **No platform, accessibility body, or named UX research org publishes a minimum
legible in-image text size for a social card.** `lib/social/design/system.ts`'s `[INFERENCE]` tag on
`MIN_LEGIBLE_PX = 32` is correct and should **stay flagged as inference** — this is a confirmed
absence, not a research failure.

### Safe zones — re-verified
- Story/Reels: **top 14%, bottom 20-35% (treat 35% as the boundary), sides 6%** — 3 independent 2026
  secondary sources agree (behaviour.digital 2026 consolidation note, adnabu, billo.app) and match
  our existing `safe-zones.ts` exactly. Meta's own canonical page exists but is JS/session-gated
  against automated fetch — **corroborated by triangulation, not re-confirmed against Meta's primary
  page this session.** No drift detected.
- Feed flat 7% margin: **no vendor states this number anywhere** — confirmed as an internal design
  convention, not a platform spec. Keep it, but don't cite it as vendor-sourced.

### Canvas dimensions — re-verified against current specs
- Square 1080×1080, portrait 1080×1350 (4:5): **confirmed exact match** to Meta's ads-guide page
  (fetched live 08/04/2026, https://www.facebook.com/business/ads-guide/update/image).
- **LinkedIn: 1px drift.** Current official spec is **1200×628**, not 1200×627 (LinkedIn Marketing
  Solutions Help, https://www.linkedin.com/help/lms/answer/a426534, "last updated 2 weeks ago" as of
  08/04/2026). Cosmetic, low priority.
- **X landscape: our suspected 1600×900 mismatch DOES NOT EXIST.** X's official spec recommends
  1200×628 (1.91:1) — nearly identical to our 1200×630. X's 16:9 option is **1920×1080**, not
  1600×900 (X Business Help Center, fetched live 08/04/2026,
  https://business.x.com/en/help/campaign-setup/creative-ad-specifications). **Correction: close the
  "X mismatch" concern — our landscape format is fine as-is.**
- Story 1080×1920: confirmed via secondary sources (TikTok's own primary spec page 404'd both
  attempts).
- Not currently built, Phase-2 candidates with confirmed live specs: Pinterest 1000×1500 (2:3,
  https://help.pinterest.com/en/business/article/pinterest-product-specs), YouTube thumbnail
  3840×2160 (16:9, min width 640px — supersedes the old "1280×720" figure,
  https://support.google.com/youtube/answer/72431).

### Photo-plus-text cards
- Scrim: no vendor publishes a numeric opacity spec. The one real numeric substitute is **WCAG
  contrast: 3:1 for large text (≥18pt normal / ≥14pt bold), 4.5:1 for body** — compute scrim opacity
  against the actual image to hit these floors, not a fixed percentage.
- Text placement (top-third vs bottom-third): no vendor rule exists — design convention only.
- **Meta's hard 20%-text-overlay rejection rule was formally retired 09/2020** (Meta's own 2020
  statement, widely reported, e.g. Adweek). A softer ranking-signal version reportedly persists in
  Meta's optimization tips but could not be re-confirmed against Meta's live help page this session
  (same JS-gating issue) — treat as reported-via-secondary-source.
- No vendor or research org publishes a word-count/character threshold for "still glanceable" — same
  shape of gap as the font-size question. Don't invent one.

### Carousel/slideshow pacing — our 2.5s is roughly half the one real evidence base
**Baymard Institute** (named, long-running UX research org) usability-tested auto-rotating carousels:
**5-7 seconds per slide for light content, up to 10s for text-heavy slides**
(https://baymard.com/blog/homepage-carousel, published 04/30/2019, updated 04/03/2025). Users
report frustration/reduced comprehension when rushed. This is desktop-homepage-carousel research,
not Instagram/TikTok-specific — the closest domain-adjacent study found. Instagram's own default
Story photo duration (5s vs 7s claimed by different secondary sources) has **no locatable primary
citation** — even the platform's own default isn't independently verifiable this session. **Our
current 2.5s slide / 0.5s crossfade is roughly half of Baymard's evidence-backed floor, with zero
citation behind the original choice.**

### Composition — sourced only
- **F-pattern scanning** (NN/g, n=232 eye-tracking study): users sweep top-heavy — put the one
  load-bearing fact (price/address/headline) in the top band, not centered-low.
  (https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/)
- Bigger text wins for glanceable reading (NN/g, same source as the legibility section).
- WCAG 3:1/4.5:1 contrast floors apply to composition generally, not just scrims.
- No sourced whitespace/margin ratio beyond the safe-zone percentages already covered — don't invent
  one.

---

## Q3 — WHAT MAKES PEOPLE CLICK

**Methodology note:** reddit.com is hard-blocked to WebSearch/WebFetch in this environment (explicit
"domains not accessible" error + 403s). Reached real Reddit threads via a read-only mirror
(crawl4ai), every citation below links the canonical reddit.com URL, verified live via the mirror.

### Clicks vs. impressions — distinct metrics, most data measures the wrong one
- Buffer's 2026 benchmark (52M+ posts, https://buffer.com/resources/state-of-social-media-engagement-2026/,
  published 03/05/2026) measures ENGAGEMENT RATE, not outbound clicks: link posts consistently
  underperform on-platform formats (LinkedIn links 3.81% vs carousels 21.77%; X links 2.25% vs text
  3.56%; Facebook links 4.43% vs images 5.20%; Threads links 2.34% vs video 5.55%). **This is evidence
  of link-post suppression, not proof of what maximizes clicks once someone is looking at the post —
  a related but different question.**
- Meta's own product terminology distinguishes **"Outbound clicks"** (leave Meta properties — our
  actual goal) from **"Link clicks"** (includes on-platform destinations) — use "outbound clicks" as
  the metric name if this ever gets tracked.
  (https://en-gb.facebook.com/business/help/186560398499760)
- Real-estate account-size threshold (Metricool + HypeAuditor, 700M posts Jan-Jun 2025, cited in
  Inman 07/06/2026, https://www.inman.com/2026/07/06/latest-data-reveals-social-media-engagement/):
  **under ~50K followers, Reels drive more reach; above it, carousels dominate reach AND
  engagement.** We are well under 50K — this argues for Reels/short-video reach in the near term even
  though our proven mechanic today is the carousel-as-video trick.
- **LinkedIn: native document/PDF carousels are the single highest-engagement format on the
  platform** (7% vs 6.45% multi-image, 6% video — Socialinsider, 1.3M posts, covered by Social Media
  Today 04/2026) — directly relevant since our market cards ARE data-carousel content, and only
  4.88% of LinkedIn profiles use this format regularly. **Underused format, good fit for us.**

### First-slide / thumbnail theory
- Industry-consensus (not one controlled study, but convergent across many 2025-2026 practitioner
  sources): the first slide "carries 80% of the weight," needs a 5-8 word headline + curiosity gap.
- **Real algorithmic mechanism, independently corroborated (Inman + Hootsuite):** Instagram can
  re-serve a carousel starting at a DIFFERENT slide if viewers scroll past without swiping through —
  a weak first slide gets a second chance, not a permanent kill.
- Instagram optimizes carousels toward **Swipe-Through Rate and Saves**, not clicks — a carousel
  tuned to maximize saves is not the same optimization target as one tuned to drive outbound clicks
  to swfldatagulf.com. Worth naming explicitly: we may be optimizing for the wrong metric by default.
- YouTube's own native thumbnail A/B test (real vendor feature, expanded 2025-2026) optimizes for
  watch-time share, not raw CTR — a third-party CTR-only test can pick a different "winner." Specific
  20-40%/300% CTR-lift numbers come from vendors selling thumbnail-testing tools —
  **self-interested claims, not independently verified.**

### Price / address / question baked into the graphic
- **No controlled, real-estate-specific study exists isolating this as a variable.** What's out there
  is unsourced marketing-blog advice (withhold the price, ask followers to guess) — low-authority,
  no methodology, no sample size.
- Best real evidence found, though not image-specific: a large field-experiment on news headlines
  (27,616 experiments, Upworthy Archive corpus) found a **curvilinear relationship** — increasing
  headline concreteness helps CTR when surrounding content is already vague, but HURTS CTR when
  content is already concrete. A vague/question-style hook is not universally better; effect flips
  sign depending on context. (Aubin Le Quéré et al., *Scientific Reports* vol 15, article 994,
  published 01/06/2025, https://www.nature.com/articles/s41598-024-81575-9, pre-registered at
  https://osf.io/fbzvw/) Plausibly transfers to image text, not proven to.
- **Real conflict on text-overlay-and-clicks:** Meta's own guidance says "best-performing ads include
  little to no text" (the retired-but-echoed 20% rule). A widely-circulated "text overlay = 40% more
  clicks / 200% higher CTR" claim traces to zero named studies, only low-authority SEO blogs.
  **These directly contradict each other — flag the conflict, do not resolve it in Meta's favor by
  default just because Meta is the vendor; neither side has a real study behind the specific
  percentage.**

### Reddit — practitioner anecdote only, not weighted as data
- r/realtors (10/26/2025, https://www.reddit.com/r/realtors/comments/1ogpr9q/): agent posting daily
  video gets ~1,000 views/post but almost no comments or lead messages — views ≠ clicks/leads.
- r/realtors (10/07/2024, 98 comments, https://www.reddit.com/r/realtors/comments/1fy1q4w/): 100+
  real Facebook-ad clicks/form-fills, zero follow-up responses — a click is not a convertible lead;
  don't over-optimize toward click count alone.
- r/marketing (03/10/2024, 217 upvotes/136 comments, https://www.reddit.com/r/marketing/comments/1bbgubw/):
  strong practitioner sentiment that AI-generated marketing content reads as "cheap/fake," high
  engagement on the thread suggests this view is widely shared, not fringe.
- r/socialmedia (02/15/2026, https://www.reddit.com/r/socialmedia/comments/1r56sq2/): a creator
  explicitly names fear that an outbound link "will tank engagement" — anecdotally corroborates the
  Buffer/Meta link-suppression data above, from an independent source.

### Apify — scouting only, nothing run, nothing written
Live MCP access confirmed. Best-fit Actors found (all PAY_PER_EVENT, no subscription commitment):
- **Niche/competitor performance:** `apify/instagram-scraper` (350,830 users, $0.0023/result, most
  popular) and `apify/instagram-hashtag-analytics-scraper` (purpose-built for hashtag performance,
  last modified 08/04/2026 — actively maintained). `apify/facebook-ads-scraper` for competitor
  paid-social creative research ($0.005/ad).
- **Reddit monitoring** (workaround for reddit.com being blocked to our own WebFetch): `trudax/reddit-scraper-lite`
  (35,551 users, 4.57★, $0.0038/result) is the best default; `harshmaur/reddit-scraper` is cheaper
  and built for AI-agent/MCP integration if this gets automated later.
- Nothing here was run or billed — discovery only, per the handoff's read-only scoping.

---

## Cross-cutting findings worth carrying into the rules card

1. **AI-tell risk is platform-specific and LinkedIn is the hot zone** (40%+ of long-form LinkedIn
   posts flagged AI-written vs. 23.9% on X) — any LinkedIn copy needs the tightest specificity guard.
2. **The X link-in-body penalty is the single best-sourced fact in this whole doc** (18.8M posts,
   named methodology) — link-in-reply on X is not optional, it's the difference between ~0% and
   ~0.4% engagement.
3. **Our carousel pacing (2.5s) has zero evidence behind it and the one real study (Baymard) suggests
   roughly double** (5-7s). Worth revisiting even though the mechanics are otherwise proven live.
4. **Two real, unresolved factual conflicts exist and should stay conflicts, not get silently
   resolved:** (a) LinkedIn's official no-link-penalty statement vs. independent reach-drop data,
   (b) Meta's "less text wins" guidance vs. the unsourced "text overlay = more clicks" claim.
5. **We may be optimizing carousels for the wrong metric** — Instagram's algorithm rewards
   Swipe-Through/Saves, not outbound clicks, and those are not the same target.
6. **Two genuine, confirmed gaps exist with no invented number filling them:** minimum legible
   in-image text size, and a text-density/glanceability word-count threshold. Both stay `[INFERENCE]`
   or unstated, never backfilled with a guessed number.
