# Ranked, grid-based ZIP email reskin

**Date:** 2026-07-03

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

No existing block type carries a value + label + percentile bar. New addition, following the
existing block-type pattern exactly:

- `doc/types.ts`: add `"metric-card"` to `BlockType`; add
  ```ts
  export interface MetricCardProps extends BlockBase {
    value?: string;       // preformatted, e.g. "$495K" — never computed client-side
    label?: string;       // "Median Home Value"
    sub?: string;         // "90-day median sale price"
    rankText?: string;    // "#45 of 124 SWFL ZIPs" — built from rankPos/rankOf, restated verbatim
    movementText?: string;// "↑ 6.85% YoY" — the candidate's own movementText, restated verbatim
    barPct?: number;      // 0-100, the candidate's own percentile — drives the bar width only
  }
  ```
  and add `"metric-card": MetricCardProps` to `BlockPropsMap`.
- `doc/schema.ts`: validation entry for the new prop shape; in `ContentPatchSchema`, every field
  above is a **data field** (sourced from the ranked-candidate pool, never AI-authored) — strip
  mode drops AI writes to it, same treatment as `ListingProps`' price/beds/baths.
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

Blocks with no `layout` (header, the "what just moved" signal block, sources text, button,
footer) render stacked exactly as they do today — mixing grid and flow blocks in one doc is
already how `compile-grid.ts`/`isGridDoc()` is designed to work.

### 4. Data: reuse today's ranked-candidate pool, zero new plumbing

`zip-seed.ts` gains the same loading step `app/r/zip-report/[zip]/page.tsx` already does:

```
REGISTRY_PACK_IDS.map(id => loadParsedBrain(id))      // lib/fetch-brain.ts, existing
  → buildRegistryTableMap(brains)                      // lib/zip-report/load-registry-tables.ts, existing
  → buildRegistryCandidates(zip, tables).candidates     // lib/zip-report/candidates.ts, existing
  → rankSignals(candidates)                             // lib/zip-report/signal-rank.ts, existing
  → top 6 (RankedSignal[])
  → one metric-card block per signal:
      value = display, label = label, sub = sub,
      rankText = rankPos/rankOf != null ? `#${rankPos} of ${rankOf} SWFL ZIPs` : undefined,
      movementText = movementText (candidate's own field, independent of `why`),
      barPct = percentile
```

Every field is a restated held value — no new number is computed, no LLM call, no new data
source. This is the exact same pool the webpage renders from; the email and the webpage will
never show a different percentile/rank for the same ZIP on the same day.

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

**Commentary:** one new deterministic sentence, templated from the #1-ranked signal only (its
`why` string, restated — e.g. "34135 currently ranks #45 of 124 SWFL ZIPs on median home value.")
placed as a `text` block under the metric-card grid. This is composed in code, not an LLM call —
consistent with the file's existing locked rule that seed-arrival stays $0-cost; a fuller
AI-authored "what it means" paragraph remains something the visitor gets only by opening/editing
the doc in the Email Lab (existing AI-patch path, unchanged).

### 5. Error handling (unchanged empty-tolerant contract)

- Zero market figures → `null` (today's existing behavior, unchanged).
- A pack that fails to load or holds no row for this ZIP → that concept simply doesn't produce a
  `metric-card` (existing `buildRegistryCandidates` behavior — never throws).
- Unknown ZIP / `extractZipShape` returns `found: false` → skip the `image` block entirely
  (mirrors the webpage's own `shapeFound` guard) instead of shipping a broken-image icon.
- Fewer than 6 covered signals → fewer metric-card rows (2-up grid just runs short; no placeholder
  cards, no invented rank).
- No flood AAL held for this ZIP → `?fill=` omitted from the shape image URL → the route's own
  neutral fallback color renders (never a fabricated gradient point for a value we don't have).

### 6. Testing

- Fix the pre-existing break in `lib/email/zip-seed.test.ts` (currently 0 passing — an import
  mismatch unrelated to this change) as part of rewriting this file's tests.
- `MetricCardBlock` render test: value/label/sub/bar-width render from props; a `barPct` outside
  0–100 clamps rather than overflowing the table cell.
- `doc/schema.test.ts`: `ContentPatchSchema` strip test for `metric-card` — an AI patch attempting
  to rewrite `value`/`barPct` is dropped, same as it is for `ListingProps`.
- Grid-compile smoke test: a doc with the shape+identity row and 3 metric-card rows compiles via
  `compileGrid` without throwing, and `isGridDoc()` returns true.
- `zip-seed.test.ts`: seeded doc for a known ZIP includes a shape image block (when the shape is
  found), an identity block, up to 6 metric-card blocks matching `rankSignals` output order, and
  no `DEFAULT_GLOBAL_STYLE` navy/teal literal in the resulting `globalStyle`. Also: the shape
  image URL's `?fill=` matches `computeZipGradient` for a ZIP with held flood AAL, and omits
  `?fill=` entirely for a ZIP with none.
- `route.test.ts` (new, for `/api/zip-shape/[zip]` — it has none today): a valid `?fill=` renders
  that color; an invalid/malicious `?fill=` (e.g. `<script>`, `url(...)`) falls back to the
  neutral default rather than reaching the SVG string.

## Non-goals

- No change to the actual `/r/zip-report/[zip]` webpage.
- No change to how branding is applied (`applyBrand`/`brandGlobalStyle` already do the right
  thing once the seed stops hardcoding real brand colors).
- No live AI call added to the seed-arrival path.
- No new data source, pack, or ingest — 100% reuse of today's `zip_hero_pool_all_brains` pool.
