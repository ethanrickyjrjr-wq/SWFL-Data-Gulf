# 05 — Color and Type

## Palette — SWFL Smart Vibes

Gulf of Mexico meets American professionalism. Deep water, not beach
postcard. Subtle, clean, sophisticated.

Use these as anchor tokens. Exact hex values are starting points — adjust
within the same chroma/value neighborhood, but don't drift the vibe.

### Surfaces (background → foreground)

| Token             | Anchor hex | Use                                                        |
| ----------------- | ---------- | ---------------------------------------------------------- |
| `--gulf-midnight` | `#0A1419`  | Primary background. Near-black with blue-green undertone.  |
| `--gulf-deep`     | `#0F1D24`  | Section background just above midnight (Tier 2 page body). |
| `--gulf-slate`    | `#152832`  | Card / surface. Slate with warmth, like water at dusk.     |
| `--gulf-slate-hi` | `#1C3340`  | Elevated surface (hovered card, expanded caveat).          |
| `--gulf-haze`     | `#22414F`  | Divider lines, table borders, low-emphasis outlines.       |

### Accents (data + brand)

| Token             | Anchor hex | Use                                                                                           |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `--gulf-teal`     | `#3DC9C0`  | Primary accent. The real color off Naples — saturated, not neon. CTAs, focused states, brand. |
| `--gulf-teal-dim` | `#2A8C85`  | Lower-emphasis accent (links, secondary CTA borders).                                         |
| `--mangrove`      | `#5BC97A`  | Bullish signals. Alive, not stock-market neon.                                                |
| `--mangrove-dim`  | `#3D8A52`  | Bullish on muted backgrounds (chip bg with white text).                                       |
| `--sunset-coral`  | `#E08158`  | Bearish signals. Warm warning, not alarm red.                                                 |
| `--coral-dim`     | `#A45A3D`  | Bearish on muted backgrounds.                                                                 |
| `--neutral-gold`  | `#D4B370`  | Mixed/neutral signals. Sand at sunset, not yellow alert.                                      |

### Text

| Token              | Anchor hex | Use                                                            |
| ------------------ | ---------- | -------------------------------------------------------------- |
| `--text-primary`   | `#F0EDE6`  | Warm off-white. NOT pure white (`#FFF` is clinical).           |
| `--text-secondary` | `#B8B4A8`  | Body copy on secondary surfaces, table cell text.              |
| `--text-tertiary`  | `#807E76`  | Captions, freshness token, footnotes, source URLs in audit.    |
| `--text-on-accent` | `#0A1419`  | Text on `--gulf-teal` backgrounds (use midnight, never white). |

### Source-link treatment

Source citation URLs should read as **understated but credible**. Use
`--gulf-teal-dim` for the link color, with no underline by default and a
1px underline on hover that fades in 120ms. Never use `--gulf-teal` for
source links — that intensity is reserved for actions, not citations.

### Direction → color mapping

This is the only place state is encoded in color. Set instantly; do not
animate the transition.

```css
[data-direction="bullish"] {
  color: var(--mangrove);
}
[data-direction="bearish"] {
  color: var(--sunset-coral);
}
[data-direction="mixed"] {
  color: var(--neutral-gold);
}
[data-direction="neutral"] {
  color: var(--text-secondary);
}
```

### What NOT to do with color

- **No pure red / pure green for bullish/bearish.** Stock-market cliche
  was vetoed in the brief. Mangrove and sunset coral exist for this
  reason.
- **No gradients on data surfaces.** Cards are flat. The only gradient
  allowed is a very subtle `--gulf-midnight` → `--gulf-deep` body
  background to imply depth.
- **No alarm colors for caveats.** Caveats are warm gray
  (`--text-tertiary`). They are "yes-but" notes, not warnings.
- **No drop shadows on cards.** Use border (`1px solid --gulf-haze`) or
  surface elevation via `--gulf-slate` → `--gulf-slate-hi`. Drop shadows
  read as 2015 dashboard skeuomorphism.

## Typography

Sharp, modern, financial-adjacent. Credible on a second monitor.

### Stack

**Headings + display:** A geometric sans with confident character.
Recommended: **Inter Display**, **General Sans**, or **Söhne**. Tighten
tracking by -1% to -2% at display sizes (28px+). Weight 600 for hero,
500 for section headers.

**Body:** A neutral, highly legible sans. Recommended: **Inter** (matches
Inter Display family seamlessly) or **Söhne**. Weight 400 for body, 500
for emphasis.

**Numeric / tabular:** Use a typeface with **tabular figures** so columns
of numbers align. Inter has `font-variant-numeric: tabular-nums`. Apply
it to every table cell containing a number:

```css
.metric-value,
td.numeric {
  font-variant-numeric: tabular-nums;
}
```

**Monospace** (for the install command on `/connect` and the freshness
token): **JetBrains Mono** or **IBM Plex Mono**. Weight 500. Slightly
smaller than body (87.5% of body size).

### Scale (rem, 16px base)

- Hero headline (`/connect`): `4rem` / clamp(3rem, 6vw, 5rem)
- Page H1 (report direction word in Tier 2): `2.75rem`
- Section H2: `1.75rem`
- Card / metric label: `0.875rem`, uppercase, +0.06em tracking
- Metric value (the big number): `2.25rem`, tabular nums
- Body: `1rem`
- Body small / caption: `0.875rem`
- Freshness token + source URL: `0.75rem`, monospace

### Line height

- Display (28px+): 1.05-1.15
- Body: 1.55
- Caption: 1.4

### Direction word treatment

The verdict ("bullish" etc.) is the most important typographic element on
any report page. Treat it like a brand wordmark:

- Weight 600
- Tracking -2%
- Lowercase (or sentence case — never ALL CAPS, never Title Case)
- Set in the direction color (see mapping above)
- Animated only on first arrival (see `02-motion-rules.md` and `03-surface-recipes.md`)

## Iconography

- 1.5px stroke, rounded caps and joins. Recommended set: **Phosphor**
  (regular weight) or **Lucide**.
- Icon color matches text color of the line it sits on. Don't tint
  icons in accent colors except for the freshness-check icon (uses
  `--gulf-teal`) and the bullish/bearish trend arrows.
- Trend arrows: use chevron-up (bullish) / chevron-down (bearish) /
  minus (neutral) — colored per the direction mapping.

## Spacing

8px base grid. Spacing tokens: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`.

- Card padding: 24
- Section vertical gap: 64 (Tier 2 body), 96 (`/connect` between hero and
  install)
- Metric row vertical padding: 12
- Audit table row padding: 8 (denser; people scan)

## Tone-setting summary

If a designer asks "does this feel SWFL Data Lake?", check:

- Deep water palette, not beach palette
- Off-white text, never clinical white
- Mangrove + coral, never stock-market red/green
- Tabular numbers, always
- Sharp display type, body that disappears
- Borders, not shadows
- One signature reveal per surface, then stillness
