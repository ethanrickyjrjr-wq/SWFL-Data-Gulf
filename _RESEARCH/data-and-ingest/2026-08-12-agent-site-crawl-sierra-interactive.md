# Agent-site listing crawl — Sierra Interactive (Task 2 of the listing-grade Sonnet queue)

**Date:** 08/12/2026 · **Method:** crawl4ai (pinned CLI), live, no Firecrawl · **Rule:** RULE 0.4
**Queue this answers:** `docs/handoff/2026-08-11-listing-grade-sonnet-work-queue.md` Task 2 of 9 —
platform = Sierra Interactive.
**Template followed:** `_RESEARCH/data-and-ingest/2026-08-11-agent-site-listing-crawl-feasibility.md`
(johnrwood.com + royalshellrealestate.com).

**Verdict: PARSEABLE. Server-rendered on the pages that matter (new-listings index and listing
detail), robots-clean for listing paths, and the field set is the richest of any SWFL agent site
crawled so far in this queue — it is the first one that carries an actual HOA fee dollar amount.**

## Site crawled

`www.naplesarearealestate.com` — Sean Lorch, Downing-Frye Realty Inc, Naples, FL (license
BK3333077). Pages fetched 08/12/2026: `/robots.txt`, homepage (`/`), the AJAX search-results page
(`/property-search/results/?searchid=1507228` — did NOT render, see §1), the New Listings index
(`/todays-new-listings/` — DID render, used as the listing-index page), and one detail page:
`/property-search/detail/116/226028999/20659-country-barn-dr-estero-fl-33928/`.

## Fingerprint — how this was identified as Sierra Interactive

Confirmed two ways, both live 08/12/2026:
1. **Page source.** `curl -A "Mozilla/5.0" https://www.naplesarearealestate.com/` returns HTML
   referencing `sierra-assets.s3.amazonaws.com`, `sierra-assets.s3-us-west-1.amazonaws.com`
   (custom-scripts.js, sierra-custom.css, building-search.js), `sierrastatic.com` (logo/photo CDN),
   and `sierrainteractive.com` / `sierrainteractivedev.com`.
2. **Footer attribution, rendered by crawl4ai.** Every page's footer carries the literal text
   `Real Estate Websites by Sierra Interactive`, linking to `https://www.sierrainteractive.com/`.
   Listing-detail photos are served from `cdn.listingphotos.sierrastatic.com`, and the agent's own
   headshot from `sierra-public.azureedge.net` — both Sierra-branded CDN hosts.

## robots.txt — the listing paths are ALLOWED

Fetched live via `crawl4ai https://www.naplesarearealestate.com/robots.txt` 08/12/2026. For
`User-agent: *` the disallows are: `/res/includes/`, `/sist/`, `/property-search/sist_ajax/`,
`/property-search/market-update/`, `/idx/market-update/`, `/search/market-update/` (with a
crawl-delay of 5s). **None of the disallowed paths cover `/property-search/detail/*`,
`/property-search/results/*`, or `/todays-new-listings/*`** — the listing index and detail pages
crawled here are not blocked. Named AI-agent rows (`OAI-SearchBot`, `ChatGPT-User`,
`PerplexityBot`, `Perplexity-User`, `Claude-SearchBot`, `Claude-User`) each carry
`Content-Signal: search=yes, ai-input=yes, ai-train=no` and `Allow: /` — explicit opt-in for
search/answer use, explicit opt-out for training. `Amazonbot`, `PetalBot`, and `Barkrowler` are
fully disallowed (`Disallow: /`). SEO bots (`AhrefsBot`, `AhrefsSiteAudit`, `SemrushBot`) get an
85s crawl-delay and the same path disallows as `*`. Sitemap declared:
`https://www.naplesarearealestate.com/sitemap.xml`. Per-site robots must be re-checked for every
new site — this result is specific to this one Sierra Interactive install (site owners can and do
customize robots.txt; nothing here should be assumed to hold for a different Sierra client site).

## 1. Rendering — index page depends on WHICH index you hit

The generic search-results endpoint (`/property-search/results/?searchid=1507228`, the "Residential"
link off the homepage) rendered only `Loading Listings...` in crawl4ai's markdown output — this
endpoint hydrates listing cards client-side via AJAX (the disallowed `sist_ajax` path in robots.txt
is almost certainly the data source for exactly this widget) and crawl4ai's default fetch did not
wait long enough / trigger the load. **This is a real limitation, not a site-wide failure**: the
purpose-built New Listings page, `/todays-new-listings/`, returned full listing cards — 65 results,
paginated 6 pages, with price/DOM/address/subdivision/beds/baths/sqft/brokerage all present in the
markdown — no extra wait flag needed. The listing detail page (`/property-search/detail/...`) is
likewise fully server-rendered; every field in §4 came through in the single crawl4ai fetch, no
JS-wait tuning required.

**Net verdict for the walk (index → detail): parseable**, but the specific results-page URL pattern
matters — a generic `?searchid=` results page did not render for this session, while the dedicated
`/todays-new-listings/` listing index did. A production ingest pipeline hitting a Sierra Interactive
site should use the "new listings" / niche-search style pages (or add a wait-for-selector strategy
for the generic results view) rather than assume the raw results endpoint always hydrates.

## 2. URL pattern — MLS number IS in the URL

`https://www.naplesarearealestate.com/property-search/detail/{board_id}/{mls_number}/{address-slug}/`

Example: `/property-search/detail/116/226028999/20659-country-barn-dr-estero-fl-33928/`. `116` is a
constant board/IDX-vendor ID that repeats across every listing on this site regardless of MLS
(confirmed against several listings pulled from the same index page: 2026033192, 2026028278,
2026033769, 226028999, 226028951, 2026033028, 226025695 all carried `116` in the same slot). The
MLS number is the **third** path segment — **a direct join key to our own listing spine's
`mls_number` column**, same pattern class as johnrwood.com (MLS number as a raw path segment) and
royalshellrealestate.com, though one segment deeper here because of the fixed board-ID prefix.

## 3. FIELD CENSUS — one detail page, one crawl4ai call

Everything below came off `/property-search/detail/116/226028999/20659-country-barn-dr-estero-fl-33928/`,
verbatim, fetched 08/12/2026:

**Identity / status:** MLS # 226028999 · Status **Active** · List Price $225,000 · full street
address, city, state, ZIP · Property Type **Single Family** · On Site **1 Day** · Last Updated
8/11/2026.

**Community Information:** Area **ES02 - Estero** (MLS area code) · County **Lee** · City Estero ·
**Subdivision: Villas At Country Creek** · Zip Code · **Development: COUNTRY CREEK** (a separate,
linked master-community field distinct from Subdivision — two-tier naming).

**School Information:** High School, Middle School, Elementary School — all named.

**Architecture:** Bedrooms 2 · Bathrooms 2 · **Year Built 1997** · Stories 1 · Style
Coach/Carriage · Construction Materials Block, Concrete, Stucco · Building Area 1,694 sq ft ·
Status Type Resale Property · **Roof: Shingle** (material, not age) · Garage Spaces 1.0 · Parking
Features.

**Features / Amenities:** Interior Features, Appliances (full list), Flooring, Furnished status,
Laundry, Room Type, Restrictions, Exterior Features, Patio And Porch, Pool (Community), Direction
Faces, Entry Level, Security Features, Window, Community Features (Golf, Non-Gated), Golf Type
(Golf Bundled), Cooling, Heating.

**Property Features:** Lot Size (0.08 Acres) · Lot Features · View · Covered Spaces · Utilities ·
Sewer · Water · Road Surface · Zoning (RPD) · free-text Directions ("GPS 'MAY' take you to a owners
gate... be sure to enter the Community off of Corkscrew").

**Tax and Financial Info:** Tax Year 2025 · Tax Annual Amount **$2,002.57** · Terms (All Financing
Considered, Cash, FHA) · Leases Per Year 6 · Total Annual Recurring Fees **$8,300** · Total One Time
Fees **$5,600** · **Master HOA Fee $1,275 (paid Quarterly)** · **HOA Fee $800 (paid Quarterly)** ·
Application Fee $100 · Transfer Fee $500 · Association Fee Includes (Association Management, Golf,
Insurance, Internet, Legal/Accounting, Maintenance Grounds, Pest Control) · Association Amenities
(Bocce Court, Clubhouse, Fitness Center, Golf Course, Pool, PuttingGreens, Restaurant, Tennis
Court(s), Management) · Pets Allowed (Call, Conditional).

**Summary strip (rendered separately near the top of the page):** Monthly HOA **$425** — a rolled-up
monthly figure distinct from the quarterly Master/Sub HOA line items in Tax and Financial Info; the
page does not show its own arithmetic, so treat as a second, possibly-derived HOA figure rather than
assume it reconciles to the quarterly amounts without the source's own math.

**Remarks:** ~3 paragraphs of full MLS description prose, covering the unit, the golf community's
amenities, and an in-progress clubhouse renovation with a stated completion date.

**Agent / brokerage:** Sean Lorch, Downing-Frye Realty Inc, phone, headshot photo · listing
courtesy line naming the actual listing brokerage (Domainrealty.Com LLC, distinct from the site
owner's brokerage) — standard IDX co-broke attribution.

**Attribution / disclaimer:** IDX Program disclaimer naming Downing-Frye Realty Inc as the site's
brokerage and explaining the IDX logo convention · "Information deemed reliable but is not
guaranteed" disclaimer · "Listing Information Last Updated 8/11/2026" line.

**Media:** 36 numbered photo URLs (`cdn.listingphotos.sierrastatic.com`, both `pics1x`/`pics3x` and
`large` variants) · a "Show All 36 Photos" affordance · a "Printable Flyer" link · a Google Maps
directions link.

**Present but NOT populated in this single-fetch snapshot (JS-driven widgets, need interaction or a
longer wait to hydrate):** Walk Score / Transit Score / Bike Score (rendered "0 / Wait..." /
"Please wait while loading..."), the map (placeholder image only), "Similar Listings" and "Similar
Recently Sold Listings" sections (headers present, no rows), mortgage calculator (interactive tool,
inputs only — not a data field).

### The five flagged fields

- **Subdivision/community name — PRESENT, and richer than either prior site.** Two distinct fields:
  `Subdivision` (Villas At Country Creek, the immediate HOA) and `Development` (COUNTRY CREEK, the
  master/umbrella community), each independently linked to its own site page.
- **Full remarks prose — PRESENT.** ~3 paragraphs, same class of content as johnrwood.com's ~2,400
  characters.
- **Year built — PRESENT.** 1997, in the Architecture block.
- **Roof — PRESENT, type only.** "Shingle." Consistent with johnrwood.com's finding: agent sites
  carry roof material/type, never roof age — age still routes through the permit lane (Task 9 of
  this queue).
- **HOA fee amount — PRESENT. This is new.** johnrwood.com (site 1 of the reference file) carried
  HOA fee *inclusions* only, explicitly no dollar figure, and that gap was logged as the reason the
  paid per-house record stays the fill lane for HOA fee amount. This Sierra Interactive page carries
  **five distinct dollar figures** for HOA-adjacent costs: Master HOA Fee ($1,275/quarter), HOA Fee
  ($800/quarter), a summary "Monthly HOA" ($425), Application Fee ($100), and Transfer Fee ($500),
  plus rolled-up Total Annual Recurring Fees ($8,300) and Total One Time Fees ($5,600). **This is the
  first site in the queue where the HOA-fee-amount gap does not need the paid-vendor fallback** —
  at least for listings syndicated through this particular Sierra Interactive install. Whether this
  generalizes to other Sierra clients or is a function of this MLS's (Gulf Coast / board 116) own
  IDX feed carrying that field is not established by one page and should not be assumed.

## 4. What this page carries that johnrwood.com (site 1) did not

- **HOA fee dollar amounts** (see above — the standout difference).
- **Two-tier community naming** (Subdivision + separate linked Development/master-community field)
  vs. site 1's Subdivision + Neighborhood pair (which named the same community twice under two
  labels rather than two distinct tiers).
- **MLS Area code** (ES02 - Estero) — a structured sub-county geography token neither prior site
  exposed.
- **Itemized fee schedule**: Total Annual Recurring Fees, Total One Time Fees, Application Fee,
  Transfer Fee — transaction-cost detail beyond the recurring HOA amount itself.
  **Terms** (financing types the seller will consider) and **Leases Per Year** (rental-restriction
  count) — investor-relevant fields absent from site 1's census.
- **Tax Annual Amount as a discrete dollar figure** ($2,002.57) alongside Tax Year — site 1 had
  Taxes as a single figure too, but here it is paired with Tax Year and sits inside a broader
  Tax-and-Financial block with the fee data above.
- **Pets Allowed** as its own structured field (Call, Conditional).
- **Zoning code** (RPD) and **Road Surface** (Paved) — parcel/infra fields not in site 1's census.
- **Free-text access Directions** specific to the gated community (GPS caveat about the correct
  entrance) — a hyperlocal note class site 1 did not carry.
- **Walk Score / Transit Score / Bike Score widget slots** (unpopulated in this fetch, but present
  as a page section — not on site 1 at all).
- **Interactive Mortgage Calculator and "Schedule a Tour" booking widget** — functional page
  elements, not data fields, but absent from site 1's simpler layout.
- **Named AI-agent robots.txt rows** (Claude-SearchBot / Claude-User / PerplexityBot /
  OAI-SearchBot, each with an explicit `Content-Signal` line) — site 1's robots.txt (per the 08/11
  file) did not carry this AI-crawler opt-in/opt-out signaling; this is new machinery from Sierra
  Interactive's current robots.txt template, not from the individual site owner.

## 5. What this does NOT establish

- **One site, one platform install.** This is one Sierra Interactive client (a solo agent on a
  standard IDX template). It says nothing about how a different Sierra client's site is themed or
  configured — HOA fee presence, in particular, likely depends on what the underlying MLS feed
  (here, the Gulf Coast MLS via board ID 116) provides, not on the platform itself.
- **The generic search-results endpoint's rendering behavior is unresolved**, not confirmed broken.
  `/property-search/results/?searchid=...` returned `Loading Listings...` in this session; a
  wait-for-selector or longer-timeout crawl4ai config was not tried. A production pipeline should
  test that before concluding the endpoint requires headless-browser interaction beyond crawl4ai's
  default.
- **No claim about sold listings** — only one active listing's detail page was fetched.
- **Terms of Service were not read** — only robots.txt, per the queue's stated scope.
- **Redistribution is a separate question from retrieval** — the IDX attribution and
  not-guaranteed disclaimer travel with this data and must be carried by any surface we build from
  it, same caveat as both prior sites in this queue.
