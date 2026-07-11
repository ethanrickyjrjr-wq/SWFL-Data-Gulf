# Spec — the Horizontal Outreach + Content Engine

**07/10/2026. DESIGN DOC (brainstorm output) — not a build authorization.** Operator asked to
"spec the horizontal and determine all the data we need to get and best places." This is that spec.
Companion research (pain points, channel legality, weighting): `03-research-and-signals.md`.

## The thesis

We already run a *licensed-professional branded-content outreach engine* for real-estate agents
(`scripts/outreach/brand-pilot.mts`, `lib/email/outreach`, `lib/prospects/enrich-brand.ts`). Nothing
in it is intrinsically about real estate. Generalize it into a vertical-agnostic engine where the only
per-vertical parts are (1) the licensee list adapter, (2) the content pack, and (3) the paywall.
Everything in the middle — normalize → confirm → brand-resolve → build deliverable → channel/compliance
— is shared.

## Architecture — five components, three of them vertical-pluggable

```
[List-Source Adapter]* → [Prospect Normalizer] → [Brand Resolver] → [Content Pack]* → [Channel + Compliance] → [Paywall]*
        (per vertical)         (shared)             (shared)          (per vertical)         (shared)          (per vertical)
```

**1. List-Source Adapter (per vertical).** Turns a public licensee source into a normalized
`ProspectRecord`. One adapter per vertical, each declaring which contact channels it yields:

```
ProspectRecord {
  vertical, name, business_name, license_number, license_class,
  county, zip, mailing_address,
  email?  phone?,            // channel availability differs by source — see the map
  brand_domain?,             // resolved downstream
  provenance                 // exact source URL / file + fetch date
}
```

**2. Prospect Normalizer (shared).** "LAST, FIRST" → display name, county filter (Lee/Collier), status
filter (active), dedupe, CSV/formula-injection escaping (open check `contacts_csv_injection_policy`).
Output is the outreach engine's existing CSV shape (`lib/email/outreach/targets.ts`).

**3. Brand Resolver (shared, already built).** domain → logo/colors via Brandfetch (100 free req) or
logo.dev; company NAME → domain via their Search APIs (needed because most licensee files carry a
business name, not a domain). Locked brand layer per the compliance finding (F3).

**4. Content Pack (per vertical).** The lake slice + deliverable template that makes content the buyer
(or their audience) actually wants. This is where the moat lives — see the map below.

**5. Channel + Compliance (shared).** Email (cold + warm), direct mail, and — consent-gated — SMS/call.
The legal reality here is load-bearing and lives in `03-research-and-signals.md` (FTSA/TCPA/A2P). The
compliance bakes (CAN-SPAM address + unsubscribe, license #, no unsubstantiated claims) are shared.

**6. Paywall (per vertical).** subscription / lead-gen / one-off list-sale / licensing. Pluggable — the
same built deliverable can be sold four ways. Domain is not fixed: a vertical may run on its own site.

## The data-sourcing map — all data we need + the best place to get it

Verified this session (crawl4ai + code probes). Reachability is the discriminator.

**Real-estate agents (current motion).** Spine: DBPR `RE_rgn7.csv` (weekly, free) — name, brokerage
(Employer's Name), mailing address, license, county. **No email in the file.** Email lane: DBPR Chapter
119 public-records request (operator is actively working this — realtor emails ARE public record) +
brokerage-directory mailto crawls. Brand: Brandfetch/logo.dev off brokerage name. → email (in progress)
+ mail + brand: covered.

**Insurance agents — BEST reachability of any vertical.** FL DFS publishes a FREE public BULK CSV at
`licenseesearch.fldfs.com/BulkDownload` → `AllValidLicensesIndividual.csv` (~320MB) +
`AllValidLicensesBusiness.csv`. Columns include **Email Address, Business Phone**, full business +
mailing address, **Business County**, and License TYCL class code+desc. Filter `Business County ∈
{Lee, Collier}` and `License TYCL Desc` contains "PROP & CAS" (`0220` = 2-20 general lines — writes
homeowners/property/flood). No login, no records request. → email + phone + mail + county + class: all
native, no enrichment needed. Content pack: flood/storm/reserve local-risk one-pager from the lake.

**Home-services / contractors.** Spine: FL DBPR Construction (board 06) + Electrical (08) bulk extracts,
already ingested (`data_lake.fl_dbpr_licenses`). License file = name + county + license only. Applicant
file (`constr_app.csv`) adds mailing address + **phone**, still no email. Segment trade by
`occupation_code` (roofing/HVAC/pool/etc). → phone + mail; no email. Motion is lead-gen (sell them
intent), so email isn't the bottleneck. Content/signal pack: permit-intent + storm clusters (already
built in the lake).

**Mortgage brokers / MLOs — weakest reachability.** NMLS Consumer Access (`nmlsconsumeraccess.org`) is
per-record lookup only — no bulk export, and it exposes name + NMLS ID + employer + company address,
**no email, no phone.** FL OFR routes all mortgage licensing through NMLS (no separate download). → to
build a list: scrape NMLS by FL + Lee/Collier ZIPs, or buy a third-party MLO list, then enrich
email/phone off name+company (website/LinkedIn). Content pack: rates + values + affordability; but note
the LO's real audience is their *referral agents*, not consumers (see research) — content aimed at
agents may convert better.

**Adjacent lists worth adding later (cheap/public):** local Business Tax Receipts (any local business),
Sunbiz new-formations (brand-new businesses need everything), parcel/homeowner records
(LeePA/CollierPA — the *audience* side for lead-gen and sponsored-digest plays).

## What generalizing costs (honest build estimate)

- **New per vertical:** one List-Source Adapter + one Content Pack + a paywall config. Small, bounded.
- **Reused as-is:** normalizer, brand resolver, deliverable/build+send, compliance bakes, domain-verify.
- **Net-new shared infra needed:** (a) email-enrichment lane for the no-email verticals (mortgage;
  contractors if we ever email them) — a directory-crawl/append service; (b) an SMS/call consent +
  A2P-10DLC registration path IF any vertical uses texting (gated by the legal finding); (c) a
  list-sale export mode for the one-off-cash paywall.

## Open questions this spec leaves for the operator

1. Which vertical is adapter #1 after RE? (Insurance is the reachability winner and a clean subscription
   fit; contractors are the strongest moat but a different, lead-gen, motion.)
2. Do we build the email-enrichment lane once (shared) or per vertical?
3. One-off list-sale: are we comfortable selling curated public-record contact lists as a fast-cash
   product (CAN-SPAM/DNC caveats apply)? It needs almost no new build for insurance.

## Register-before-code

Per RULE 3.5, when a vertical is picked: `node scripts/new-build.mjs <slug> "<label>"` before any code,
and the channel/compliance section must be finalized against the legal finding in the research file.
