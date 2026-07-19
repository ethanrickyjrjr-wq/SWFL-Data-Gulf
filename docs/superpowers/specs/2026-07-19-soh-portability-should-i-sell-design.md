# SOH portability + cost-of-waiting on /r/should-i-sell

**Date:** 2026-07-19
**Build slug:** `soh-portability-should-i-sell` · verify check: `soh_portability_should_i_sell_live_verify`
**Approved:** operator, 07/19/2026 (two-tier shape ratified in-session; "SPEC" decree)

## Problem

Sellers with a homestead sit on a Save-Our-Homes benefit (the gap between just value and
assessed value) that is invisible to them, portable when they move, capped at $500,000, and
on a 3-year clock once they abandon the homestead. The scoring industry never shows a seller
this number. STEADY-PAINS confirmed "SOH cost of waiting" as a market gap but parked it as
"need feeds we don't have" — that was written before the FDOR full-scope ingest landed
(07/18/2026). We now hold every input per parcel and per ZIP. `steady20_soh_cost_of_waiting_calc`
is the open idea check; `should_i_sell_property_tax_source` is the open tax-default check.

## Goal

Extend the live `/r/should-i-sell/[zip]` page with a two-tier SOH section — an always-rendered
ZIP-grain line plus an address-gated per-parcel portability calculator — and resolve the
property-tax default honestly (link-out + user entry; no fetched bill exists). Zero new ingest,
zero paid calls; every figure is parcel roll, published brain output, statute constant, or
user-entered.

## Evidence (researched in-session 07/19/2026, RULE 0.4 — crawl4ai + primary docs, not memory)

- **Florida DOR PT-112 (R. 08/24)** — `https://floridarevenue.com/property/Documents/pt112.pdf`
  (fetched 07/19/2026): SOH cap = the lesser of 3% or CPI change per year, first year after
  homestead exemption. The SOH benefit is the accumulated difference between assessed and just
  value. Portability window: establish the new homestead **within three years of January 1 of
  the year the old homestead was abandoned** (not three years after the sale). File DR-501T
  with DR-501; deadline **March 1**. A change of ownership resets the buyer to just value the
  following January 1.
- **s. 193.155(8), Florida Statutes** — `http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0100-0199/0193/Sections/0193.155.html`
  (crawled 07/19/2026), verbatim formulas:
  - **Upsizing** (new JV ≥ old JV): new assessed = new JV − min($500,000, old JV − old AV).
  - **Downsizing** (new JV < old JV): new assessed = (new JV ÷ old JV) × old AV, then if
    (new JV − new assessed) > $500,000, assessed is raised so the difference equals $500,000.
  - Values fix as of January 1 of the abandonment year.
- **County tax-bill endpoints — probed, no fetchable bill.** Lee Tax Collector routes to
  `https://county-taxes.net/fl-lee/property-tax` (Grant Street TaxSys, client-rendered JS —
  crawler receives "Loading..."); Collier routes to `https://collier.county-taxes.com/public`
  (same vendor, Cloudflare bot verification). No dependable server-fetchable per-parcel annual
  bill. Consequence: the spread's tax field stays user-entry with a cited per-county link-out.
  TaxSys also exposes `/public/reports` (bulk files) — a possible future ingest, tracked as its
  own check, out of scope here.

## Data roots (per docs/standards/data-roots.md — no new roots needed)

- **Per-parcel (calculator):** `data_lake.lee_parcels` + `data_lake.collier_parcels` (FDOR
  cadastral, byte-identical 104-col schema). Fields: `jv`, `jv_hmstd`, `av_hmstd`, `phy_addr1`,
  `phy_zipcd`. The portability chain (`assessment_transfer_flag`, `assessment_diff_transferred`,
  `year_value_transferred`, `prev_homestead_*`) is pulled and available for a later "did you
  already port?" enrichment — not read in v1. Per-parcel SOH benefit = `jv_hmstd − av_hmstd`
  (the statute's portable amount), identical definition in both counties.
- **Per-ZIP (always-on line):** published brain output via `loadParsedBrain` — the same seam as
  the market snapshot. Lee: properties-lee-value per-ZIP assessed/SOH detail table (served
  07/19/2026). Collier: properties-collier-value `collier_value_by_zip` table
  (`soh_gap_median_pct` column). **Definitional nuance carried in copy:** Lee's ZIP median is
  the whole-parcel (just−taxable)/just proxy; Collier's is the homestead-portion
  (jv_hmstd−av_hmstd)/jv_hmstd measure. Directionally comparable, not numerically identical —
  each line cites its own county's definition. The per-parcel tier is NOT affected (uniform
  jv_hmstd/av_hmstd in both counties).

## What we're building

### Tier 1 — ZIP-grain line (always rendered when data exists)

One sentence in a new section "Your tax break, and what moving does to it": the median share
of homesteaded value shielded by Save Our Homes in this ZIP, as-of dated (MM/DD/YYYY, once),
cited to FDOR cadastral via the county value brain. Nullable end-to-end: ZIP absent from the
table → line omitted, never guessed. Crawler-honest — real server-rendered number.

### Tier 2 — per-parcel portability calculator (address-gated)

Reuses the existing `?address=` GET param (one form serves the spread and this section).

- **Loader** matches normalized street + ZIP against the county parcel table (single-row
  lookup; county chosen by the ZIP's primary county). No match → tier renders nothing (the
  prompt to add an address stays); partial coverage accepted — same stance as the year-built
  join.
- **Homesteaded parcel** (`jv_hmstd > 0`), rendered line by line:
  - *Your SOH benefit today:* `jv_hmstd − av_hmstd`, dollar figure, FDOR-cited, as-of dated.
  - *What ports:* upsizing → min($500,000, benefit) comes straight off the next home's
    assessment. Downsizing → proportional formula, computed against ONE optional user-entered
    input, "price of the home you'd buy next" (lane 4; blank → we show the MAXIMUM portable
    amount min($500,000, benefit), labeled as the buy-equal-or-up case with "less if you
    downsize" — no assumed next-home price ever).
  - *The clock:* 3 years from January 1 of the abandonment year; DR-501T by March 1. Statute +
    PT-112 cited inline.
  - *Cost of waiting* — `[INFERENCE]`-tagged: project just value forward 6/12 months with the
    same cited ZIP YoY fraction the spread uses; assessed grows at the 3% statutory ceiling
    (state CPI-vs-3% as the rule; 3% used as the ceiling case, labeled as such); the gap and
    the ported amount recompute; when the projected gap crosses $500,000 the line says the
    excess stops porting. Falsifier stated (the same one the spread uses: the trend reversing).
- **Non-homesteaded parcel** (`jv_hmstd = 0` or null): one honest line — the roll shows no
  homestead here, portability doesn't apply — and the spread still renders.
- **A buyer-side truth kept visible:** the section states plainly that the buyer of the
  seller's current home resets to just value (why their own low bill doesn't transfer to the
  buyer — and why their next home's bill can jump without portability).

### Property tax in the existing spread (resolves `should_i_sell_property_tax_source`)

No default number — the probe found no fetchable bill. The tax field keeps requiring the
user's real bill and gains a cited per-county link-out: Lee → `county-taxes.net/fl-lee/property-tax`,
Collier → `collier.county-taxes.com/public` ("Look up your exact bill — {County} Tax
Collector"). `lib/should-i-sell/property-tax.ts` gains link metadata only, never a number; its
STATUS comment updates with the probe result. Close the check with this shipped + probe
evidence; open `taxsys_bulk_reports_probe` (idea) for the bulk-reports lane.

## Code shape

- `lib/should-i-sell/soh-portability.ts` — pure math, no I/O. Statute constants
  (`SOH_PORT_CAP = 500_000`, `SOH_ANNUAL_CAP_PCT = 3`, `PORT_WINDOW_YEARS = 3`) each with a
  source-URL comment. Functions: benefit, portUpsizing, portDownsizing (statute order of
  operations exactly), projectGap (ceiling-case assessed growth, [INFERENCE] metadata +
  falsifier text). Tests: upsize, downsize, cap-clip both directions, zero/absent homestead,
  negative-gap guard (assessed never exceeds just: clamp 0).
- `lib/should-i-sell/load-parcel-soh.ts` — server loader, typed Supabase client, address
  normalization (uppercase, collapse whitespace, strip unit suffixes), county by ZIP primary,
  single-row select of the 5 fields + source vintage. Dep-injected fetch; tests cover match,
  no-match, non-homesteaded, malformed address.
- `lib/should-i-sell/load-zip-soh.ts` — ZIP line off `loadParsedBrain` per county pack table;
  county-correct definition string + as-of; nullable. Tests with fixture ParsedBrain.
- `components/should-i-sell/SohPortability.tsx` — client component: next-home-price input
  (optional), reuses the 6/12-month horizon idiom, renders line items (never a bare final
  number), all caveats above.
- `app/r/should-i-sell/[zip]/page.tsx` — wire section between MarketSnapshot and the spread;
  citations extended: FDOR cadastral, Florida DOR (floridarevenue.com), Florida Legislature
  (leg.state.fl.us), county Tax Collector homepages.
- `lib/should-i-sell/no-invention.test.ts` — extended to the new section (no unsourced number
  can render).

## Not building (fenced out)

- No new ingest, no cron, no pack/vocab change, no `--- OUTPUT ---` shape change (the ZIP tier
  reads already-published tables — Gate 5 untouched).
- No millage math, no estimated tax bill, no "average millage" — banned as derivable-but-invented.
- No use of the portability-chain columns in v1 (enrichment noted for later).
- No TaxSys scraping; bulk-reports lane is its own future check.
- Charlotte/Glades/Sarasota claims — out of scope (Lee + Collier only, county stated on the line).

## Verification

`bun test` on the three new libs + extended no-invention test; `bunx next build`; live-verify
on served bytes (real address in a Lee ZIP and a Collier ZIP, one homesteaded + one
non-homesteaded case) → close `soh_portability_should_i_sell_live_verify`,
`steady20_soh_cost_of_waiting_calc`, `should_i_sell_property_tax_source` with proof.
