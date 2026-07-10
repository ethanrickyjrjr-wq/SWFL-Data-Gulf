# Outreach-to-agents research — brand injection, contacts, cadence, brand takeover (07/10/2026)

> **Recommended model:** ⚡ Sonnet — 12 tasks, 2 conflict groups

Operator directive (07/10/2026 session): before planning the first real test send to SWFL real
estate agents, run SteadyAPI social listening (Reddit / X / Instagram, no run limit) + crawl4ai
passes on: brand-color/logo coverage at scale, contact (email+name) acquisition, send schedule,
what to send first, and the "keep your current brand setup" offer for agents who already do email.

## Run stats

- **SteadyAPI Reddit:** ~55 live calls. 10 subreddit snapshots (`/posts?url=&filter=hot|new`,
  25 posts each: r/realtors, r/Emailmarketing, r/RealEstate, r/FirstTimeHomeBuyer,
  r/RealEstateTechnology) → 19 keyword-matched threads → 16 `/post` comment pulls.
- **SteadyAPI Twitter:** 2 `/search` queries ("realtor email marketing", "real estate newsletter
  agents") → entity object contained 0 users/topics. Searched-and-empty; don't re-run blind.
- **SteadyAPI Instagram:** 3 single-token `/search` calls (`realtormarketing`,
  `realestatemarketing`, `realtoremail`) → all 0 posts (known vendor token-sensitivity).
  Searched-and-empty.
- **crawl4ai:** Brandfetch Brand API docs (live), logo.dev docs (live), DBPR Instant Public
  Records → Real Estate Commission public-records page (live), Woodpecker follow-ups article
  (nav-heavy, low value). Brandfetch PRICING page is bot-walled (Cloudflare challenge) — dollar
  figures need a dashboard signup, not a crawl.
- **NEW VENDOR QUIRK (folded into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`):** SteadyAPI
  403s any request carrying Python's default urllib User-Agent BEFORE auth — non-JSON body,
  every endpoint, valid key. Browser-style UA header fixes it. A 403 is not a key problem.

## Findings — social listening (each with source URL)

### F1. Generic automated outreach is explicitly ignored; data-specific outreach is the stated exception
r/RealEstateTechnology "On-market deals … They're just faster" (38 comments,
https://www.reddit.com/r/RealEstateTechnology/comments/1u35xwh/): "the systems that hold up are
the ones pulling from actual listing data, price drops, days on market, specific remarks, rather
than blasting the same template everyone else is using. Generic automation is easy to ignore."
Same thread: "people smell a bot instantly and once it feels canned, trust is dead."
**Changes:** T1 demo email MUST lead with their-market numbers (already the funnel spec's design
— this is independent confirmation from the buyer side).

### F2. Tool landscape: consolidation fatigue + Zillow distrust are the switching levers
r/RealEstateTechnology CRM threads (121 + 33 comments,
https://www.reddit.com/r/RealEstateTechnology/comments/1ugbvvb/ and /1ugdr8l/):
- Named stack: Follow Up Boss (dominant; **Zillow-owned — "I don't trust my data with them for
  one second"**), Brivity ("business OS"), Back At You (brokerage-provided social automation),
  Twenty CRM (custom), Smartlead, Attio. Agents switch CRMs ~every 18 months.
- #1 complaint: "too many features I don't need" + setup complexity; consolidation from 3-4
  tools to 1 is the recurring motive.
- An agent published a **Follow Up Boss MCP server** (github.com/mindwear-capitian/
  followupboss-mcp-server) — agents driving their CRM through Claude is already happening.
**Changes:** coexist positioning ("works alongside FUB/Moxi" — already in the broker track) is
right; add the data-ownership angle (your data stays yours) to outreach copy. We are not a CRM
and should never pitch as one.

### F3. Brand compliance = locked templates with disclosures baked in
r/RealEstateTechnology "stay brand compliant" (11 comments,
https://www.reddit.com/r/RealEstateTechnology/comments/1upaic9/):
- "The real compliance risk is 30 agents freelancing on Canva at 11pm. The fix … locked
  templates where they can only touch photos and copy. Make the compliant path the LAZY path."
- Required bakes: brokerage name + license number on every piece, Equal Housing language,
  CAN-SPAM address + unsubscribe; fair-housing copy rules (describe the property, never the
  buyer); truthful-claims only ("no #1 agent language you can't substantiate").
- "Canva Brand Kit" is the mental model agents already have for brand assets.
**Changes:** per-brokerage brand injection should ship as a LOCKED brand layer (colors/logo/
disclosure block fixed; content editable) — exactly the grid-builder + applyBrand shape. The
demo email should say "your brand kit is already loaded."

### F4. Send-on-behalf domain consensus: client subdomain, never shared root
r/Emailmarketing "Client domain Or Company Domain?" (7 comments,
https://www.reddit.com/r/Emailmarketing/comments/1uku53z/): use the CLIENT's dedicated sending
subdomain, aligned DKIM/SPF (+DMARC), per-client reputation isolation, backup subdomain ready,
reputation monitoring per client. Sending all clients through your own domain risks one bad
client poisoning every other client's deliverability.
**Changes:** the product's send path per agent = their subdomain via the existing domain-verify
backend (built, zero UI — the UI is now load-bearing for the paid product). Our own COLD
outreach still goes from OUR dedicated outreach domain (funnel spec, unchanged).

### F5. Designed (grid) emails are safe for opted-in sends, WRONG for cold touches
r/Emailmarketing "Text-based sender … heavy designed emails" (20 comments,
https://www.reddit.com/r/Emailmarketing/comments/1uinz08/): image-heavy HTML inboxes fine on a
warm, authenticated, opted-in domain — "the design isn't what decides inbox placement, the
relationship is." "Stay lean" is specifically **cold-outreach** advice; cold sends from a
young domain should be text-forward. Practical bars: clean HTML, CDN images + alt text, total
size ≲1MB, SPF/DKIM/DMARC.
Also: r/Emailmarketing REMOVES cold-email discussion on sight — the practice carries stigma;
positioning and restraint matter.
**Changes:** T1 cold demo = ONE branded chart PNG + text-forward body (funnel spec's shape is
right; resist the temptation to send a full grid masterpiece cold). Full grid beauty belongs in
the earned daily-trial track and the product itself.

### F6. Warmup + first-touch mechanics (cold infrastructure)
r/Emailmarketing Beehiiv warmup thread (17 comments,
https://www.reddit.com/r/Emailmarketing/comments/1uln7u6/): prefer a subdomain of an existing
trusted domain over a brand-new domain; ramp steadily (a 25/day trickle can stall reputation);
first sends value-based; optimize for REPLIES ("reply is better than ctr and ctr is better than
open rates"); do DNS/auth first.
**Changes:** when the operator buys the outreach domain (funnel gate), consider
`hello.swfldatagulf.com`-style subdomain vs a cold new domain — subdomain inherits existing
reputation but shares blast radius; the funnel spec's separate-domain call stays, but warm it
with value sends before cycle 1.

### F7. Welcome/first-response timing: fire on the event, never on a cron sweep
r/Emailmarketing delayed-welcome thread (11 comments,
https://www.reddit.com/r/Emailmarketing/comments/1uq0gso/): engagement peaks in the first ~60
seconds after opt-in; the killer delays are double-opt-in friction and welcome sends routed
through the same queue as campaign blasts on a 15-min cron. Fix: transactional send fired on
the opt-in event on its own stream.
**Changes:** market-area-alerts baseline welcome (runner handles new subscribers before the
daily batch) matches this; when arrival-page signups from the outreach click-back land, the
claim → first-content moment should be event-fired, not swept.

### F8. Open-rate tracking is dying as a KPI (regulatory + MPP)
Two r/Emailmarketing threads (https://www.reddit.com/r/Emailmarketing/comments/1upxfz1/ and
/1uo2jzt/): France (CNIL, deadline 07/14/2026) and Italy (10/28/2026) now treat tracking pixels
as cookie-consent surfaces. US-only lists unaffected, but the community read is uniform: clicks/
replies/conversions are the real KPIs; UTM-tagged links measure clicks without a pixel.
**Changes:** nothing to build — the funnel spec already scores on reply/click (Apple MPP). Keep
EU addresses out of cycle-1 CSVs; note for any future EU recipient.

### F9. Pre-send review whitespace RECONFIRMED (third sighting)
r/realtors "Does anyone actually review agent email responses" (12 comments,
https://www.reddit.com/r/realtors/comments/1uqr1eh/): "We're independent contractors — no one is
reviewing an email"; 500-agent brokerage = manual review impossible; brokers carry supervision
liability anyway; one brokerage collects email/text copies at close, reviewed only if a problem
surfaces. Plus F1's thread: AI-drafted listing copy is creating Fair Housing violations "nobody
catches until it's too late."
**Changes:** strengthens the Q9 (round 3) whitespace — our voice-guard/lint layer is a genuine
differentiator worth one line in outreach copy ("every email passes a compliance lint").

### F10. Cadence question (Q5) — FIFTH empty search
Nothing in 250 posts across the 5 subreddits directly evidences market-report frequency
tolerance ("why does my realtor email me every day" produced no usable threads this pass).
Q5 stays open. **Decision basis remains the pinned 07/02 evidence** (funnel spec: 4 touches /
~3 weeks, complaint risk triples past 4 unanswered; first follow-up 8.4% reply; 42% of replies
from follow-ups) + market-area-alerts unsubscribe drivers (too many emails 53.5%). Do not block
the test send on Q5.

## Findings — crawl4ai (automation lanes)

### C1. Brandfetch Brand API — domain → full brand kit in one call
docs.brandfetch.com/brand-api/overview (crawled live 07/10/2026):
`GET https://api.brandfetch.io/v2/brands/domain/{domain}` (Bearer key) → logos, colors, fonts,
firmographics. Not-in-dataset domains are indexed LIVE on request (global coverage claim).
Free dev account = **100 free requests**; paid plans above with overage billing + hard spend
cap settable to $0; 100 req/s throughput; quota headers `x-api-key-quota` /
`x-api-key-approximate-usage`. Also: Brand Search API (company NAME → domain — pairs with the
DBPR corp list which has names, not domains). Pricing page is bot-walled; verify $ at signup.

### C2. logo.dev — the cheaper-looking alternative, 18M companies
logo.dev docs (crawled live 07/10/2026): Logo API (domain → logo img URL, works anywhere an
image does, publishable key), Describe API (domain → name/description/**colors**/socials),
Brand API (full profile: logo, brandmark, banners, colors), Search API (name → domain). Has a
dedicated "Migrating from Brandfetch" guide (positioning on price). Pricing page not yet
crawled — grab before choosing.

### C3. DBPR licensee extracts — the full agent-name spine, weekly, free
www2.myfloridalicense.com/real-estate-commission/public-records/ (crawled live 07/10/2026):
- **`RE_rgn7.csv`** — every Current/Active/Inactive RE licensee in **Charlotte, Collier, DeSoto,
  Glades, Hendry, Highlands, Lee, Sarasota**, updated WEEKLY. Columns include: Licensee Name,
  DBA Name, Rank (agent/broker), full mailing address, County Name, License Number, Primary/
  Secondary Status, Original License Date, Expiration, **Employer's Name + Employer's License
  Number** (= brokerage affiliation!).
- **NO EMAIL COLUMN** — mailing addresses only. Emails still come from lane B (brokerage
  directory crawls, the agents.json pattern: in-page mailto links only) or a DBPR public-records
  request (portal: fldbpr.mycusthelp.com — Chapter 119 FL Statutes; licensee emails are
  obtainable public records via request).
- `RealEstateCorpLicense.csv` = the corp file the 06/26 brand-folder session already used.
**Changes:** DBPR licensee CSV × brokerage-directory email crawl = names + brokerage + email
joined by name/brokerage. Filter Rank=active sales associates/brokers in Lee+Collier.

## What stays open / searched-and-empty ledger

- Q5 direct cadence evidence (5th empty pass) — decided from pinned research instead.
- X/Instagram passes empty for these niche queries — don't re-run the same tokens blind.
- Brandfetch + logo.dev PRICING dollar figures — bot-walled/uncrawled; verify at signup before
  committing to a lane (100 free Brandfetch requests cover the pilot regardless).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 6, Task 6, Task 6, Task 6, Task 6, Task 6, Task 6, Task 6, Task 6 |  |
| 🟡 | Task 3, Task 3, Task 3 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
