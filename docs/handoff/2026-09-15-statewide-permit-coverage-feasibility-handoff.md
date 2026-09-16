# Statewide permit coverage — feasibility handoff

Date: 09/15/2026. Operator ask, verbatim shape: figure out what permits we can get and how hard
it is, starting with SWFL, with an eventual goal of all of Florida. Confirm every real way to get
each jurisdiction's data, and specifically whether historical archives are pullable in bulk or
whether someone has to sign into a portal and copy records by hand when a customer orders them.
Everything below is live-checked 09/15/2026 (WebSearch for discovery, crawl4ai/direct fetch for
verification, per RULE 0.4 — nothing here is from memory). Builds on
`_RESEARCH/competitor-and-strategy/2026-09-15-hbweekly-permit-reports-scan.md` and
`2026-09-15-permit-data-market-landscape.md`.

## The one-sentence answer

There is no single Florida permit API. It is a per-jurisdiction integration problem — every
county and every incorporated city runs its own system, usually its own vendor, sometimes more
than one vendor mid-migration. That is not a Claude failure or a gap unique to us: **PermitData.net,
a company whose entire business is exactly this, does not even cover Lee County** in its own
public Florida coverage page (verified live below), and every other real competitor we found
(`2026-09-15-permit-data-market-landscape.md`) describes sourcing from "hundreds of municipal
systems" as their core difficulty, not a solved problem. HBW's answer to the same problem is 40
human reporters. The work is real; it just isn't a mystery — it's a list.

## What we already have live (no new work)

- **Lee County (unincorporated)** — Accela Citizen Access, agency code `LEECO`
  (`aca-prod.accela.com/LEECO`). Scraped weekly via crawl4ai stealth, ~90-day rolling window,
  live and running (confirmed via `gh run list`, last success 09/14/2026). Flagged internally as
  fragile — it trips Accela's WAF under sustained load.
- **Collier County (unincorporated)** — pulled monthly from a published Issued-series XLSX report
  on collier.gov. Live and running (last success 09/15/2026), but see the CityView finding below
  — this may not be the county's only or freshest channel.

## SWFL jurisdictions checked today — what system each one runs

**Lee County cities/towns:**

- **Cape Coral** (Lee's largest city — NOT covered by the county's Accela feed at all) — runs
  **Tyler EnerGov Citizen Self-Service**, a completely different vendor from the county.
  Separately, Cape Coral also publishes a **Building Permits dataset on its own ArcGIS Open Data
  site** (`capecoral-capegis.opendata.arcgis.com`) — structured, not a scrape, in principle. Tried
  fetching it directly today: **blocked by anti-bot protection, HTTP 403.** Not necessarily a dead
  end — Collier's own XLSX fetcher already proved out a crawl4ai "UndetectedAdapter" stealth mode
  for exactly this kind of block (`ingest/cadence_registry.yaml` note, 06/16/2026) — but it is not
  a free win, it needs the same stealth work applied and verified here first.
- **Fort Myers** (city) — also **Tyler EnerGov CSS**, same vendor family as Cape Coral, different
  instance/tenant.
- **Bonita Springs** (city) — also EnerGov-based ("GovAccess" portal at
  `energov.cityofbonitasprings.org`).
- **Sanibel** (city) — split system: **CityView Portal** for permit search, but **EnerGov** for
  viewing/managing existing permits. Two vendors live at once — worth confirming which one
  actually holds the historical record before building against either.
- **Fort Myers Beach** (town) — **mid-migration**: existing permits live in **iWorQ**, new permits
  as of the last confirmed announcement move to **GovWell**. A moving target — don't build a
  connector against this one without re-checking current state first, it may have changed again
  since the last public announcement.

**Collier County cities:**

- **Naples** (city) — **CityView Portal** (`cityview2.iharriscomputer.com/CityofNaplesFlorida`).
  One search result's own page title read **"Naples, Florida Captcha - CityView Portal"** —
  meaning the public search page is very likely CAPTCHA-gated. A real, named obstacle, not
  assumed — needs a direct check before promising this one is scrapeable at all.
- **Marco Island** (city) — has its own permitting portal search (no login required for public
  search, per the city's own page). **Records go back to permits submitted October 1, 1998** —
  the city's own site says so directly. This is the single best archive-depth finding of the day:
  at least one SWFL jurisdiction already exposes ~27 years of history through a public, no-login
  search, contradicting the assumption that "historic" always means someone signing in and
  copying by hand.
- **Collier County (unincorporated) itself** — the county's own site describes its "CityView
  Online Permitting Portal" as the system for Building Permits & Planning Applications. **This
  potentially means Collier's live permits are queryable through the same CityView system Naples
  and Sanibel use** — which would be fresher and more complete than the monthly XLSX report we
  currently pull. Unconfirmed which one is actually authoritative or whether they're the same
  underlying data; this is the single highest-value thing to verify next, since it could
  improve our EXISTING Collier pipeline, not just add new coverage.
- Collier also runs a general **GIS Hub** (`hub-collierbcc.opendata.arcgis.com`) with
  GeoServices/WMS/WFS API access — confirmed for parcels/zoning, **not confirmed for a
  permits-specific layer** the way Lee's own ArcGIS org has one. Worth one direct check, not
  assumed either way.

## The vendor landscape, just from these 8 jurisdictions

Accela (Lee County) · Tyler EnerGov (Cape Coral, Fort Myers, Bonita Springs) · CityView /
iharriscomputer (Sanibel, Naples, and likely Collier County) · iWorQ → GovWell (Fort Myers Beach,
mid-transition). **Four different vendor platforms inside two counties.** Extrapolate that across
Florida's 67 counties and ~400 municipalities and the shape is exactly what PermitData.net and
HBW both describe: not one integration, dozens to hundreds of them, each with its own quirks
(CAPTCHAs, anti-bot, split systems, mid-migration states, registration walls).

## Answering "is it me signing in and copying, or can we get it in bulk"

Mixed, by jurisdiction, and now backed by actual evidence instead of a guess:

- **Structured/bulk-friendly today:** Lee County (Accela, already scraped), Collier County
  (monthly XLSX, already pulled), Marco Island (public search, no login, 27 years of history).
- **Structured but blocked without extra work:** Cape Coral's ArcGIS Open Data (403 on a plain
  fetch — needs the stealth technique already proven elsewhere), Lee's own richer ArcGIS
  FeatureServer org (never pulled at all — `docs/standards/data-roots.md` source_ceiling,
  07/08/2026).
- **Likely obstructed:** Naples (probable CAPTCHA on the one search page checked).
- **Genuinely uncertain, needs one more check each:** Fort Myers, Bonita Springs, Sanibel
  (whether EnerGov exposes a bulk/API path or only a per-record web search), Fort Myers Beach
  (actively changing vendors), whether Collier's CityView portal is queryable in bulk or only
  per-record.

Nothing found today requires the "sign in and manually copy for a customer" fallback — every
jurisdiction checked has at least a public, no-login search interface. Whether that search
interface can be *automated at scale* (API, bulk export, or a reliable scrape) versus only
answering one record at a time is the open question per jurisdiction, and it's a spectrum, not a
binary.

## What actually needs to happen next (in order)

1. **Confirm Collier's CityView vs. its monthly XLSX** — highest value, touches an EXISTING
   pipeline, not new scope. One direct login-free portal check settles whether we've been pulling
   the county's second-best channel this whole time.
2. **Confirm whether Cape Coral's ArcGIS layer is reachable with the stealth fetch technique** we
   already built for Collier — if yes, this closes the Cape Coral gap
   (`lee_permits_cape_coral_coverage_gap`, opened 09/15/2026) with a real API, not a scrape.
3. **One direct check each on Fort Myers, Bonita Springs, Sanibel's EnerGov instances** — does
   EnerGov CSS expose a bulk query/API path, or only single-record lookup? This determines whether
   "all of Lee's cities" is a real near-term target or a per-record-only fallback.
4. **Re-check Fort Myers Beach** before building anything — it was mid-migration as of the last
   public announcement found; confirm current state first.
5. **Only after Lee + Collier are actually fully mapped** does "next county" become a real
   question — and the method here (WebSearch each jurisdiction's own permit page → identify the
   vendor → check for a public search vs. API vs. bulk export → note login/CAPTCHA/anti-bot
   friction) is the repeatable pattern for scaling to the rest of Florida. This handoff is that
   pattern's first real run, not a one-off.

## Sources checked live, 09/15/2026

leegov.com / aca-prod.accela.com/LEECO (existing pipeline) · collier.gov (existing pipeline) ·
capecoral.gov (Permitting Services, Building & Permit Reports, EnerGov CSS page) ·
capecoral-capegis.opendata.arcgis.com (403'd) · fortmyers.gov/EnerGov ·
cityofbonitasprings.org + energov.cityofbonitasprings.org · mysanibel.com +
cityview2.iharriscomputer.com/SanibelPortal · fortmyersbeachfl.gov (iWorQ/GovWell transition
notice) · naplesgov.com + cityview2.iharriscomputer.com/CityofNaplesFlorida ·
cityofmarcoisland.com/building/page/permitting-portal-search · hub-collierbcc.opendata.arcgis.com
· permitdata.net/coverage.html (35-jurisdiction FL demo, Lee County absent, confirmed live).
