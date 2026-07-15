# Source discovery + community-data wiring — session handoff

**Date:** 2026-07-15
**Read this first, before re-deriving any of the below from scratch.** Everything here was
verified against live code, a live deployed page, or `SESSION_LOG.md` — not memory, not a code
read alone. Where a claim came from a code read only and turned out wrong, that's written down too,
so the next session doesn't have to relearn the same lesson.

## 1. `/ops/census` is not broken. It's excellent. Verify by looking, not by reading its source.

Live at `https://swfldatagulf-ops.vercel.app/census`, screenshotted and full-text-read 07/15/2026.
As of that check: **76 pipelines tracked (73 active, 3 parked), 71/76 confirmed-total researched,
69/76 source-ceiling researched, 0/76 vendor-benchmark applicable.** Every pipeline has a PULLED row
and an AVAILABLE row with dated, cited, often crawl4ai-verified detail down to the column level.
Examples worth knowing without re-finding them:

- **Lee Permits** — we scrape a fragile Accela SPA. Lee County's own ArcGIS org has structured
  layers instead: 9,386 unincorporated-Lee permits, 719 commercial permits, 2,192 Cape Coral
  residential permits, a 93,976-row code-enforcement layer, two manufactured-home layers (43,000+
  lots — a direct fix for the parked `land_manufactured_swfl` gap), a 550,454-row parcel
  land-use/valuation table, a subdivisions/plats layer, and a `ZoningCases` layer (8,017 rows).
  None ingested.
- **FRED G17** — we pull only the national industrial-production series. FRED has real Lee/Collier
  county-level series with confirmed IDs (house price index, county GDP, per-capita income, median
  household income, poverty rate, building permits) — none pulled.
- **Redfin listings AVAILABLE** — publishes the same tracker weekly, we pull monthly; also separate
  metro-only migration-flow and investor-purchase products, unpulled.
- The page **already flags cross-pipeline duplication**: `Collier Parcels` and `Parcel Subdivision`
  both cite the open check `collier_parcels_parcel_subdivision_redundant_scrape` for hitting the
  identical FDOR ArcGIS layer for overlapping Collier parcels.

**Why this matters for how you work:** if you're about to research what a source offers before
touching an ingest pipeline, check this page's row for that pipeline FIRST. The research is very
likely already done, dated, and cited. Re-researching it burns real time and money and is close to
guaranteed to reproduce what's already there.

**A verification mistake made getting here, worth knowing about so it isn't repeated:** an earlier
pass in this session read `census.ts`'s source, saw it parses the right data, and declared the page
"working" without ever loading it. A raw `curl` fetch then misread a Next.js internal
error-boundary payload (framework boilerplate present on every route) as a live 404 and briefly,
wrongly, reported the page as broken. Only an actual screenshot settled it. **Code that looks
correct is not verification of a deployed page's behavior — load the page.**

## 2. The real fix for "we keep rediscovering what we already have": push, not a new file

Full design: `docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md` (has its own
correction log — an earlier draft proposed generating a parallel per-pipeline file duplicating
`/ops/census`; struck, do not resurrect it).

Short version of what's actually being built:

- **Ingest:** wire `inject-focus.mjs` to print a pipeline's existing PULLED/AVAILABLE rows (from
  `cadence_registry.yaml`'s `source_scope`, the same data `/ops/census` reads) inline the moment a
  session touches that pipeline, or before new source research starts. No new file.
- **Deliverable recipes (pilot lane) and brain packs:** a small `.ledger.md` file per unit with two
  sections — `Enforced` (a claim mapped to the real test that catches it if broken) and
  `Unenforced` (the honest residual still running on hope). A pre-push gate blocks if an Enforced
  claim's named test doesn't exist or fails — proof the claim is real, not just documentation that
  it should be true.
- Deliverables triage is already done: 9 of the deliverable playbook's 12 per-recipe landmines
  already have a real passing test (see the spec's §3 table) — the pilot is mostly cross-referencing
  what exists, not writing new tests from scratch.

## 3. `communityStats` — built today, wired into nothing, and there's already a same-day plan to fix it

**The precise, verified state (do not re-derive this a third time):**

- `data_lake.parcel_subdivision` — 604,362 rows, real, fresh (07/14/2026 ingest).
- `lib/listings/community-lookup.ts` — a real resolver built and unit-tested TODAY
  (`matchSubdivision`, `resolveCommunityForAddress`, `resolveCommunityStats`,
  `resolveCommunityForListing`; 9/9 tests). This is what closed the check
  `parcel_subdivision_orphaned_no_readers`.
- **Confirmed by grep across the whole repo: nothing outside `community-lookup.ts` and its own test
  file imports any of those functions.** The check's own name — "orphaned, no readers" — is still
  literally true in production. Closing the check was legitimate (a real reader now exists and is
  tested) but does not mean the data reaches any deliverable, chart, or narrative.
- This is a **different** "community" concept from `ListingFacts.community` /
  `communitySourceLine()` (`lib/listings/listing-detail.ts`), which is vendor-scrape data (golf,
  gate, pool mentions off a specific listing's detail page) and IS already wired into all six
  shared-narrator recipes (new-listing, coming-soon, just-sold, open-house, price-reduced,
  under-contract) via `lib/deliverable/recipes/shared.ts:183` — only `market-comps` excludes it, by
  design. **Do not conflate the two** — an earlier point in this session did, and told the operator
  "only under-contract gets community facts," which is wrong for the vendor-scrape kind and right
  only for the new tax-roll kind.

**Already fully specced and ready to execute, do not re-plan:**
`docs/superpowers/specs/2026-07-15-community-stats-deliverable-wiring-design.md` +
`docs/superpowers/plans/2026-07-15-community-stats-deliverable-wiring.md` (1,168-line task-by-task
plan). It adds `communityStats` as a new, separate `ListingFacts` field (never merged with
`community`), wires it through `resolveSubject()`/the shared narrator, and — caught by an advisor
pass already baked into the spec — handles a real join-key bug: the subdivision-name alias
reconciler and the new resolver must agree on canonical-vs-raw naming or matches silently miss.
**Verified 07/15/2026: none of it is built yet** (`communityStats` / `neighborhoodStatsSourceLine`
appear nowhere in `lib/`).

**One thing that plan flags for verification and that this session did NOT resolve, on purpose,
rather than guess a third time:** the open check `community_facts_remaining_recipes` currently
reads "only under-contract consumes them," which does not match a direct grep of `shared.ts`
showing all six non-`market-comps` recipes already wired to `facts.community`. Resolve this with a
real test when implementing the plan above — don't take either the check's text or this handoff's
grep as final without one.

## 4. What to actually do next (operator decides order/priority — not decided here)

- Implement the community-stats-deliverable-wiring plan (§3) — it's fully specced, sitting ready.
- Wire `inject-focus` to push `/ops/census` data inline for ingest pipelines (§2) — smaller than it
  sounds, no new file format, points at data that already exists.
- Build the deliverables Enforced/Unenforced ledger pilot (§2) once the above two are through, or in
  parallel if capacity allows — they don't block each other.
- Someone should re-verify (with a test, not a read) whether `community_facts_remaining_recipes`'s
  text is stale, and correct or close it with real evidence.

## 5. On trusting this document

Every claim above has a verification method named next to it (screenshot, grep, test count, commit
hash) — if any of it is later found wrong, the fix is to correct THIS document in place with what
was actually true and why the mistake happened, the same way
`docs/standards/deliverable-playbook.md` Part 8.5 and this session's own spec correction log do it —
not to quietly start a new document that duplicates it.
