# Color and Type

## Palette — Gulf of Mexico meets American professionalism

Deep water, not beach postcard. Subtle, clean, sophisticated.

---

### Surfaces (dark → less dark)

| Token             | Hex       | Use                                                        |
| ----------------- | --------- | ---------------------------------------------------------- |
| `--gulf-midnight` | `#0A1419` | Primary background. Near-black with blue-green undertone.  |
| `--gulf-deep`     | `#0F1D24` | Section background just above midnight.                    |
| `--gulf-slate`    | `#152832` | Card / surface. Slate with warmth, like water at dusk.     |
| `--gulf-slate-hi` | `#1C3340` | Elevated surface (hovered card, expanded section).         |
| `--gulf-haze`     | `#22414F` | Divider lines, table borders, low-emphasis outlines.       |

### Accents

| Token             | Hex       | Use                                                            |
| ----------------- | --------- | -------------------------------------------------------------- |
| `--gulf-teal`     | `#3DC9C0` | Primary accent. The real color off Naples. CTAs, brand, focus. |
| `--gulf-teal-dim` | `#2A8C85` | Lower-emphasis accent (source links, secondary borders).       |
| `--mangrove`      | `#5BC97A` | **Bullish** signals. Alive, not stock-market neon.             |
| `--mangrove-dim`  | `#3D8A52` | Bullish on muted backgrounds (chip bg).                        |
| `--sunset-coral`  | `#E08158` | **Bearish** signals. Warm warning, not alarm red.              |
| `--coral-dim`     | `#A45A3D` | Bearish on muted backgrounds.                                  |
| `--neutral-gold`  | `#D4B370` | **Mixed / neutral** signals. Sand at sunset.                   |

### Text

| Token              | Hex       | Use                                                            |
| ------------------ | --------- | -------------------------------------------------------------- |
| `--text-primary`   | `#F0EDE6` | Warm off-white. NOT pure white (clinical).                     |
| `--text-secondary` | `#B8B4A8` | Body copy on secondary surfaces, table cell text.              |
| `--text-tertiary`  | `#807E76` | Captions, freshness token, footnotes, source URLs.             |
| `--text-on-accent` | `#0A1419` | Text on `--gulf-teal` backgrounds (use midnight, never white). |

---

### Direction → color mapping

This is the only place state is encoded in color. **Set instantly; do not animate the transition.**

```css
[data-direction="bullish"] { color: var(--mangrove);        } /* #5BC97A */
[data-direction="bearish"] { color: var(--sunset-coral);    } /* #E08158 */
[data-direction="mixed"]   { color: var(--neutral-gold);    } /* #D4B370 */
[data-direction="neutral"] { color: var(--text-secondary);  } /* #B8B4A8 */
```

---

### What NOT to do with color

- **No pure red / pure green for bullish/bearish.** Mangrove and sunset coral exist for this reason.
- **No gradients on data surfaces.** Cards are flat.
- **No alarm colors for caveats.** Caveats are warm gray (`--text-tertiary`). They are "yes-but" notes, not warnings.
- **No drop shadows on cards.** Use border (`1px solid var(--gulf-haze)`) or surface elevation. Drop shadows read as 2015 skeuomorphism.

---

## Typography

Sharp, modern, financial-adjacent. Credible on a second monitor.

### Font stack

| Role | Family | Weight |
| ---- | ------ | ------ |
| Headings / display | Inter Display (or General Sans, Söhne) | 600 |
| Body | Inter | 400 / 500 |
| Data values / metric numbers | Inter Display | 600 |
| Monospace (install command, freshness token) | JetBrains Mono (or IBM Plex Mono) | 500 |

Tighten heading tracking by -1% to -2% at display sizes (28px+).

### Type scale (rem, 16px base)

| Role                       | Size                      | Weight | Notes                        |
| -------------------------- | ------------------------- | ------ | ---------------------------- |
| Landing page hero          | `clamp(3rem, 6vw, 5rem)`  | 600    | tracking -2%                 |
| Report H1 (verdict word)   | `2.75rem`                 | 600    | tracking -2%, lowercase      |
| Section H2                 | `1.75rem`                 | 500    |                              |
| Metric value (big number)  | `2.25rem`                 | 600    | tabular nums, always         |
| Metric label               | `0.875rem`                | 500    | uppercase, +0.06em tracking  |
| Body                       | `1rem`                    | 400    | line-height 1.55             |
| Body small / caption       | `0.875rem`                | 400    |                              |
| Freshness token / source   | `0.75rem`                 | 500    | monospace, `--text-tertiary` |

**Always on numbers:** `font-variant-numeric: tabular-nums;`

### Direction word treatment

The verdict ("bullish" etc.) is the most important typographic element on the page:

- Weight 600
- Tracking -2%
- **Lowercase** (never ALL CAPS, never Title Case)
- Set in the direction color (see mapping above)
- Animated only on first arrival

---

## Spacing

8px base grid. Tokens: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`.

- Card padding: 24px
- Section vertical gap: 64px (report body), 96px (landing page)
- Metric row vertical padding: 12px

---

## Tone summary

If you're asking "does this feel right?", check:

- Deep water palette, not beach palette
- Off-white text, never clinical white
- Mangrove + coral, never stock-market red/green
- Tabular numbers, always
- Sharp display type, body that disappears
- Borders, not shadows
- One signature reveal per surface, then stillness
