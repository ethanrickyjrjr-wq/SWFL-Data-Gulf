# /charts Rebuild — 2026-06-13 (handoff)

Everything that happened in the charts work this session, in one place. The
forward-looking *rules* live in `app/_design/07-charts-and-dataviz.md`; this
file is the *story* — what broke, what we did, what's still open.

Commits: **`d563f21`** (fix + rebrand + airport + standard) and **`002189f`**
(filled-area variant + air-travel label). Both on `main`, both deployed green.

---

## TL;DR

`/charts` was crashing the production build (`main` red across multiple
deploys). Root cause: a single React Server Component boundary violation. We
fixed it, rebranded the charts to the gulf palette, restored the filled-area
look the operator liked on the home-value chart, added a third chart (regional
air travel), and wrote a durable chart standard. Live and verified on
`https://www.swfldatagulf.com/charts`.

---

## What broke — and why no test caught it

The earlier `/charts` push (`8b55fa6`) passed a **`formatValue` function** as a
prop from the Server Component page (`app/charts/page.tsx`) into the
`"use client"` chart component. **Functions can't be serialized across the
RSC boundary**, so `next build` aborted at the static-prerender step:

```
Error: Functions cannot be passed directly to Client Components ...
Export encountered an error on /charts/page: /charts, exiting the build.
```

The trap: `tsc`, ESLint, and `bun test` **all pass this bug** — a function prop
is valid TypeScript, and unit tests don't prerender the page. Only `next build`
(or `vercel build`) catches it. So it shipped "green" and broke at deploy.

Timeline:

| Commit | What | Deploy |
| --- | --- | --- |
| `8b55fa6` | chart connected (the bug) | ERROR |
| `f8d19e4` / `a973e1b` | later pushes | ERROR (same break) |
| `e731a05` | pre-chart build | the READY build prod kept serving |

So the site stayed up (200) on the *old* build while every new deploy failed —
which is why "the chart isn't there" and "Vercel is down (red)" were both true
at once.

---

## The fix

Replace the function prop with a **serializable token**. `valueFormat: "usd" |
"rent" | "count"` is passed from the page; the formatter is resolved *inside*
the client component via the new pure module `lib/charts/format.ts`. Nothing
un-serializable crosses the boundary. This is now documented as a hard rule in
`07-charts-and-dataviz.md` §6 so it can't recur.

---

## The rebrand (no jargon, on-brand color)

- **Gulf palette** — series colors are now `--gulf-teal #3dc9c0` (Cape Coral),
  `--mangrove #5bc97a` (Fort Myers), `--neutral-gold #d4b370` (Naples); surfaces
  `#0f1d24` / `#22414f`. (Was off-brand Tailwind slate + amber/sky/purple.)
- **Colorblind double-encoding** — those three gulf colors are near-iso-luminant,
  so for red-green colorblind readers they collapse together (verified by
  dichromat simulation; WCAG 1.4.1 "don't rely on color alone"). Mitigation: the
  line charts use per-series dash patterns + a labeled interactive legend.
- **No company names / jargon** — "Zillow ZHVI/ZORI" → "Typical home value" /
  "Typical monthly rent". Page H1 "Southwest Florida — Market Trends".
- **Fixture badge removed** — the `"SWFL fixture sample"` default is gone; the
  demo/embed surfaces now pass an explicit `asOfNote="Sample data"`, and `/charts`
  shows a real, dynamic `as of <month>` from the query result (no hardcoded date).
- **Filled-area variant restored** (`002189f`) — the operator liked the original
  filled-gradient look. `MetroAreaChart` now takes `variant="line" | "area"`; the
  home-value chart uses `area` (gulf gradients), rent + air-travel stay lines.
  Charts need not all match.

---

## Research (Firecrawl, cited)

Three parallel research agents pulled best practices from authoritative sources
(FT Visual Vocabulary, Datawrapper Academy, Storytelling with Data, Our World in
Data, Nielsen Norman Group, USWDS, GOV.UK, WCAG 2.2). Findings drove the
standard doc. Headline conclusions:

- Line is the default for monthly time series; filled area is a *deliberate*
  stylistic choice, not the norm.
- The locked gulf series colors **pass** contrast against the dark background but
  **fail** colorblind distinguishability from each other → redundant encoding is
  mandatory.
- IA: hub-and-spoke — a central `/charts` hub + contextual charts on topic pages
  later, with a global "Charts" nav link. (See "Held" below.)

---

## What's live on `/charts`

| Chart | Source | Shape | Style |
| --- | --- | --- | --- |
| Typical home value | `data_lake.zhvi_pivoted` | 3 metros | filled area |
| Typical monthly rent | `data_lake.zori_pivoted` | 3 metros | line |
| Air travel through the region | `public.rsw_airport_monthly` | single line | line |

All three are brain-backed (the airport panel reads the same table as
`refinery/packs/rsw-airport.mts`, a master input) and config-driven (add a chart
= one `PANELS[]`-style row + a series preset).

---

## Air travel = departures only (read this before "add arrivals")

The airport panel plots **enplanements = passengers *boarding*** (departures).
That is the **only** metric in `rsw_airport_monthly` — it is **not** arrivals +
departures. We do **not** hold deplanement (arrival) data.

To show arrivals separately is a **data/ingest task, not a chart change**:
1. Verify the Lee County Port Authority source actually publishes deplanements.
2. Add the deplanement metric to the `rsw-airport` ingest pipeline + brain.
3. Then the chart can plot two series (boardings vs. arrivals) for free.

---

## The standard (durable, forward-looking)

`app/_design/07-charts-and-dataviz.md` — chart-type rules, the locked palette +
colorblind mandate, plain-language labeling, the accessibility checklist, the
hub-and-spoke IA, and the RSC server→client boundary rule. Added to the design
folder's reading order (`00-START-HERE.md`). Read it before adding any chart.

---

## Held / follow-ups (none done in this session)

- **Global "Charts" nav link** — `app/layout.tsx` has no shared header, so a link
  "on every page" means building a `SiteHeader` that lands on the marketing hero
  and every report page. Deferred as its own task. Tracked: check
  `charts_global_nav_link`.
- **Arrivals/deplanements** — the air-travel split above; needs source
  verification + an ingest change first.
- **4th chart — home-value YoY momentum** — derived from existing data, zero new
  source. Optional; not built.

---

## Verification (evidence, not assertion)

- `next build` **EXIT=0**, `/charts` prerenders as a **static** route (the exact
  thing that was crashing).
- ESLint clean on touched files; TypeScript clean (via build); 12/12 chart
  pure-logic tests (`lib/charts/*.test.ts`).
- Live: `https://www.swfldatagulf.com/charts` → **200**, all three titles
  present, **zero** "Zillow/ZHVI/ZORI/fixture" in the served HTML, no error
  markers. Production deployment `d563f21` reached `READY` on the live domain.
