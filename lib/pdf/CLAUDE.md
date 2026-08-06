# lib/pdf/ — conventions (loads when you edit here)

# ⛔ TYPOGRAPHY IS DECIDED. DO NOT PICK A FONT, A SIZE, OR A CLIPPING RULE.

**The two roots, both COMMITTED and readable — `docs/design-reference/` was UN-GITIGNORED
08/06/2026 for exactly this reason:**

- `app/_design/05-color-and-type.md` — **Display: Inter Display** (or General Sans / Söhne).
  **Body: Inter**, weight 400 body / 500 emphasis. **Mono: JetBrains Mono** (or IBM Plex
  Mono), weight 500. **Numbers: `font-variant-numeric: tabular-nums`, always** — its own
  words: *"so columns of numbers align."*
- `docs/design-reference/colors_and_type.css` — the executable token file. `--font-display`
  and `--font-body` = Inter, `--font-mono` = JetBrains Mono, plus the scale (hero clamp
  3–5rem / h1 2.75 / h2 1.75 / metric 2.25 / body 1 / small+label 0.875 / caption 0.75rem),
  line-heights 1.08 display · 1.55 body · 1.4 caption, tracking −0.02em display · +0.06em
  label, and the 8px tokens 4/8/12/16/24/32/48/64/96. Stated direction: *"sharp
  financial-adjacent display type, tabular figures, borders not shadows."* Take the
  direction, re-implement in our stack — its README says do not ship it as-is.

**Executable form for email:** `lib/email/blocks/scale.ts` (`text(role)` — seven roles, size +
weight + leading TOGETHER) and `lib/brand/fonts.ts` (the six brand families, every engine).
A raw `fontSize`/`fontWeight`/`lineHeight`/`fontFamily` fails `blocks/type-conformance.test.ts`.

## THREE RULES THAT WERE WRITTEN DOWN AND OBEYED NOWHERE — all three fixed 08/06/2026

1. **NUMBERS CARRY TABULAR FIGURES.** Use `TABULAR` from `lib/charts/format.ts` on every SVG
   text node that renders a number. Not one of the 15 SVG chart builders did, so a stat row
   showed aligned figures while the chart directly beneath it showed proportional ones — same
   email, same numbers. Labels stay proportional; only NUMBERS align.
2. **NEVER FIT TEXT BY CHARACTER COUNT.** Use `fitText` / `labelGutterFor` / `measureText`
   from `lib/brand/text-metrics.ts`, which read real advance widths out of the bundled TTFs.
   A character budget is blind on two axes at once — measured off our own faces 08/06/2026:
   the same 22 characters span **1.14x across our six faces** and **3.08x inside Montserrat
   alone** (87.4px of "1" versus 268.9px of "W" at 11px). It was never right for any font:
   under the old 26-character budget `"Whiskey Creek 33919 — SOLD"` passed untouched and
   painted **20.7px over the bars in Liberation Sans** — the incumbent Arial-metric face,
   before any brand font was wired. The `s.length > N ? s.slice(0, N-1) + "…" : s` idiom is
   BANNED in any rendered surface.
3. **A GUTTER IS MEASURED, NOT PINNED.** `labelGutterFor(labels, {...})` sizes the label
   column to the real labels in the face that will actually rasterize, clamped at both ends.
   The pinned `padL = 150/156` was wrong in both directions at once: ZIP labels wasted a
   quarter of a 600px canvas, and street addresses were cut against a gutter nobody measured.

**The face must reach the BUILDER, not just the rasterizer.** `fontFamily` threads recipe →
`chartSpecToEmailImage` → `chartSpecToEmailSvg` → every builder → `svgToPng`. Handing it only
to `svgToPng` rasterizes the right typeface into a layout fitted for a different one — which
is exactly how a label that "passed" its budget still overflowed.
