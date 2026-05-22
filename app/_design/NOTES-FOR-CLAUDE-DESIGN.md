# Notes for Claude Design

Two notes blocks below. Paste **one** into Claude Design's "Other notes
at the bottom" textarea, depending on how much room that field gives
you. The short version is the priority paste.

The long version is canonical context for the project — but if Claude
Design has GitHub access to this repo, the deeper rule docs in
`app/_design/` cover that material in more depth. The notes textarea
should carry the gestalt, not the full spec.

---

## Short version (paste this — ~120 words)

We build **SWFL Data Lake**, an analyst-grade data product for
Southwest Florida. Color: deep gulf-midnight backgrounds, gulf-teal
accent (the real water off Naples — saturated, never neon), mangrove
green for bullish signals, sunset coral for bearish. Off-white text,
never clinical white. Sharp display type (Inter Display weight 600,
tracking -2%), body in Inter, tabular figures on every number.
**Motion personality:** surfacing from deep water. Spring physics that
settle cleanly — no bounce, no elastic, no decorative loops. Every
animation must earn its place by revealing data, never gating it. Voice
is confident and sourced — quantify, don't characterize; lowercase
verdicts; plain-English errors; no marketing fluff. Borders, not drop
shadows. Tables align via tabular numerics. When in doubt, cut the
animation and show the number.

---

## Long version (paste only if the field allows it)

**SWFL Data Lake** is an analyst-grade real-time data product covering
Lee, Collier, and Charlotte counties in Southwest Florida — housing,
CRE, building permits, traffic, tourism, hurricane risk, logistics,
and the macro context behind them. Every number cites a source. Nothing
is invented. The audience is analysts, investors, developers, and
smart locals who want real answers, not vibes.

**Aesthetic:** surfacing from deep water. Deep gulf-midnight palette,
not beach pastels. Gulf-teal accent for primary actions, mangrove
green for bullish, sunset coral for bearish, neutral gold for mixed.
Off-white text, never clinical white. Sharp financial-adjacent display
type. Borders, not drop shadows. Tables align via tabular figures.

**Motion:** spring physics that settle cleanly — never bounce, never
elastic, never decorative loops. Every animation must answer "what
insight does this reveal?" If you can't, cut it. The signature move is
one clean spring-reveal of the verdict, then stillness. Three contexts
modulate the budget: in-chat MCP widget gets ≤ 300ms (≤ 600ms in
explicit impress mode), web report pages get full send with maps and
3D when earned, the /connect landing page goes high to stop people
mid-scroll. Universal rule across all three: animation reveals data,
it does not gate it — the number is in the DOM from page load.

**Voice:** confident, sourced, surgical. Quantify, don't characterize
("permits down 12% YoY," not "trending lower"). Lowercase verdicts
("bullish," not "Bullish"). Cite the source by name. Errors are plain
English, not error codes. No marketing fluff, no hedging, no apology
copy.

**Hard constraints:** every motion must be toggleable via a persistent
`animations: on/off` preference; respect `prefers-reduced-motion:
reduce` unconditionally; lazy-load any heavy library (Mapbox, Three.js)
so first paint never blocks on it.

**Inspiration to study (not copy):** meteo.ashwyn.studio for the dark

- teal data aesthetic, Pudding for editorial big-type confidence,
  Linear for SaaS polish discipline, nodal.gg for depth and discovery
  feel. Avoid: government data portals, tourist brochures, stock-chart
  red/green clichés, generic SaaS admin dashboards.

**Brand name:** working name only — the codebase uses `%%APP%%` as a
placeholder until the real name is decided. Don't render the
placeholder; use "SWFL Data Lake" or omit the brand mark entirely
until the name lands.
