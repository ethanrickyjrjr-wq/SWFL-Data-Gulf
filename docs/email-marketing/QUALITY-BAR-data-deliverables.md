# QUALITY BAR — Incredible Data-Grounded Email / PDF / Deliverable

> **Recommended model:** ⚡ Sonnet

> The design target for the deliverable engine. Sourced live 06/26/2026 (crawl4ai — Litmus, Beefree, Redfin Data Center, Datawrapper, Really Good Emails). Supersedes the ZIP-first framing in `README.md`.
> **Root cause of the "pencil-drawn graph":** email runs no JS, so a chart must be a pre-rendered static image. The fix is to render it server-side at 2x and size down — real gridlines, direct end-of-line labels, a source/as-of caption — NOT a hand-thrown SVG polyline. (`lib/email/chart-image.ts` is the polyline; that is the file to rewrite to this bar.)

## A. Section anatomy (7 sections, in order)

1. **Masthead / issue strip** — proves it's a recurring report. Report name, edition ("Lee County · Weekly"), as-of stated ONCE as MM/DD/YYYY. e.g. `Lee County Housing Brief — week ending 06/26/2026`.
2. **The Read / TL;DR** — the single market call, above the fold (first 250–400px). 1–2 lead metrics + the directional thesis. e.g. `Buyers kept the upper hand this week. The typical home took 58 days to sell — nine days slower than a year ago — and one in three listings cut its price before going under contract.`
3. **Metric grid / scorecard** — 4–6 KPI callouts (big number + period-over-period delta + up/down glyph). From Redfin's taxonomy: median sale price, days on market, active inventory / months of supply, sale-to-list, price-drop share, new listings. e.g. `Median sale price $485,000 — up 2.1% vs last month, down 1.4% vs a year ago.`
4. **Featured chart + read** — ONE primary time series (12–24 mo) with a grey comparison line. Caption under the chart states the read: `Days on market has climbed every month since spring, back to where it sat in early 2023.`
5. **Analyst commentary / "What it means"** — the differentiator. 2–3 short paragraphs connecting metrics into cause/effect; any forward call marked `[INFERENCE]` + a falsifier.
6. **Drill-down module (optional, repeatable)** — one geography/segment in focus (any level: a corridor, a city, luxury vs starter, a ZIP). Small comparison table or a second compact chart.
7. **Sources + footer** — collapsed sources list (never inline), methodology link, physical address, visible unsubscribe (CAN-SPAM).

## B. Visual hierarchy (reads pro, not pencil)

- **Frame:** 600px content width (never exceed ~680). Total height 1500–2000px ideal, 3000 max. Under 102KB (Gmail clips). 60/40 text-to-image.
- **Type scale:** body 14–16px; section headers 18–22px; one hero KPI 32–40px. System font stack; web fonts are progressive enhancement only.
- **Color:** ONE brand accent for the primary series + CTAs; everything contextual in grey. Avoid pure/bright saturated colors; slightly desaturated (not pure-white) background.
- **Metric callout:** label small grey caps; value large bold; delta on its own line, colored with a triangle glyph; never hedge a hard number.
- **THE CHART (Bloomberg/Redfin, not a sketch):** static raster/vector rendered server-side at 2x; line/area for trends, columns for a few discrete periods (don't force a line on 4 points); thin light-grey horizontal gridlines only; Y labels in unit ($485K, 58 days, 34%), 4–5 ticks; one hero series in accent + grey context/prior-year line; **direct end-of-line labels, not a legend**; light area fill at low opacity; **projection/[INFERENCE] region = a shaded highlight band with a dashed line**; honest interpolation; caption `Source · as-of MM/DD/YYYY`; always an ALT-text fallback.

## C. The analysis bar (average → pro)

Formula: **number → comparison (vs last period AND/OR vs a year ago) → what it means → forward call marked `[INFERENCE]` with a base value + one falsifier → as-of MM/DD/YYYY.** Plain English, no internal counts, no jargon.

- BEFORE: "The average days on market is 58."
- AFTER: "Homes are taking 58 days to sell — nine days longer than a year ago and the slowest pace since early 2023. Buyers have time to negotiate again. [INFERENCE] If inventory keeps building, expect days-on-market past 65 by late summer; breaks if mortgage rates drop below 6%. (as-of 06/26/2026)"

- BEFORE: "Median price is $485,000, up from last month."
- AFTER: "The typical home sold for $485,000, up 2.1% from last month but still 1.4% below a year ago — a small bounce inside a flat year, not a turnaround. The lift is in move-in-ready listings; older inventory is still cutting prices. [INFERENCE] Year-over-year stays negative through Q3 unless the price-drop share falls below 30%. (as-of 06/26/2026)"

The tell of "average" is a number with no comparison and no consequence. "Pro" anchors every number to a baseline and ends in a "so what."

## D. Email technical constraints that drive design

- No JavaScript — charts/interactivity are pre-rendered images or pure HTML/CSS.
- Table-based layout + MSO conditionals for Outlook (Word engine; no flexbox/grid).
- ~600px single column; metric grids collapse to one column on mobile; buttons min 44×44px.
- Image-blocked fallback: never image-only; every chart/number also lives as HTML text or ALT text. Under 102KB.
- Dark mode (~1/3 of opens): chart images on transparent/dark-safe background; avoid pure black/white.
- Modular blocks: each section is a reusable module the engine assembles — also how it stays self-updating without re-designing each send.

## E. Sources (crawl4ai, 06/26/2026)

Litmus email-design best-practices; Beefree template-size + newsletter guides; Redfin Data Center metric taxonomy; Datawrapper line-chart + color academy (load-bearing for the chart treatment); Really Good Emails real-estate + newsletter galleries. Full URL list + CONFIRMED/UNREACHABLE status in the research transcript; raw captures in the session scratchpad.
