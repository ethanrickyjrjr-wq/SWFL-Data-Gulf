# Showcase Complete — every coded email represented on /showcase

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 17 files, keywords: migration, architecture

**Goal:** Every coded email builder is represented on /showcase — add Open House + Price Improved to the Listing→Close story, promote back-on-market into the recipe set with its own showcase slide, and ship the first community-info email recipe over the Steady tables that landed 08/03/2026.

**Architecture:** Showcase slides are committed static captures: demo HTML under `public/showcase/<id>/live/*.html` → `scripts/capture-showcase.mjs` (Playwright via the pinned crawl4ai venv Python) → `public/showcase/<id>/step-N.webp` → storytelling entries in `lib/showcase/registry.ts` pointing at recipe keys in `lib/deliverable/recipes.ts`. Recipes dispatch through `lib/deliverable/recipes/index.ts` (`RECIPE_BUILDERS`). Nothing rebuilds automatically — captures are committed artifacts.

**Tech Stack:** Next.js app, Bun (`bun test`, `bunx next build`), TypeScript recipe builders, Playwright capture via `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`.

## Global Constraints

- **NEVER invent a number.** Demo BRANDS are fictional (Latitude 26 Estates, Cast & Coast Realty — established pattern, disclosure lines in registry.ts); every FIGURE is real lake/vendor data. An unsourced figure becomes an open slot, never a made-up value.
- **Citation decree:** user-facing source for any `steadyapi_*` table is **"realtor.com"**, never "SteadyAPI". `google_maps_amenities` cites Google Maps.
- **DO NOT TOUCH** `ingest/pipelines/neighborhood_amenities/**`, `refinery/packs/active-listings-swfl.mts`, `migrations/20260803_*.sql`, `refinery/sources/active-listings-residential-source.mts` — a parallel session owns them (repolith claims). Read-only is fine.
- **RULE 0.55:** before wiring any new data consumer, open the top decision table of `docs/standards/data-roots.md`; also read `_ASSISTANT/pending-amenity-catalog-edits.md` (the amenities roots are being catalogued there by the parallel session).
- **No push without operator confirmation.** Commit locally with explicit paths (`git add <paths>`, never `-A`); pushes go through `node scripts/safe-push.mjs` only after the operator says push, with a SESSION_LOG.md entry in the same push.
- **Checks to close (with `--evidence`) as tasks complete:** `showcase_open_house_price_reduced_slides` (Task 2), `back_on_market_recipe_key` (Task 3), `community_email_recipe` (Task 4). `node scripts/check.mjs close <key> --evidence "<proof>"`.
- **Verification commands:** `bun test lib/deliverable` and `bunx next build` (never `npx tsc`). Registry asset guard: `bun test lib/showcase` (`registry.test.ts` fails on any missing committed asset — run it BEFORE committing registry changes).
- **Report n of N.** Any task not finished gets reported as the fraction with the missing parts named, and its check stays open.

---

### Task 1: Discover the demo-build path and rebuild context

The five existing Listing→Close demo HTMLs were produced in-session ~07/01–07/05. Find the producing mechanism before inventing one.

**Files:**
- Read: `public/showcase/listing-to-close/live/02-new-listing.html` (reference output shape — full standalone HTML)
- 🔴 Read: `lib/deliverable/recipes/index.ts` (builder contract), `lib/deliverable/CLAUDE.md`, `docs/standards/emails.md`
- Read: `app/api/email-lab/render/route.ts` (the EmailDoc→HTML render path)

**Interfaces:**
- Produces: a documented, repeatable command/script path that takes `(recipeKey, demo listing address, demo brand doc)` → standalone HTML file. Written up as a comment block at the top of the build script created in Task 2.

- [ ] **Step 1:** Find the commit that added the originals and any producing script:

```bash
git log --format='%h %ad %s' --date=short -- public/showcase/listing-to-close/live/05-sold.html
git show --stat <that-commit> | head -40
ls scripts/email/
```

- [ ] **Step 2:** Read the render route to identify the exact function that turns an `EmailDoc` into the standalone HTML the live files contain (`app/api/email-lab/render/route.ts` imports it — follow the import). Note its name and signature.
- [ ] **Step 3:** Identify the Latitude 26 demo listing address and demo brand doc: grep the existing live HTML for the street address, and grep the repo for it to find any committed fixture used by the original builds:

```bash
grep -o '[0-9]\+ [A-Za-z ]\+' public/showcase/listing-to-close/live/02-new-listing.html | head -5
grep -ri "<street name found>" scripts/ lib/ fixtures/ --include=*.ts --include=*.mts -l
```

- [ ] **Step 4:** Write findings (producing script or its absence, render function name, demo address, brand source) into `_ASSISTANT/investigations/showcase-complete/01-demo-build-path.md`. No commit yet.

### Task 2: Open House + Price Improved slides in Listing→Close

**Files:**
- Create: `scripts/email/build-showcase-lifecycle-extras.mts` (build script for the two demo emails)
- Create: `public/showcase/listing-to-close/live/06-open-house.html`, `public/showcase/listing-to-close/live/07-price-reduced.html` (script output, committed)
- 🔴 Modify: `scripts/capture-showcase.mjs:19-30` (the `listing-to-close` files array)
- 🔴 Modify: `lib/showcase/registry.ts` (two new slides in the `listing-to-close` showcase)
- Create (script output, committed): `public/showcase/listing-to-close/step-6.webp`, `step-7.webp`, plus refreshed `step-1..5.webp`
- Test: `lib/showcase/registry.test.ts` (existing asset guard — no new test file)

**Interfaces:**
- Consumes: Task 1's render function + demo address; `buildOpenHouse` / `buildPriceReduced` from `lib/deliverable/recipes/open-house.ts` / `price-reduced.ts`, both `(ctx: RecipeBuildContext) => Promise<EmailDoc | null>`; `RECIPES["open-house"]` / `RECIPES["price-reduced"]` from `lib/deliverable/recipes.ts`.
- Produces: two committed demo HTMLs + seven committed webp captures + two registry slides carrying `recipe: RECIPES["open-house"]` and `recipe: RECIPES["price-reduced"]`.

- [ ] **Step 1:** Write `scripts/email/build-showcase-lifecycle-extras.mts`: resolve the same demo subject the originals used (Task 1), construct the `RecipeBuildContext` (recipe from `RECIPES`, `prompt` = the recipe's own `prompt` with the demo address filling the `[[blank]]`, `currentDoc` = the same brand doc the originals carried, `facts`/`resolved` from the demo listing), call the builder, render with Task 1's render function, write the HTML file. Open-house needs a date/time: use a real upcoming Saturday two weeks from the run date, 12–3 PM — it's an invitation detail (a moment the agent declares, lane 4), not a data claim; state it plainly, no fake urgency copy.
- [ ] **Step 2:** Run it: `bun scripts/email/build-showcase-lifecycle-extras.mts`. Open both HTML files and verify: every figure in them traces to the demo listing record or a cited source; the price-reduced email shows the cut above the price (that's its coded behavior); no empty chart boxes. If the builder returns null, STOP and report why — do not hand-author HTML.
- [ ] **Step 3:** Append the two files to the capture array — keep lifecycle narrative order in ONE place only (the registry); the capture array maps file→step number positionally, so append at the end to avoid renaming committed step-1..5 assets:

```js
// scripts/capture-showcase.mjs — listing-to-close entry becomes:
{
  id: "listing-to-close",
  width: 700,
  files: [
    "01-coming-soon.html",
    "02-new-listing.html",
    "03-comps.html",
    "04-pending.html",
    "05-sold.html",
    "06-open-house.html",
    "07-price-reduced.html",
  ],
},
```

- [ ] **Step 4:** Run `node scripts/capture-showcase.mjs` (recaptures ALL showcases — deliberate: flushes the ~4-week-stale July captures, including the two slides suspected of showing the old agent-card bio bug). Eyeball every regenerated webp under `public/showcase/*/step-*.webp` before committing; if any OTHER showcase's fresh capture now shows broken/changed content, report it and hold that file out rather than committing a regression.
- [ ] **Step 5:** Add the two slides to `lib/showcase/registry.ts` inside the `listing-to-close` showcase's `slides` array, in NARRATIVE order (Open House after "New Listing", Price Improved after "Market Comps") — slide order in the registry is display order and need not match step numbers:

```ts
{
  image: "/showcase/listing-to-close/step-6.webp",
  title: "Open House",
  whatsHappening:
    "The in-person moment: date and time up front, the home's key specs, one RSVP ask.",
  howAiHandled:
    "Kept it about the house and the moment — specs from the listing record, no chart, a single CTA.",
  liveHref: "/showcase/listing-to-close/live/06-open-house.html",
  recipe: RECIPES["open-house"],
},
{
  image: "/showcase/listing-to-close/step-7.webp",
  title: "Price Improved",
  whatsHappening:
    "The reset, stated honestly: the cut shown above the new price, and what the new number means against real nearby comps.",
  howAiHandled:
    "Read the cut from the listing record, plotted the new price per square foot against real comparable homes, and wrote one honest line — no invented reason the price moved.",
  liveHref: "/showcase/listing-to-close/live/07-price-reduced.html",
  recipe: RECIPES["price-reduced"],
},
```

Rewrite `whatsHappening`/`howAiHandled` to match what the BUILT emails actually contain — the copy above is the shape; the claims must be true of the real output. Update the section intro in `components/showcase/CampaignExamples.tsx:16-17` from "five emails" to "seven emails".
- [ ] **Step 6:** Run `bun test lib/showcase` — expected PASS (asset guard sees all referenced files). Then `bunx next build` — expected clean.
- [ ] **Step 7:** Commit (explicit paths: the script, both HTMLs, all recaptured webps, registry.ts, capture-showcase.mjs, CampaignExamples.tsx) with message `feat(showcase): open-house + price-improved join listing-to-close — full recapture`. Close check `showcase_open_house_price_reduced_slides` with the test output as evidence.

### Task 3: Promote back-on-market into the recipe set + its showcase slide

**Files:**
- 🔴 Modify: `lib/deliverable/recipes.ts` (add `"back-on-market"` to `RECIPE_KEYS` + a `RECIPES` entry)
- 🔴 Modify: `lib/deliverable/recipes/index.ts` (register in `RECIPE_BUILDERS`)
- Read first: `lib/deliverable/recipes/back-on-market.ts:145-160` — `buildBackOnMarket(ctx: RecipeBuildContext, <second param>)` has a second parameter; adapt with a closure supplying its default, do NOT change its signature (the /r/back-on-market "send it" flow calls it directly)
- 🔴 Modify: `lib/showcase/registry.ts` (one-slide showcase entry) + `components/showcase/CampaignExamples.tsx:15-24` (`SECTION_INTRO` line for it)
- 🔴 Modify: `scripts/capture-showcase.mjs` (new capture entry)
- Create (script output, committed): `public/showcase/back-on-market/live/01-back-on-market.html`, `public/showcase/back-on-market/step-1.webp`, `public/showcase/back-on-market/thumb.webp`
- Test: `lib/deliverable/recipes.parity.test.ts` + `lib/showcase/registry.test.ts` (existing suites)

**Interfaces:**
- Consumes: `buildBackOnMarket` as above; the relist data root behind it (read `back-on-market.ts` header comments — the days_off_market relist detector).
- Produces: `RecipeKey` union gains `"back-on-market"`; `RECIPES["back-on-market"]` usable by any door.

- [ ] **Step 1:** Read `lib/deliverable/recipes/back-on-market.ts` in full. Note its subject spine (address), what its second parameter is, and what data it renders.
- [ ] **Step 2:** Add the key + entry. In `RECIPE_KEYS`, after `"price-reduced"`. Entry (adjust `chart` to whatever the builder actually ships — read it, don't guess):

```ts
"back-on-market": {
  key: "back-on-market",
  positioning: "sell-side",
  label: "Back on the Market",
  skeleton: null, // builder loads its own committed grid — verify in back-on-market.ts and name it here if it declares one
  prose: null,
  subject: "address",
  chart: "none",
  prompt:
    "Build a back-on-market email for my listing at [[your listing address]] — say plainly it's available again, its time off the market, key specs, and one straight line on why a returned listing is a second chance, not a red flag.",
  needs: ["agent_name", "brokerage", "business_address"],
},
```

- [ ] **Step 3:** Register the builder in `RECIPE_BUILDERS` (closure-adapt the second parameter with its default). Run `bun test lib/deliverable` — expected PASS including `recipes.parity.test.ts`; if parity demands a surface offering, follow its failure message.
- [ ] **Step 4:** Build the demo: extend `scripts/email/build-showcase-lifecycle-extras.mts` with a back-on-market demo — a REAL relisted SWFL property from the relist detector's own data (query the root `back-on-market.ts` reads; pick a mid-market Cape Coral one), Cast & Coast Realty brand (existing fictional brand, portrait already committed). Output `public/showcase/back-on-market/live/01-back-on-market.html`.
- [ ] **Step 5:** Add capture entry `{ id: "back-on-market", width: 700, files: ["01-back-on-market.html"] }` to `capture-showcase.mjs`, run it, and produce `thumb.webp` the same way the other showcase thumbs were made (check `git log -- public/showcase/market-pulse/thumb.webp` for the producing commit/script; if it was manual, downscale step-1.webp to match the other thumbs' dimensions with sharp).
- [ ] **Step 6:** Registry entry — new `Showcase` in `SHOWCASES` (no `campaign` field — it's not a quick-start campaign yet):

```ts
{
  id: "back-on-market",
  company: "Cast & Coast Realty · Cape Coral",
  title: "Back on the Market: The Second Chance",
  hook: "A returned listing announced straight — time off market stated, no spin.",
  accent: "#0E7C86",
  thumb: "/showcase/back-on-market/thumb.webp",
  surfaces: ["email"],
  disclosure:
    "Demonstration campaign — Cast & Coast Realty is fictional. The property and relist data are real — SWFL Data Gulf listing feed (08/03/2026).",
  slides: [
    {
      image: "/showcase/back-on-market/step-1.webp",
      title: "Back on the Market",
      whatsHappening:
        "The listing returns to market and the email says so plainly — days off market stated, specs restated, one CTA.",
      howAiHandled:
        "Detected the relist from real state transitions, stated the gap honestly, and made the second-chance case without inventing a reason the first deal fell through.",
      liveHref: "/showcase/back-on-market/live/01-back-on-market.html",
      recipe: RECIPES["back-on-market"],
    },
  ],
},
```

Add a `SECTION_INTRO["back-on-market"]` line in `CampaignExamples.tsx`. As with Task 2, make the caption claims true of the real output, and set the disclosure date to the actual build date MM/DD/YYYY.
- [ ] **Step 7:** `bun test lib/showcase lib/deliverable` — expected PASS. `bunx next build` — expected clean. Commit with explicit paths, message `feat(showcase+recipes): back-on-market becomes a recipe key with a showcase story`. Close check `back_on_market_recipe_key` with test output as evidence.

### Task 4: Community-info email recipe (first recipe over the 08/03 Steady tables)

This is a NEW recipe — run `node scripts/new-build.mjs community-info-email "Community Info Email"` first (spec stub + live-verify check), and honor the failure-modes section below in the spec stub.

**Data (live-verified 08/03/2026, read-only SQL):** `data_lake.steadyapi_neighborhoods` 245 rows (named vendor neighborhoods, boundary polygon + centroid), `steadyapi_neighborhood_amenities` 16,304 (31 Yelp-derived categories w/ lat/lon + distance), `steadyapi_property_neighborhood` 19,805 (listing↔neighborhood pairing), `neighborhood_stats` 20,400 (median just value etc.), `google_maps_amenities` 1,909, `community_profiles` 81. Schools with ratings + 12 location scores ride on the amenities payload (research: `_RESEARCH/data-and-ingest/2026-08-03-neighborhood-amenities-full-scope.md`). HOA fees are ABSENT vendor-wide — never promise them.

**Files:**
- 🔴 Modify: `lib/deliverable/recipes.ts` (key `"community-info"` after `"market-pulse"`)
- Create: `lib/deliverable/recipes/community-info.ts`
- Create: `lib/deliverable/recipes/community-info.test.ts`
- 🔴 Modify: `lib/deliverable/recipes/index.ts` (register builder)
- Read first: `docs/standards/data-roots.md` top table + `_ASSISTANT/pending-amenity-catalog-edits.md` (the amenities roots' intended names — consume THOSE roots; if the parallel session hasn't landed them yet, this task BLOCKS and its check stays open, reported honestly)
- Reference implementations: `lib/deliverable/recipes/review-reply.ts` (area-spine, lake-data recipe) + `lib/deliverable/recipes/default-grid.ts` (sourced-fill + open slots)

**Interfaces:**
- Consumes: `RecipeBuildContext` (subject `"area"`, `zip` may be set); the amenity/neighborhood roots per data-roots.
- Produces: `buildCommunityInfo(ctx: RecipeBuildContext): Promise<EmailDoc | null>`; `RECIPES["community-info"]`.

**Failure modes (name the break before you build — each pairs with a guard):**
- Neighborhood not matched from the user's typed area → builder returns the grid with open slots (default-grid pattern), NEVER null-and-refuse (RULE 0.7) and NEVER a nearest-guess neighborhood presented as the asked one.
- Amenity list is Yelp-derived and can be sparse for a neighborhood → cells render only categories with rows; empty categories are dropped, not zero-filled (test: sparse fixture ships no "0 restaurants" cell).
- Citation leakage → every steadyapi-derived cell cites "realtor.com", google_maps_amenities cites Google Maps; test asserts the string "SteadyAPI" appears nowhere in the built doc.
- Stale-month drift → each cell carries its source's as-of date MM/DD/YYYY from the row's load timestamp, not the build date.
- Chart temptation → `chart: "none"` at launch; an amenity-count bar is a tomorrow upgrade, not this build (an email about a PLACE leads with facts, and the count data is one day old — earn the chart after the lane settles).

- [ ] **Step 1:** `node scripts/new-build.mjs community-info-email "Community Info Email"`; paste the failure-modes section above into the spec stub.
- [ ] **Step 2:** Recipe entry in `recipes.ts`:

```ts
"community-info": {
  key: "community-info",
  positioning: "story-side",
  label: "Community Info",
  skeleton: "skeleton-clean-white",
  prose: null,
  subject: "area",
  chart: "none",
  prompt:
    "Build a community-info email for [[your neighborhood or community]] — where it sits, its schools with ratings, what's nearby to eat and do, and typical home values, every figure cited.",
  needs: ["agent_name", "brokerage", "business_address"],
},
```

- [ ] **Step 3:** Write `community-info.test.ts` FIRST (TDD): four tests mirroring the failure modes — unmatched area → open-slot grid (not null); sparse amenities → no zero-filled cells; no "SteadyAPI" string anywhere in output; every numeric cell carries a source label. Run: `bun test lib/deliverable/recipes/community-info.test.ts` — expected FAIL (module not found).
- [ ] **Step 4:** Implement `buildCommunityInfo` to green, reading ONLY the catalogued roots (data-roots names), modeled on review-reply's data access + default-grid's open-slot handling. Narrator (if any prose call) gets sources-only, story-side — no favorable-framing block (that block is pasted verbatim in exactly three prompts today; this is not one of them).
- [ ] **Step 5:** Register in `RECIPE_BUILDERS` after `"market-pulse"`. Run `bun test lib/deliverable` — expected PASS.
- [ ] **Step 6:** Showcase slide: build one demo (a real named Naples or Cape Coral neighborhood from `steadyapi_neighborhoods`, Meridian South Advisory brand), capture into a new one-slide showcase `community-info` following Task 3 Steps 4–6 exactly (new capture entry, thumb, registry entry with `SECTION_INTRO` line, disclosure with real build date).
- [ ] **Step 7:** `bun test lib/showcase lib/deliverable` + `bunx next build` — expected PASS/clean. Commit explicit paths, message `feat(deliverable+showcase): community-info email — first recipe over the neighborhood lane`. Close `community_email_recipe` with test output; the `community-info-email_live_verify` check stays OPEN until verified on production post-deploy.

---

## Execution notes for the Opus session

- Work on `main` only if no file overlap with the parallel amenities session (RULE 1.5); the files this plan touches (`lib/showcase/`, `lib/deliverable/`, `scripts/email/`, `public/showcase/`, `scripts/capture-showcase.mjs`) are currently unclaimed — re-check `repolith claim list` before starting.
- Task order is 1 → 2 → 3 → 4; Task 4 may block on the amenities catalog entries — if blocked, ship Tasks 1–3 and report 3 of 4 with Task 4's blocker named.
- This plan was written from code read on 08/03/2026 (recipes.ts, recipes/index.ts, registry.ts, capture-showcase.mjs all read in full or at the cited lines) plus a live SQL probe of the lake. Inherited plans are hypotheses: re-verify any line number or signature before editing (RULE 0.5).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 3, Task 4 | `lib/deliverable/recipes/index.ts`, `scripts/capture-showcase.mjs`, `lib/showcase/registry.ts`, `lib/deliverable/recipes.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
