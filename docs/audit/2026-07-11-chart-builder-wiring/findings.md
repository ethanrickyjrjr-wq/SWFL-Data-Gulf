# Why the Email Lab and Social Composer can't reach the "good" charts

**Date:** 2026-07-11
**Scope:** Email Lab grid builder (`components/email-lab/EmailLabGridShell.tsx`) + Social composer
(`components/email-lab/social/*`). RULE 0.5 probe — every claim below is grep/read-verified against
current code, not memory.

## TL;DR

There are **four parallel chart systems** in this repo that evolved independently and were never
fully cross-wired:

1. **`CHART_REGISTRY`** (`components/charts/registry/registry.ts`) — 12 frames, web-live, used by
   the Projects/deliverable narrative engine and the chat/answer engine. None are `fixtureOnly` —
   all 12 can legitimately bind to real brain data today.
2. **`spec-to-png.ts`** (`lib/email/spec-to-png.ts`) — rasterizes a `ChartSpec` to a PNG for email
   (email clients can't run JS/SVG). Only **8 of the 12** registry frames have a case here.
3. **`CHART_TYPE_OPTIONS`** (`lib/email/reshape-chart-type.ts`) — the actual dropdown a user sees in
   the Email Lab builder. Only **5** shapes are exposed, and it's *behind* #2 — two frames PNG
   rendering already supports aren't even offered as picker options.
4. **`EmailChartSpec`** (`lib/email/templates/charts/chart-types.ts`) — a completely separate, older
   taxonomy (`bar` / `sparkline` / `gauge` / `heat-row` / `stacked-bar`) still used by outreach
   drip campaigns, listing flyers, and — critically — the **social image renderer**.

The Email Lab builder is running behind its own renderer. The Social composer is worse: it has a
fully built, unit-tested chart renderer with **zero live callers** — nothing in the product can
currently produce a chart that reaches it.

---

## 1. Email Lab builder — 5 of 12 frames exposed, and the picker lags the renderer

### The live wiring path (confirmed)
`EmailLabGridShell.tsx` chart-type dropdown → `/api/email-lab/ai` (`chartType` param) →
`lib/assistant/chart-for-question.ts` (`buildChartForQuestion`, picks a real brain, returns a
registry `ChartSpec` with `.frameId`) → `lib/email/reshape-chart-type.ts` (`reshapeChartToType`,
re-labels the SAME real values into the requested shape — never invents a number) →
`lib/email/spec-to-png.ts` (`chartSpecToEmailSvg`, rasterizes to PNG) → embedded in the doc.
(`lib/email/build-doc.ts:244-275`)

### CHART_REGISTRY — all 12 frames (registry.ts:35-110)

| frameId | Component | Used elsewhere on site | In `CHART_TYPE_OPTIONS`? | In `spec-to-png.ts`? |
|---|---|---|---|---|
| `bar-table` | ChartBlockFrame | corridor character charts, chat | ✅ (`bar`) | ✅ (fallback) |
| `ranked-delta` | RankedDeltaFrame | — | ✅ (`ranked`) | ✅ |
| `donut-share` | DonutShareFrame | — | ✅ (`donut`) | ✅ |
| `dot-plot` | DotPlotFrame | — | ✅ (`dotplot`) | ✅ |
| *(reshape-only)* `composed-bar-line` | bklit ComposedChart | email-only shape, no registry entry | ✅ (`composed`) | ✅ |
| `spark-grid` | SparkGridFrame | — | ❌ **missing from picker** | ✅ **renderer ready** |
| `line-band` | LineBandFrame | — | ❌ **missing from picker** | ✅ **renderer ready** |
| `zhvi-area` | ZHVIAreaChartFrame | `/demo`, `/embed/charts`, chat | ❌ not a picker option (used automatically for time-series) | ✅ (fallback path) |
| `corridor-scatter` | CorridorMarketScatterFrame | `/embed/charts`, chat | ❌ | ❌ **no PNG renderer** |
| `composition` | CompositionFrame | Projects deliverable engine | ❌ | ❌ **no PNG renderer** |
| `z-gauge` | ZGaugeFrame | Projects deliverable engine | ❌ | ❌ **no PNG renderer** |
| `seasonal-radial` | SeasonalRadialFrame | Projects deliverable engine (`cre-swfl`) | ❌ | ❌ **no PNG renderer** |
| `storm-timeline` | TimelineFrame | Projects deliverable engine (env-swfl, gated on brain emit) | ❌ | ❌ **no PNG renderer** |

### The two gap classes

**Class A — quick win, renderer already works, picker just wasn't updated:**
`spark-grid` and `line-band` both have working cases in `spec-to-png.ts:126-133`. Nobody added
them to `CHART_TYPE_OPTIONS` (`reshape-chart-type.ts:17-23`) or a `case` in
`reshapeChartToType`'s switch (`reshape-chart-type.ts:123-190`). A user literally cannot select
these today even though sending one would work.

**Class B — real gap, no PNG path exists yet:**
`corridor-scatter`, `composition`, `z-gauge`, `seasonal-radial`, `storm-timeline` have no case in
`chartSpecToEmailSvg`'s switch (`spec-to-png.ts:99-144`). If one of these `frameId`s ever reached
that function today it would silently fall through to the bar-table fallback
(`spec-to-png.ts:158-160`) — not broken, but never the "good" chart. These need real PNG/SVG
renderer work before they can be picker options.

**Also flagged, not a gap:** `composed-bar-line` is NOT a `CHART_REGISTRY` entry at all — it's an
email-only reshape target with its own case in `spec-to-png.ts:134-143` (real bklit
`ComposedChart` render). It works today; it's just architecturally a fourth thing (a reshape
output, not a registry frame) worth naming so nobody "fixes" it into the registry by mistake.

---

## 2. Social composer — the renderer exists, nothing can feed it

This is the worse gap. Three independent facts, each confirmed by reading the code:

**a) The composer UI cannot create a chart element.**
`useSocialComposer.ts:158-159` — the "add element" palette switch has no `case "chart"`; the
`default` branch just returns with a comment: `// chart is author-seeded, not palette-added
(placeholder render today)`.

**b) The canvas can't paint one even if it existed.**
`KonvaStage.tsx:129-132` — `case "chart"` renders a flat gray `<Rect>` placeholder. The comment
says "the chart is rendered to an image src in a later task" — that task was never done.

**c) The AI author never seeds one either.**
`lib/social/design/author.ts` has zero references to `chart`/`Chart` — the comment in (a) claiming
charts are "author-seeded" describes a path that doesn't exist in the author code today.

**d) There's a SEPARATE, unrelated social-image system with its own orphaned chart renderer.**
`app/api/social/render/[format]/route.ts` + `lib/social/render-social-image.ts` is **not** the
interactive composer at all — correcting an earlier conflation in this doc. The interactive
composer's export is client-side: `useSocialComposer.ts:362` calls `stage.toDataURL({...})`
directly on the Konva canvas (a screenshot of whatever elements are painted). The API route builds
its `SocialModel` from flat query params (`headline`, `stat_value/label/caption`, `source`,
`as_of`, `freshness_token`) — no `elements[]`, no `SocialDesign` — so it's a separate, likely
cron/automated "market pulse" card generator, unrelated to (a)-(c) above.

That said, its chart capability is real and equally orphaned: `render-social-image.ts` has a
fully built, tested `chart` field (`render-social-image.ts:67-69, 278-291`) that embeds an
`EmailChartSpec` via `lib/social/chart-svg.ts` (`chartFragment`, `nativeBarSvg`), with its own
scale-to-fit logic and dedicated tests (`render-social-image.test.ts`, `chart-svg-parity.test.ts`)
— but the route that calls it never passes a `chart` param, so **this renderer has no caller in
the entire app** either. It's a second, independent instance of the same pattern: a real renderer
with nothing feeding it.

### Net effect
The interactive composer can paint text, an image, a stat, a CTA, and a logo — never a chart (no
palette option, gray placeholder in Konva, no AI-seed path). The separate automated social-card
route has a working, tested chart renderer that nothing calls. Two different social surfaces, two
independent "renderer without a producer" gaps.

---

## 3. The parallel taxonomy nobody reconciled

`EmailChartSpec` (`lib/email/templates/charts/chart-types.ts`) — `bar` / `sparkline` / `gauge` /
`heat-row` / `stacked-bar` — is a **second, older chart-spec type**, structurally unrelated to
`ChartSpec`/`frameId` (`components/charts/registry/chart-spec.ts`). It's still the live taxonomy
for:
- `lib/email/outreach/{drip-email,campaign,build-content,demo-content}.ts` (drip/outreach sends)
- `lib/email/listing-flyer.ts`
- `lib/social/render-social-image.ts` + `lib/social/chart-svg.ts` (the unreachable social renderer
  from §2)

Meanwhile chat (`lib/assistant/conversation-path.ts`, `lib/welcome/frames.ts`), the Projects
deliverable engine, and the Email Lab builder all standardized on the newer `ChartSpec`/`frameId`
registry. `lib/email/listing-comps.ts` appears to have already been migrated to the new taxonomy
(per SESSION_LOG, its `buildCompsSpec` emits a `{type:"chart"}` `ChartSpec` frame, not an
`EmailChartSpec`) — so the migration is in progress, just not finished, and nobody has gone back to
migrate outreach/listing-flyer/social.

This isn't a "missing capability" the way §1/§2 are — outreach and listing-flyer still work — but
it means any future work on charts has to know which of the two systems a given surface speaks
before touching it, and it's why the social renderer (built against `EmailChartSpec`) doesn't just
plug into the registry frames the rest of the product already has.

---

## What's NOT a gap (confirmed, so we don't re-litigate)

- `CHART_REGISTRY`'s `fixtureOnly` flag is the single gate for "can't bind to live data" — checked,
  **none** of the 12 frames are flagged, so live-data-capability is not the blocker anywhere above.
- `app/demo/page.tsx` and `app/embed/charts/page.tsx` (from the prior turn's answer) are dev/preview
  routes using fixture JSON directly — unrelated to either builder's insertion pipeline. Confirmed
  again here; not re-investigated.
