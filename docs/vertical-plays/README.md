# Vertical Plays — the board

**Created 07/10/2026. Living document — grow it, don't finish it.**

This folder is the answer to a standing question: *beyond real-estate agents, who else can we
sell scheduled content / lead signals to, using the SWFL data lake plus data that's cheap to get?*

Two rules for this folder, set by the operator 07/10/2026:

1. **The paywall is not fixed.** Each vertical gets whatever monetization fits it — lead-gen,
   subscription, one-off cash, or data licensing. We don't force one model across all of them.
2. **The domain is not fixed.** A play does not have to live on swfldatagulf.com. If a vertical wants
   its own site, brand, or lane, we copy the capability over and change the paywall/details. The lake
   and the build engine are the asset; the storefront is disposable.

When we ship a new feature or land new data, come back here and re-score — a play that was "blocked on
reach" may have just become reachable.

---

## What we actually hold (the moat, plainly)

The lake is a **local-economy sensor grid for Lee + Collier** — far more than houses:

- **Permits** (residential + commercial), by ZIP and corridor, Lee weekly + Collier monthly — a literal
  *demand signal* for where building/renovation is heating.
- **Contractor list** — FL DBPR Construction (board 06) + Electrical (08) licenses & applicants.
  ⚠️ carries name + county + license + (applicants) mailing address + phone. **No email.**
- **Storm history** — NOAA events (Ian, Irma, Helene, Milton) — post-storm demand framing.
- **Flood / environmental exposure** — modeled NFHL risk.
- **Residential RE** — values, listings, rentals, price distribution, market heat, seller stress,
  investor ZIPs, momentum, communities, **condo structural reserves (SIRS)**.
- **Commercial RE**, traffic / corridor flow / logistics.
- **Tourism (TDT) + RSW airport** passenger volume.
- **Labor demand + wages (BLS OEWS)**, business licenses, crime/safety (FDLE), sector credit, macro
  (US/FL/SWFL), econ dev, news / city pulse, Census ACS demographics.

**Cheap-to-add adjacent data** (public / low cost, not yet ingested): local Business Tax Receipts,
FL DFS insurance-agent licenses, NMLS mortgage-originator registry, Sunbiz new business formations,
parcel/homeowner records (LeePA/CollierPA), solar permits, boat registrations.

---

## The build asset we already own

A **licensed-professional branded-content outreach engine** (`scripts/outreach/brand-pilot.mts`,
`lib/email/outreach`, `lib/prospects/enrich-brand.ts`, `fixtures/real-estate-brands/`):

> scrape the state licensee list → confirm the business → match it to a brand (logo/colors via
> Brandfetch) → inject that brand into a deliverable built from lake data → (send is the paywall).

It is written *for* RE brokerages but it is not *about* real estate. Swap the DBPR list for DFS
(insurance) or NMLS (mortgage) and the same machine runs. **That is the single most leveraged thing on
this board** — see `00-current-motion-monetization.md`.

---

## Scoring legend

Each play is scored on the five axes that actually decide whether someone pays:

- **Reach** — can we build a contactable list, and on what channel? (email / phone / mail / in-app)
- **Content fit** — does our data make something the *buyer or their audience* wants to open?
- **WTP** — is willingness-to-pay proven in that industry?
- **Motion** — the natural paywall: `lead-gen` / `subscription` / `one-off` / `licensing`.
- **Readiness** — distance to a paid pilot: what's already built vs. what's missing.

Scores: **High / Med / Low**. Readiness: 🟢 close · 🟡 gap to close · 🔴 far.

---

## The board

### Tier A — strongest fit, go here first

Reachability + channel legality verified 07/10/2026 (see `03-research-and-signals.md`). Ordered by
closeness to cash.

| # | Play | Reach | Content fit | WTP | Motion | Ready | Deep dive |
|---|------|-------|-------------|-----|--------|-------|-----------|
| 1 | **Insurance agents** (homeowners/flood/condo) | **High — free DFS bulk CSV w/ email+phone+county+class** | High (flood+storm+SIRS+values = client-open content) | High (FL crisis, retention) | `subscription` + `list-sale` | 🟢 | _todo (top pick)_ |
| 2 | **Home services / restoration** (roof, HVAC, pool, remodel, water/mold) | Med (phone/mail, no email; cold phone gated) | High *as leads* / Low *as newsletter* | High (buy leads $50–100 ea) | `lead-gen` (mail/opt-in) | 🟡 | [01](01-home-services-restoration.md) |
| 3 | **Real-estate agents** (current motion) | Med (email via Ch.119 in progress) | High | High | flip to `subscription` per-seat/brokerage | 🟢 (engine live) | [00](00-current-motion-monetization.md) |
| 4 | **Mortgage brokers / MLOs** | Low (NMLS no bulk/email — scrape+enrich) | High (rates+values; audience = referral agents) | High (same as RE) | `subscription` / `lead-gen` | 🟡 | _todo_ |
| 5 | **Property managers / HOA (condo)** | Low (no clean list) | High (SIRS reserve mandate = live crisis) | Med-High (mandate-driven) | `subscription` / `licensing` | 🟡 | _todo_ |

### Tier B — real, weaker or narrower

| # | Play | Reach | Content fit | WTP | Motion | Ready |
|---|------|-------|-------------|-----|--------|-------|
| 5 | **CRE brokers / developers** | Med | Med (commercial permits+logistics+traffic+econ dev) | Med (few, high-value) | `subscription`/`licensing` | 🟡 |
| 6 | **Local banks / credit unions** | Med | Med (credit+business formation+macro) | Med | `licensing` (B2B) | 🔴 |
| 7 | **Financial advisors / wealth mgrs** | Med | Med (macro+local econ for retiree migration) | Med | `subscription` | 🟡 |
| 8 | **Tourism / hospitality / vacation-rental mgrs** | Med | Med (TDT+airport+traffic demand signals) | Med | `subscription`/`licensing` | 🟡 |
| 9 | **Title / escrow companies** | Med | Med (listings+values+market) | Med | `subscription` | 🟡 |
| 10 | **Solar / energy installers** | Med (permits+DBPR) | High *as leads* (solar permits+storm+ACS income) | High (buy leads) | `lead-gen` | 🟡 |

### Tier C — data-thin, opportunistic

| # | Play | Note |
|---|------|------|
| 11 | Local consumer businesses (auto, med-spa, retail) | ACS demographics + local econ only; generic content, big volume, weak moat |
| 12 | Chambers / EDCs / trade associations | econ dev + labor + business formation; sell the *data feed* B2B2C, not email |

---

## Cross-cutting gaps to close (the "what we need to go after" list)

These unblock multiple plays at once. Track as `checks` when we commit to one.

- [x] **Verify DFS insurance-agent list** — DONE: free public bulk CSV carries email+phone+county+class.
- [x] **Verify NMLS registry** — DONE: per-record only, no bulk, no email/phone (scrape+enrich needed).
- [x] **Channel legality** — DONE: email + direct mail are the only clean COLD channels; cold SMS is
      dead, cold calling needs an FL FDACS telemarketer license. See `03` §2.
- [ ] **Email acquisition (mortgage + contractors + RE-until-Ch.119).** Insurance is solved (native).
      RE is in progress (operator's Ch.119). Mortgage + contractors still need an enrichment lane OR a
      channel that isn't email (direct mail; opt-in funnel). No longer a universal blocker.
- [ ] **FDACS telemarketer license decision** — required before ANY cold-calling program (blocks the
      contractor-by-phone idea). Confirm exemption posture with counsel.
- [ ] **Homeowner-audience list** — parcel/homeowner side (LeePA/CollierPA) as an audience, for lead-gen
      and sponsored-digest plays.
- [ ] **Content a non-RE audience opens weekly** — each subscription play needs a proven "reader opens
      this" recipe, not a data dump.

---

## Files in this folder

- `README.md` — this board.
- `00-current-motion-monetization.md` — better ways to monetize the RE engine we already run, now.
- `01-home-services-restoration.md` — deep dive: home services (lead-gen; channel now gated).
- `02-horizontal-engine-spec.md` — the vertical-agnostic engine design + full data-sourcing map.
- `03-research-and-signals.md` — live research (reachability, channel legality, pain points, net-new
  ideas) **weighted by closeness to cash**. The ranking there is the "what do we do next" answer.
- `04-data-acquisition-engine.md` — the hard-data acquisition landscape + a system design for
  systematizing source discovery and records requests.
- `05-non-re-monetization-sweep-2026-07-18.md` — 36-agent sweep (Twitter/Instagram/Amazon +
  crawl4ai) across 14 domains outside the already-covered RE/insurance/mortgage/contractor ground,
  ranked into 10 fully-planned, adversarially-verified product candidates. Top pick: a SIRS/milestone
  condo-compliance gap finder off data already in the lake.
- _add one `NN-<vertical>.md` per play as we go deep. Insurance is the next deep dive._
