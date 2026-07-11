# Deliverable coherence gate (chart↔headline) + Naples luxury ring fixture

**Date:** 2026-07-11
**Status:** approved (brainstorm), pre-implementation
**Checks:** `deliverable_coherence_gate_live_verify` (this build) · `promised_deliverable_element_coherence_audit` (follow-up: extend to every promised element)

## Problem

A past session hand-authored the **Luxury Market Report** template sample with a
`$3,168,000` "median asking · $2M-plus" headline sitting directly above a chart titled
"Top-tier home value · Lee County" that runs **$802K → $746K**. Two different markets stacked
on one card: the headline is the $2M+ ultra-luxury segment; the chart is Zillow's *top-third*
home-value index (~$750–800K in Lee County). It reads as broken, and it undercuts a luxury
pitch with a declining line.

Root cause is **structural, not a one-off**:

1. **The two halves are produced on independent paths and never have to agree.** In the live
   builder, the AI writes the headline number; `buildChartForQuestion` picks the chart from the
   prompt. Nothing checks that the chart's magnitude/subject matches the headline. In the
   *gallery sample* (what shipped here), a human hand-typed both — with the same freedom to drift.
2. **The embarrassing artifact was hand-authored, not builder output.** The seed preview
   (`generate-seed-preview-charts.mts` `LEE_TOP_TIER`, `preview-fill.ts` "507 / −7%") is
   marketing fill. So a runtime-only gate would never have caught it — the incoherence entered at
   **authoring** time.
3. **The gallery sample is not what the builder produces.** "Use this layout" hands the builder
   an empty skeleton; the pretty sample is decoration. So the previews promise a coherence the
   builder is not held to.

Operator framing (2026-07-11): *"I just want to make sure this doesn't happen anymore. We need
rules to building."* Betting on model judgment — the builder's or a strong model's — is the
mistake; a strong model shipped the broken example. The guarantee must be structural.

## Goal

A **rule that makes an incoherent chart-bearing deliverable fail to ship**, enforced at both the
authoring surface (where this bug entered) and at runtime — extending seams we already have, not a
new mandatory gate (CLAUDE.md RULE C2). The Naples luxury ring is the fixture that turns the new
test green: proof the rule holds.

This build does the **chart↔headline** item. It establishes the pattern — *an element type ships
with its coherence rule, enforced by a test over every template* — that the follow-up check
extends to pictures, commentary, and examples.

## Non-goals

- Semantic understanding of chart *subject* ("top tier" vs "$2M+"). Not mechanically safe; would
  false-positive. We catch the **magnitude** class only, and honestly say so.
- A coherence *framework*. One assertion, two call sites, one fixture.
- Rewiring the gallery-preview↔builder decoupling across all templates (tracked in the follow-up
  check; out of scope here beyond the luxury template's own coupling).

## What we're building

### 1. `assertHeroChartCoherence` — one pure function

`lib/deliverable/chart-coherence.ts`

```ts
export type UnitClass = "currency" | "percent" | "count" | "other";

export interface CoherenceInput {
  hero: { value: number; unit: UnitClass } | null;
  chart: { values: number[]; unit: UnitClass } | null;
}

export type CoherenceResult =
  | { coherent: true }
  | { coherent: false; reason: string };

export function assertHeroChartCoherence(input: CoherenceInput): CoherenceResult;
```

Rules (deliberately narrow — only the mechanically safe slice):

- Missing hero OR missing/empty chart → **coherent** (nothing to compare).
- Units differ, or either unit is `"other"`, or unit is `"percent"` → **coherent** (a $ headline
  over a % chart is legitimate; percent ratios break near zero — excluded from the ratio test).
- Same unit is `"currency"` or `"count"`: let `min`/`max` be the chart's plotted range and
  `FACTOR = 3`. **Incoherent** iff `hero > max * FACTOR` OR `hero < min / FACTOR`. The reason
  string names both figures (e.g. `"headline $3,168,000 is 4.0× above the chart's top plotted
  value $802,000"`).

Pure, deterministic, no I/O. Unit-tested directly (`chart-coherence.test.ts`): the luxury numbers
(incoherent), a same-magnitude pair (coherent), a $-hero/%-chart pair (coherent), empty inputs
(coherent), a count pair.

### 2. Author-time enforcement — the CI test that would have caught this

Every chart-bearing template declares its sample's promised numbers in one place so the test can
read them. Today the hero lives in `preview-fill.ts` and the chart series lives inline in
`generate-seed-preview-charts.mts`. We extract the generator's inline series into an exported,
template-keyed const (`SEED_CHART_SERIES: Record<templateId, { values: number[]; unit: UnitClass }>`)
that the generator imports — one authority for "the sample chart's numbers." The hero value +
unit is parsed from `preview-fill`'s `hero.value` string (`$…` → currency, `…%` → percent, else
count).

New test (on the existing seed-preview suite) iterates every chart-bearing template:
`assertHeroChartCoherence({ hero, chart })` must return `coherent: true`, else **red CI**. A real
exception is blessed by an explicit `COHERENCE_ALLOWLIST` annotation (template id + one-line
reason) — strict: a human resolves it, silence is not allowed.

### 3. Runtime enforcement — soft, AND cross-surface (not email-only)

Run the same assertion wherever a chart and a headline first coexist, comparing the built chart's
displayed magnitude against the surface's headline figure. A chart is a bonus, never a blocker
(existing philosophy): on a clear incoherence **drop the chart** (better no chart than a lying one)
and `console.log` the reason; never block the send. The assertion is the shared pure function from
§1 — each surface calls it at its own assembly point (it cannot live inside the chart *producer*
`buildChartForQuestion`, which never sees the headline):

- **Email:** `lib/email/build-doc.ts` `buildPromptChart`, after the chart is built (extends the
  existing seam, RULE C2). Handle **multi-chart** templates (`weekly-pulse`, `monthly-digest`,
  `year-in-review` carry 2–3 charts) — check each chart against the hero, drop only the
  incoherent one.
- **Social — DEPENDENCY on `social-chart-registry` (Build 2).** That build lights up two brand-new
  chart-attach paths (manual "Add Chart" and AI-author seeding) that both run the same
  `buildChartForQuestion` producer email already uses. **Both MUST call `assertHeroChartCoherence`
  against the post's headline/stat element at attach time**, or social becomes the one unguarded
  surface and ships this exact bug class. This is not optional given the operator ruling
  ("guardrail everywhere"): the social spec carries it as an explicit step, cross-referenced here.
- **Picker parity (Build 1).** Exposing 7 more chart types to the Email Lab picker adds 7 more ways
  a user-selected chart can mismatch the headline. Every picker-selected chart routes through the
  same runtime drop, so no new type escapes the guard.

### 3a. Chart "theme" — a surface-neutral option, not an email-only luxury hack

The luxury ring needs a dark-ground + gold skin; charts today are always white, which clashes on
any dark email or social post. Make this a `theme`/`ground` option on the `ChartSpec` (light |
dark | brand-accent), read by the shared SVG dispatch. **Coordinate with Build 2**, which extracts
that dispatch (`chartSpecToEmailSvg` → `lib/charts/spec-to-image.ts`): add the theme handling to the
individual builder (`donut-share.ts`, a stable location) and have the extracted dispatch pass
`options.theme` through — so email and social both render a branded chart from one path, and we
don't both edit the moving dispatch and collide.

### 4. The Naples luxury ring — the fixture that proves the rule

Replaces the declining Zillow top-tier line in the Luxury Market Report with a **luxury-skinned
donut** of the Naples / Collier $2M+ market — the honest, coherent chart, coupled to the same
number the headline uses so they *cannot* disagree.

- **Geography: Naples/Collier**, not Lee. Collier has **1,226** active $2M+ listings vs Lee's 665,
  and is top-heavy (152 above $10M vs 36). Naples is the ultra-luxury market.
- **Renderer: reuse `donutShareSvg`** (`lib/charts/svg/donut-share.ts`) — already wired end-to-end
  through the real build path (`buildChartForQuestion` → `donut-share` → email PNG) *and* has a web
  frame. Add an optional **luxury skin**: dark ground + gold/champagne ramp, inheriting the email's
  own background (fixes a latent bug — charts are currently always white, clashing on dark emails).
  Legend keeps exact counts + % (the honesty anchor per the pie/donut caveat: humans misread
  angles, so the numbers must be printed). ≤4 tiers.
- **Segments (real, `data_lake.listing_price_histogram_swfl`, active for-sale, as of 07/11/2026):**
  $2–3M = 378 · $3–5M = 412 · $5–10M = 284 · $10M+ = 152 · center total **1,226** ·
  caption "active $2M+ listings · Naples / Collier". Caption says **listings**, not homes (source
  is all property types — honest; a homes-only filter is a follow-up).
- **Live-build coupling:** extend `price-distribution-swfl` (which already reads this histogram but
  bins for affordability, top bucket "$1M+") with a **luxury sub-band detail table** ($2M+ per
  county: $2–3M / $3–5M / $5–10M / $10M+). A chart binding turns that detail table into the
  donut-share spec for a Luxury Market Report build — so the headline count and the ring's center
  read the *same* number. Atomic pack change (register any vocab slug + update `catalog.test`,
  rebuild with `--target-only`).
- **Fix the sample stats** (`preview-fill.ts`): hero leads with Naples — "1,226 homes listed above
  $2M · Naples / Collier"; drop the misattributed "−7.0% Top-Tier Value YoY"; replace with a real
  luxury stat ("152 listed above $10M"). Regenerate the preview asset so the gallery renders the
  *same* ring the builder emits.

### 5. The written rule

Add to `lib/email/CLAUDE.md` (deliverable conventions): *"Every chart-bearing deliverable: the
chart's magnitude must cohere with its headline (same unit → headline within ~3× of the chart's
plotted range), enforced by `assertHeroChartCoherence` at author-time (CI test over all templates)
and runtime (soft: drop the chart). An element type ships with its coherence rule — the pattern
extends to pictures, commentary, examples."*

## Current state — all 27 templates (audit, 07/11/2026)

The operator asked that this take care of the current state of every deliverable, not just luxury.
Probed `preview-fill.ts` + the seed chart series. Of the 27 `SEED_DOCS` templates, **9 carry a
chart**; the other 18 (listing / relationship / letter / skeleton) render stats + photos, no chart,
so the chart↔headline gate is n/a for them.

The 9 chart-bearing templates and their coherence today:

- `market-spotlight` — hero $290,000 vs Lee-asking line (~$396K–$400K). **Coherent** (within 3×).
- `weekly-pulse` — no hero block; stats + 3 charts (ZIP $, Lee-asking $, inventory count).
  **Coherent** (no hero to contradict; multi-chart).
- `trend-snapshot` — hero $433,549 vs ZHVI area ($433K–$471K). **Coherent**.
- `rate-watch` — hero 6.49% vs 30-yr rate line (~6%). **Coherent** (percent — gate abstains).
- `luxury-market-report` — hero $3,168,000 vs top-tier line ($802K→$746K). **INCOHERENT** —
  $3.17M is 4.0× above the chart top. This is the only failure and the fixture this build fixes.
- `neighborhood-report` — hero $550,000 vs ZIP 33914 asking ($550K–$599K). **Coherent**.
- `investment-brief` — hero $1,807 vs Fort Myers rent (~$1,800). **Coherent**.
- `monthly-digest` — hero $330,500 (currency) vs sales-per-month + inventory (count). **Coherent**
  (different units — gate correctly abstains; not a defect).
- `year-in-review` — hero −8.1% (percent) vs sale-price $ + sales count. **Coherent** (cross-unit).

So the author-time gate, run over all 9 today, goes **red on exactly one** (luxury) and green on
the rest — including the cross-unit and multi-chart cases, which prove the rule's restraint. Fixing
luxury turns the whole gate green; from then on any new incoherent template sample is a red build.
This is how "all 27" are covered without hand-freezing anything: the gate is the standing audit.

## Staging

- **Stage 1 (fixes the screenshot):** items 1, 2, 4-preview (luxury-skin donut + Naples data +
  regen preview + fixed stats) + the written rule. The coherence test goes green on the luxury
  fixture.
- **Stage 2 (closes the wiring):** item 4 live-build coupling (`price-distribution-swfl` luxury
  sub-bands + chart binding) + item 3 runtime enforcement.

## Follow-up (check: `promised_deliverable_element_coherence_audit`)

Extend the *rule-ships-with-item* pattern to every promised element across every template:
pictures (subject match), commentary (agrees with the numbers it describes), examples (real, not
invented). Audit each chart-bearing template for magnitude coherence once the test lands (fixing or
allowlisting each), then generalize.

## Test plan / verification

- `chart-coherence.test.ts` — unit cases above.
- Seed-preview coherence test — red before the luxury fix, green after; red again if any future
  template ships an incoherent sample.
- `bunx next build` clean.
- Live-verify (`deliverable_coherence_gate_live_verify`): build a Luxury Market Report in the lab,
  confirm the emitted email carries the Naples ring (center 1,226) and the coherence check passes;
  seed gallery card renders the same ring.
