# Luxury Presence agent-site crawl — feasibility + field census (Task 4 of the listing-grade queue)

**Date:** 08/12/2026 · **Method:** crawl4ai (pinned CLI, `C:\Users\ethan\.local\bin\crawl4ai`), live,
no Firecrawl · **Rule:** RULE 0.4
**Brief this answers:** `docs/handoff/2026-08-11-listing-grade-sonnet-work-queue.md` Task 4 —
Luxury Presence platform crawl test, one of the 4-platform sweep alongside kvCore/BoldTrail, Sierra
Interactive, and Real Geeks.
**Verdict: PARSEABLE. Server-rendered, robots-clean, no rendering trick needed — plain crawl4ai
markdown carries the full listing content on every page fetched.**

## Site tested

`naplesjamie.com` — Jamie Chang, Sales Associate, Premier Sotheby's International Realty, 325
Vanderbilt Beach Road, Naples FL 34108. A real, active SWFL agent site (Naples/Marco Island market),
found via a Bing search for `"Luxury Presence" real estate agent website Naples Florida` (fetched
through crawl4ai, 08/12/2026) — the search results page itself showed `media-production.lp-cdn.com`
image hosts against this domain, which is the fingerprint confirmed below.

**Fingerprint that identified the platform:** two independent signals on the live homepage
(`https://naplesjamie.com`, fetched 08/12/2026):
1. Every content image on the site is served from `media-production.lp-cdn.com` (e.g.
   `https://media-production.lp-cdn.com/cdn-cgi/image/format=auto,quality=85/https://media-production.lp-cdn.com/media/ygzdgjf1ggtaegjhhcwg`)
   — Luxury Presence's own media CDN hostname (`lp-cdn.com` = "Luxury Presence CDN").
2. The footer carries an explicit credit line: **"Powered by [Luxury Presence](https://www.luxurypresence.com/)"**,
   linking to `www.luxurypresence.com`. This is the same distinctive footer-credit pattern the parent
   brief named as a Luxury Presence tell.

Listing photos on the property-detail page live on a third, separate host —
`dlajgvw9htjpb.cloudfront.net/cms/{brokerage-uuid}/{mls_number}/{numeric-id}.jpg` — a CloudFront
distribution that embeds the MLS number directly in its own path, one more platform tell.

## robots.txt — no listing-path disallows

Fetched live, 08/12/2026, `https://naplesjamie.com/robots.txt`:

```
Sitemap: https://naplesjamie.com/sitemap.xml
User-agent: AdsBot-Google
Disallow: /api/

User-agent: SemrushBot
Crawl-delay: 10
User-agent: SiteAuditBot
Crawl-delay: 10
User-agent: PetalBot
Crawl-delay: 10
User-agent: dotbot
Crawl-delay: 10

User-agent: *
Disallow: /thankyou
Disallow: /modules/
Disallow: /internal/
Disallow: /thank-you
Disallow: /home-search/account
Disallow: /home-search/auth/
Disallow: /api/
Disallow: /cdn-cgi/
Disallow: /modals.html
```

For `User-agent: *` the disallows are `/thankyou`, `/modules/`, `/internal/`, `/thank-you`,
`/home-search/account`, `/home-search/auth/`, `/api/`, `/cdn-cgi/`, `/modals.html`. **Neither
`/properties/` (the listing index and detail path) nor `/home-search/listings` (the map-search path)
is disallowed.** Only the logged-in account/auth sub-paths of `/home-search/` are blocked, not the
search results themselves. Per-site robots must still be re-checked for every new Luxury Presence
site — this result is site-specific, same caveat as the johnrwood.com and royalshellrealestate.com
findings.

## Listing detail URL pattern — the MLS number is NOT in the URL

`https://naplesjamie.com/properties/{address-slug}-{opaque-hex-string}`

Example: `https://naplesjamie.com/properties/623-park-shore-drive-naples-fl-us-34103-d4bf160d-938d-4c99-a340-cb4eb831a5b4`.

The trailing segment (`d4bf160d-938d-4c99-a340-cb4eb831a5b4`) is an opaque internal listing ID, not
the MLS number — it does not match the MLS® ID shown on the page (226020867). **This breaks the
pattern seen on both prior platforms (johnrwood.com and royalshellrealestate.com), where the MLS
number sat directly in the URL path.** On Luxury Presence, the MLS number is NOT a join key you can
read off the URL. It IS recoverable two other ways on this same page, both requiring a fetch of the
page body rather than the URL alone:
1. A labeled field on the detail page itself: **`MLS® ID: 226020867`**.
2. Embedded in every photo URL's path: `https://dlajgvw9htjpb.cloudfront.net/cms/{uuid}/226020867/{id}.jpg`.

So the join to our listing spine's `mls_number` column is still free and reliable, but it requires
parsing the page body (or a photo URL) — a URL-only join, which worked on the first two platforms,
does NOT work here.

## Field census — one free page, one call

Detail page fetched: `https://naplesjamie.com/properties/623-park-shore-drive-naples-fl-us-34103-d4bf160d-938d-4c99-a340-cb4eb831a5b4`,
08/12/2026. Everything below came off that single page, verbatim, under its own labeled section
headers ("Features & Amenities" > Interior / Area & Lot / Exterior / Financial):

**Identity / location:** street address · city, state, ZIP (34103) · **MLS® ID 226020867** ·
**Neighborhood: Park Shore / Moorings** (this IS the subdivision/community field on this platform —
labeled "Neighborhood," not "Subdivision") · a cross-linked community landing page
(`/neighborhoods/park-shore-moorings`) with its own short description.

**Structure:** Type **Residential** · total bedrooms 5 · total bathrooms 5 (full 4, half 1) ·
Living Area 4,383 Sq.Ft. · Total Area 4,383 Sq.Ft. · Lot Area 0.39 Acres · **YEAR BUILT 2025** ·
Architecture Styles **1 Level Ranch** · Garage Space 3.0.

**Money / market:** Status **For Sale** · Sales Price $5,500,000 · **Real Estate Tax $19,768/yr**.

**Attribution:** listing agent name (Jamie Chang), title (Sales Associate), phone, email,
**DRE # 249521765**, "Courtesy of Premier Sotheby's International Realty" line.

**Remarks:** ~2,700 characters of full descriptive prose (construction details, finishes, appliance
brands, outdoor living features, all agent/MLS-sourced narrative text) — same shape as the
johnrwood.com remarks field.

**Media:** full photo gallery (69 image URLs on this one listing, CloudFront-hosted, MLS number in
every path).

**Fields checked and explicitly NOT present on this page:**
- **Subdivision/community name:** PRESENT, under the label "Neighborhood" rather than "Subdivision"
  (Park Shore / Moorings).
- **Full remarks prose:** PRESENT (~2,700 characters, see above).
- **Year built:** PRESENT (2025).
- **Roof:** ABSENT. Checked the full field list and grepped the whole page body for "roof" — the
  only hit was the substring inside "weatherproof," not a roof field or a roof mention in the
  remarks prose. Zero roof information of any kind on this page.
- **HOA fee amount:** ABSENT as a sourced fact. "HOA Dues" appears only inside the page's mortgage
  calculator widget, defaulted to **$0** and user-editable — an estimate input, not an MLS-sourced
  HOA figure. Same finding as johnrwood.com: HOA amount is not a field this platform class publishes.

## What this page carries that johnrwood.com (site 1) did not

- **A live interactive showing-scheduler** embedded directly in the listing page (date/time picker,
  in-person vs. video-chat toggle, submits a request to the agent) — site 1 had no equivalent widget.
- **A built-in mortgage calculator** on the detail page itself (home price, term, down payment,
  property tax, interest rate, HOA dues as editable inputs, computing a monthly payment breakdown).
- **A cross-linked, named community/neighborhood landing page** (`/neighborhoods/park-shore-moorings`)
  reachable directly from the listing — a dedicated content page per community, not just a text label.
- **Agent DRE (license) number** printed directly on the listing card — johnrwood.com's site-1 census
  did not surface an individual license number on the detail page.
- **The opaque, non-MLS listing-ID URL scheme** itself is a structural difference worth flagging as
  a negative finding (see URL-pattern section above) — every other platform tested to date put the
  MLS number in the path; this one doesn't.

## What this does NOT establish

- **One site, one platform, one listing.** This is one Naples/Marco Island Sotheby's affiliate on
  Luxury Presence's standard template. Other Luxury Presence sites may run different template
  versions (Luxury Presence sells site-builder plans, not one fixed layout) — field labels or the
  URL scheme could vary by plan/template.
  **Task 4 spec's own stop condition is met with one site — no second site was tested.**
- **Terms of service were not read** — only robots.txt, per the same scope limit as the prior two
  platform write-ups.
- **No claim about sold listings.** Only an active for-sale listing was fetched; the site does
  separately expose a "Past Transactions" section (`/properties/sold`) that was not crawled for a
  field census.
- **Redistribution is a separate question from retrieval**, same caveat as prior platform files —
  the MLS attribution ("Courtesy of Premier Sotheby's International Realty") and the agent's own
  branding travel with the data and would need to be carried by any surface we build from it.

## Rendering note for the platform-sweep summary

No headless-rendering workaround, no WAF block, no JS-hydration barrier encountered on this
platform — plain `crawl4ai <url>` markdown returned full listing content on the homepage, the
`/properties/sale` listing index, and the detail page, on the first fetch of each, 08/12/2026.
