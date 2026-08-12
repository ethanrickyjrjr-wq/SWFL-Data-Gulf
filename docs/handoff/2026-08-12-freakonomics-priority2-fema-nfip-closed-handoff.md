# Handoff — FEMA NFIP penetration rate closed; where the seller-insight thread stands

**Filed 08/12/2026.** Continuation of `_RESEARCH/email-and-social/2026-08-11-freakonomics-research-
targets-crawl4ai-results.md` (the 5-priority crawl4ai results) and
`docs/handoff/2026-08-11-crawl4ai-freakonomics-research-targets-handoff.md` (the target list that
research closed out). One item from that research pass got acted on this session — Priority 2's
FEMA finding. Everything else in the thread is unchanged: still research, no email picked, no other
code touched.

---

## Closed this session — FEMA NFIP penetration rate is now real, not a guess

**What it was:** `refinery/sources/fema-nfip-source.mts` hardcoded
`INSURED_PENETRATION_FACTOR = 0.3` — a flat NSI-proxy guess used as the denominator for every SWFL
ZIP's per-insured-property flood-loss (AAL) math, regardless of county. Flagged as a known ceiling in
`docs/standards/data-roots.md` and `ingest/cadence_registry.yaml` since 07/07/2026.

**What changed:** the crawl4ai research (Priority 2) found FEMA's real "NFIP Residential Penetration
Rates" dataset and pulled live values for Lee/Collier. Before wiring, I re-queried the same live
OpenFEMA API myself (`https://www.fema.gov/api/open/v1/NfipResidentialPenetrationRates`, filtered by
`fipsCode`) to get exact figures for all three SWFL core counties, not just the two the research
covered:

- **Lee (12071): 24.25%** — 84,120 contracts-in-force / 346,951 total residential structures
- **Collier (12021): 29.55%** — 51,467 / 174,174
- **Hendry (12051): 4.4%** — 657 / 14,936 (not in the original research; Hendry is real coverage per
  this platform's scope, so it needed a real number too, not a silent gap)

All as of 2026-08-03 (FEMA's `asOfDate`, dataset refreshes quarterly). The flat 0.30 guess overstated
Lee's real rate by ~6 points and was off by more than 5x for Hendry — Hendry's real NFIP penetration
is far lower than Lee/Collier's, which the single-number guess could never have shown.

**Code:** `INSURED_PENETRATION_FACTOR` (single number) → `INSURED_PENETRATION_FACTOR_BY_COUNTY`
(per-FIPS map) + `penetrationFactorFor(countyCode)` (throws on an unmapped county rather than
silently defaulting — every caller already filters to the 3 SWFL core counties first, so a miss here
means a real bug upstream, not a gap to paper over). Both ZIP-aggregation paths
(`aggregateZipRollupTop6` fixture path, `buildZipFragmentsFromView` live path) now look up the real
rate by the ZIP's county instead of using one number for the whole region. `insured_denominator_basis`
and the pack-level caveats/citations in `refinery/packs/env-swfl.mts` were updated to name the real
rate and source instead of "NSI proxy (v1)".

**This is a hardcoded snapshot, not a live ingest pipeline** — same pattern as the existing
`ZIP_POPULATION_2020` map in the same file. Re-pull the three rates from the API above before the
numbers go stale; FEMA's dataset page and the API's `asOfDate` field say quarterly. FEMA's
Policies-in-Force dataset and the Community Status Book remain unpulled — real, cited, still a gap.

**Docs updated to match:** `docs/standards/data-roots.md`, `ingest/cadence_registry.yaml`
(`fema.source_ceiling`), `docs/semantic-ledger.md` (`env_zip_flood_aal_usd_per_insured_property`
definition), `_ASSISTANT/2026-07-08-vendor-extraction-ceiling-audit.md` (item 6 marked closed).

**Tests:** `refinery/sources/fema-nfip-source.test.mts` (30 pass, incl. 2 new — a sanity-lock on the
3 real rates and a throw-on-unmapped-county test) + `refinery/packs/env-swfl.test.mts` (38 pass).
`bunx tsc -p refinery/tsconfig.json --noEmit` shows no new errors from this change (only the
repo-wide pre-existing `bun:test` module-resolution noise, unrelated).

---

## Still open — nothing else in the thread was touched

1. **Lee County cash-buyer gap — genuinely exhausted, not a search failure.** RASM's own report
   template (Domus Analytics) structurally does not carry a cash-buyer cut. Florida Realtors has the
   number on the same template but it's membership-gated. Real options: email
   `marketing@rpcra.org` directly, get a Florida Realtors membership login, or ship Collier's real
   61% (NABOR, May 2026, primary) as Collier-only and keep stating Lee as a named gap.
2. **Price-band search-filter mechanism** — Zillow's own help docs say their filter is free-text
   min/max, not fixed brackets, which undercuts the original "hard $50k bracket" premise. 5 real
   peer-reviewed papers back the broader charm-pricing/left-digit-bias phenomenon, but none prove a
   hard-bracket exclusion mechanism specifically.
3. **Competitor scan** — confirmed real white space: no one (Compass/Redfin/HomeLight/Opendoor)
   combines DOM-stigma psychology + carrying-cost math + price-cut timing into one seller-facing
   calculator.
4. **Comparable-metro DOM-vs-cut range** — Bright MLS (via a secondary outlet, unconfirmed at
   primary) is the closest analog to our own buildable Lee/Collier stat. Explicit: never cite any of
   this priority's numbers in anything shipped — sanity-check range only.

## What this handoff is not

Still research plus one closed data-ceiling item — not a build spec. No email picked, no approach
chosen for the seller-insight product itself. Next step on any of items 1-4 above is the operator's
call, run through `superpowers:brainstorming` before it becomes a build, same as the rest of this
thread.
