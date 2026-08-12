# Handoff — remaining crawl4ai targets for the seller-insight research thread

**Filed 08/11/2026.** Continuation of `_RESEARCH/email-and-social/2026-08-11-freakonomics-seller-insights-crawl4ai-research.md`
(4-agent sweep, filed same day) and the correction in `_ASSISTANT/SCRATCHPAD.md` (brainstorming
ideas is not a data-verification request). This is still pure ideation — nothing here has been
crawled yet, no build has been chosen. It's a target list so the planning thread doesn't die when
this session ends.

**Read the prior report first.** It already found real, sourced material in four angles
(cost-of-waiting, cash-buyer price bands, listing-freshness psychology, and a broad sweep). What
follows is what's still worth crawling — either because the prior sweep surfaced a gap it couldn't
close, or because a new angle fell out of what it found.

---

## Priority 1 — close the Lee County gap the last sweep confirmed but couldn't fill

The prior report found a real, price-banded, current cash-buyer breakdown for **Naples-Marco
Island** (Collier County) — but Lee County (Fort Myers, Cape Coral) had nothing newer than a 2009
foreclosure-era stat. The last sweep never checked the actual local MLS boards, which are the most
likely place county-level stats like this get published first, before a national portal picks them
up.

1. **RASM — Royal Palm Coast REALTOR® Association** (the Lee County MLS board). Crawl their public
   market-stats / research pages for monthly or quarterly reports — cash-buyer share, DOM,
   price-band breakdowns. This is the single most likely source to close the Lee County gap.
2. **NABOR — Naples Area Board of REALTORS®**. The prior Naples number came from NAR via a news
   writeup (Gulfshore Business), not NABOR's own report — crawl NABOR directly for the primary
   source, which may carry more detail (weekly/monthly cadence, more price bands, YoY trend) than
   the news article captured.
3. **Florida Realtors county-level monthly reports** (floridarealtors.org) — the prior sweep hit
   Florida Realtors only as a corroborating link for the Naples stat. Check whether their
   Lee-County-specific monthly release carries its own cash-buyer or price-band figures.

## Priority 2 — the carrying-cost math is missing its insurance line

The prior report's carrying-cost estimate has two real, local legs (live mortgage rate + real
property tax) and leans on a **national** survey (Clever Real Estate) for insurance/maintenance/HOA.
SWFL insurance costs are not a national-average situation — post-Ian Lee/Collier premiums are a
known outlier, and this platform's own ceiling notes already flag that FEMA NFIP penetration is
currently a static 0.3 guess in code, not a real pulled number.

4. **Citizens Property Insurance Corporation** (FL's insurer of last resort) — public average
   premium data by county; Lee/Collier likely break out separately given post-Ian volume.
5. **Insurance Information Institute (III)** — Florida homeowners insurance average cost
   reporting, ideally with a hurricane-exposure or coastal-county cut.
6. **FEMA NFIP** — actual average flood-insurance premium by county/flood zone, to replace the
   static 0.3 guess flagged as a ceiling in `docs/standards/data-roots.md`. This is a data-roots
   ceiling already recorded, not a new finding — worth closing while in the neighborhood.

## Priority 3 — the price-band search-filter claim needs a stronger source than one opinion column

The prior sweep's best source for "listings just above a round-number bracket get filtered out" was
a single Inman practitioner column — directionally credible, not a controlled study. The property-tax
round-number study it found (Lomonosov, *Real Estate Economics* 2025) is real and rigorous but proves
a *different* mechanism (tax bills, not listing price).

7. Zillow/Realtor.com **developer or technical documentation** on how their own search/filter UIs
   actually bucket by price — a primary technical source beats a columnist's claim about the
   platforms' own behavior.
8. A narrower academic search specifically for **listing-price round-number bracket effects**
   (distinct from the tax-bill study already found) — real estate economics journals, repeat-sales
   or hedonic-pricing literature.

## Priority 4 — competitive check: is anyone already sending this kind of reasoning?

Before this becomes a build, it's worth knowing whether Compass, Redfin Premier, HomeLight, or
Opendoor's seller tools already send "why" reasoning like cost-of-waiting or price-band coaching in
their seller-facing emails or dashboards. If they do, that's a real benchmark to match or beat, not
a blind spot. If they don't, that's a real differentiation claim, not an assumed one.

9. Crawl marketing/blog pages and any publicly-shown sample emails from those four companies for
   seller-facing "why" reasoning — screenshots or copy examples, with URL and date.

## Priority 5 — sanity-check range for the buildable SWFL stat

The prior report's strongest "buildable today" idea is computing our own Lee/Collier
DOM-vs-price-cut correlation (real data, zero new ingest). Before that gets built, it's worth
knowing what a *plausible* result looks like, so a bug in the query doesn't get mistaken for a real
finding.

10. Search for any other MSA that has published its own version of this stat (beyond the Indiana
    MLS study already found) — gives a range to sanity-check our own number against once it's
    computed, not a number to cite in the final product.

---

## What this handoff is not

Still ideation. Nothing above has been crawled. No approach has been chosen, no email picked, no
code touched. When the operator wants to act on any of this, the next step is picking a target from
this list (or from the prior report's Bucket A/B items) and running it through
`superpowers:brainstorming` properly — same as any other new build on this platform.
