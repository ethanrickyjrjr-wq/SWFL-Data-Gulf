# Email Lab — AI Design Research Findings
**Date:** 2026-06-28
**Status:** Research complete. Do NOT re-crawl these topics. Build from here.

---

## 1. The Mission

We are not building a drag-and-drop email builder. We are building an AI that impresses people with Adobe-quality emails and PDFs the moment they describe what they want — then lets them touch up anything they want after. The user describes: "Give me a luxury market report for Fort Myers with our new listing on Alico." Claude pulls real data from our lake, drops in real photos (via crawl4ai or uploaded URLs), builds a chart, lays it all out beautifully, and hands back a send-ready email. The user resizes one block, changes one headline, hits send. That is the product.

Data is NOT the constraint. Photos are NOT the constraint. We have four-lane sourcing, crawl4ai for hero images, and a lake full of numbers. The constraint is the render engine that takes all of it and makes it look like a designer spent two hours on it.

---

## 2. The Render Stack (What We're Going All-In On)

### react-grid-layout v2.2.3 — the drag-resize canvas

**Source:** https://github.com/react-grid-layout/react-grid-layout (22k stars, used by Grafana, Metabase, HubSpot, AWS)
**What it gives us:** A 12-column grid canvas where every block is draggable and resizable by the user OR by AI (it's just a layout array). The AI writes `[{i, x, y, w, h}]` and the grid renders exactly what was designed. The user drags to adjust.

Key config:
```ts
<ReactGridLayout
  width={600}
  cols={12}
  rowHeight={30}
  margin={[8, 8]}
  allowOverlap={false}               // set true for layering / grid-on-grid
  compactor={verticalCompactor}
  onLayoutChange={(layout) => dispatch({ type: 'LAYOUT_CHANGE', layout })}
  draggableHandle=".drag-handle"
  resizeHandles={['se', 'sw', 'ne', 'nw']}
/>
```

Aspect ratio lock on resize:
```ts
onResize={(layout, oldItem, newItem) => {
  const block = blocks.find(b => b.i === newItem.i)
  if (block?.type === 'photo' && block.aspectRatio) {
    newItem.h = Math.round(newItem.w * block.aspectRatio)
  }
}}
```

Grid-on-grid (layering): set `allowOverlap={true}` on the outer canvas. A block with `type: 'grid'` contains its own `Block[]` children and renders a nested `ReactGridLayout` at fixed width = parent block's pixel width.

### Craft.js — editor state and undo/redo

**Source:** https://craft.js.org (verified docs)
**What it gives us:** A component editor framework with a serializable node tree, undo/redo history, and a selection/editing system. Every block in the email is a Craft.js node. Claude writes JSON; Craft.js renders it. User makes a change; Craft.js records it in history. Every design decision is a named, typed parameter — exactly how Graphite's node system works.

Craft.js node tree maps directly to our Block schema. No need to invent undo/redo from scratch.

### Photopea — in-browser raster photo editor

**Source:** https://www.photopea.com/api/ (verified)
**Cost:** Free. No API key. No signup. Embeds via iframe URL config.
**What it gives us:** Full Photoshop-equivalent editing embedded in a modal. The user clicks "Edit photo" on any image block → Photopea opens with that image pre-loaded, cropped to block dimensions → user edits → clicks save → our `/api/email-lab/save-photo` endpoint receives the binary → stores in Supabase email-media bucket → photo block updates.

Embed config:
```js
const config = {
  files: [photoUrl],
  server: {
    version: 1,
    url: "https://swfldatagulf.com/api/email-lab/save-photo",
    formats: ["png", "jpg:0.9"]
  },
  environment: { theme: "dark" },
  script: `app.activeDocument.resizeCanvas(${blockPxW}, ${blockPxH}, AnchorPosition.MIDDLECENTER);`
}
const src = `https://www.photopea.com#${encodeURIComponent(JSON.stringify(config))}`
```

Save endpoint note: Photopea sends binary POST. First 2000 bytes = JSON metadata, rest = image bytes. Extract via `Buffer.slice(2000)`.

### react-email — the email compiler

**Already in our stack.** `Section`, `Row`, `Column`, `Img`, `Link`, `Text` — these compile Block[] to table-based HTML that renders in every email client. The editor canvas is CSS/flex (for the user experience); the output is always table HTML (for email clients).

**MJML** was evaluated but rejected. react-email is already in the stack, has the same semantic model (mj-section = Section, mj-column = Column), and doesn't require a separate compile step or external binary.

### Resend — send + click/open tracking

**Already wired.** The `email_events` table, open pixel route (`/api/t/o/`), click redirect route (`/api/t/c/`), and `withClickTracking` / `withTrackingPixel` helpers are all specified in `2026-06-28-email-lab-full-upgrade.md` Task 9. Tracking is free with Resend on existing plan.

---

## 3. The Block Schema (the injectable template format)

This is the core data structure. Claude writes it. The user edits it via drag-resize-click. The compiler turns it into send-ready HTML.

```ts
// lib/email/grid-schema.ts  (to be created)
export type BlockType = 'photo' | 'text' | 'chart' | 'grid' | 'stats' | 'button' | 'divider' | 'two-col'

export interface Block {
  i: string            // unique id
  x: number            // grid col (0-11)
  y: number            // grid row
  w: number            // col span
  h: number            // row span
  type: BlockType
  // photo / image
  src?: string         // public URL — from Supabase email-media, crawl4ai, or user URL
  alt?: string
  caption?: string
  kind?: 'photo' | 'chart'   // coexistence tag (inject-chart.ts uses this)
  aspectRatio?: number // h/w — locks resize proportions
  // text
  text?: string        // body copy; accepts {{merge_tags}}
  align?: 'left' | 'center' | 'right'
  // click tracking
  linkUrl?: string
  linkTrackId?: string // injected at blast time; never stored in template
  // style overrides
  paddingY?: 'none' | 'sm' | 'md' | 'lg'
  sectionBg?: string   // hex
  zIndex?: number      // for allowOverlap mode
  // chart (reuses photo slot with kind:'chart')
  chartSpec?: object   // recharts/vega-lite spec
  // nested grid
  children?: Block[]   // only when type === 'grid'
}

export interface EmailTemplate {
  templateId: string
  label: string
  blocks: Block[]
}
```

Claude never writes `linkTrackId` (blast-time injection only). Claude never writes `kind` directly (set by inject-photo.ts and inject-chart.ts). Everything else Claude can write.

---

## 4. Graphite — Why We're All-In

**Source:** https://graphite.art (verified), https://github.com/GraphiteEditor/Graphite (verified), https://graphite.art/learn (node catalog verified)
**Cost:** Free, open source (Apache 2.0)
**Status:** Alpha 4. Active development. GSoC participant. Quarterly progress reports.

### What Graphite Actually Is

Graphite is a procedural vector editor built on WebAssembly/Rust. Every design decision is a node in a graph. "Make the header 48px bold Inter" is a node chain: `Read String` → `Apply Font` → `Text` → `Render`. The node catalog includes:

- **Read Attribute nodes:** String, Number, Color, Gradient, Vector, Raster, Bool, Transform, Blend Mode
- **Write Attribute nodes:** Attach Attribute, Write Attribute
- **Context nodes:** Read String, Read Index, Read Graphic, Read Position, Read Raster, Read Color, Read Gradient, Read Vector
- **Logic nodes:** Switch, Equals, Greater Than, Less Than, Logical And/Or/Not
- **Math nodes:** Add, Subtract, Multiply, Divide, Remap, Clamp, Min, Max, Modulo, etc.
- **General nodes:** Map, Mirror, Count Elements, Extract Element, Index Elements, Flatten, To Graphic, Wrap Graphic
- **Debug nodes:** Log to Console, Sample Image, Serialize, As String, Clone, Empty Image, Quantize

This is a Turing-complete procedural design system. A "Luxury Market Report" designed in Graphite is literally a program: it takes parameters and produces a visual output.

### Why Graphite is NOT the runtime today

There is no "Load JSON from URL" node. No "HTTP Request" node. No documented external data injection API. The document format is not yet stable (Alpha 4 goal is stable format). The roadmap item "Compile standalone programs from node systems" — what would let us call a Graphite document with our lake data and get rendered SVG back — is listed as future, not Beta 1.

ETA for Graphite as a live template engine: 12-18 months at their development pace.

### Why We Go All-In Anyway

**Design tool role (right now):** Graphite is the best free tool for designing the visual templates that become our Block[] JSON. Open Graphite, design a gorgeous newsletter layout with precise photo proportions, type hierarchy, color relationships, visual weight distributions. The node system lets you iterate on these rapidly — change font → all instances update, change grid gap → everything reflows. Screenshot or export SVG as the visual spec. Translate that spec into our template JSON.

**The mental model is identical:** Craft.js nodes in the editor = Graphite nodes in the design tool. Both represent "a typed component with parameters that renders to output." Claude operating on our Block[] JSON is doing exactly what Graphite's procedural system does, just with our data. We're not waiting for Graphite — we're already building the same concept in our stack.

**Future integration path:** When Graphite ships "Standalone program export" and "External data injection," we can expose a Graphite document as a template: call it with our lake data, get back a rendered SVG header or full layout. The SVG slots directly into the email-media bucket. Our Block schema stays the same.

**SVG assets today:** Graphite exports clean SVG now. The workflow: design brand header, dividers, property layout diagrams, chart backgrounds in Graphite → export SVG → upload to Supabase email-media → drop into photo blocks. SVG renders pixel-perfect in Gmail, Apple Mail, Outlook.com. Legacy Outlook desktop (2019 and earlier) needs PNG fallback, which is where Inkscape headless comes in.

---

## 5. Inkscape — Headless SVG Processing

**Source:** https://gitlab.com/inkscape/inkscape (verified)
**Cost:** Free, open source
**Status:** v1.x, stable, mature

### The --pipe flag (serverless analog)

```bash
inkscape --pipe --export-type=png --export-dpi=144 < input.svg > output.png
```

Any process that writes SVG to stdin and reads PNG from a file can use Inkscape as a pure conversion engine, completely headless. The `--actions` flag chains operations without GUI:

```bash
inkscape --pipe --actions="export-type:png;export-dpi:192;export-do" < hero.svg > hero@2x.png
```

### Python extensions (the injection path)

Inkscape has a full Python extensions system: `.py` files that hook into Inkscape's SVG document model. An extension can:
- Read a Block[] JSON file
- Walk the SVG tree, find elements by `id` attribute
- Replace `text` content nodes with real data values
- Replace `image` `href` attributes with real photo URLs
- Apply transforms, colors, effects
- Write the modified SVG back

This is the path to "give Inkscape a Block[] JSON → get a rendered email SVG layout back." The extension documentation lives at https://inkscape.gitlab.io/extensions/documentation/

### Where it runs

Inkscape cannot run in Vercel Functions (no desktop binaries in serverless). It runs in:
- **GHA runners** (already used for cron) — add an Inkscape step to convert SVG → PNG for Outlook fallback, or to batch-render template previews
- **Local development** — instant preview of any template design

### Where it does NOT replace Photopea

Photopea: raster photo editing, embeds in browser iframe TODAY, Photoshop-quality, free. This is the in-browser editor. Inkscape: vector/SVG work, headless server-side batch conversion. They solve different problems. Don't conflate them.

---

## 6. crawl4ai for Photos

**Already proven in our stack.** `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` with `UndetectedAdapter` works on home IP.

Photos are not the constraint. Here's what we can pull automatically with one URL:

1. `og:image` from any website (already built in `lib/email/og-image.ts`) — listing pages, brand sites, any URL the user mentions in their prompt
2. Full page screenshot via crawl4ai — any website that blocks og:image bots
3. MLS photos — RESO Media standard, built into listing brain (next layer)
4. Street view via Mapbox Static API — any address in SWFL
5. Aerial/satellite via Mapbox Static API — any property

When Claude builds an email and encounters a listing URL or a brand website URL in the prompt, it calls `upsertHeroPhoto()` (already built in `inject-photo.ts`) which pulls og:image → stores in email-media bucket → drops into the email. The user doesn't upload anything. The email already has a real photo when they see the preview.

For photos beyond og:image — aerial shots, neighborhood photos, property interiors — crawl4ai's `UndetectedAdapter` can pull from RESO-compliant image galleries, Zillow listing image arrays (when accessible), or any public photo URL.

---

## 7. The AI Template System (Our Injectable Templates)

We do not wait for Graphite to ship external data injection. Our Block schema is already the injectable template format.

A template lives in Supabase as a JSON blob:
```json
{
  "templateId": "luxury-market-report",
  "label": "Luxury Market Report",
  "blocks": [
    { "i": "hero", "x": 0, "y": 0, "w": 12, "h": 6, "type": "photo", "kind": "photo", "aspectRatio": 1.777 },
    { "i": "headline", "x": 0, "y": 6, "w": 8, "h": 2, "type": "text", "text": "{{headline}}" },
    { "i": "median-price", "x": 8, "y": 6, "w": 4, "h": 2, "type": "stats" },
    { "i": "price-chart", "x": 0, "y": 8, "w": 12, "h": 5, "type": "photo", "kind": "chart" },
    { "i": "listings", "x": 0, "y": 13, "w": 12, "h": 8, "type": "two-col" }
  ]
}
```

Claude receives: template + user intent ("luxury market report for 34102").

Claude's two roles:
1. **Template author** — writes Block[] JSON for beautiful templates, stored in Supabase. Does this once per template type.
2. **Data injector** — fills `src`, `text`, `chartSpec`, `stats` from our lake. Does this every time a user generates.

The user sees a fully populated email. They drag one block, change one headline, hit send. The templates are the "Graphite designs" translated into JSON. The node concept is preserved: every block is a typed node with parameters. Claude operates on the parameter layer, never the rendered HTML.

### Three priority templates

Based on our current lake coverage:

**Luxury Market Report** — hero photo (og:image from brand site or crawl4ai), headline (AI-generated from lake data), median sale price stats (LeePA/realtor.com), 12-month price chart (realtor.com History CSVs), two-col listing grid (MLS photos from RESO).

**New Listing Announcement** — hero photo (RESO Media / og:image), property address + price (LeePA), three stats (bed/bath/sqft from LeePA), one-paragraph AI commentary, CTA button → listing page.

**Weekly Market Pulse** — header graphic (Graphite SVG exported), three stats blocks (employment from LAUS, ACS population, permit count), two charts (price trend + permit activity), ZIP comparison table.

---

## 8. Tools Evaluated — Do Not Re-Evaluate

### REJECTED / Not Relevant

**GIMP** — desktop-only, no web API, no iframe embed. Nothing to integrate.

**Twilio/SendGrid** — competitor email delivery. We use Resend. Do not re-propose.

**Beefree SDK** — paid proprietary, replaces everything we're building with a vendor lock-in. Rejected.

**MJML** — same capability as react-email (already in stack) but requires separate binary. Adds complexity for zero gain.

**Easy Email (github zalahasa/etc)** — multiple 404s during research; repo names did not resolve. Unverified and unmaintained.

**Litmus/EmailOnAcid** — email testing services (paid). Not a builder. Multiple doc pages returned 404 during research.

### VERIFIED / In Stack or Ready to Use

**react-grid-layout v2.2.3** ✅ — drag-resize canvas. 12-col, row-height, aspect lock, allowOverlap for layering.

**Craft.js** ✅ — editor state, node tree, undo/redo. Serializable JSON state maps to Block[].

**Photopea** ✅ — free, no key, iframe embed, full Photoshop. `photopea.com/api/` docs verified live.

**react-email** ✅ — already in stack. `Row/Column/Section/Img/Link` → table HTML.

**Resend** ✅ — already wired. Tracking pixel + click redirect specified in full-upgrade spec Task 9.

**crawl4ai** ✅ — already proven on home IP with UndetectedAdapter.

**Graphite** ✅ (design tool only, runtime in 12-18mo) — procedural vector, exports SVG, free, Apache 2.0.

**Inkscape CLI** ✅ (GHA only, not Vercel) — `--pipe`, `--actions`, Python extensions for SVG injection.

---

## 9. Why This Wins

The moat is not the email builder. Every SaaS has one. The moat is that our email already has real data in it before the user touches anything.

When a broker opens the email lab and says "make me a market report for Bonita Springs," they do not fill a form. They do not search for data. They do not upload a photo. They type one sentence. Claude pulls median sale price from LeePA, permit activity from our permit brain, employment trend from LAUS, og:image from the broker's brand site, and builds a pixel-perfect 600px email with a chart, a stats row, a hero photo, and the broker's colors — in under 5 seconds. The broker drags the hero photo to make it taller, changes the headline, hits send.

That is a 10-minute workflow compressed to 45 seconds. No other tool does that because no other tool has the data lake + AI + email renderer wired together with four-lane sourcing.

The visual quality comes from two things: react-grid-layout keeping everything snapped and proportioned, and our block library having beautiful typography and spacing (the aesthetic upgrades in Task 5 of the full-upgrade spec). We are not building a Figma killer. We are building the most beautiful possible output from a data-first email system.

crawl4ai gives us any photo from any website. Graphite gives us designer-quality SVG assets for headers and dividers. Photopea gives users photo editing when they need it. react-email ensures every email renders correctly in Gmail, Apple Mail, Outlook. Resend tells us who opened it and what they clicked.

The only thing left to build is the grid canvas that ties it together.

---

## 10. What to Build Next (in order)

1. `lib/email/grid-schema.ts` — Block type definitions (above)
2. `components/email-lab/GridCanvas.tsx` — react-grid-layout wrapper, 12-col, aspect-lock on resize, allowOverlap toggle
3. `lib/email/compile-grid.ts` — `Block[] → react-email JSX → HTML string` (handles nested grids recursively)
4. Per-block toolbar — drag handle (`.drag-handle`), resize corners, AI button (fires per-block prompt), delete, Photopea trigger for photo blocks
5. `app/api/email-lab/ai/route.ts` — update to accept/return `Block[]` in addition to current doc format
6. `app/api/email-lab/save-photo/route.ts` — Photopea binary POST receiver → Supabase email-media
7. Template library in Supabase — three seed templates (luxury, listing, pulse)
8. crawl4ai integration in build-doc.ts — fallback beyond og:image for richer hero photos

The specs in `2026-06-28-email-lab-full-upgrade.md` (Tasks 1-9) are a prerequisite for the block canvas; ship those first, then build the grid layer on top.
