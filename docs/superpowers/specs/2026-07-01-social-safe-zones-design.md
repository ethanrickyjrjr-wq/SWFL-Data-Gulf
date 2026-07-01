# Social graphic safe zones (key-element exclusion + 4:5 default)

**Date:** 2026-07-01 · **Slug:** `social-safe-zones` · **Check:** `social_safe_zones_live_verify`

Evidence base (fetched live via crawl4ai this session, RULE 0.4):
`_ASSISTANT/research/2026-07-01-social-safezone-meta-firstparty-verification.md`.

## Problem

Social graphics render text/logo/watermark **inside the platform's UI-chrome danger zones**. In the server
rasterizer (`lib/social/render-social-image.ts` `composeCardSvg`) every format uses a single uniform 7%
pad (`pad = Math.round(width * 0.07)`), top-anchored. For a `story` (1080×1920) that puts:
- the headline at y≈116px — **inside the top-14% (269px) zone** (covered by the profile icon), and
- the watermark at `height - pad` = y≈1844px — **deep inside the bottom-35% (from y=1248) zone** (covered
  by Reels caption/CTA UI).

So our own provenance watermark — the thing that must survive a re-share — is the element most likely to be
obscured. The interactive Konva composer has no safe-zone guide at all, and the composer default format is
`square` (1:1), which Meta explicitly no longer recommends for feed.

## Goal

Keep **key elements** (headline, stat, logo, CTA, watermark) clear of each platform's UI-chrome bands,
**without constraining artwork** and **without ever refusing or hard-blocking a build** (RULE 0.7). The
background image/color stays full-bleed edge-to-edge; only text/logo/CTA/watermark are laid out within a
safe band defined by **tunable, evidence-cited constants**. In the composer the band is a **soft visual
guide**, never a clamp on user placement.

### Evidence → constants (tiered)

- **Bottom 35%** of a 9:16 story reserved — **Meta first-party, verbatim** (reels-ads doc). Bottom is
  placement-dependent (20% plain Story, 35% Reel); default to the conservative **35%** for a cross-postable
  asset. Tunable.
- **Top 14% (250px)** reserved — **two independent sources** (Sprout Social + billo). Tunable.
- **Sides 6%** — billo only, weakest; small + tunable.
- **Feed default 4:5** (1440×1800) — Meta first-party + Sprout. Shift composer default off square.
- Feed formats (square/portrait/landscape) have **no full-screen UI chrome** → their safe inset stays the
  historical 7% margin, keeping their output **byte-identical** (zero blast radius on existing feed cards).

## What we're building

**1. `lib/social/safe-zones.ts` (new) — the single source of truth.**
Exports evidence-cited fraction tables + a resolver:
```ts
export interface SocialSafeInsets { top: number; bottom: number; left: number; right: number } // px
export const SAFE_ZONE_FRACTIONS: Record<SocialFormat, {top;bottom;left;right}>
export function safeInsets(format: SocialFormat, width: number, height: number): SocialSafeInsets
```
Fractions: feed formats `{0.07,0.07,0.07,0.07}` (== current behavior); `story` `{top:0.14, bottom:0.35,
left:0.06, right:0.06}`. Comment block cites the Meta/Sprout/billo tiers verbatim. Numbers live here ONLY so
they are trivially tunable.

**2. `render-social-image.ts composeCardSvg` — lay key elements inside the band.**
- Replace the single `pad` with `const safe = safeInsets(format, width, height)`.
- Background `<rect>` stays full-bleed (unchanged) — artwork is never constrained.
- Horizontal: content x = `safe.left`, `innerW = width - safe.left - safe.right`.
- Top-anchor content at `safe.top` (accent rule, logo, headline all shift down for story; unchanged for feed
  where `safe.* == pad`).
- Watermark bottom-anchors to `height - safe.bottom` (was `height - pad`) — lifts it **above** the story
  danger band.
- No behavior change for square/portrait/landscape (fractions identical to old `0.07`).

**3. `KonvaStage.tsx` — soft safe-zone guide as a DOM overlay (never exported).**
The composer exports via `stage.toDataURL()` (`useSocialComposer.ts:322`), which captures only canvas nodes.
So the guide is a **sibling DOM `<div>`** (absolutely positioned over the stage, `pointer-events:none`),
using CSS **percentages** = the safe fractions (no scale math). Wrap the `<Stage>` in a
`position:relative` container; overlay a dashed inner box + faintly-shaded top/bottom/side danger bands for
`story` (subtle 7% frame for feed). Because it's DOM, not Konva, it can NEVER appear in the exported PNG and
never blocks a drag. Guide is informational only.

**4. Default format shift — square → portrait (4:5).**
`useSocialComposer.ts:39` `newDesign("square")` → `newDesign("portrait")`. Evidence-backed feed default.
**Only affects NEW designs** — saved designs serialize their own `format`, so nothing existing re-renders.
Isolated one-line change, flagged for operator sign-off (the one debatable UX change).

**5. Author hint — one line.**
In `authorSocialSystem()` (`lib/social/design/author.ts`), add a single sentence: prefer 9:16 for video,
4:5 for feed; keep key text/logo out of the top/bottom safe bands. The author already only picks
template+format+copy, so this is guidance, not new capability.

**6. Tests.**
- `lib/social/safe-zones.test.ts` — fraction→px math; feed insets == `round(w*0.07)`; story band bounds.
- Extend `render-social-image` tests — assert (a) story watermark `y < height - bottomReserve` i.e. above
  the band, story headline first line `y > topReserve`; (b) **regression**: square/portrait/landscape SVG
  output is byte-identical to pre-change (snapshot equality) so feed cards are provably unchanged.

## Non-goals (explicit)

- No hard clamp / export-time rejection of user-placed elements (that was the "schema gate" option; it risks
  nagging users who place intentionally — deferred).
- No vertical re-centering of story content within the band (top-anchored-within-band satisfies Meta;
  centering is future polish).
- **Story content flow is top-anchored and NOT clamped to the band bottom (v1 limitation).** The watermark
  bottom-anchors above the reserve, but headline→stat→chart flow downward from `safe.top` with no awareness
  of the band bottom. A story WITHOUT a chart clears comfortably; a story carrying a large chart can overflow
  into the reserved bottom 35% and collide with the watermark. Bounding/scaling the flow is deferred — flag
  on `social_safe_zones_live_verify`.
- No change to the publish adapters / `FORMAT_RATIO` (already correct: portrait 4:5, story 9:16).

## Isolation / interfaces

- `safe-zones.ts` is pure, client-safe (no resvg import), one job: format → insets. Both the server
  rasterizer and the client overlay consume it — one source of truth, testable in isolation.
- Server change is contained to `composeCardSvg` (already pure + exported for tests).
- Client change is contained to `KonvaStage` (presentational) + one default in `useSocialComposer`.

## Blast radius

- Feed formats: **none** (byte-identical, guarded by snapshot test).
- Story: intended change — content moves into the safe band. The only "regression" is that story layouts
  now use less vertical space (the safe band is ~979px of the 1920), which is the point.
- Default shift (#4): new composer sessions start at 4:5 instead of 1:1; existing saved designs unaffected.
