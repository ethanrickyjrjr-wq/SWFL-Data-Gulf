# Ranked, grid-based ZIP email reskin

**Date:** 2026-07-03 · **Revised:** 2026-07-03 (post-review — see "Review corrections")

## Review corrections (applied)

An in-session code audit caught three spec bugs before implementation; the sections
below are the corrected versions. Summary of what changed from the first draft:

1. **§4 named the wrong builder.** The draft called `buildRegistryCandidates`, a strict
   SUBSET of what the webpage uses (`buildZipCandidates`) — it omits `flood_aal` (the #1
   signal, and the one that colors the hero shape), `permits_90d`, and census. Using it
   would have painted the hero cutout with a signal that could never appear as a card, and
   broken the "same pool as the webpage" promise. Corrected to `buildZipCandidates` via a
   shared helper (`lib/zip-report/load-ranked-signals.ts`). This is modest new plumbing,
   not "zero" — the draft's "zero new plumbing" claim was wrong.
2. **Census cap was unaddressed.** The seed deliberately ships income-only census (stale
   2018–2022 ACS vintage). `buildZipCandidates` adds every census value. Corrected: the
   helper takes a `censusPolicy: "income-only"` that keeps only the income VALUE while
   passing the FULL distribution (so income's percentile is still computed against the
   whole SWFL set). "Exact same pool as the webpage" is softened to "same builder + inputs,
   minus the seed's income-only census cap."
3. **The strip mechanism doesn't protect `value`/`label`.** `BlockContentPatchSchema` is a
   single flat text allowlist shared by all block types; `value` and `label` ARE in it. So
   the draft's `value`/`label` metric-card fields would have survived an AI patch. Corrected:
   the held fields are named `metricValue`/`metricLabel` (outside the allowlist), exactly as
   `ListingProps` uses `price`/`beds`.

## Problem

The seeded ZIP email (`lib/email/zip-seed.ts`, built earlier today) is a flat stack of generic
blocks — a centered hero, a bare stat pair, a plain bulleted list of figures. It doesn't read as
a real, well-designed email, and it doesn't use any of the ranked/percentile data the ZIP
webpage now renders (`lib/zip-report/candidates.ts`, built earlier today in the
`zip_hero_pool_all_brains` work). Two concrete bugs surfaced alongside this:

1. The ZIP-shape PNG (`/api/zip-shape/[zip]`) rendered on a solid dark rounded rect. Dropped into
   the email's white section, that read as an opaque black box. **Fixed** (commit `5277fa09`):
   the PNG is now fully transparent (verified RGBA, corner pixels `(0,0,0,0)`).
2. The shape's stroke outline, at the SVG's raw unscaled geometry stroke-width, rasterized as a
   thick, ugly dark border — nothing like the near-invisible 0.6px CSS stroke the actual webpage
   uses. **Fixed** (commit `7f16e13f`): flat fill, no stroke.

The deeper problem this spec addresses: even with the shape fixed, the email's *information
design* — how metrics are presented, what colors it hardcodes, how things are laid out — doesn't
resemble a real product email or the source webpage it's supposed to represent.

## Goal

Rebuild `lib/email/zip-seed.ts` so the seeded ZIP email:
- Uses the same ranked, cited, percentile/movement data the ZIP webpage renders (not a flat
  figure list).
- Never hardcodes SWFL's own brand colors — uses a neutral placeholder skeleton so an operator's
  own branding (`applyBrand()`) is the only thing that ever paints real color, per the existing
  brand system.
- Places the ZIP-shape cutout next to the ZIP code/place identity, side by side, rather than as
  a big centered hero.
- Presents metrics as ranked cards with a real percentile bar (email-safe, cross-client), mirroring
  the webpage's "ZIP in detail" grid — not a bare list.
- Matches the density/quality bar already documented in
  `docs/email-marketing/QUALITY-BAR-data-deliverables.md` (crawl4ai-sourced 06/26/2026 — reused
  here rather than re-researched, see "Research" below).
- Stays $0-cost and deterministic on arrival (no LLM call when a visitor clicks in) — this is a
  same-day locked rule already stated in `zip-seed.ts`'s own file header; this reskin does not
  relitigate it.

Out of scope: the conversion-funnel/paywall pieces, the AI-editing pass that happens once a
visitor opens the doc in the Email Lab (unchanged), and any change to the actual `/r/zip-report`
webpage (confirmed live and unregressed this session).

## Research

`docs/email-marketing/QUALITY-BAR-data-deliverables.md` is an existing crawl4ai research pass
(06/26/2026 — Litmus, Beefree, Redfin Data Center, Datawrapper, Really Good Emails) that already
answers "what does a genuinely good data-grounded email look like." Its section anatomy (masthead
→ TL;DR → 4–6 KPI metric grid → featured chart → analyst commentary → drill-down → sources/footer)
and its technical constraints (table-based layout, no JS, ~600px width, image-blocked fallback,
dark-mode safety) are the design bar for this spec. Re-running crawl4ai for the same question 8
days later would just re-derive the same sources; this spec cites and reuses it instead.

## What we're building

### 1. Neutral brand-skeleton style

`lib/email/zip-seed.ts` currently imports `DEFAULT_GLOBAL_STYLE` directly
(`primaryColor: "#0f1d24"`, `accentColor: "#3DC9C0"` — literally SWFL's own navy/teal). A new
constant, `NEUTRAL_SKELETON_STYLE` (new file `lib/email/doc/skeleton-style.ts`, same shape as
`EmailGlobalStyle`), replaces it for seed docs: grayscale/slate placeholders
(`primaryColor: "#1F2937"`, `accentColor: "#64748B"`, `backdropColor: "#F8FAFC"`,
`textColor: "#1F2937"`) so an unbranded send doesn't read as an SWFL-branded template. This is
purely a color-source swap — `applyBrand()` and `brandGlobalStyle()` already merge real brand
tokens on top of whatever `globalStyle` the doc carries; no changes needed to that path.

### 2. New `metric-card` block type

No existing block type in the EmailDoc block system carries a value + label + percentile bar.
(There IS a `renderMetricCard` in `lib/email/templates/components/metric-card.ts` — but that's the
server-string `templates/` render path, a different subsystem, and it has no percentile bar; it is
not reused here.) New addition, following the existing block-type pattern exactly:

- `doc/types.ts`: add `"metric-card"` to `BlockType`; add
  ```ts
  export interface MetricCardProps extends BlockBase {
    metricValue?: string; // preformatted, e.g. "$495K" — never computed client-side
    metricLabel?: string; // "Median Home Value"
    sub?: string;         // "90-day median sale price"
    rankText?: string;    // "#3 of 57 SWFL ZIPs" — built from rankPos/rankOf, restated verbatim
    movementText?: string;// "↑ 6.85% YoY" — the candidate's own movementText, restated verbatim
    barPct?: number;      // 0-100, the candidate's own percentile — drives the bar width only
  }
  ```
  and add `"metric-card": MetricCardProps` to `BlockPropsMap`.
  **Field-naming is load-bearing:** `metricValue`/`metricLabel` — NOT `value`/`label` — because
  `BlockContentPatchSchema` is a single flat text allowlist shared by every block type, and it
  DOES include `value` and `label` (hero uses them). Naming the held fields outside that allowlist
  is the ONLY thing that keeps an AI content-patch from rewriting a held number, exactly as
  `ListingProps` relies on `price`/`beds`/`baths` being outside it.
- `doc/schema.ts`: validation entry for the new prop shape. All six fields sit OUTSIDE
  `BlockContentPatchSchema` (the AI content-patch allowlist), so an AI patch that targets any of
  them is stripped — same treatment as `ListingProps`' price/beds/baths.
- `blocks/MetricCardBlock.tsx` (new, pure component like the others): renders value (large bold),
  label (small caps, muted) + sub (smaller, muted); when `barPct` is a number, a single-row
  two-cell table follows — `<td style="background:accentColor;width:{barPct}%">` +
  `<td style="background:BORDER">` filling the remainder — the standard cross-client email meter
  technique (no image, no CSS gradient, works in Outlook/Gmail/dark mode); when `barPct` is
  `undefined`, no bar renders at all. `rankText`/`movementText` render as caption lines below
  (either, both, or neither — whatever the signal actually holds).
- `blocks/BlockRenderer.tsx`: register the new case.
- `doc/default-docs.ts`: add a `createBlock` default for `"metric-card"`.
- `lib/pdf/email-doc-pdf.tsx`: add a stacked fallback (value/label/sub/rank text, bar rendered as
  a plain filled rectangle via `@react-pdf/renderer`'s View — no interactivity needed). This is
  consistent with the PDF engine's existing documented behavior of ignoring `BlockLayout` and
  stacking every block linearly; no new divergence introduced, just a new block type that engine
  already knows how to stack.

### 3. Grid layout: shape + identity side by side, metric cards two-up

Two blocks share the same `y` band to sit side by side (the existing `compile-grid.ts` row-
grouping mechanism, already used elsewhere — no compiler changes needed):

- `image` block (the ZIP-shape PNG) at `{x:0, y:0, w:4, h:4}`. Fixed this session: the PNG is
  transparent/flat (no card, no stroke), and the route's fill is now a caller-supplied `?fill=`
  param instead of a hardcoded color (commit `ab40c4f7`). `zip-seed.ts` computes the URL's `fill`
  with the *same* `computeZipGradient(aal, FLOOD_GRADIENT.low, .high, .c0, .c1, .c2)` call
  (`lib/map/zip-color.ts`) the zip-report page and the homepage map both use, keyed off the same
  flood AAL value — so a ZIP's shape is the identical color in the email, the webpage, and the
  homepage map (operator 07/03: "the zip color stays the same color as clicked when on
  homepage"). This means `zip-seed.ts` needs the ZIP's flood AAL, which isn't in its current
  `loadMarketFigures`/`loadLifecycleDigest` pair — add the same flood-by-zip lookup
  `app/r/zip-report/[zip]/page.tsx` already does (env-swfl `flood_by_zip`) as a third parallel
  load. No AAL held for this ZIP → omit `?fill=` entirely → the route's own neutral fallback
  (`#2a3942`, matches the map's no-data color) renders, never a fabricated gradient point.
- A new small identity text region (ZIP code + place name — reuses the existing `hero` block,
  narrowed) at `{x:4, y:0, w:8, h:4}`.
- `metric-card` blocks, two per row, `{w:6}` each, `y` incrementing per row — top 6 ranked signals
  (see §4), so 3 rows.

**Every block is positioned** (header at `y:0` … footer at the bottom), like the existing grid
templates in `default-docs.ts`. The draft claimed no-`layout` blocks would "render stacked as
today" alongside positioned ones — that is WRONG: `compile-grid.ts`'s `groupRows` assigns a
no-`layout` block `fallbackY = 1_000_000 + i`, so it sorts AFTER every positioned block. A bare
header would land at the BOTTOM. So the seed gives every block an explicit full-width row
(`w:12`) at a sequential `y`; the flow blocks still render full-width and stacked, they just
carry a layout to hold their order. (Free-tier canvas still ignores layout and stacks — the
side-by-side shape+identity and two-up cards appear in the preview/send `compileGrid` render; the
metric-card CONTENT shows either way.)

### 4. Data: reuse the webpage's ranked pool via a shared helper (modest new plumbing)

The registry/flood/permits/census assembly the report page does inline is extracted into a
shared helper, `lib/zip-report/load-ranked-signals.ts`, which both surfaces can call:

```
loadRankedZipSignals(zip, { censusPolicy: "income-only" })    // lib/zip-report/load-ranked-signals.ts
  loads: 11 registry brains + env-swfl (flood) + permits-swfl + census (loadCensusSignals +
         loadZipQuickSummary), assembles floodRows/floodForZip/permitsCounts/censusValues
  → buildZipCandidates({ ... })                                // lib/zip-report/candidates.ts — the FULL
                                                               //   builder (flood_aal + permits_90d +
                                                               //   census, NOT the registry-only subset)
  → rankSignals(candidates)                                    // lib/zip-report/signal-rank.ts
  → returns { ranked, hasFlood, fillColor, place, shapeFound, sources }

zip-seed.ts then: top 6 ranked → one metric-card block per signal:
      metricValue = display, metricLabel = label, sub = sub,
      rankText = rankPos/rankOf != null ? `#${rankPos} of ${rankOf} SWFL ZIPs` : undefined,
      movementText = movementText (candidate's own field, independent of `why`),
      barPct = percentile ?? undefined   // null percentile → NO bar (never a fabricated width)
```

Why the FULL builder: `buildRegistryCandidates` is a strict subset — it omits `flood_aal`
(SIGNAL_PRIORITY[0], and the signal whose gradient colors the hero shape), `permits_90d`, and
census. Using it would paint the hero cutout with a signal that can never appear as a card.

**Census policy:** `censusPolicy: "income-only"` keeps only the income census VALUE in the pool
(every other ACS figure rides a stale 2018–2022 vintage) while passing the FULL census
distribution through, so income's percentile is still computed against the whole SWFL set — not
a truncated one.

Every field is a restated held value — no new number is computed, no LLM call. The email uses the
SAME builder + the SAME inputs the webpage uses (minus the income-only census cap), so email and
webpage agree on a ZIP's rank/percentile today. (Parity is by-convention, not yet structural: the
page still inlines its own assembly. Follow-up check `zip_report_helper_page_migration` tracks
migrating the page onto this helper so parity becomes structural.)

`rankText` and `movementText` are two independent lines (not `why`, which is a single tag that
picks whichever of the two "wins" for the webpage's terse inline display) — the email has room
for both when both are held, so it shows both rather than picking one.

**No fabricated bar:** when `percentile` is `null` (rare — e.g. a census figure whose SWFL
distribution has only one point), `barPct` is `undefined` and `MetricCardBlock` renders the
value/label/sub/rank/movement lines with no bar at all, never a fabricated midpoint width. A bar
width is a visual restatement of a held percentile, not a decoration — it never renders without
one.

The "what just moved" signal block and the sources/text block stay exactly as they are today
(already deterministic, already cited) — only the metric-list block is replaced by the grid of
`metric-card`s.

**Commentary:** one new deterministic sentence placed as a `text` block under the metric-card
grid. It NAMES the signal that most sets this ZIP apart (the #1-ranked signal's topic), but is
**digit-free** — it never restates a number (the number already rides the card, and the file's
existing invariant is that prose carries no digits). E.g. "Right now, the figure that most sets
Cape Coral apart is its annual flood loss." The lead topic is derived from the #1 signal's label
with any parenthetical/digit portion stripped (so "New Permits (90 Days)" → "new permits", never
leaking a digit into prose). Composed in code, not an LLM call — consistent with the file's locked
$0-cost seed-arrival rule; a fuller AI-authored "what it means" paragraph remains something the
visitor gets only by opening/editing the doc in the Email Lab (AI-patch path, unchanged).

### 5. Error handling (unchanged empty-tolerant contract)

- Out-of-scope ZIP (`loadRankedZipSignals` returns `null`) **or** zero ranked signals → `null`
  (caller opens unseeded). This replaces the draft's "zero market figures → null": the pool is now
  the ranked-signal set, so that is what gates the seed.
- A pack that fails to load or holds no row for this ZIP → that concept simply doesn't produce a
  `metric-card` (existing `buildRegistryCandidates` behavior — never throws).
- Unknown ZIP / `extractZipShape` returns `found: false` → skip the `image` block entirely
  (mirrors the webpage's own `shapeFound` guard) instead of shipping a broken-image icon.
- Fewer than 6 covered signals → fewer metric-card rows (2-up grid just runs short; no placeholder
  cards, no invented rank).
- No flood AAL held for this ZIP → `?fill=` omitted from the shape image URL → the route's own
  neutral fallback color renders (never a fabricated gradient point for a value we don't have).

### 6. Testing

All implemented and passing (74 tests across the files below; full email/pdf/zip-report suite
971 pass):

- `zip-seed.test.ts` (rewritten — the old file failed to import at the `createServiceRoleClient`
  seam): mocks the two seams `zip-seed` composes from — `loadRankedZipSignals` + `loadLifecycleDigest`
  — and asserts header-first/footer-last, one metric-card per ranked signal IN ORDER with held
  value/rank/movement/bar, a null percentile → no bar, the shape URL's `?fill=` = the URL-encoded
  gradient (omitted when no flood), NEUTRAL skeleton style (no `#0f1d24`/`#3DC9C0`), digit-free
  commentary, and `null` on out-of-scope/zero-signals/malformed-ZIP. The helper is asked for
  `censusPolicy: "income-only"`.
- `blocks/MetricCardBlock.test.ts`: value/label/sub/rank/movement render; bar draws at the held
  width; an out-of-range `barPct` clamps to 0–100; an undefined `barPct` renders NO bar.
- `doc/schema.test.ts`: an AI content-patch targeting `metricValue`/`metricLabel`/`sub`/`rankText`/
  `movementText`/`barPct` is stripped (data fields, like `ListingProps`); a metric-card block
  round-trips through `EmailDocSchema` with its held value intact.
- `compile-grid-metric.test.ts`: a doc shaped like the seed (shape+identity row + metric-card rows)
  is `isGridDoc() === true` and compiles via `compileGrid` without throwing, with the header at top
  (not pooled at the bottom).
- `app/api/zip-shape/[zip]/route.test.ts` (new): `safeFill` accepts `#hex`/`rgb(...)`, falls back to
  the neutral default for `null`/empty and rejects `<script>`/`url(...)`/quotes/named colors before
  they reach the SVG string.
- `author-doc.test.ts`: an authored `metric-card` is dropped (it's data-seeded only; also excluded
  from the author vocabulary in `build-doc.ts`), so the author can never ship a placeholder card.

## Non-goals

- No change to the actual `/r/zip-report/[zip]` webpage.
- No change to how branding is applied (`applyBrand`/`brandGlobalStyle` already do the right
  thing once the seed stops hardcoding real brand colors).
- No live AI call added to the seed-arrival path.
- No new data source, pack, or ingest — 100% reuse of today's `zip_hero_pool_all_brains` pool.
