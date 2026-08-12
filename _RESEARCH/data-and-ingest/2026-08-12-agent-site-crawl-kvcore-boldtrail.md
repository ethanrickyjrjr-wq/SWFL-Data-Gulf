# Agent-site listing crawl — kvCore / BoldTrail (Task 1 of the 08/11/2026 Sonnet queue)

**Date:** 08/12/2026 · **Method:** crawl4ai (pinned CLI, `crawl4ai <url>`), live, no Firecrawl · **Rule:** RULE 0.4
**Queue this answers:** `docs/handoff/2026-08-11-listing-grade-sonnet-work-queue.md`, Task 1 of 4 platform-crawl
tasks (kvCore/BoldTrail). Template/method: `_RESEARCH/data-and-ingest/2026-08-11-agent-site-listing-crawl-feasibility.md`.
**Prior research check:** `_RESEARCH/INDEX.md` grepped for `kvcore|boldtrail` before starting — one
hit at line 256 (a forward-pointer in the 08/11 feasibility file saying kvCore still needs this exact
test) and one at line 487 (an unrelated email-merge-tag note). No prior kvCore crawl test existed.

**Verdict: BROWSER-ONLY.** crawl4ai's real browser returns full server-rendered content with a rich
field census; a plain HTTP client (`curl`) is blocked (403) on every page except `robots.txt`. Per the
HARD RULE, that `curl` 403 is not treated as "blocked" — it is the same WAF-in-front-of-a-real-site
pattern already documented for royalshellrealestate.com, confirmed again here on a different vendor
stack.

## Site tested

`lesleywilliams.exprealty.com` — Lesley Williams / Williams Signature Group, eXp Realty in South
Florida, a real SWFL agent (serves Cape Coral, Fort Myers, Naples, Bonita Springs, Estero, Lehigh
Acres, Punta Gorda, Venice, Englewood per the site's own area-page list). eXp Realty issues its agents
kvCore/BoldTrail-powered sites under the shared `*.exprealty.com` domain, so this is a real, live SWFL
production listing site, not a demo. Pages fetched 08/12/2026: `robots.txt`, homepage (`/`), the
listings index (`/index.php?showagent=1&rtype=list`), and one detail page
(`/property/175-2026001896-2529-gleason-parkway-cape-coral-FL-33914`).

**Fingerprint that identified the platform** — three independent markers in the homepage HTML (fetched
via `crawl4ai -o all`, inspected in the raw `html` field, not the markdown):
1. `var extern_login_url = "https://sociallogin.kvcore.com/oauth.php?agencyid=lesleywilliams.exprealty.com&agentid=215272&domain=..."` — login flow points straight at `kvcore.com`.
2. Footer button: `<a href="http://boldtrail.com/" class="btn-primary btn-sm">Powered by BoldTrail</a>`.
3. Footer copyright: `<a href="https://insiderealestate.com">© 2026 Inside Real Estate</a>` — Inside
   Real Estate is the parent company that owns kvCore/BoldTrail.

## robots.txt — listing paths are NOT explicitly disallowed, but the file has a trap

Fetched live 08/12/2026 from `https://lesleywilliams.exprealty.com/robots.txt` (this one loads fine
even via plain `curl`, HTTP 200 — unlike the rest of the site). Full content, verbatim:

```
Sitemap: https://lesleywilliams.exprealty.com/sitemap-index.xml

User-agent: *
Disallow: /emails_kvarea/
Disallow: /mobilefirst/
Disallow: /private_kvarea/
Disallow: /index.php?similar=1
Disallow: /language.php
Disallow: /wp-admin/
Disallow: /wp-includes/
Disallow: /admin/
Disallow: /index.php?advanced=1 
Disallow: /index.php?quick=1 

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: Googlebot
Disallow: /index.php?advanced=1 
Disallow: /index.php?quick=1 

Allow: /sell
Allow: /areas
Allow: /pages
Allow: /resources
Allow: /index.php?showagency=1 
Allow: /index.php?showagent=1 

User-agent: AdsBot-Google
Allow: /

User-agent: Slurp
Crawl-delay: 120

User-agent: Googlebot-Mobile
Allow: /
Crawl-delay: 10

User-agent: msnbot
Allow: /
Crawl-delay: 120

User-agent: bingbot
Allow: /
Crawl-delay: 120

User-agent: Mediapartners-Google
Allow: /
Crawl-delay: 10

User-agent: AdsBot-Google-Mobile
Allow: /
Crawl-delay: 10

User-agent: AdsBot-Google-Mobile-Apps
Allow: /
Crawl-delay: 10

User-agent: PowerMapper
Allow: /
Crawl-delay: 5

User-agent: Screaming Frog SEO Spider
Allow: /

User-agent: SemrushBot
Allow: /

User-agent: TermlyBot
Allow: /

User-agent: CookieYesbot
Allow: /

User-agent: Osano Privacy Compliance Scanner
Allow: /

User-agent: *
Disallow: /
```

**None of the itemized disallows target the listings index or a listing detail path** — no
`/index.php?showagent=1`, no `/property/*` in either `Disallow:` block. `/property/` (the listing
detail path on this platform) is never mentioned anywhere in the file.

**But the file is structurally unusual and worth flagging exactly as written, not interpreted:**
there are TWO separate `User-agent: *` records — one near the top with the itemized disallow list
above, and a second one at the very bottom that reads only `User-agent: *` / `Disallow: /` — a blanket
disallow of the entire site for any crawler identifying as `*`. Between them sit named-bot records
(Googlebot, bingbot, Slurp, msnbot, PowerMapper, Screaming Frog, SemrushBot, and several others) each
individually `Allow: /`. This is not something either prior platform's robots.txt did. No interpretation
is offered here on which block "wins" (that is a RULE-forbidden legal/technical judgment call, not a
quote-gathering task) — only that a crawler identifying as an unnamed default user-agent meets a
trailing blanket `Disallow: /`, while every named search/SEO bot is explicitly allowed. crawl4ai itself
did not enforce this — it fetched full content regardless — so this is a policy signal for us to honor
deliberately, not a technical block crawl4ai hit.

## Listing detail URL pattern — the MLS number IS in the URL

`https://lesleywilliams.exprealty.com/property/{office_code}-{mls_number}-{address-slug}`

Example: `/property/175-2026001896-2529-gleason-parkway-cape-coral-FL-33914`. `175` reads as an
internal office/brokerage code (constant across every listing seen on this site, including the three
"Similar Properties" links captured on the same page — all `175-...`). `2026001896` is the MLS number
and it matches the page's own `MLS#` field exactly (`**MLS#** 2026001896`) — **confirmed as the join
key to our listing spine's `mls_number` column**, same pattern as both platforms already tested.

Note on discovery: the map-view listings index (`?rtype=map`) does NOT expose detail links in its
initial HTML — the four listing pins load into the map via client-side JS/AJAX after render, and
crawl4ai's markdown of that page had zero `/property/` links. Switching the same index to
`?rtype=list` (a real query-param flip, not a different page) rendered four `/property/...` links
directly in the page HTML. **Anyone repeating this crawl on kvCore sites should hit the list view, not
the default map view, to get detail-page links without extra JS interaction.**

## Field census — detail page, everything that came through verbatim

Page: `/property/175-2026001896-2529-gleason-parkway-cape-coral-FL-33914` (2529 Gleason Parkway, Cape
Coral, FL 33914). Fetched 08/12/2026.

**Property Attributes block:** MLS# 2026001896 · Type Single Family · Listing Status Active · County
Lee · City Cape Coral · Area CC22 - Cape Coral Unit 69,70,72- · Neighborhood CAPE CORAL · Zip 33914 ·
Style Ranch, One Story · Year Built 2005 · Taxes $7,993 · Price $664,900 · Bedrooms 4 · Full Bathrooms
2 · Half Bathrooms 1 · Sqr Footage 3,201 · Lot Size 0.48 Acres.

**Data Source:** Florida Gulf Coast MLS (SWFLMLS).

**Property Description:** full MLS remarks prose, several hundred words, verbatim — covers 2023–2024
renovation detail (new tile roof, new HVAC, new water heater, new pool pump, hurricane impact windows,
generator, alarm system) and a flood-history/insurance disclosure line ("Home has never flooded -
sellers do have a transferrable flood policy at $1604 annually").

**Price History table** (date / event, verbatim rows): 2/20/2026 Listed $739,000 · 3/8/2026
$699,000 · 4/25/2026 $675,000 · 7/22/2026 $669,900 · 8/8/2026 $664,900.

**General Features table:** Sewer (Assessment Paid, Public Sewer) · Heating (Central, Electric) ·
Cooling (Central Air, Ceiling Fan(s), Electric) · Utilities (Cable Available) · Possession (Close Of
Escrow) · **Roof: Tile** · Appliances (Built-In Oven, Dishwasher, Electric Cooktop, Freezer, Disposal,
Microwave, Refrigerator) · Garage Spaces 2 · **Association Fee Includes: None** · Patio/Porch Features
(Lanai, Open, Porch, Screened) · Architectural Style (Ranch, One Story) · Pool Features (Concrete,
Electric Heat, Heated, In Ground, Screen Enclosure, Pool/Spa Combo) · Security Features (Burglar Alarm
Monitored, Security System) · Construction Materials (Block, Concrete, Stucco) · Pets Allowed Yes ·
Year Built 2005 · View Landscaped · Stories Count 1 · Property Subtype Single Family Residence · Tax
Year 2025 · Ownership Single Family · Waterfront Features None · Community Features Non-Gated · County
Lee · Property Type Residential · Association Amenities None · **HOA: false** · Attached Garage true ·
**Subdivision Name: CAPE CORAL** · Facing Direction Southwest · Garage Y/N true · Full Baths 2 ·
Status Active · City Cape Coral · Disclosures (Owner Has Flood Insurance, RV Restriction(s)) · Senior
Community Y/N false · Zoning Description R1 · MLS Area CC22 · Lot Size Units Acres · Carport Y/N false
· Spa Features (Electric Heat, Gunite, In Ground, Screened) · Tax Annual Amount 7993 · Property
Condition Resale · Virtual Tour (two separate URLs: floridavisualmarketing.com IDX + Zillow 3D tour) ·
Standard Status Active · Tax Lot 82 · Property Sub Type Additional Single Family Residence ·
PostalCity Cape Coral · **Legal Description** (full plat/lot legal, verbatim: "CAPE CORAL UNIT 74 BLK
4857 PB 22 PG 131 LOT 82 + POR LOT 83 DESC IN OR 4289 PG 4129").

**Interior Features table:** Interior Amenities (Breakfast Bar, Bedroom on Main Level, Breakfast Area,
Bathtub, Tray Ceiling(s), Separate/Formal Dining Room, Dual Sinks, Entrance Foyer, Eat-in Kitchen,
Jetted Tub, Kitchen Island, Multiple Shower Heads, Main Level Primary, Pantry, Separate Shower, Vaulted
Ceiling(s), Walk-In Closet(s), Central Vacuum, Split Bedrooms) · Flooring (Carpet, Tile) · Furnished
Y/N Unfurnished · Total Stories 1 · Air Conditioning Y/N true · Heating Y/N true · Window Features
Single Hung · Half Baths 1 · Laundry Features (Washer Hookup, Dryer Hookup, Inside) · Total Bedrooms 4
· Entry Level 1 · Room Type (Den, Family Room, Screened Porch, Great Room) · **LivingAreaSource:
Appraiser** · Total Baths 3.

**Exterior Features table:** Exterior Amenities (Fruit Trees, Sprinkler/Irrigation, Outdoor Shower,
Shutters Manual) · Parking Features (Attached, Driveway, Garage, Paved, Garage Door Opener) · Lot
Features (Irregular Lot, Oversized Lot, Cul-De-Sac, Sprinklers Automatic) · Water Source (Assessment
Paid, Public) · Lot Size Area 0.48 · Spa true · Building Area Total 3,643 · Lot Dimensions
"55 x 123 x 245 x 142" · Lot Size Acres 0.48 · Road Surface Type Paved · Private Pool true · **Lot
Size Source: Appraiser** · Waterfront Y/N false · Covered Spaces 2 · Road Responsibility (Public
Maintained Road) · LotDimensionsSource Appraiser.

**Amenities tag list** (checkbox-style flags, present/not-present per listing): Foreclosure, Views,
Short Sale, New Construction, Adult 55+, Lease To Own, No HOA Fees, Furnished, Primary On Main, Air
Conditioning, Seller Finance, Green, Fixer Upper, Horse, Golf, Fireplace, Deck, Garage, Basement, Pool.

**Comp panel — "Property vs Single Family Average in 33914":** Price (AVG $780K vs this listing $660K)
· Taxes (AVG $8,454 vs $7,993) · Year Built (AVG 2005 vs 2005). This is a live ZIP-level average
comparison rendered on the page itself.

**Attribution / agent:** Your Agent — Lesley Williams, Williams Signature Group, Broker Associate /
Sales Advocate, phone number, agent profile link · "Listed By EXP Realty LLC" (the actual listing
brokerage of record, separate from the site owner's own brokerage name badge).

**Media:** 20+ photo URLs on a CloudFront/imgproxy path
(`d2na8ywvtbawk2.cloudfront.net/.../f:webp/rt:fit/w:1025/<base64>`, decoding to
`d36xftgacqn2p.cloudfront.net/listingphotos175/2026001896-N.jpg`) · a second, brokerage-native virtual
tour link (`floridavisualmarketing.com`) alongside a Zillow-hosted 3D tour link.

**Similar Properties block:** three more `/property/175-{mls}-{slug}` links with price/type/size/beds-
baths, each independently join-keyed the same way as the primary listing.

### The five flagged fields — explicit answer

- **Subdivision/community name: PRESENT.** `Subdivision Name: CAPE CORAL` (also duplicated as
  `Neighborhood: CAPE CORAL` and in the MLS Area string).
- **Full remarks prose: PRESENT.** Full MLS description, several hundred words, verbatim, including an
  agent-stated renovation and flood-insurance narrative.
- **Year built: PRESENT.** `Year Built: 2005`, appears twice (Property Attributes block and General
  Features table), plus a ZIP-average comparison ("AVG 2005" vs "2005" for this listing).
- **Roof: PRESENT.** `Roof: Tile` — a material/type value, not an age, same limitation already
  documented on johnrwood.com. Roof age is not on this page; the remarks prose says "new tile roof"
  informally but with no installation date, which is agent-stated, not structured or dated.
- **HOA fee amount: NOT PRESENT.** The schema carries `HOA: false`, `Association Fee Includes: None`,
  and an `Association Amenities: None` field, but this specific property has no HOA, so there is no
  fee-amount value to observe on this page. The field template does carry a fee-amount slot in
  principle (a "No HOA Fees" tag also fires in the Amenities list) — but confirming what a nonzero HOA
  fee amount actually renders as would require pulling a second, HOA-carrying listing on this same
  platform, which is out of scope per the stop condition (this exact null-vs-populated ambiguity
  matches what was already found on johnrwood.com: "HOA: inclusions yes, FEE AMOUNT no").

## What this page carries that johnrwood.com (site 1 in the reference file) did not

- **A dated Price History table** — every list-price change with its date, not just the current price.
  This is a direct read on days-on-market behavior and price-reduction pattern per listing, free.
- **Per-field source attribution** — `LivingAreaSource: Appraiser` and `LotSizeSource: Appraiser` name
  which party supplied that specific number. Site 1's census had no equivalent provenance-per-field
  marker.
- **A live ZIP-average comp panel rendered on the page** — "Property vs Single Family Average in
  33914" for price, taxes, and year built, computed by the platform itself against the listing's own
  ZIP.
- **Full legal description and tax lot** — plat book/page and lot number, not present in site 1's
  census.
- **An explicit "Listed By" brokerage-of-record line** distinct from the site-owner's own brokerage
  badge, plus a second, brokerage-native virtual tour URL alongside the Zillow one.
- **A visible robots.txt trap** — the two-block `User-agent: *` structure with a trailing blanket
  `Disallow: /` is new; neither site 1 nor site 2 in the reference file had anything like it.
- **Confirmed WAF-vs-plain-HTTP split on a THIRD stack.** `curl` returned HTTP 403 on the homepage and
  the detail page (200 only on `robots.txt`) while crawl4ai's browser fetched all three in full —
  the same operational split already documented for royalshellrealestate.com, now confirmed on a
  kvCore/BoldTrail site too. Per the HARD RULE, this curl result was NOT used to conclude the site was
  blocked; crawl4ai's browser fetch is the evidence of record for the "browser-only" verdict above.

## What this does not establish

One site, one eXp-issued kvCore/BoldTrail instance. It says nothing about a non-eXp brokerage's kvCore
deployment (custom branding/template could differ), and nothing about Sierra Interactive, Real Geeks,
or Luxury Presence — those remain separate, not-yet-run tasks per the queue. Terms of Service were not
read, only robots.txt. No sold-listing page was fetched, only an active one.
