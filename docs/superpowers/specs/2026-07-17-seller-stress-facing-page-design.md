> **⚠️ SUPERSEDED 07/17/2026 — DO NOT BUILD FROM THIS DOC.** Consolidated into
> `docs/superpowers/specs/2026-07-17-should-i-sell-design.md` (route `/r/should-i-sell`), which merges
> this seller-facing stress read with the market snapshot + sell-now-vs-wait spread into one
> seller-decision product. This draft was never committed. Kept on disk for reference only.

# Seller-facing seller-stress read + report page

**Date:** 2026-07-17
**Status:** Approved design (pre-plan). Build #1 of a 3-surface program.
**Check:** `seller_stress_facing_page_live_verify` (live-verify) · program idea: `seller_stress_signals_face_the_seller`

## Problem

An entire propensity-to-list / seller-stress scoring industry is commercially proven (Homebot at
8M+ homeowners, CoreLogic Realist Sell Score, Datazapp) — and every instance deliberately withholds
the score from the seller it describes. The number lives on the agent/loan-officer dashboard; the
homeowner never sees their own read or why they got it. Nobody works *for* the seller.

We already hold the same *kind* of asset, and it is honest: `seller-stress-swfl` is a live,
deterministic 0–100 composite per ZIP (delistings rate leading, price-drop breadth, cancellation
rate, drop depth, relisting), each figure cited to the Redfin Data Center, scored against a
2019–2021 pre-shock baseline. Latest served read: SWFL median 60.9/100 ("elevated"), 52 of 55 core
ZIPs scored, as of 07/12/2026.

But the score only faces the seller in **analyst voice** and at **region grain**. On
`/r/housing-swfl` it renders as "SWFL seller stress is elevated at 61/100 (bearish threshold: ≥65)"
— region-wide, not the seller's own area, and framed for someone who already speaks the vocabulary.
The data is surfaced. The *facing* is not.

Grain reality: ours is ZIP-grain, not the per-home propensity Homebot ships (150M rows, per-address).
Matching per-home propensity needs data we do not hold. The whitespace is **not** "match their
model" — it is "face the score to the seller," which their whole industry refuses to do. That we can
do today with zero new data.

## Goal

Turn the live seller-stress score into something a **home seller** can read about **their own area**,
framed truth-first and made actionable — and prove it on a public, cited, crawler-honest page.

This spec covers **build #1 only**: the shared read authority + the seller-facing page. The
report-reader wiring and the recurring digest are the next two builds, each its own spec. Sequencing
was chosen credibility-first (page → reader → digest) to fit the operator's stated posture that
credibility work precedes new send motions.

**Honest scope caveat:** this ships a credibility *artifact*, not a credibility *measurement*. The
trust-low-point posture is really about a tracked click→outcome loop ("no measurement loop means
trust can only be zero"), and this page, as specced, has no way to know if anyone reads it or acts.
Whether a lightweight view/engagement signal belongs in build #1 or is deferred to a cross-surface
measurement pass is an open decision for the operator (see Open questions) — it is **not** silently
covered here.

**Framing decision (locked):** truth-first, made actionable. We do **not** sand off "elevated
pressure" — the honesty *is* the differentiator, because everyone else hides it. Lead with the real
read, then say what it means for pricing and timing. This is market intelligence, distinct from the
sell-side-favorable-framing policy (which governs how a *specific listing's* story is told).

## What we're building

### Architecture: one authority → thin renderer

One shared read module is the single authority for "what does seller-stress mean for a seller in
this area." The page (this build), the report reader (next build), and the digest (build after)
all render *that same read*. No surface re-derives the framing or re-maps the score. This is the
"one authority per shared concept" rule applied up front, before there are three copies to
reconcile.

```
lib/seller-stress/read.ts   ← THE authority (new)
  getSellerStressRead(zip) → SellerStressRead | null
        │  reads served bytes: brains/seller-stress-swfl.md
        │  (parseBrainMarkdown → seller_stress_by_zip detail table)
        │  NOT a recompute of the score
        ▼
app/r/seller-stress/[zip]/page.tsx   ← renderer #1 (new, this build)
```

### The authority — `lib/seller-stress/read.ts`

`getSellerStressRead(zip: string): Promise<SellerStressRead | null>`

- **Source of truth = served bytes.** Reads `brains/seller-stress-swfl.md` through
  `parseBrainMarkdown` (`refinery/render/speaker.mts`), the same path `/r/housing-swfl` already uses.
  It reads the *published* brain output, never recomputes the composite. Verifying served bytes, not
  a diff, is the honesty rule for "is this live."
- Locates the ZIP's row in the `seller_stress_by_zip` detail table. Every number the read emits comes
  from that row or the brain's `key_metrics` (region median). Nothing is computed that isn't already
  in the published output. No invented figure — a suppressed ZIP is handled explicitly (below).
- Returns a typed `SellerStressRead`:

```ts
interface SellerStressDriver {
  key: string;          // e.g. "share_delisted_pct"
  plainText: string;    // "About 1 in 6 listings got pulled off-market without selling"
  value: string;        // "16%" — formatted from the brain row
  isLeading: boolean;   // delistings rate is the leading signal — surfaced first
}

interface SellerStressRead {
  zip: string;
  place: string | null;        // primaryPlace from the resolver, for "your area" copy
  scored: boolean;             // false → suppressed ZIP, honest no-score path

  // ── The region's honest absolute state — the BRAIN is the authority, we relay it ──
  region: {
    direction: "bearish" | "mixed" | "neutral" | "bullish"; // brain's published direction
    stateLabel: string;   // seller-plain translation: "elevated seller pressure"
    median: number;       // published region median score (e.g. 61)
  };

  // ── This area's position WITHIN the region's scored distribution ──
  area: {
    score: number;        // 0–100, the ZIP's published score (shown, not re-banded)
    rank: { position: number; total: number }; // 1 = most pressure; "more than 40 of 52"
    vsMedian: "above" | "near" | "below";       // this area vs the region median
  };

  drivers: SellerStressDriver[];   // top 2–3, leading signal first, plain English
  caveats: string[];           // seller-material qualifiers from the published output, verbatim
  headline: string;            // truth-first one-liner, composes region state + area position
  flipLine: string;            // the positioning line (no competitor name)
  actionable: string;          // what it means for pricing/timing
  source: { label: string; url: string; underlying: string }; // "SWFL Data Gulf" / Redfin

  // ── Two DISTINCT dates — the data period is the currency, the refresh is not ──
  dataPeriod: string;          // "March 2026" — the labeled Redfin period from published output
  refreshedAt: string;         // MM/DD/YYYY — when we last pulled it (token date)
}
```

- **No re-banding — the brain owns "how stressed."** The read must NOT invent absolute score
  cutoffs. The pack deliberately decouples the published 0–100 score (clamped at
  `SCORE_CEIL_SIGMA = 3.0`) from `direction` (read off the raw composite at 0.6 / -0.2 / -0.6) so a
  ceiling retune can't flip the headline — and the per-ZIP detail table publishes only the compressed
  score, not the raw composite. So absolute banding on the score would drift with the ceiling and
  could mislabel a regionally-stressed area as calm. Instead the read relays the brain's own
  `direction` (the region's honest absolute state) and places the area *relative* to the region's
  published score distribution (rank + above/near/below median). Both halves come straight from the
  published output; the pack is untouched. "near" the median = within a small fixed band (e.g. ±3
  score points) so tiny differences aren't dramatized.
- **The seller's one-line read is composed, not asserted.** `headline` combines the two honest
  halves — e.g. "Southwest Florida is under elevated seller pressure right now, and your area
  (34145) carries more of it than 40 of the 52 areas we track." A regionally-stressed area that
  happens to sit below the local median still reads the region's elevated state first, so "below the
  middle" never masquerades as "calm."
- **The read carries the brain's truth-qualifiers — this is non-negotiable for this surface.** The
  published output ships caveats that materially change how a seller should read the number, and the
  read must relay the seller-relevant ones verbatim, not drop them. Two are load-bearing: (a) the
  ~50%-all-cash caveat explaining why national stress thresholds don't apply here, and (b) the
  condo-SIRS / SB 4-D caveat: *"special assessment delistings inflate stress in condo-heavy ZIPs
  (e.g., Marco Island corridor)."* That corridor is 34145 — the single most-stressed ZIP and the
  natural running example. A page that tells a single-family seller in 34145 "you have the most
  seller pressure in the region" while silently dropping the brain's own note that the reading is
  partly a condo-assessment artifact is hiding exactly the thing this product exists to show. The
  read selects caveats by relevance (the condo one only when the area is condo-flagged; the all-cash
  one always) and the page renders them adjacent to the score, not buried.
- **Two dates, and the data period is the currency — not the refresh date.** `asOfFromToken` on the
  brain's token returns 07/12/2026 (when we pulled it), but the data's labeled period is 2026-03-01
  (Redfin rolling-3-month). Showing "As of 07/12/2026" over March data is the open ledger defect
  *"as-of is OUR verify date, not the source period"* — and it is worse on a consumer honesty
  surface. So the read exposes both, distinctly: `dataPeriod` ("March 2026", parsed from the labeled
  period the pack already embeds in its detail-table title and metric labels) is presented as the
  reading's currency; `refreshedAt` (07/12/2026) is shown as a secondary "last checked" line. The
  refine date never stands in for data currency.
- **Driver translation** is a fixed, tested map from metric key → plain-English template. Leading
  signal (delistings) is always surfaced first, per the pack's own preference ("lead with the
  delistings rate"). Templates carry the number verbatim from the row; they never round differently
  than the brain or add a figure.
- **Suppressed ZIP** (score null — 3 of 55 today): `scored: false`, `score: null`, no fabricated
  drivers. Copy states plainly "we don't have enough listing history to score your area yet" and
  points to nearby scored areas. This is the four-lane rule's only hard block (invented number)
  honored at the read layer.

### The page — `app/r/seller-stress/[zip]/page.tsx`

A **public** report-family surface (indexable, continues the story), rendered in the existing report
chrome — this is not a new product surface and invents no new shell.

- **Reuses, does not reinvent:** `ReportShell`/`ReportHeader`/`ReportFooter`/`SectionTitle` from
  `app/r/_components/report-shell`, `resolveZip` (for the `[zip]` render) and `resolveLocation` +
  `searchRoute` (for `?q=` deep-links — the same resolver `/r/search` uses), `CitationList`,
  `asOfFromToken`, and `ReportAi` (the highlight-to-ask layer — the one surface the operator says is
  getting better; we ride it, not rebuild it).
- **Entry = the existing homepage bar, not a new box (operator decision 07/17).** The homepage is
  the operator-locked one-bar surface (`HeroBar`, three modes: Campaign / Market Report / Ask, spec
  `2026-07-12-homepage-one-bar-design.md`). Seller-pressure earns a **4th mode** on that bar, added
  to the same tab/chip grammar — NOT a bespoke search box (that would reinvent, worse, the bar's
  Mapbox autocomplete). The mode routes through the existing pure router `heroBarAction`: a bare ZIP
  → `/r/seller-stress/<zip>`; any place → `/r/seller-stress?q=<place>`. The `[zip]` page is the
  shareable permalink; a thin `/r/seller-stress` landing resolves `?q=` via `resolveLocation` +
  `searchRoute` and redirects to the permalink (out-of-scope → `OutOfScopePanel`, never a 404).
  Because `/r/seller-stress` is now an explicit page, the `/r/[slug]` catch-all collision is moot.
  The mode's tab label, button text, and one-line "gets" copy are the operator's to approve before
  ship (they live in `HeroBar`'s `MODES` array).
- **The flip hero (truth-first):** the positioning stated straight, no competitor named (respects the
  no-competitor-trash-talk rule) — e.g. *"This score gets built for agents and lenders every month.
  You've never been shown yours. Here it is."* Then the region's honest state, the seller's own
  score and where their area sits within the region, and the leading driver.
- **Crawler-honest number.** The score renders as a real server-side number (following the
  `/r/housing-swfl` `fmtMetric` pattern). No count-up-from-zero animation — that is a known bug where
  crawlers read 0. The headline number must be in the server HTML.
- **Body:** the 2–3 translated drivers, the rank-in-region line, the region-median context, the
  seller-material caveats (rendered adjacent to the score, not buried), the "what it means for
  pricing/timing" actionable, and the `CitationList` (label "SWFL Data Gulf", underlying Redfin Data
  Center). Currency shown as the **data period** ("Data through March 2026"), with the refresh date
  ("Last checked 07/12/2026") as a distinct secondary line — MM/DD/YYYY, stated once each.
- **Suppressed-ZIP render:** the honest no-score panel + nearby scored areas; never a made-up score.

### Framing guardrails (product voice rules, enforced in copy + read)

- No system nouns, brain ids, `§`, or pack jargon in any rendered string.
- Never frame the product as "ZIP-level" — copy says "your area" / "your market" and names the place
  (`primaryPlace`); the ZIP is the key, not the pitch.
- Plain text; the only tables are the existing report stat cards, not markdown tables in prose.
- Every figure cited; "SWFL Data Gulf" as the citation label, Redfin Data Center as underlying.
- The reading's currency is the **data period**, not the refresh date; dates are MM/DD/YYYY, never
  the raw `SWFL-…` freshness token.
- No invented number anywhere; suppressed area = explicit no-score copy.

### Data flow

```
seller types address ─▶ LocationSearchBox ─▶ resolveZip ─▶ /r/seller-stress/<zip>
                                                                    │
                                        getSellerStressRead(zip) ───┤ reads brains/seller-stress-swfl.md
                                                                    │ (published bytes)
                                              SellerStressRead ─────▶ page renders (server-side number)
```

### Error / empty handling

- Brain file missing/unreadable → `getSellerStressRead` returns `null`; page `notFound()` (same
  degrade-gracefully pattern as `/r/housing-swfl`'s optional stress section).
- Invalid ZIP (`!/^\d{5}$/`) → `notFound()`.
- Out-of-scope ZIP → `OutOfScopePanel`.
- Suppressed ZIP → honest no-score render, HTTP 200.

### Testing

- **`lib/seller-stress/read.test.ts` (bun:test):** `region.direction`/`stateLabel` relays the
  brain's published direction unchanged (no re-banding); `area.rank` and `area.vsMedian` are computed
  correctly against the published score distribution (including ties and the ±3 "near" band); driver
  plain-English templates carry the row's number verbatim; leading signal (delistings) first;
  suppressed ZIP returns `scored: false` with no `area`/`drivers` numerics populated; the condo-SIRS
  caveat is present in `caveats` for a condo-flagged ZIP (34145) and the all-cash caveat is always
  present; `dataPeriod` reflects the labeled data period (March 2026) while `refreshedAt` is the
  token date (07/12/2026) and the two never collapse into one; both dates are MM/DD/YYYY-family; a
  golden fixture (the current served brain output) produces the expected read. A no-invention
  assertion: every numeric string in the read appears in the source output.
- **Page live-verify:** the `verify` skill — real `next build`, serve on a clean port, screenshot,
  and confirm the score is present in the *server-rendered* HTML (crawler-honest). Live proof lands
  in `verification/answer-proofs.jsonl` per the answer-fix-proof gate; closes
  `seller_stress_facing_page_live_verify`.

## Out of scope (explicit)

- **Report-reader wiring** (surface #2) — its own spec next.
- **Recurring monthly digest** (surface #3) — its own spec after the page proves out.
- **Per-home propensity** — needs data we do not hold; not attempted.
- **Per-listing lifecycle overlay** (the check mentions "+ listing-lifecycle state") — a possible
  later add-on once a seller with an active listing can be identified; not in build #1.
- **Any change to the score itself** — the pack and its math are untouched; the read consumes only
  published output.
- **Engagement/outcome measurement** — deferred pending the operator's call (Open questions). If
  deferred, it belongs to a cross-surface measurement pass that also covers the reader and digest,
  not a one-off bolt-on here.

## Note for the planner

- **Routing collision — resolved by the explicit landing.** `/r/[slug]/page.tsx` is a catch-all that
  renders a brain by slug. Adding `app/r/seller-stress/page.tsx` (the thin `?q=` resolver landing)
  makes `/r/seller-stress` an explicit route, so it no longer falls through to `/r/[slug]` with a
  nonexistent `slug="seller-stress"`. Keep that landing in the plan for this reason as well as entry.
- **Homepage-mode change touches locked files.** The 4th mode edits `components/landing/HeroBar.tsx`
  (`MODES` array + `placeholder` + the hero `<h1>`, which currently promises exactly three things —
  "the campaign, the report, or the answer" — and must grow to four or the tab reads as a bolt-on),
  `lib/landing/hero-bar-action.ts` (`HeroBarMode` type + a new route case), and possibly the one-bar
  CSS. This is the operator-locked homepage — approved for this build (07/17), but the tab/button/
  gets/headline copy is surfaced to the operator before ship.

## Open questions

Resolved during brainstorming:
- Surface(s): all three (page → reader → digest); this spec = page only. ✔
- Framing: truth-first, made actionable. ✔
- Public vs signed-in: public, report-family chrome. ✔
- Grain: ZIP, keyed by the seller's resolved address/area; per-home propensity explicitly out. ✔

Open for the operator:
- **Measurement in build #1?** Ship a lightweight view/click-through signal on the page now, or defer
  it to a cross-surface measurement pass? Default if unanswered: **deferred** (keeps build #1 tight),
  with the gap stated in the spec rather than implied away.
