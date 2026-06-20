# HOMEPAGE — Handoff

**Status:** WIP. Demo approved → integrate into `components/landing/Hero.tsx`. Homepage NOT touched yet.

**Last session:** 2026-06-19

---

## What Was Built

A standalone choropleth map demo with clickable ZIP areas and a capabilities/comparison section below.

- **Live demo:** `c:\Users\ethan\Downloads\swfl-demo-wip.html` (1.17MB self-contained HTML)
- **Build script:** `HOMEPAGE/build_demo4.py` — run `python HOMEPAGE/build_demo4.py` to regenerate
- **Competitor research:** `HOMEPAGE/research_competitors.py` — crawl4ai scrape of Mailchimp/CC/FUB pricing

---

## SVG Source (contractor file — required to build)

`c:\Users\ethan\Downloads\Lee County and Collier County-01.svg` (1.14MB)

The build script reads this file directly. It is NOT in the repo (too large, binary Illustrator export).

**What the script does to it:**
- Strips `id="_33931"` underscore prefix → `id="33931"` (all 57 ZIPs)
- Strips embedded Illustrator `<style>` block (was white-background-only)
- Adds `class="zip-group"` to each ZIP `<g>` element for JS targeting
- Adds `id="contractor-map"` to root `<svg>`
- Coast layer (`#the_rest_of_the_coast`) forced to `fill: DEEP` via CSS
- County outlines (`#Lee_county`, `#Collier_County`) set to `fill:none; stroke: subtle`

**SVG structure:** 57 ZIP groups as `<g id="33931" class="zip-group">` containing 949 total `<path>` sub-elements (islands, peninsulas split). JS applies choropleth fills to all child paths.

---

## Demo Layout

```
NAV BAR
HERO — "Real Data. Instant Answers." + search bar + metric pills (Flood/Value/Permits)
MAP — [272px data rail | full choropleth map canvas]
STATS BAR — 4 highlight cells
CAPABILITIES SECTION — 4 cards + competitor comparison strip + CTA
```

---

## Capabilities Section — Approved Copy

4 cards, short:
1. **Ask anything. Get the answer.** — Any market question, any ZIP. Real numbers, right now.
2. **Describe it. AI builds it.** — Market summary, flood analysis, investment memo. Say what you need — it's ready.
3. **Add clients. AI tracks everything.** — Drop in properties or clients. AI monitors what changes and tells you first.
4. **Scheduled. Automatic. Just say when.** — "Email my clients every month." Done. AI writes it from live data, personalizes it for each client, and sends on schedule — forever. No workflow to build.

**Competitor comparison strip** (crawl4ai-sourced, real prices):
| | Feature | Price |
|---|---|---|
| Mailchimp | Email automation | $68+/mo, build it yourself |
| Constant Contact | Scheduled campaigns | $68/mo, manual workflow setup |
| Follow Up Boss | AI + automation for RE teams | $499/mo for 10 users |
| **SWFL Data Gulf** | **All of it — just ask** | **Included.** |

---

## Data in the Demo (hardcoded mock data — replace with live lake when integrating)

| Metric | Source | Notes |
|---|---|---|
| Flood risk | FEMA NFIP AAL | Annual avg loss per property |
| Home value | Zillow ZHVI Apr 2026 | Median by ZIP |
| New permits | Lee + Collier county | 2024 count |

All 57 ZIPs covered: 33 Lee County + 24 Collier County. Place names in `PLACE_NAMES` dict in `build_demo4.py`.

---

## Next Step: Integrate Into Homepage

When operator approves demo, make these changes to the repo:

### 1. `components/landing/Hero.tsx`
- Delete the entire `FloridaDataViz` function (lines 19–99)
- Replace the right-side `<motion.div>` (the float animation container) with the map section
- OR restructure to full-width below the headline — operator to decide layout

### 2. SVG handling
The contractor SVG is 1.14MB — too large to inline in JSX. Options:
- **a) Public asset** — copy cleaned SVG to `public/map/lee-collier.svg`, fetch + inject via `useEffect`
- **b) Component** — run the Python cleaning script once, save cleaned SVG as a React component (large file ~1.1MB but tree-shakeable)
- **c) Next.js dynamic import** — import as a string, dangerouslySetInnerHTML into a wrapper div

Recommended: option (a) — copy cleaned SVG to `public/`, `fetch('/map/lee-collier.svg')` in a `useEffect`, inject. Keeps the component clean.

### 3. Capabilities section
Build as `components/landing/Capabilities.tsx` — import on `app/page.tsx` below `<Hero />`.

### 4. Live data wiring
Replace hardcoded `FLOOD`/`VALUE`/`PERMITS` dicts with a fetch from `/api/b/master` or a dedicated `/api/homepage/map-data` endpoint that returns the same shape. This is a follow-on task after the visual integration.

---

## Gulf Color Tokens (from `app/globals.css`)

| Token | Hex |
|---|---|
| gulf-midnight | `#0a1419` |
| gulf-teal | `#0a8078` |
| mangrove | `#5bc97a` |
| sunset-coral | `#e08158` |
| neutral-gold | `#d4b370` |

---

## Files in This Folder

| File | Purpose |
|---|---|
| `demo-current.html` | **Current working demo** — use this until Fiverr delivers corrected SVG |
| `build_demo4.py` | Demo builder — run `python HOMEPAGE/build_demo4.py` to regenerate |
| `fix_33931.py` | Patches 33931 boundary from ZCTA (imperfect — Fiverr is the real fix) |
| `build_demo3.py` | Previous version (v2 demo, for reference) |
| `research_competitors.py` | crawl4ai scrape of Mailchimp/CC/FUB pricing |
| `HANDOFF.md` | This file |

### When Fiverr delivers the corrected SVG

1. Save it to `c:\Users\ethan\Downloads\` with the same filename (`Lee County and Collier County-01 (1).svg`)
2. Run `python HOMEPAGE/build_demo4.py`
3. Copy output to `HOMEPAGE/demo-current.html`
4. Verify 33931 shows as a thin barrier island
