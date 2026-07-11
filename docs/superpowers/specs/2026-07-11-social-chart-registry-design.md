# Social composer chart support (built on ChartSpec registry)

**Date:** 2026-07-11
**Audit:** `docs/audit/2026-07-11-chart-builder-wiring/findings.md` (§2, corrected)
**Check:** `social_chart_registry_live_verify`
**External research (RULE 0.4):** Vega/Vega-Lite, QuickChart, Highcharts node-export-server — all
three independently converge on "one declarative chart spec, separate renderer per output target"
as the correct shape for this exact problem (cited in full in the audit + prior conversation
turn). This spec applies that pattern: `ChartSpec`/`frameId` is the one root; email and social each
get their own thin renderer against it.

## Problem (corrected from the initial audit)

The interactive social composer (`components/email-lab/social/*` — Konva canvas, `SocialDesign`
model) cannot put a chart on a post: no palette button (`useSocialComposer.ts:158-159`), Konva
paints a flat gray placeholder for any `chart` element (`KonvaStage.tsx:129-132`), and the AI
author never seeds one (`lib/social/design/author.ts` has zero chart handling despite a comment
elsewhere claiming otherwise).

**Correction to the original audit finding:** the composer's export is client-side —
`useSocialComposer.ts:362` calls `stage.toDataURL()` directly on the Konva canvas. The
`app/api/social/render/[format]/route.ts` + `lib/social/render-social-image.ts` pair I originally
cited as "the export route with no chart param" is a **separate, unrelated system** (a flat
query-param `SocialModel`, no `elements[]` — almost certainly an automated/cron card generator).
It does have its own orphaned, `EmailChartSpec`-based chart renderer, but fixing that is a
different problem from this one and is out of scope here (noted under Non-goals).

## Goal

A user (or the AI author) can add a real chart — built from the same `ChartSpec`/`frameId`
registry that powers chat, the Projects deliverable engine, and the Email Lab builder — to a
social post, see it painted on the Konva canvas, and have it survive the existing
`stage.toDataURL()` export unchanged.

## Why the registry, not `EmailChartSpec` (locked per your direction)

`ChartSpec`/`frameId` has three live consumers today (chat's comps path —
`conversation-path.ts:749,838`, confirmed still firing; the Projects deliverable engine; the Email
Lab builder). `EmailChartSpec` has one real live consumer left (`outreach`/`listing-flyer`) plus
the orphaned social renderer above — effectively zero once that's retired (tracked separately as
`retire_emailchartspec_outreach`). Building social fresh against the registry means one taxonomy
going forward instead of feeding the fork.

## What we're building

### 1. The shared rasterizer — extract the root, don't fork it

`lib/email/spec-to-png.ts` already documents itself as "THE BRIDGE: a ChartSpec ... → a hosted PNG
for email... spec → static SVG → resvg PNG → hosted email-media URL," built from three composable
pieces: `chartSpecToEmailSvg` (frameId-keyed SVG dispatch, `spec-to-png.ts:84`), `svgToPng` (resvg
conversion, `lib/email/chart-image.ts`), and `hostEmailPng` (upload + URL, same file). None of the
first two are actually email-specific — only the third (hosting destination) is. Extract
`chartSpecToEmailSvg` + `svgToPng` into a surface-neutral home (e.g. `lib/charts/spec-to-image.ts`)
that both `lib/email/spec-to-png.ts` and a new `lib/social/chart-image.ts` import — `spec-to-png.ts`
becomes a thin wrapper (email hosting only) so no existing behavior changes and no test breaks.
`lib/social/chart-image.ts` pairs the same SVG+PNG core with its own hosting call (mirrors
`hostEmailPng`'s pattern against whatever bucket/prefix social media already uses — check
`lib/social/design/author.ts`'s existing image-upload path for the convention to match, don't
invent a new one).

This is the "root" the instruction asked for: one spec, one SVG dispatch, one PNG conversion,
shared; hosting destination and consumption are the only per-builder pieces.

### 2. `ChartElement` carries a real payload

`lib/social/design/types.ts:44-48` — `ChartElement.spec` is already typed `unknown` specifically
to keep this file refinery-free (it currently just carries an opaque payload the comment calls
`EmailChartSpec`). No type-boundary problem to solve: repoint the comment at `ChartSpec` and add a
sibling `src?: string` field (the rasterized PNG URL), mirroring `ImageElement`/`LogoElement`'s
existing `src` shape exactly. An empty/missing `src` means "still rendering" — same semantics the
placeholder already handles.

### 3. Konva paint — reuse `ImageEl`, don't write new draw code

`KonvaStage.tsx`'s `case "chart"` (line 129-132) currently always returns a gray `<Rect>`. Change
it to behave like `case "image"`/`case "logo"` (line 126-128): if `el.src` is set, run it through
the existing `ImageEl` component (`KonvaStage.tsx:65-77`, already uses `useKonvaImage` +
`crossOrigin="anonymous"` — confirmed CORS-safe per `use-konva-image.ts`'s own vendor-verified
comment, so the hosted chart PNG loads into Konva exactly like any other image and
`stage.toDataURL()` keeps working untainted). If `el.src` is empty, keep the gray placeholder — it
already means "loading," not "broken."

### 4. Manual "Add Chart" — the one genuinely new interaction pattern

Every other element type in `addElement` (`useSocialComposer.ts:112-163`) is synchronous — a
default value, done. A chart cannot be: building one means calling a live brain/question-answering
path, which is async. Design: `addElement("chart")` pushes a `ChartElement` immediately with
`spec: null, src: ""` (renders as the existing loading placeholder, no new state machine needed),
then kicks off an async call — mirroring whatever pattern the existing photo-upload flow
(`promotingPath` state, `useSocialComposer.ts:92`) already uses for "push placeholder now, fill in
`src` via `updateElement` once the async result lands" — to a small endpoint that runs
`buildChartForQuestion` (`lib/assistant/chart-for-question.ts`, the same function
`lib/email/build-doc.ts`'s `buildPromptChart` already calls) against the user's prompt/scope, then
rasterizes via the new `lib/social/chart-image.ts` from step 1, and calls `updateElement` with the
real `spec` + `src`. This needs a small prompt affordance (what to chart) — reuse the existing
prompt box (`prompt`/`aiBusy`/`aiStatus` state already in `useSocialComposer.ts:62-65`) rather than
building a second one.

### 5. AI-author seeding

`lib/social/design/author.ts` gets the equivalent of `lib/email/build-doc.ts`'s `buildPromptChart`
call: when the author model decides a chart belongs on the post, it follows the same
`buildChartForQuestion` → rasterize → `ChartElement{spec, src}` path as step 4, not a separate
code path — one producer function, called from two triggers (manual palette action, AI author).

### 6. Coherence guard — REQUIRED, both triggers (cross-ref: `deliverable-coherence-gate`)

The operator ruling is "guardrail everywhere." Social is a surface, so it gets the guard too — and
because steps 4 and 5 route through the same `buildChartForQuestion` producer email uses, skipping
it here is the one thing that would let this exact bug class (a chart that contradicts the post's
headline) ship on social unguarded. Both the manual "Add Chart" (step 4) and the AI-author seed
(step 5), at the point they attach the built chart to the post, call `assertHeroChartCoherence`
(`lib/deliverable/chart-coherence.ts`, already shipped) comparing the chart's displayed magnitude
against the post's headline / stat element. On a clear incoherence, drop the chart (leave the
loading placeholder empty / do not attach) and log the reason — never block the compose. Runs
server-side at attach time, where the spec + headline coexist, NOT at the `stage.toDataURL()`
export. Add a `useSocialComposer` test asserting an incoherent chart is not attached.

### 7. CORS on the social hosting bucket — VERIFY before shipping (RULE 0.4)

`stage.toDataURL()` throws a security error on a *tainted* canvas — and the canvas taints if the
hosted chart PNG comes from a bucket that does not return `Access-Control-Allow-Origin`. The Konva
image load is CORS-safe (`crossOrigin="anonymous"`), but that only works if the destination bucket
`lib/social/chart-image.ts` uploads to actually serves CORS headers. Before Build ships: confirm the
social image bucket returns them (check the existing social image-upload path's bucket config); if it
doesn't, fix the bucket CORS, or the first exported chart post fails at export. This is a
verify-item, not an assumption.

### 8. Chart theme — read the shared option (cross-ref: `deliverable-coherence-gate` §3a)

The shared dispatch this build extracts (`lib/charts/spec-to-image.ts`) should pass a
`ChartSpec.options.theme` (light | dark | brand-accent) through to the individual SVG builders, so a
social post's chart can match the post's palette the same way an email's can. The theme handling
lands in the builders (e.g. `donut-share.ts`) under the coherence-gate build; this build just makes
sure the extracted dispatch forwards the option rather than dropping it.

## Testing

- `lib/charts/spec-to-image.ts` (new shared module): unit tests asserting identical output to the
  current `spec-to-png.ts` behavior (regression-proof the extraction — same SVG/PNG bytes for the
  same input, before and after the refactor).
- `lib/social/chart-image.ts`: mirrors `spec-to-png.test.ts`'s structure, new hosting destination
  only.
- `KonvaStage`: a render test asserting `case "chart"` with a populated `src` produces the same
  tree shape `case "image"` does (proves the reuse, not a parallel implementation).
- `useSocialComposer`: a test that `addElement("chart")` pushes an element with `src: ""`
  synchronously (never blocks the UI on the async call).

## Non-goals

- Not fixing the separate automated social-card route (`app/api/social/render/[format]/route.ts` +
  `render-social-image.ts`)'s orphaned `EmailChartSpec` chart path — different system, tracked
  under the same `retire_emailchartspec_outreach` check since it's the same taxonomy retirement,
  not a new one.
- Not building every one of the 12 registry frames for social on day one — ship against whatever
  subset Build 1 (`2026-07-11-chart-picker-parity-design.md`) has PNG-capable at the time; the
  rasterizer is shared, so social's frame coverage grows automatically as Build 1 completes each
  one. No separate social-specific frame-coverage tracking needed.
- Not changing the Email Lab builder's picker or renderer — that's Build 1, independent.
