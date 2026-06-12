# Chart & Graph HTML Templates — README

Static HTML chart templates for runtime token replacement. All 10 files are self-contained and render standalone in any modern browser.

---

## Token System

Every color, font, copy, and URL value is a placeholder replaced at runtime via find-and-replace. The full token list:

| Token | Purpose | Example value |
|---|---|---|
| `{{PRIMARY}}` | Main brand color | `#1a4fd6` |
| `{{ACCENT}}` | Secondary / highlight color | `#00b478` |
| `{{SURFACE}}` | Card / container background | `#ffffff` |
| `{{TEXT}}` | Body text color (also used for light text on dark bg) | `#ffffff` |
| `{{FONT_FAMILY}}` | Full font stack | `'Inter', sans-serif` |
| `{{BORDER_RADIUS}}` | Corner radius on cards | `12px` |
| `{{COMPANY_NAME}}` | Company name string | `Acme Data Co.` |
| `{{LOGO_URL}}` | Image src for logo | `https://cdn.example.com/logo.png` |
| `{{TAGLINE}}` | One-line tagline under logo | `Insight at every ZIP` |
| `{{WEBSITE_URL}}` | Footer link URL | `https://example.com` |
| `{{SENDER_NAME}}` | Email from name | `Acme Reports` |
| `{{SENDER_ADDRESS}}` | Email from address | `reports@example.com` |
| `{{DISCLAIMER}}` | Footer legal / disclaimer text | `Data is unaudited and for internal use only.` |

### doc-split.html only
| Token | Purpose |
|---|---|
| `{{MAP_IMAGE_URL}}` | Mapbox (or other) static image URL injected as `background-image` on `.map-image-target` |

---

## Deliverable A — Email Charts

All 5 files use **inline CSS only**, **table-based layout**, max-width **600px**, and render correctly in Gmail and Outlook. No JavaScript, no `<style>` blocks, no external fonts.

### `email-hbar.html` — Horizontal Bar Chart
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{DISCLAIMER}}`

**Chart:** 6 rows (Northeast, Southeast, Midwest, Southwest, Mountain, Pacific). Each row: label left, `{{PRIMARY}}`-colored bar middle, dollar value right. Row backgrounds alternate `{{SURFACE}}` / slightly lighter `#f7f7f7`.

---

### `email-compare.html` — Before / After Comparison
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{DISCLAIMER}}`

**Chart:** 2-column (Last Period / This Period), 4 metric rows. Improvements colored `{{ACCENT}}`; declines colored as a red tint (`#c0392b`, derived from a muted red shade of `{{PRIMARY}}`).

---

### `email-hero.html` — Hero Stat Card
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{DISCLAIMER}}`

**Chart:** Full-card `{{PRIMARY}}` background. Giant centered number (64px). Supporting sentence below. Three supporting stats in a `{{ACCENT}}` strip at the bottom. `{{TEXT}}` used for white/light text on dark backgrounds.

---

### `email-ranked.html` — Ranked List (Top 5)
**Tokens used:** `{{PRIMARY}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{DISCLAIMER}}`

**Chart:** 5 ranked rows. Rank badge circle uses `{{PRIMARY}}` at decreasing CSS `opacity` (1.0 → 0.8 → 0.6 → 0.4 → 0.2). Inline mini bars use matching opacity. Real ZIP codes as dummy data.

---

### `email-table.html` — Data Comparison Table
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{DISCLAIMER}}`

**Chart:** 5 rows × 3 columns (Segment, Revenue, Units, Growth). Header row `{{PRIMARY}}` background. Growth cells color-coded: strong = `{{ACCENT}}` tint; caution = amber tint (`rgba(240,180,0,0.08)`); decline = red tint (derived from `{{PRIMARY}}`, `rgba(200,50,50,0.10)`). No additional color tokens.

---

## Deliverable B — PDF / Document Charts

All 5 files use CSS custom properties mapping to the 13 tokens, support flexbox/CSS grid, are designed for **letter size**, and include `@media print` rules for `window.print()`. No JavaScript.

### `doc-hbar.html` — Full-Width Horizontal Bar Chart
**Format:** Letter portrait (8.5×11in)
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{SENDER_ADDRESS}}`, `{{DISCLAIMER}}`

**Chart:** 8 rows. Each row has label, sub-label (ZIP cluster range), bar track, value, and directional delta badge. Bars use `{{PRIMARY}}` for primary markets and `{{ACCENT}}` for emerging markets. Legend and source line at bottom.

---

### `doc-donut.html` — Donut / Ring Chart
**Format:** Letter landscape (11×8.5in)
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{SENDER_ADDRESS}}`, `{{DISCLAIMER}}`

**Chart:** Pure CSS `conic-gradient` donut (no canvas, no SVG, no JS). 5 segments. Colors derived as CSS `color-mix()` tints of `{{PRIMARY}}` and `{{ACCENT}}` — no new color tokens. Center label shows total unit count. Right panel legend with proportional mini-bars.

---

### `doc-sparkline.html` — Trend Area Chart
**Format:** Letter landscape (11×8.5in)
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{SENDER_ADDRESS}}`, `{{DISCLAIMER}}`

**Chart:** SVG `<polyline>` trend line with `<path>` area fill using a `linearGradient` from `{{PRIMARY}}` at 25% opacity to near-transparent. 12 monthly data points. Q4 accent dots use `{{ACCENT}}`. KPI strip above chart. Grid lines and axis labels.

---

### `doc-split.html` — Split Map + Metrics Frame
**Format:** Letter landscape (11×8.5in)
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`, `{{WEBSITE_URL}}`, `{{SENDER_ADDRESS}}`, `{{DISCLAIMER}}`, **`{{MAP_IMAGE_URL}}`**

**Chart:** Left 50% = map placeholder (`div.map-image-target`) with `background-image: url('{{MAP_IMAGE_URL}}')` — inject a Mapbox static image URL at runtime. Right 50% = 4 metric rows with value, context line, and directional badge. Full-bleed `{{PRIMARY}}` top bar.

---

### `doc-hero.html` — Full-Frame Hero Stat Slide
**Format:** Letter landscape (11×8.5in) — single presentation slide
**Tokens used:** `{{PRIMARY}}`, `{{ACCENT}}`, `{{SURFACE}}`, `{{TEXT}}`, `{{FONT_FAMILY}}`, `{{BORDER_RADIUS}}`, `{{COMPANY_NAME}}`, `{{LOGO_URL}}`, `{{TAGLINE}}`

**Chart:** Full-slide `{{PRIMARY}}` background. `{{LOGO_URL}}` + `{{COMPANY_NAME}}` top-left. Giant number (112px, `{{TEXT}}` color for contrast). Accent divider line in `{{ACCENT}}`. Supporting context sentence. 4-column stats strip at bottom. Decorative tint rings use `rgba(255,255,255,0.05)`.

---

## File list

```
email-hbar.html       — Email: horizontal bar chart (6 rows)
email-compare.html    — Email: before/after period comparison (4 metrics)
email-hero.html       — Email: hero stat card (giant number + strip)
email-ranked.html     — Email: ranked top-5 list with opacity bars
email-table.html      — Email: 5×3 color-coded data table
doc-hbar.html         — PDF:   full-width bar chart (8 rows, portrait)
doc-donut.html        — PDF:   CSS conic-gradient donut (5 segments, landscape)
doc-sparkline.html    — PDF:   SVG trend area chart 12 months (landscape)
doc-split.html        — PDF:   split map + 4 metric rows (landscape)
doc-hero.html         — PDF:   hero stat presentation slide (landscape)
README.md             — this file
```

---

## Runtime replacement notes

1. All 13 standard tokens appear in every file except `{{MAP_IMAGE_URL}}` which is only in `doc-split.html`.
2. `{{SENDER_NAME}}` is available in all files but used primarily as metadata. It does not appear visually in the current templates — add it to email `From:` headers at the sending layer.
3. `{{TEXT}}` doubles as the light-on-dark text color in hero/dark-background contexts — supply white (`#ffffff`) or near-white as appropriate.
4. Multi-segment colors in `doc-donut.html` use CSS `color-mix()`. If your runtime environment does not support `color-mix()`, replace `--seg3`, `--seg4`, `--seg5` with explicit hex values derived from your brand colors before delivery.
