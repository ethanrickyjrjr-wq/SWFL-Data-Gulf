# Should I Sell — seller decision read (area stress score + market snapshot + sell-now-vs-wait spread)

**Date:** 2026-07-17
**Status:** Approved design (pre-plan). Own product — separated 07/17/2026 from the Back on Market read.
**Route:** `/r/should-i-sell` (seller decision-support; distinct from `/r/back-on-market`).
**Check:** `should_i_sell_live_verify`
**Consolidates (supersedes):**
- `docs/superpowers/specs/2026-07-17-seller-stress-facing-page-design.md` (the seller-facing stress read)
- `docs/superpowers/specs/2026-07-17-back-on-market-phase5-market-context-design.md` (market snapshot + sell-now-vs-wait spread — mis-filed as "Phase 5" of Back on Market)
**Research (evidence base, LOCAL/gitignored):** `docs/steadyapi-research/2026-07-17-buyer-seller-agent-augmentation-landscape.md` (finding #1 + rank #3's metric combination)

## Why this is its own project (not a phase of Back on Market)

`/r/back-on-market` (finding #7) answers an **evaluative** question about a listing that *returned to
market* — "how often do deals fall through here, and is a returned listing a red flag?" — for a
**buyer or a seller** looking at a specific home. This product answers a **prospective seller-only**
question — "should I list now or wait, and what does waiting cost or gain me?" — for someone who
**hasn't listed yet**. Different user, different moment, different URL. The sell-now-vs-wait spread has
nothing to do with a home being back on market, and a buyer checking whether a home is tainted does
not want a listing-decision calculator. The two products **share one thing**: the reconciled
seller-stress reader (`lib/back-on-market/load-zip.ts`), which serves both and is not duplicated.

## Problem

An entire propensity-to-list / seller-stress scoring industry is commercially proven (Homebot at 8M+
homeowners, CoreLogic Realist "Sell Score," Datazapp "Home Seller Score") — and every instance
deliberately withholds the score from the seller it describes; it lives on the agent/lender dashboard.
**Nobody works for the seller.** We already hold the same *kind* of asset, honestly: `seller-stress-swfl`
is a live, deterministic 0–100 composite per ZIP (delistings rate leading, price-drop breadth,
cancellation rate, drop depth, relisting), each figure cited to Redfin Data Center, scored vs a
2019–2021 baseline. Latest served read: SWFL median 60.9/100 ("elevated"), 52 of 55 core ZIPs scored,
data period March 2026 (labeled 2026-03-01, a Redfin rolling-3-month figure).

But (a) that score only faces the seller in analyst voice at region grain (on `/r/housing-swfl`,
"elevated at 61/100"), not their own area truth-first; (b) the market-timing signals a seller needs —
months of supply, median DOM, sale-to-list ratio (`housing-swfl`), price-cut share
(`listing-momentum-swfl`) — are scattered across separate pages; and (c) nowhere in the product is
there a dollar answer to "what does waiting 6–12 months cost or gain me." The 168-item research pass
flagged that exact combination (rank #3): a seller on Reddit got a hand-typed answer combining months
of inventory, DOM, sale-to-list, price-cut share, and a sell-now-vs-wait spread. This ships it for real.

## Goal

A **public, seller-facing** decision read at `/r/should-i-sell`, address/ZIP-first, truth-first, that
composes three things for the seller's own area — every figure sourced or explicitly user-entered,
never invented:

1. **Their area's honest seller-stress read** (the hidden score, faced to them).
2. **The market snapshot** (months of supply, DOM, sale-to-list, price-cut share).
3. **A personalized sell-now-vs-wait dollar spread** (address-gated).

Display states, matching Back on Market's degrade pattern: **ZIP alone** → stress read + market
snapshot; **address resolved** → also the personalized spread.

## Non-goals (YAGNI)

- **Not a buyer surface, not a back-on-market read.** No returned-listing / relist / fallthrough
  framing, no buyer/seller toggle. Seller decision-support only.
- **No per-home propensity score.** Matching Homebot's per-address model needs data we do not hold;
  ours is ZIP-grain, stated as "your area," never framed as "ZIP-level." The whitespace is *facing*
  the score, not matching their model.
- **No default insurance estimate, ever.** Florida insurance is the single worst place to guess; we
  hold no FL OIR ZIP data. Insurance is a required user-entered field or the spread omits it plainly.
- **No change to the score or its math.** The pack is untouched; every surface reads *published* output.
- **No price-band segmentation** — ZIP is the finest grain for these signals, stated as itself.
- **No second-opinion CMA / lowball check, no new-construction alert** — both research-flagged and
  buildable off the comp helper / permits pack, but each its own later brainstorm.

## Architecture — one shared authority → three sourced sections → thin renderer

```
lib/back-on-market/load-zip.ts             ← SHARED authority (reconciled 07/17). Seller-stress read:
                                              region direction/median + this ZIP's rank/vsMedian +
                                              drivers + caveats. Reads PUBLISHED brain output, no recompute.
lib/should-i-sell/load-market-snapshot.ts  ← NEW: housing-swfl + listing-momentum-swfl rows for the ZIP.
lib/should-i-sell/spread-calc.ts           ← NEW: pure fn, the sell-now-vs-wait dollar math.
app/r/should-i-sell/[zip]/page.tsx         ← renderer (report-family chrome).
app/r/should-i-sell/page.tsx               ← thin ?q= landing → resolveLocation → redirect to permalink.
```

The seller-stress read stays in `load-zip.ts` (do not fork it — one authority per shared concept). If
that module's name feels wrong once it serves two products, rename it in a dedicated commit; do not
duplicate it.

### Section 1 — the seller-stress facing read (from `load-zip.ts`, already built)

Relays the brain's **published** read, never re-derived: `region.direction` + a seller-plain
`stateLabel` ("under elevated seller pressure right now") + `median`; this area's `rank`
(1 = most pressure; "more than 40 of 52 areas") and `vsMedian` (above/near/below, ±3-pt "near" band);
the top 2–3 drivers in plain English, leading signal (delistings) first; and the brain's
seller-material caveats **verbatim** — load-bearing: the ~50%-all-cash caveat (always) and the
condo-SIRS / SB 4-D caveat (when the area is condo-flagged — 34145 is the running example, most-stressed
ZIP partly a condo-assessment artifact; dropping that note would hide the exact thing this product
exists to show). **No re-banding** — the brain owns "how stressed"; we relay direction + relative rank,
never invent absolute score cutoffs (the published score is ceiling-clamped and would drift). Suppressed
ZIP (3 of 55) → honest no-score copy + nearby scored areas, never a fabricated number.

### Section 2 — market snapshot (`loadMarketSnapshot(zip)`)

Same seam as `load-zip.ts` (`loadParsedBrain` → per-ZIP detail row): months of supply, median DOM,
sale-to-list ratio (from `housing-swfl`), price-cut share (from `listing-momentum-swfl`). Returns a
flat typed object — each field nullable, each carrying its own `asOf` + `source`. These are absolute
sourced figures (no ranking). A ZIP absent from a table → that half is `null`, the card is omitted,
never guessed.

### Section 3 — sell-now-vs-wait spread (`spread-calc.ts`, address-gated)

The one new compute, and the one place a wrong default becomes a financial claim on someone's largest
asset. Every input is sourced, live-fetched-and-cited, or required from the user — never invented.

- **V0 (current value):** from the existing comp helper (`lib/assistant/comp-helper.ts`), once an
  address resolves via the page's existing address flow. No address → this section doesn't render;
  the ZIP-level snapshot still does.
- **V_future (at 6 or 12 months, user-selectable):** `V0 × (1 + median_sale_price_yoy × months / 12)`,
  where `median_sale_price_yoy` is this ZIP's own trailing YoY rate, **already published per ZIP in
  `housing-swfl`** (verified live — a real field, no new ingest). Rendered `[INFERENCE]` (data-protocol
  rule 7): cites the audited YoY base by name and states the falsifier in the copy — "assumes the past
  year's price trend continues; a market shift would change this." Never a guarantee.
- **Carrying cost while waiting — three components, three sourcing rules:**
  - *Property tax:* live-fetched from the county appraiser/tax collector at render time (named web
    source, cited, re-fetched — never hard-coded) as the starting figure, with a "use my real bill"
    override. Exact endpoint/field confirmed at plan time (RULE 0.5 — LeePA + Collier appraiser may
    expose it per-parcel).
  - *Insurance:* **required user-entered, no default of any kind.** Until entered, the spread shows the
    tax + appreciation pieces plus a plain "insurance not included — add your premium to complete this."
  - *Mortgage interest:* optional user-entered (their real rate/balance). If omitted, exactly $0, stated
    plainly — never a "typical mortgage" default.
- **Spread = `(V_future − V0) − total_carrying_cost`**, always rendered as line items (projected gain,
  tax, insurance if provided, mortgage if provided), never a bare final number — matches the
  provenance-panel precedent (every figure carries its source).

### Entry + chrome

- **Standalone route this build — NO new homepage-bar mode** (corrected 07/17 per the seller-stress
  handoff + the operator-locked "one grammar, never a collage" homepage rule). Ship `/r/should-i-sell`
  as a link-reachable route (like `/r/back-on-market` Phase 1), with its own thin `?q=` landing that
  resolves via `resolveLocation` + `searchRoute` → the `[zip]` permalink (out-of-scope →
  `OutOfScopePanel`, never a 404). Do NOT add a bespoke 4th `HeroBar` mode — two adjacent seller reads
  with two front doors crowd the locked one-bar. The homepage entry-grammar (route via the EXISTING
  "Market Report" mode, or ONE deliberate new seller-decision mode covering the whole product) is an
  **operator decision, flagged not built** — `HeroBar.tsx` / `hero-bar-action.ts` stay untouched here.
- **Report-family chrome, reused not reinvented:** `ReportShell`/`Header`/`Footer`/`SectionTitle`,
  `resolveZip`, `CitationList`, `asOfFromToken`, `ReportAi`. Public, indexable.
- **Crawler-honest number:** the score + dollar figures render as real server-side numbers (the
  `/r/housing-swfl` `fmtMetric` pattern) — no count-up-from-zero (crawlers read 0).

## Framing guardrails (product voice)

- No system nouns / brain ids / `§` / pack jargon in any rendered string.
- Never "ZIP-level" — "your area" / "your market", name the place (`primaryPlace`); ZIP is the key.
- Plain text; the only tables are the report stat cards, never markdown tables in prose.
- Every figure cited; "SWFL Data Gulf" label, underlying source named (Redfin / county / comp helper).
- The reading's currency is the **data period** shown as a month label ("Data through March 2026" — a
  rolling-3-month figure, so a bare day like 03/01/2026 over-states precision), with the refresh date as
  a distinct secondary "last checked 07/12/2026" line (MM/DD/YYYY). Never the raw freshness token.
- No invented number anywhere; suppressed area + missing inputs = explicit copy, never a silent guess.
- Truth-first: we do not sand off "elevated pressure" — the honesty is the differentiator.

## Data flow

```
seller types address/ZIP ─▶ HeroBar (4th mode) ─▶ /r/should-i-sell/<zip>
   zip resolved     → load-zip.ts (stress read) + loadMarketSnapshot(zip)   → sections 1 + 2 render
   address resolved → comp helper V0 + housing-swfl YoY → spread-calc (if insurance) → section 3 renders
```

## Error / empty handling

- Brain file missing/unreadable → the section's loader returns null → that section omitted (degrade
  like `/r/housing-swfl`). Invalid ZIP → `notFound()`. Out-of-scope → `OutOfScopePanel`. Suppressed ZIP
  → honest no-score render, HTTP 200. No address → no spread section (not a broken partial). No
  insurance → spread renders with the explicit "add your premium" prompt, never a silent zero.

## Testing

- `load-market-snapshot.test.ts` — pulls the right ZIP row from each brain; a ZIP absent from either
  table degrades that half to null; absent from both → null object (section omitted).
- `spread-calc.test.ts` — pure fn, fixed inputs → fixed outputs; the `[INFERENCE]` tag + falsifier
  string always present when a projection renders; insurance omission → explicit "not included" state,
  not a zero-cost assumption; mortgage omission stated as $0, not dropped.
- Seller-stress read tests already exist in `load-zip.test.ts` (region relay, rank/vsMedian, suppressed
  → no area, drivers verbatim) — reused, not rewritten.
- No-invention lint extension: every numeric string in the spread section traces to a cited source, is
  `[INFERENCE]`-tagged, or is user-entered — a string-level assertion alongside the Phase 1 guard.
- Live-verify (`should_i_sell_live_verify`): real Lee/Collier address on a prod build; the score +
  snapshot cards match live `seller-stress-swfl`/`housing-swfl`/`listing-momentum-swfl` values; the
  spread withholds a dollar figure until insurance is entered; the headline number is in the
  server-rendered HTML (crawler-honest). Proof → `verification/answer-proofs.jsonl`.

## Suggested build phases (each independently shippable, credibility-first)

1. **B1 — the facing read + page + entry.** Section 1 (stress read, already in `load-zip.ts`) rendered
   at `/r/should-i-sell/[zip]` in report chrome, + the thin `?q=` landing + the 4th HeroBar mode. Zero
   new data. Ships the "face the hidden score to the seller" thesis on day one.
2. **B2 — market snapshot.** Section 2 (`loadMarketSnapshot`) + cards. Zero new data.
3. **B3 — sell-now-vs-wait spread.** Section 3 (`spread-calc` + comp-helper V0 + county tax fetch +
   the user-input fields). The only phase with new compute + a live external fetch.

## Open decisions (resolve at plan time)

- Exact county tax-source endpoint/field for the property-tax default (RULE 0.5 probe).
- Default projection horizon: 6mo, 12mo, or both side by side.
- HeroBar 4th-mode copy (operator approves before ship).
- A lightweight view/engagement signal on the page now, or deferred to a cross-surface measurement
  pass? (The trust-low-point posture is about a tracked click→outcome loop; this page as specced can't
  see reads. Default if unanswered: deferred, stated not implied.)
- Whether `load-zip.ts` gets renamed now that it serves two products (dedicated commit if so).
