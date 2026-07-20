# ZIP report Dataset+FAQPage JSON-LD

**Date:** 2026-07-20
**Check:** `zip_report_jsonld_live_verify`
**Approved:** operator, 07/19/2026 (design presented in-session; shape choice Dataset+FAQPage confirmed via explicit pick)

## Problem

`/r/zip-report/[zip]` — the most actively worked report surface — ships zero structured data,
while every other public report surface already emits source-cited JSON-LD from `lib/jsonld.ts`
(brain reports: Dataset+FAQPage · CRE corridors: Place+FAQPage · communities:
GatedResidenceCommunity+FAQPage · desk: Dataset). The product thesis is answer engines citing
swfldatagulf.com; the busiest report page is invisible to structured-data parsers.

## Research (live crawl, 07/19/2026 — Google Search Central docs via crawl4ai)

- Google **fully deprecated FAQ rich results on May 7, 2026** — FAQPage markup no longer produces
  any Google Search feature for any site. Source: https://developers.google.com/search/docs/appearance/structured-data/faqpage
  (changelog note + May 2026 deprecation entry).
- **Dataset markup feeds Google Dataset Search only**, not regular Google Search.
- The original AEO rationale (`docs/superpowers/plans/_FINISHED/2026-06-03-aeo-jsonld.md`) was never
  Google SERP features — it targets LLM crawlers (Claude, Perplexity, ChatGPT) parsing structured
  Q&A with citations. That rationale is unchanged. Operator chose Dataset+FAQPage over Dataset-only
  with this finding on the table.

## Goal

The ZIP report page emits the same proven Dataset+FAQPage markup as the brain report pages,
pointed at the page's own ranked signals with their existing per-signal sources and freshness —
zero new data fetches, zero invented values.

## What we're building

### 1. `zipReportJsonLd()` in `lib/jsonld.ts` (extend existing artifact — RULE C2)

Pure helper beside the four existing ones. Decoupled input interface (mirrors the
`communityJsonLd` pattern; keeps `lib/jsonld.ts` import-light and bun-testable — the page itself
imports CSS and can't be bun-tested, same reasoning that split out `metadata.ts`):

```ts
export interface ZipReportJsonLdSignal {
  label: string;              // "Median sale price"
  display: string;            // "$485K" — preformatted, restated VERBATIM (never recomputed)
  sub?: string;               // "90-day median sale price"
  source?: { label: string; url: string };
}
export interface ZipReportJsonLdInput {
  zip: string;
  place: string | null;       // primaryPlace from assembleZipReport
  county: string | null;      // res.county_names[0]
  signals: ZipReportJsonLdSignal[];  // ranked hero+grid signals, served order
  asOf: string | null;        // MM/DD/YYYY — page already computes via asOfFromToken
  asOfIso: string | null;     // YYYY-MM-DD for Dataset.dateModified (machine field)
}
```

**Dataset block:** name + description aligned with `zipReportMetadata()` wording
(`"<Place> <zip> Market Report — SWFL Data Gulf"` / home-values-flood-permits description);
`url: ${SITE}/r/zip-report/${zip}`; reuse module constants for publisher/creator/license/
`isAccessibleForFree`; `dateModified: asOfIso` when present. `spatialCoverage` is ZIP-scoped —
a `Place` (place name + ZIP) `containedInPlace` its actual county `AdministrativeArea`
`containedInPlace` the Southwest Florida chain (mirrors `corridorJsonLd`), sharper than the
county-pair default. `variableMeasured`: one `PropertyValue` per signal —
`{ name: label, value: display, url: source.url when present }`.

**FAQPage block:** one Question per signal that **carries a real `source`** (uncited signals never
become FAQ answers — no-invention lint philosophy applied to markup). Text:
`"What is <label> in <place ?? ZIP zip> (<zip>)?"` → `"<display><sub ? ' — ' + sub>. Source:
<source.label> (<source.url>). As of <asOf>."` Capped at 8 entries (matches `brainJsonLd`).

**Guards:** zero eligible FAQ entries → return Dataset only (a zero-question FAQPage is invalid
schema.org — same guard as corridor/community). Helper is pure, never throws, no fetches.

### 2. Injection in `app/r/zip-report/[zip]/page.tsx`

One `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />`
next to `ReportFooter`, identical to `app/r/[slug]/page.tsx:281`. Built from `ranked`, `primaryPlace`,
`res.county_names[0]`, and `asOf` — all already loaded by the page. Out-of-scope ZIPs return before
this point (existing guard), so no markup ever ships for a page we don't serve.

### 3. Deliberate deviation: no raw freshness token in markup

Existing helpers embed the raw token in FAQ answer text. Locked rule: raw token is INTERNAL,
as-of is MM/DD/YYYY. The new helper never sees the token — it takes the formatted `asOf` string
(prose) and `asOfIso` (machine `dateModified`). The existing surfaces' token leak is a separate
defect — filed as its own `checks` entry, NOT fixed in this build (no scope creep).

## Data freshness precondition (operator decree, this session)

Before live-verify: the served `active-listings-swfl` brain must include the latest daily sweep.
Found during this session: serve refined 02:29 UTC 07/19 vs sweep landed ~04:30 UTC —
one sweep behind. Targeted rebuild dispatched (leaf, then `master --no-force` fold);
three initial dispatch attempts hit a GitHub Actions minor incident (503s ~00:50 UTC 07/20) —
retry until accepted, then commit the tripwire acceptance entry.

## Out of scope (on purpose)

- `/z/[zip]` and `/r/should-i-sell/[zip]` — same pattern, separate pass, separate registration.
- `speakable` — deferred until consumer support is researched live (Google's implementation was
  news-content beta; unverified value).
- `RealEstateListing` — no public per-listing detail page exists (verified: no such route).
- Fixing the raw-token leak in `brainJsonLd`/`corridorJsonLd` — separate `checks` entry.

## Testing

New `bun:test` cases in `lib/jsonld.test.ts`, mirroring existing style:

1. Dataset shape: name/description/url/spatialCoverage chain with place+county present.
2. Place-less ZIP fallback (`"ZIP <zip> Market Report — …"`, county-only spatial chain).
3. `variableMeasured` restates `display` verbatim; source URL attached only when present.
4. FAQ: cap at 8; signals without `source` excluded; answer text carries `Source:` + `As of`.
5. Zero eligible FAQ entries → Dataset-only array (no FAQPage).
6. Regression: serialized output contains no raw `SWFL-…-YYYYMMDD` token pattern.

Build verify: `bunx next build` (never `npx tsc`). Live verify (closes the check): fetch the
deployed page, confirm the `application/ld+json` script parses and its figures match the served
page values byte-for-byte.
