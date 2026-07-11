# Follow-up: Hendry leaking into /desk region + county totals

**Date found:** 2026-07-11 · **Found by:** Sonnet 5, same session that reviewed/shipped the desk build
**Check:** `desk_hendry_scope_leak` (opened in `checks`, due 07/25)
**Status:** NOT fixed — operator said "it's just the SteadyAPI [view], leave it as a follow up" mid-session. This doc is the handoff for a fresh session to pick up.

## What's wrong

`/desk`'s wire ticker shows "Hendry median ask $199,900" as of 07/09/2026, alongside Lee and
Collier. Operator's expectation: Hendry should be excluded from ranked/display surfaces — this was
the whole point of the `zip-scope-core` effort that shipped earlier on 07/11/2026 (all 12 ZIP-emitting
packs scoped to Lee+Collier's 57-ZIP core via `refinery/lib/core-scope.mts` / `isCoreScope`).

**But the desk's Hendry tile isn't the only thing wrong — it's a symptom.** The root cause sits one
layer down, in `data_lake.listing_active_stats` (`docs/sql/20260630_listing_active_stats_api.sql`):

```sql
FROM active
GROUP BY GROUPING SETS ((county, zip_code), (county), ())
```

There is **no county filter anywhere in this view** — the `active` CTE only filters on
`source_name='api_feed' AND state='active' AND sale_or_rent='sale' AND list_price IS NOT NULL`. The
`()` grouping set (the REGION total — "SWFL median ask", "SWFL active listings" on desk's KPI row) is
a blended median across **every county the ingest touches**, which per
`ingest/pipelines/listing_lifecycle/constants_api.py` (`IN_SCOPE_FIPS`) is Lee + Collier + **Hendry**.
Hendry was deliberately added to the *ingest* boundary on 07/02 (`hendry_seed_orphans` decision,
documented in the workflow header) — that part is intentional and should NOT be reverted. What's
missing is a *display-layer* filter mirroring what `isCoreScope` already does for ZIP-grain packs, but
at the county/region-rollup grain this view produces.

## Why this wasn't caught by zip-scope-core

That effort (SESSION_LOG 2026-07-11, "zip-scope-core COMPLETE") scoped 12 **ZIP-emitting refinery
packs** by filtering their ZIP-grain rows through `isCoreScope(zip)`. `listing_active_stats` is a raw
SQL view with **county-grain and region-grain** grouping sets computed BEFORE any TypeScript ever sees
the rows — `isCoreScope` (a ZIP-string predicate) can't reach into a `GROUP BY (county)` or `GROUP BY
()` aggregate. The desk build (`eaf6d1cc`, same day) is new code that reads this same view directly
(`lib/desk/loaders.ts` `loadActiveStats`) and nobody wired a county-level equivalent before shipping.

## Blast radius — NOT desk-only

`listing_active_stats` is read by 27 files (`rg listing_active_stats`), including at least:
- `refinery/packs/active-listings-swfl.mts` — a full brain pack (check whether its ZIP-grain rows are
  already `isCoreScope`-filtered per zip-scope-core, but its own region/county aggregates may not be)
- `app/insiders/_lib/desk-stats.ts`
- `lib/landing/load-home-map-data.ts` (homepage map)
- `lib/email/market-context.ts` (client-facing deliverable copy)

Any of these that surface a **region-level or county-level** number (not a per-ZIP row) from this view
is a candidate for the same Hendry blend. Audit each before assuming only desk is affected.

## What NOT to do

- Don't just delete the Hendry ticker tile in `lib/desk/loaders.ts` — that hides the symptom (the
  visible tile) while leaving the "SWFL median ask" region total still blended.
- Don't rip Hendry out of the ingest (`IN_SCOPE_FIPS`) — that's a separate, deliberate decision
  (`hendry_seed_orphans`, 07/02) about the LAKE boundary, not the display boundary. `core-scope.mts`'s
  own header says exactly this pattern is correct: "Hendry/Sarasota/Charlotte/Glades are dropped from
  ranked outputs... but stay in the lake."

## Recommended shape of the fix (not yet built)

Extend `refinery/lib/core-scope.mts` — the ONE authority — with a county-name-level export mirroring
`CORE_SCOPE_ZIPS`'s derivation, using the fixture's existing `county_names` field
(`fixtures/swfl-zip-county.json` entries carry `"county_names": ["Hendry"]` etc. alongside
`primary_county` FIPS):

```ts
export const CORE_SCOPE_COUNTY_NAMES: ReadonlySet<string> = new Set(["Lee", "Collier"]);
export function isCoreCounty(name: string | null | undefined): boolean {
  return CORE_SCOPE_COUNTY_NAMES.has((name ?? "").trim());
}
```

Then either (a) filter `listing_active_stats` itself at the SQL layer (`WHERE county IN ('Lee',
'Collier')` on a NEW view/column, or a sibling `listing_active_stats_core` view so nothing that
intentionally wants all 3 counties breaks), or (b) filter every TS consumer's `counties`/`region` read
through `isCoreCounty`. Prefer (a) — aggregate-at-source is the standing convention
(`ingest/CLAUDE.md`) and it fixes all 27 files at once instead of patching each call site
(`feedback_shared-concept-one-authority` — don't re-derive per builder). Requires deciding whether the
REGION total (`()` grouping set) should also drop to Lee+Collier-only, which changes what "SWFL" means
in every consumer — needs an explicit operator decision before touching the view, since it's read by
a live client-facing email (`market-context.ts`).

## To close `desk_hendry_scope_leak`

1. Confirm with operator: should the SQL view itself change (affects 27 files), or should this be
   fixed desk-only for now (`lib/desk/loaders.ts`, filtering `stats.counties`/`stats.region` inline)?
2. Whichever scope is chosen, ship it + update/add tests, re-verify `/desk` no longer shows Hendry.
3. Audit the other files reading `listing_active_stats` for the same region/county-blend pattern.
