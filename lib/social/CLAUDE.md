# lib/social/ — social conventions (loads when you edit here)

## THE ONE ROOT RULE — read this before you type a color or a font size

Social had the same disease email had, and for the same reason. Measured 07/14/2026:

- **The house palette lived in FOUR copies** — `design/templates.ts`, `design/serialize.ts`,
  `design/chart-attach.ts`, and `components/email-lab/social/useSocialComposer.ts` — each with its
  own hand-typed defaults. One of them was wrong: the canvas accent was `#0ea5b7`, **a teal that is
  not our teal**. Nobody chose it. Someone typed a teal from memory, three files copied it, and every
  unbranded post we ever rendered shipped in the wrong brand color.
- **TWO unrelated type scales.** The canvas templates sized off `min(W,H)` with eleven magic
  multipliers; `render-social-image.ts` sized off `width` with six different ones.

None of that was laziness — **it was a missing file.** `app/globals.css` was the brand root and said
so ("must use these tokens, NOT the raw hex"), but a canvas has no cascade and resvg cannot parse
CSS. There was nothing to import. So everyone re-typed.

**The two roots, and what each owns:**

| You need | Import | Never |
|---|---|---|
| a brand color | `BRAND.*` — `lib/brand/tokens.ts` | a hex literal |
| a color for TEXT | `ink(role, theme, on)` / `accent(role, theme, on)` — `design/system.ts` | `BRAND.teal` directly on text |
| a decorative fill (CTA bg, rule, chart stroke) | `decor(theme)` | a hex literal |
| a canvas / panel surface | `THEMES[theme].canvas` / `.panel` | a hex literal |
| a font size | `type(role, format)` | a multiplier of `W`, `H`, or `base` |

`lib/brand/tokens.ts` is the **TypeScript mirror of `app/globals.css`**, locked to it by
`tokens.test.ts` (it parses the real CSS and fails on drift). Adding a color? **globals.css FIRST**,
then `tokens.ts`, then watch the test go green.

**A raw hex under `lib/social/design/**` or `components/email-lab/social/**` is an ESLint error.**
There is no allowlist and none is expected — in this lane a hand-typed hex is never correct.

## Type: five roles, one ladder — and NEVER `min(W,H)`

`type(role, format)` returns **fontSize AND lineHeight AND fontWeight together.** There is no
accessor that lets you pick a size and forget the leading — that omission is what clipped every stat
in email (a text node with no lineHeight silently inherits an absolute 24px box).

Roles, ratio 1.5 from a 32px floor: `display` 162 · `headline` 108 · `title` 72 · `body` 48 ·
`label` 32. Need something smaller? **Step down the ladder with `compact(role)` — do not invent a
multiplier.** `label` is the floor and the floor is enforced.

**Type scales off WIDTH, not `min(W,H)`.** Every one of these surfaces displays an image *fit to
width*, so height never touches how big the text looks. `min(W,H)` was a vertical-overflow hack
wearing a legibility decision's clothes, and it cost landscape (1200×630 — the only format where
height < width) **~42% of its type size**: a label that rendered 30px on a square rendered 18px on
landscape, roughly 7pt once a phone downscales the feed image.

Landscape's real constraint is its 630px of height. Solve that where it belongs — **drop a role or
shorten the copy, and let the bounds test fail you.** Never by shrinking type below the floor.

## Color is decided by ROLE, not by theme — so the light theme needs no ternaries

WCAG applies to text baked into an image (Android's a11y docs say so explicitly). The floors:
**4.5:1 normal text · 3:1 large text.** `CONTRAST_FLOOR` binds a floor to each role, and `legibleInk`
demotes anything that misses. **Unreadable is unreachable.**

This is why the light/sand theme is not a per-field ternary in every template. One number, two
verdicts, decided by role:

- `#2a8c85` (dimmed teal) on sand is **3.46:1** → **legal as a metric number** (clears 3:1),
  **illegal as a label** (misses 4.5:1). `accent()` returns it for `display`/`headline`/`title` and
  automatically demotes it for `body`/`label`.
- `#3dc9c0` (full teal) on sand is **1.74:1** → **decorative only.** It may be a CTA fill or a chart
  stroke. It may never be a word. `ink()`/`accent()` will not return it on a light canvas.
- A teal CTA reads **9.15:1 in both themes**, which is why the CTA fill never dims.

Don't take those numbers on faith and don't re-derive them from memory — `system.test.ts` computes
every one across every role × format × theme × surface. Re-tune a brand color and it tells you which
rule broke.

## Two systems, still unwired — know which one you're in

1. **`lib/social/`** — the complete publish/schedule engine (OAuth, `social_schedules`, 5 channel
   adapters, cron). `render-social-image.ts` rasterizes brain-data cards via resvg.
2. **`lib/email/social-calendar/`** — the lab's "Generate Week," which composes posts as `EmailDoc`.

The seam is `SocialModel` vs `EmailDoc`. They are not connected. Publishable (5 platforms) ≠
displayable (8) — gate a platform picker off the `Platform` union in `channels/index.ts`, **not**
`lib/email/social/platforms.ts`.

## Still-open forks (checks, not folklore)

- `render-social-image.ts` and `lib/charts/social-card.ts` still hold private greys
  (`#9CA3AF`, `#6B7280`, `#E5E7EB`) — **the brand has no neutral grey scale**, so each path invented
  one. Adding a grey ramp is a design decision, not a refactor. → check `brand_has_no_grey_scale`.
- `render-social-image.ts` still runs its own type scale. → check `social_render_engine_off_system`.

## The rule that generalizes

**Extract on copy #2.** A second copy of a fallback is a second brand. If you are about to hand-type
a value that already exists somewhere else in this repo, you are not saving time — you are choosing
which of the two will be wrong later.
