# Lane 05 — Chart renders behind/through headline stat numbers

Symptom: built email showed a decorative chart/donut shape rendering behind and overlapping
the headline stat numbers ("$355,385 453 $277,495" all smashed together), garbled.

## Checked / ruled out

- **StatsBlock.tsx** — no absolute/z-index. Pure flow. Strip variant lays cells as
  inline-block `max-width:cellPx`. Could smash cells if cellPx small, but does NOT draw a
  chart behind. (That's a StatsBlock sizing lane, not chart-overlap.)
- **MetricCardBlock.tsx** — meter bar is a 2-cell table below the value. No overlap, no chart bg.
- **SignalBlock.tsx / HeroBlock.tsx** — no chart/decoration behind numbers.
- **ImageBlock.tsx** — HAS an overlay mode (`backgroundImage: url` + text on top) at line 47-114.
  This is the ONLY email block that renders a picture BEHIND text. overlayTitle/overlayBody over
  a CSS background-image. If a chart PNG becomes the background-image of an overlay image block,
  text renders on top of the chart shape. NEEDS FOLLOW-UP: can the AI content-patch set
  overlayTitle/overlayBody on a kind:"chart" image block?
- **compile-grid.ts** (grid tier email HTML) — pure band-overlap → ghost COLUMNS (side-by-side
  inline-blocks). Two w=12 blocks in same band wrap (stack), never z-overlap. Cannot produce
  "behind/through".
- **row-grouping.ts** — band overlap grouping; no z-index.
- **GridCanvas.tsx** — react-grid-layout v2 with `verticalCompactor`; each GridBlock is
  `overflow-hidden`. Compactor resolves overlaps. BUT `buildLayout` (line 85) mixes a fresh
  `cursorY=0` for no-layout blocks with stored positions of layout-carrying blocks — a no-layout
  chart image gets y=0 and initially collides at the top with positioned blocks (compactor then
  resolves). Possible transient overlap, not obviously the persistent garble.
- **Chart SVG builders** (spec-to-image.ts dispatch): spark-grid, donut-share, z-gauge, ranked-delta
  — ALL lay values/labels in dedicated non-overlapping regions. spark sparkline is BELOW value;
  donut center total is a single number; z-gauge value above the bar. None smash 3 numbers behind
  a shape. Chart is rasterized to a hosted PNG and placed as a plain `<Img>` in an ImageBlock.

## Leading hypothesis (REVISED — first one falsified)
- FALSIFIED: chartImageBlock() (inject-chart.ts:19) only sets url/alt/kind:"chart"/caption/linkUrl.
  NEVER overlayTitle/overlayBody. upsertChartBlock replaces props wholesale. So a chart image is
  ALWAYS a plain `<Img>` in flow — never an overlay-background. ImageBlock-overlay hypothesis dead.
- FALSIFIED: react-grid-layout@2.2.3 `verticalCompactor.compact` (chunk-55DQUWLA.js:406) DOES resolve
  pre-existing collisions (compactItemVertical → resolveCompactionCollision loop, l.380-382). So even
  though buildLayout (GridCanvas.tsx:85) assigns a no-layout chart block `y=cursorY` starting at 0
  (colliding with positioned blocks near y=0), the compactor pushes it clear. No persistent canvas
  overlap from that alone.

## Where I am
Every obvious surface ruled out for a PERSISTENT z-index/behind-text overlap:
- Email HTML (EmailDocRenderer + compile-grid): pure vertical flow / ghost COLUMNS that wrap-stack.
- Chart SVG builders (spark-grid/donut/z-gauge/ranked-delta): values in dedicated non-overlapping
  regions; rasterized to a plain PNG.
- Canvas (GridCanvas + RGL verticalCompactor): compacts, resolves collisions.

## RESOLVED — there is NO chart-behind-text layering bug in this lane

Read the remaining builders + the seed doc (the inputs I'd deferred):
- **ranked-delta.ts / barChartSvg / trendChartSvg / spark-grid / donut-share / z-gauge / composition**
  — all FIXED-COORDINATE `<text>`; label/value regions never overlap the shape. The reported
  "bar chart ranking OTHER ZIPs" is ranked-delta (bindRankedDeltaSpec wins first,
  chart-for-question.ts:125) — clean horizontal bars, values in a separate x-band.
- **bklitTrendSvg / bklitComposedSvg** (components/charts/vendor/bklit/email-svg.tsx) — the ONLY
  recharts-auto-layout builders. BUT they render NO per-point data value labels (no `<XAxis>`, no
  value `<text>`) — only the plotted area/bars + a fixed-coordinate title/caption. So they
  physically cannot emit the "$355,385 453 $277,495" text. Not the source.
- Chart is ALWAYS a plain in-flow `<Img>` PNG: chartImageBlock (inject-chart.ts:19) sets only
  url/alt/kind/caption/linkUrl — NEVER overlayTitle/overlayBody. ImageBlock renders `<Img>`, not the
  overlay background path. Grep-verified: the ONLY block with `backgroundImage` is ImageBlock's
  overlay mode, which a chart image never enters.
- Email HTML = pure vertical flow (EmailDocRenderer / compile-grid ghost COLUMNS that wrap-stack).
- Canvas = RGL 2.2.3 `useGridLayout` compacts propsLayout on mount (chunk-7MZZ6T4J.js:77-80) AND on
  every propsLayout change (l.104-109); verticalCompactor resolves pre-existing collisions
  (chunk-55DQUWLA.js:406, 380-382). No persistent z-overlap possible.

### The two perceived symptoms, actual causes
1. "$355,385 453 $277,495 smashed together" = StatsBlock's OWN documented width-overflow
   (StatsBlock.tsx header lines 1-5: an unbreakable 32px value forces the HTML table past
   width:100%, cells crush). CROSS-LANE — the StatsBlock sizing lane owns it, not chart-overlap.
2. "decorative chart shape behind the numbers" = the seed places the CHART SLOT `image` block
   (default-docs.ts:276) DIRECTLY BELOW the 3-cell stats block (default-docs.ts:268), full-width.
   upsertChartBlock replaces that slot in place, preserving its position. In the built email the
   chart PNG sits immediately UNDER the crushed stat row — read as "behind," but it is adjacent
   in-flow, never layered.

CONCLUSION: no z-index/absolute/sizing bug in the chart-rendering path. There is nothing to fix in
"chart layered over stats" — that component does not exist. The real defect that needs a fix is the
StatsBlock width-overflow smash (separate lane).
