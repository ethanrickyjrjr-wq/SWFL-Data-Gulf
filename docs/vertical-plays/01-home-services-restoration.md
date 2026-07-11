# Deep dive #1 — Home services / restoration

**07/10/2026.** Roofers, HVAC, pool builders, remodelers, and storm/water/mold restoration contractors
in Lee + Collier. Chosen first because it has the **strongest data moat we own** and a **proven
willingness to pay** — with one honest caveat about *how* it monetizes.

## The one thing to get right: this is lead-gen, not a newsletter

Our moat here is **intent data**: a new permit pulled in a ZIP, a post-storm damage cluster, a
corridor where residential renovation is spiking. That is worth money the way Angi/HomeAdvisor already
sell it — as a **lead**, priced $50–100 each, that these businesses *already buy*.

It is *not* naturally a subscription-newsletter play. "Permit z-scores in your corridor" is a demand
signal for the contractor, not content a *homeowner* opens every week. So don't force the subscription
model here — the honest motion is **lead-gen / intent signals**, sold to the contractor. (A homeowner
newsletter *could* be a second-order play — "your neighborhood home-value + storm-risk digest,
sponsored by [roofer]" — but that's a harder content problem; park it, don't lead with it.)

The operator was explicit: the paywall isn't fixed and the play needn't live on swfldatagulf.com. A
clean shape here is a **separate lead-gen product/site** — e.g. a "SWFL contractor intent feed" — that
happens to run on the same lake.

## The data moat (all already in the lake)

| Signal | Brain / source | What it gives the contractor |
|--------|----------------|------------------------------|
| Where building/renovation is heating | `permits-swfl` (Lee weekly, Collier monthly), by ZIP + corridor, residential + commercial buckets, z-scored | "These ZIPs/corridors are spiking right now — go there" |
| Post-storm demand | `storm-history-swfl` (NOAA: Ian, Irma, Helene, Milton) | Roofing/restoration surge timing + location |
| Flood / water exposure | `env-swfl` (modeled NFHL) | Water-mitigation / elevation targeting |
| Homeowner affordability / demographics | Census ACS by ZCTA | Which ZIPs can afford the job |
| The contractor universe itself | FL DBPR licenses + applicants (boards 06 + 08) | Who to sell the leads *to* + competitive density |

The permit brain already emits ZIP-grain detail tables and corridor z-scores — the intent signal is
**built**, not hypothetical.

## Reachability — verified, and it's the gap

Checked the DBPR ingest columns directly (`ingest/pipelines/fl_dbpr_licenses/constants.py`):

- **License file** (`CONSTRUCTIONLICENSE_1.csv`, `lic08el.csv`): licensee name, DBA, occupation,
  county code, license number, statuses, dates. **No email. No phone. No address.**
- **Applicant file** (`constr_app.csv`): name + full mailing address + **phone** + ext. Still **no email.**

So contractors are reachable by **phone and direct mail** (applicants) — not email. But the channel is
now legally gated (verified 07/10/2026, see `03-research-and-signals.md` §2):

1. **Cold text is dead** (TCPA consent + A2P 10DLC carrier-blocks cold marketing) and **cold calling
   needs a Florida FDACS telemarketer license** plus DNC/autodialer compliance. So "cold-call/text the
   contractor" is NOT an open lane. The realistic cold channel to contractors is **direct mail** (we
   hold applicant addresses), with phone reserved for **opt-in/inbound** leads or a licensed calling
   program. This is a material constraint on the motion — don't assume phone.
2. The `licenses-swfl` *brain* holds only aggregates (counts, lapse rate). The contactable
   per-contractor list lives in the raw `data_lake.fl_dbpr_licenses` / `fl_dbpr_applicants` tables —
   we'd read those directly, not the brain.

## What's built vs. what's missing (readiness 🟡)

**Built:**
- Permit intent signal (ZIP + corridor z-scores) — `permits-swfl`.
- Storm + flood + ACS layers.
- Contractor universe in the lake (licenses + applicants, with phone/address on applicants).
- The outreach/brand engine (reusable if we ever do the sponsored-homeowner-digest variant).

**Missing (the go-after list):**
- [ ] **A lead product.** Package "new permit / post-storm / heating-corridor" events into a per-lead
      or per-ZIP-subscription feed a contractor buys. This is a new small build, not a new data source.
- [ ] **Contractor buyer list assembly** from the raw DBPR tables (name + phone + trade + county),
      deduped, segmented by trade (roofing vs HVAC vs pool via occupation_code).
- [ ] **Lead quality proof.** Validate that a permit/storm signal actually precedes real jobs — one
      backtest against known outcomes before charging, or we're selling noise.
- [ ] **Homeowner side (optional, for the sponsored-digest variant)** — parcel/homeowner audience from
      LeePA/CollierPA.
- [ ] **Channel** — phone/SMS/direct-mail sequence (not the email engine) for selling to contractors.

## Fastest path to cash

The lowest-build, honest first pilot:

1. Pull the current **heating residential ZIPs/corridors** + any **active post-storm cluster** from
   `permits-swfl` / `storm-history-swfl` (already computed).
2. Assemble a **roofing + restoration contractor list** for those ZIPs from the raw DBPR applicant
   table (name + phone + trade).
3. Sell a **founding-price weekly intent feed** ("the 10 hottest renovation ZIPs in Lee/Collier this
   week + the permits behind them") to 3–5 contractors. Cold channel = **direct mail** (we have
   applicant addresses) or a warm intro; phone only once they opt in (cold phone is gated — §2). No
   email infra, no site needed for a first cash test.
4. If it converts, *then* build the productized feed, sort the channel at scale (FDACS-licensed calling
   vs. inbound funnel vs. mail), and decide whether it wants its own domain.

## Verify before pitching

- Backtest the permit/storm → job-demand link (don't sell an unvalidated signal).
- Confirm the DBPR applicant phone column is populated for SWFL rows at usable density.
- Sanity-check against how Angi/HomeAdvisor price locally, so the founding price is anchored.
