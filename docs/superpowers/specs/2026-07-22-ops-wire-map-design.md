# /wire-map — a clickable, drillable visual of the lake wire map

**Status: spike built and verified live in browser. Full ~200-node transcription not yet done — pending operator go-ahead.**

## What this is

A new page at `swfldatagulf-ops`'s `/wire-map` that visualizes
`_RESEARCH/data-and-ingest/2026-07-22-lake-wire-map.md` (brain-platform, gitignored, 16-agent
grep-verified audit of all 93 registry sources + 41 packs): lake table → pack → master? →
consumer, including the dead tables, orphan packs, non-pack bypass consumers, and the live-API
lane the audit found.

Two things the operator asked for by name:
1. **Click a node, it opens to where it's wired to.** Not a link elsewhere — an in-canvas
   drill: nodes start clustered (e.g. "Active Listings ▸ (2)"); clicking a cluster opens it to
   reveal the real nodes and edges underneath.
2. **"Use census to look into the data inside each one, and if a brain, what it produces."**
   A side panel on click, live-fetched — real Supabase row estimate for a table, real
   `/api/b/<pack>` output for a brain — not a static label.

## Why this shape, not the other two candidates

- **Not `/graph`** (existing force-directed canvas, auto-published `brain-graph.json` via a
  GitHub Actions republish workflow from graphify). Bolting hand-curated audit data onto an
  auto-regenerated artifact means the next graphify republish silently clobbers it.
- **Not `/architecture`**'s HTML/CSS column-lane layout (the operator's own first pick, before
  he clarified the click-to-open-wiring interaction). Lanes drawn in CSS can't animate an
  edge reveal the way a canvas can — the operator's actual ask needs a canvas.
- **vis-network, not a new library.** `/graph` already loads it via the same CDN-script
  pattern this page reuses. Two vendor facts, verified against
  `visjs.github.io/vis-network/docs/network/` this session (crawl4ai, 07/22/2026), decided it:
  `layout.hierarchical` (`direction: 'LR'`, `sortMethod: 'directed'`) lays a DAG out by edge
  direction instead of force-clustering, and the `clustering` module
  (`clusterByConnection` / `openCluster`) is the literal mechanism for "click it, it opens to
  where it's wired to." No new dependency added.

## Data source — why it's a curated JSON, not a live fetch

The audit lives in brain-platform's gitignored `_RESEARCH/`, so unlike `/census` (which reads
brain-platform's *committed* `cadence_registry.yaml` live via GitHub raw fetch), the wire-map
audit can never be fetched cross-repo at build time — it never reaches GitHub. `wire-map-data.json`
is a curated, dated snapshot checked into the ops repo, the same pattern `architecture.json`
already uses (`"generatedOn"` + `"note"` fields disclosing it's a snapshot, not a live query).

## What's built (the spike)

Per an advisor review that flagged the real risk as "does vis-network hierarchical + clustering
actually compose cleanly at scale," not "is the data right" — this session's own git log showed
5+ prior `fix(graph)` commits fighting vis-network's physics/camera/drag behavior — the spike
proves the canvas on ~10 real nodes, one per case, before spending effort transcribing the full
~200-node dataset:

- `lib/supabase.ts`: new `tableSnapshot(schema, table)` — **estimated** count
  (`Prefer: count=estimated`, verified against postgrest.org's pagination docs this session),
  never an exact `COUNT(*)` scan. `rowCounts()` (used by `/census`) uses `count=exact`, which
  is fine for a scheduled 5-minute-revalidate build but wrong for a per-click UI action on
  tables like `leepa_comparable_sales` (108k rows) or the parcel tables (~800k rows) — the
  active egress-panic scratchpad thread was the reason to not repeat that choice here.
- `app/api/wire-map/table/route.ts`, `app/api/wire-map/brain/route.ts` — server-only routes.
  The Supabase service key documented at the top of `lib/supabase.ts` as "never reaches the
  client" stays true: the client canvas only ever calls these two routes, never the Supabase
  client directly.
- `app/wire-map/wire-map-data.json` — 11 nodes / 6 edges, one real example of every case:
  a full live chain (`listing_state` → `active-listings-swfl` → master + `app/desk`), a
  confirmed-dead table (`active_listings_residential`), a non-pack bypass
  (`redfin_city_swfl` → `lib/desk/loaders.ts`), a deliberately-orphaned pack (`fgcu-reri`),
  and a live-API-lane node that never touches the lake (Mapbox Search Box API). Every label,
  status, and detail string is transcribed verbatim from the audit doc — nothing invented.
- `app/wire-map/page.tsx` — the canvas + side panel.

## Verified live in browser (this session)

Built, `npx next build` clean (typecheck passes, both new API routes register as dynamic
routes), then driven through Chrome on a local dev server:
- Clicking the "Active Listings ▸ (2)" cluster opens it into the real `listing_state` →
  `active-listings-swfl` → master / `app/desk` chain.
- Clicking `active-listings-swfl` fetched and displayed **real production output** from
  `https://www.swfldatagulf.com/api/b/active-listings-swfl` (21,130 active listings, median
  $425,000, county breakdown, freshness date, live link).
- Clicking `master` did the same against `/api/b/master` (real synthesizer read, magnitude,
  confidence, conflict note).
- Clicking a table node correctly showed "Supabase env unset — can't query live" (this dev
  machine has no local Supabase creds — same degrade path every other page in the ops repo
  already uses; this will show a real estimated count once deployed where the env is set).
- Dead node renders with a dashed border; orphan pack, bypass chain, and live-API lane all
  render as distinct, correctly-unclustered nodes.
- One bug found and fixed live: `shapeProperties: undefined` on non-dead nodes crashed
  vis-network's internal option merge (`Cannot read properties of undefined`) — fixed to
  `shapeProperties: { borderDashes: false }`, vis-network's own documented default.

## Failure modes and their guards

- **Transcription error** (wrong status/label) — every field copied verbatim from the
  already-verified audit; no new claims introduced.
- **Expensive live query on a huge table** — `count=estimated`, not `exact`; guarded above.
- **Service-key leakage to the client** — API routes only; the client never imports
  `lib/supabase.ts`.
- **Stale snapshot masquerading as live** — `generatedOn` date shown on the page, same
  disclosure pattern as `architecture.json`.
- **~200-node graph unreadable** — clustering, verified against real vis-network docs, starts
  the canvas collapsed; the spike proved the open/close mechanic works.
- **Dead brain-slug 404** — `/api/wire-map/brain` degrades to "not live" rather than throwing;
  verified live against a real 404 (`{"error":"brain not found"}`) this session.
- **Push friction** — pushing to the ops repo from a brain-platform session has documented
  hook friction (prior incident, memory-tracked). Spike is committed locally in the ops repo;
  push handed to the operator rather than attempted automatically.

## Not yet done

Transcribing the remaining ~190 nodes (of ~93 tables, 41 packs, ~50 consumers, ~15
dead/orphan/true-orphan items, 6 live-API-lane items) from the audit doc into
`wire-map-data.json`, plus a nav link from the `/ops` homepage. Held for operator sign-off on
the spike before spending that effort, per the advisor's sequencing recommendation.
