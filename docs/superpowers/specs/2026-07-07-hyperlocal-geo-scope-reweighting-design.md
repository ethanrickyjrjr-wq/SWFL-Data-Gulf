# Hyperlocal geo-scope + reach-weighting for local-news intelligence — RESEARCH BRIEF

- **Date:** 07/07/2026
- **Status:** RESEARCH BRIEF — for operator review. NOT approved to build. No code touched.
- **Author:** assistant, from live code probe + live lake measurement + crawl4ai research.
- **Scope:** ALL covered places (13 city units today; extensible to any area/ZIP we hold data for), not just Naples.
- **Supersedes framing in:** the per-city substring model in `ingest/lib/pulse_match.py` + the per-unit
  distill guard in `ingest/pipelines/city_pulse/distill.py`.

---

## 1. What we are trying to do (the goal)

One clean, non-duplicated local-intelligence lake where **every fact sits at its single true finest
place** (a ZIP / neighborhood / area / city) and **carries a reach weight that decides how far the news
travels** up the geographic hierarchy.

The two user experiences this unlocks, from one dataset with zero copies:

- **Specific seeker → more detail.** Someone asking about a street, a ZIP, or a part of town gets that
  place's own hyperlocal facts PLUS the bigger news that blankets it (rolled *down* the hierarchy).
- **Big news → travels wide.** A major employer move, a hurricane, a county decision is written **once**
  at a high reach weight and reaches every place under it — no duplicate rows.

Applied to every place, this is a moat: genuinely granular location intelligence (down to ZIP/area) that
is also non-repetitive, for Fort Myers, Cape Coral, Naples, and every smaller place alike. Each city and
area accrues its own little details; the reach weight is what keeps hyperlocal noise local and lets real
news climb.

---

## 2. The problem today (issues) — with measured evidence

### 2a. The matcher over-matches by naive substring
`ingest/lib/pulse_match.py:47` — `article_matches_city` is literally `city.lower() in hay`. Because
"Naples" is a substring of "North Naples" and "East Naples", the **Naples** pass matches every North/East
Naples article. Sub-areas are treated as **sibling cities**, not children in a hierarchy, so nothing rolls
up and there is no ZIP/area grain at all.

### 2b. Per-unit passes over overlapping article sets → duplicate facts + wasted distill
Each of the 13 city units runs its own match + its own Sonnet distill call. Overlapping matches mean the
same story is captured and distilled under multiple place labels. The dedup key is
`(city, source_url)` (`distill.py` `dedup_key`), so the *same article* under two place labels produces
**two rows** — it cannot collide.

### 2c. Measured duplication (live query, `pg.data_lake.city_pulse`, 07/07/2026)
- **142** total fact-rows across the 13 city units.
- The four Naples-area units hold **47 rows — a full third (33%) of the entire lake** — for one metro.
- Within that cluster: **47 rows, 38 distinct article URLs → 9 rows are exact duplicates** (same article
  filed under 2–3 place labels). Overlap combos: Naples+North Naples ×3, East Naples+Naples ×2,
  Golden Gate+Naples+North Naples ×1 (triple-filed), East Naples+North Naples ×1, Golden Gate+North Naples ×1.
- Per-unit spread today: Marco Island 16, Bonita Springs 16, Fort Myers 15, North Naples 15, East Naples 13,
  Estero 12, Naples 12, Cape Coral 12, Fort Myers Beach 11, Golden Gate 7, Lehigh Acres 6, Sanibel 4,
  North Fort Myers 3.
- **9 is a FLOOR.** It only catches identical URLs. The *same story told by two different outlets*
  (different URLs) across sub-areas is not counted, so true story-level duplication is higher.

### 2d. Grain skew, not just dupes
Even setting the 9 dupes aside, greater-Naples gets four bites at the news (four units) while Fort Myers,
Cape Coral, etc. get one each. Distill budget and lake share are disproportionately spent re-chewing one
metro. Bigger cities that deserve *finer* internal granularity (Cape Coral quadrants, Fort Myers'
River District / Dunbar / Gateway) get none.

### 2e. The distill guard reinforces the bug
The per-unit prompt tells Naples to skip Fort Myers/Cape Coral/etc. but does NOT list East/North Naples/
Golden Gate, and explicitly says to KEEP facts about the city's "immediate area." So the model is actively
instructed to keep sub-area stories under the parent — cementing the double-count.

---

## 3. Research findings (crawl4ai, 07/07/2026)

Sources (provenance):
- Toponym resolution — https://en.wikipedia.org/wiki/Toponym_resolution
- Geoparsing — https://en.wikipedia.org/wiki/Geoparsing

The field that studies this is **geoparsing** = geotagging (recognize place mentions) + **toponym
resolution** (disambiguate each mention to one real place). Two findings map directly onto what we want:

1. **Resolution should be "conflict-free" — one mention → exactly one place.** The literature frames it as
   a *set-cover* problem: you do NOT file a story under every place whose name appears; you pick the single
   best-fitting place. This is the textbook fix for our duplicates.

2. **"Context-Hierarchy Fusion": estimate the geographic *scope* of a document, then resolve.** Scope
   (how far the news reaches) is a **separate axis** from place (where it happened). This is exactly the
   "big news travels, hyperlocal stays" idea — and it is a studied technique, not a hunch.

Resolution heuristics we can lean on: **population/prominence** (a bare "Naples" defaults to the city, not
a hamlet), **geographic proximity / sibling toponyms** (a street name + "North Naples" resolves finer than
bare "Naples"), and **gazetteer hierarchy** (ZIP ⊂ neighborhood ⊂ city ⊂ metro ⊂ county). Gazetteer
options that are free + authoritative: **GNIS** (USGS, ~2M US places), **GeoNames**, **OSM**. Open-source
geoparsers to study for prior art: CLAVIN, geoparsepy, Mordecai, TopoCluster.

---

## 4. Proposed architecture (generalized to ALL places)

### 4a. A real place hierarchy (gazetteer) — the core dependency
Build one place tree covering everywhere we operate: **county → city → area/neighborhood → ZIP**, with each
node carrying its parent. Seed it from a REAL source (GNIS / GeoNames / OSM / our existing SWFL ZIP
crosswalk `fixtures/swfl-zip-county.json`), never hand-typed — no invented places or ZIPs (RULE 1). Examples
of the *kind* of nodes (actual list must be sourced, not authored): Naples → {Old Naples, Pelican Bay,
Park Shore, North Naples, East Naples, Golden Gate, …} → their ZIPs; Cape Coral → {SE/SW/NE/NW quadrants,
Pelican, …}; Fort Myers → {River District/Downtown, Dunbar, Gateway, McGregor, Whiskey Creek, …}.

### 4b. Two axes per fact — home place + reach weight
Replace "one row per city label" with **one row per fact**, carrying:

- **`home_place`** — the single most-specific place the story is actually about. A neighborhood/ZIP if the
  article names a street/landmark/ZIP; the city if it's citywide; the metro/county if it spans the region.
  One place per fact (the conflict-free rule) — this is what structurally kills the dupes.
- **`reach_weight`** — a score for how far the news should travel up the hierarchy. Low = stays at
  `home_place`. High = climbs to city, metro, county, and thus surfaces for everyone below.

### 4c. The reach-weighting system (the operator's idea, made concrete)
Reach is computed, not vibed — keeping the Brain-Factory rule "numbers in code, narrative from the LLM."
The LLM proposes a reach; deterministic code floors/caps it from hard, sourced thresholds. Candidate
inputs to the weight (to be researched + tuned):

- **Topic/volatility** (we already classify these): breaking disaster → high; large transaction → mid/high;
  development/permit → mid; small business open/close → low.
- **Magnitude signals, verbatim from the story:** dollar amount, job count, unit count, acreage — with
  sourced thresholds (e.g. a transaction above $X or a project above N jobs earns city/metro reach).
- **Named-entity prominence:** a region-wide employer or institution (sourced list) lifts reach.
- **Explicit geographic language:** "Collier County approved…", "region-wide…" → county/metro reach;
  "downtown…", a single address → hyperlocal.

Output: a `reach_weight` (or a discrete `reach_level`: hyperlocal / area / city / metro / county) that,
combined with `home_place`'s position in the tree, defines the set of places the fact is visible to.

### 4d. Rollup at READ time, not fan-out at write time
Store once; surface at every relevant grain by **containment**:
- Query a ZIP/area → its own facts + ancestor facts whose reach extends down to it.
- Query a city → city + metro/county facts + all its areas' facts (rolled up).
- A high-reach metro story is one row, visible everywhere beneath it. Zero copies.

### 4e. Capture change — hierarchy-aware, not one-pass-per-label
Run capture per **top-level place** (city/metro), once, and let the distill place each fact at its finest
grain + reach. This deletes the substring double-match at the source: there is no separate "Naples" pass
to swallow the "North Naples" articles.

### 4f. Reworded extraction contract (the "how we word it")
The distill prompt stops saying "extract facts about {city}, skip other cities" and becomes, per fact:
1. **Place it** — pick the single most-specific named place it is genuinely about (a neighborhood/ZIP if a
   street, landmark, address, or ZIP is named; the city if citywide; the metro/county if region-wide).
   Never assign one fact to more than one place; pick the finest one that is its *subject*, not merely
   mentioned in passing.
2. **Weight its reach** — how far does this matter: one neighborhood, the whole city, the metro, the county?
3. **Resolve to ZIP** — if a street/landmark/address is named, map it to its ZIP from the provided gazetteer.

Hand the model: the **place gazetteer** for the capture's area (city → areas → ZIPs) and the **already-tracked
story slugs** (already injected today) so continuations reuse the right place + slug.

---

## 5. Implied schema / pipeline changes (for scoping the build later)

- `data_lake.city_pulse` → a place-aware table (`place_pulse`?) with `place_id` (FK into a new
  `data_lake.places` hierarchy table) + `reach_weight`/`reach_level`, replacing the free-text `city` column.
- New `data_lake.places` gazetteer table (county/city/area/zip + parent_id), sourced + backfilled.
- **Dedup key change:** from `(city, url)` to a fact/place identity that prevents cross-place dupes while
  still allowing genuinely distinct local facts from the same article.
- **Reader change:** rollup logic in every surface that reads pulse today (brains, assistant, any
  deliverable) — a shared read helper, not N reimplementations.
- **Backfill:** re-place the existing 142 rows (re-distill from Tier-1 cold captures, or migrate).
- **Corridors too:** `corridor-pulse` imports the same Sonnet distill constant; corridors (roads) are
  another grain and should ride the same place+reach model, not a parallel hack.
- Guards intact: $1/run budget + $5/day ceiling preflight still wrap every distill call.

---

## 6. Open questions to research (yours)

1. **Gazetteer source of truth** — GNIS vs GeoNames vs OSM vs our ZIP crosswalk; how to get neighborhood/area
   polygons or at least name→ZIP mappings for every covered city, from a real source.
2. **Reach rubric + thresholds** — what exact signals and sourced cutoffs set reach (dollar/jobs/acreage
   bands, prominent-entity list). This is the part that most needs real grounding, not guesses.
3. **Discrete levels vs continuous weight** — is `reach_level` (5 buckets) enough, or do we want a numeric
   score with a decay so reach fades with distance up the tree?
4. **Ambiguity handling** — when a story names two comparable places, or none specific; default-to-city vs
   drop.
5. **Neighborhood coverage** — do we go all the way to named neighborhoods now, or land at ZIP grain first
   and add neighborhoods as a phase 2?
6. **Migration vs re-distill** for the existing 142 rows and the Tier-1 cold archive.
7. **Prior art** — read CLAVIN / geoparsepy / Mordecai to avoid reinventing the resolver.

---

## 7. Dependencies & risks

- **Biggest dependency:** the sourced gazetteer. Everything else waits on a real place hierarchy.
- **Risk:** LLM place-assignment quality — needs a small labeled eval set (like the Haiku-vs-Sonnet
  distill comparison) before trusting it in the lake.
- **Risk:** reader rollup touches many surfaces; do it as one shared helper or it drifts.
- **Not a cost fire:** whole current run is $0.86; this is about data-grain quality + a real moat, not spend.

---

## 8. Provenance

- Live code: `ingest/lib/pulse_match.py`, `ingest/pipelines/city_pulse/distill.py` + `pipeline.py`,
  `.github/workflows/city-pulse-daily.yml`.
- Live data: `pg.data_lake.city_pulse` measured 07/07/2026.
- Research: Wikipedia *Toponym resolution* + *Geoparsing* (URLs in §3), via crawl4ai.
- Existing rules honored: no invented places/ZIPs (RULE 1); numbers-in-code/narrative-from-LLM
  (Brain-Factory rule 2); ingest budget + daily-ceiling guards (`ingest/CLAUDE.md`).
