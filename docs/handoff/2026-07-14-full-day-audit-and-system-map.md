# 2026-07-14 — Full-Day Audit + System Map

> **Recommended model:** 🧠 Opus — 10 tasks, 35 files, keywords: migration, architecture

















**Author:** Opus 4.8 (1M) audit session · **Date:** 07/14/2026
**Trigger:** Operator: "Check everything we've done today. Make sure we aren't creating extra paths for
things we already have. We are making a layout of how everything works so we can fix faster and know when
things are broke. I'm tired of finding out we did things wrong over and over."

---

## HOW TO READ THIS FILE (for the next Opus)

This is two documents in one:

1. **PART A — THE SYSTEM MAP.** A durable, subsystem-by-subsystem layout: entry points, the ONE root for
   each shared concept, the tests that guard it, and — most important — **how you'd tell it's broken**
   (symptom → the exact file/command to check). This is the lasting artifact. Update it, don't let it rot.

2. **PART B — FINDINGS (point-in-time, 07/14).** What today's 61 commits + the in-flight working tree may
   have gotten wrong. Split hard into **CONFIRMED** (quoted code at file:line + a named duplicate path or a
   concrete input→wrong-output) and **SUSPECTED** (plausible, not proven). **Never act on a SUSPECTED item
   without re-verifying it yourself first** — this repo has a history of confidently-wrong audits
   (the LittleBird "data gap" audit was mostly phantom). Default was DON'T-REPORT; if it's here it cleared a bar.

### The lens that generated this audit
Today was a **consolidate-to-one-root day**. The commit themes say it plainly: "the layout root," "the
design root," "TEAL/NAVY get their one root," "one construction for both flat bands," "the design system is
now CODE — it was markdown." Against Ricky's locked rule *one authority per shared concept*, that makes the
primary defect class precise:

> **An "extra path for something we already have" = a new root got established today, but the OLD path was
> left live as a second still-reachable path.**

Every lane hunted that first.

### Scope of the change set audited
- **61 commits** on `main` dated 2026-07-14 (`git log --since="2026-07-14 00:00" --oneline`).
- **230 unique files** touched by those commits.
- **~37 files uncommitted** in the working tree + 3 untracked — **in-flight work by parallel sessions.**
  In-flight items are described, NOT condemned for being incomplete.
- **3 live worktrees** at audit time: `bp-contact-segments` (wt/contact-segments), `bp-dcd` (wt/dcd),
  `bp-desk-fix-isolate-2` (detached). The main working tree is SHARED — this audit was strictly read-only.

### Verification method
10 read-only `Explore` subagents, one per subsystem, each bound to: quote current code at file:line, name
the duplicate path or the input→wrong-output, and park anything unproven in a separate SUSPECTED list.
Anchor facts below the map were verified by the lead session directly (not delegated).

---

## PART A — THE SYSTEM MAP

> Filled per-subsystem as audit lanes report. Each section: **Entry points · The one root(s) · Tests ·
> How you'd tell it's broken.**

### A0. Repo shape (verified)
- Stack: Next.js (App Router) + Supabase + Vercel + DuckDB + Python `dlt` ingest. Runtime: **Bun** for TS.
- Three planes:
  - **Ingest** (`ingest/**`, Python) → writes Tier-2 `data_lake.*`.
  - **Refinery** (`refinery/**`, TS) → builds brains (`brains/*.md`) from packs; 4 stages; master synthesizes.
  - **App/deliverable** (`app/**`, `lib/**`, `components/**`) → website, email/PDF/social deliverables, the
    answer path (MCP + `/api/b/*`).
- Control plane: `ingest/cadence_registry.yaml` (schedules/scope), `ingest/quality/` (contracts),
  `ingest/scripts/doctor.py` (health), `.github/workflows/**` (crons), `.claude/hooks/` (pre-push gates).

### A1. Ingest pipelines — ✅ audited (ZERO confirmed defects; one probe gap → S5)

**Entry points:** each pipeline is `run()`/`main()` in `pipeline.py` (dlt) with `--dry-run` via argparse;
ArcGIS pipelines (parcel_subdivision, collier_parcels) drive from `resources.py` `ingest_*`;
listing_lifecycle: `pipeline.run(source="api"|"scan", only_county=..., dry_run=...)`.

**One-root check (all reused, not duplicated):** guards `ingest/lib/guards.py` `assert_vs_canonical`;
coercion `ingest/lib/coercion.py` `coerce_float`/`coerce_int` (parcel's new fields reuse it — no dup helper);
run budget `ingest/lib/api_usage.RunBudget` (marketbeat retrofit mirrors city_pulse, no fork). ArcGIS paging
lives in `ingest/lib/arcgis_paginator.py`, but **parcel_subdivision carries its own OBJECTID-batch fetch +
`arcgis_count` in `resources.py`** (see C2 — a real second path, tolerated).

**In-flight `replace_strategy` fix (uncommitted):** `insert-from-staging` applied to exactly the 6 pipelines
carrying `write_disposition="replace"` (census_acs, census_cbp, fema, fdot, fhfa, fl_dbpr_licenses) — grep of
`write_disposition="replace"` returns exactly those 6, none missed. Sound.

**listing_lifecycle in-flight fix — verified sound:** `is_builder_plan` drops `ready_to_build`/`is_plan`
records at the parse boundary; pipeline holds stale plan rows out of `prior_all` to avoid fabricated
departures. Test-guarded (`test_extract_api.py`, `test_pipeline_api.py`). No finding.

- **Tests:** `pytest ingest/tests` / `pytest ingest/pipelines/*/test_*.py`.
- **How you'd tell it's broken:** a widened column lands 100% NULL → `parcel_subdivision --dry-run` prints row
  0, check the new fields are non-null (this is the live S5 risk); a replace pipeline truncates on a bad run →
  `assert_vs_canonical` guard; budget runaway → `RunBudgetExceeded`.
### A2. Ingest control plane (cadence/doctor/crons/gates) — ✅ audited

**Entry points:** health/gating `python -m ingest.scripts.doctor --cron --fail-on red` (the only scheduled
run, `freshness-probe-daily.yml:71`; imports check_freshness + check_data_quality + `gh_runs.py`); identity
`bun ingest/tools/check-registry-identity.mts --static` (CI `ci.yml:50` + pre-push Gate 7); cron incidents
`heal-cron-failure.yml` + `log-cron-incident.yml` (both import `classify-cron-failure.mjs`); digest send-gate
`scripts/email/build-digest.mts:193` → `assertChainRanToday`.

**One root per concern:** cron scheduling → the workflow `cron:` lines are the only truth; the registry
stores `cadence_days` (publish rate) + `workflow:` filename, NOT the cron, cross-checked by
`checkWorkflowLiveness` (one root ✓). Run budget → `RunBudget` (`api_usage.py:122`, one root ✓). **Failure
classification is deliberately SPLIT** — incident/log surface (`classify-cron-failure.mjs`, where `classify`
+ `classifyTermination` are ONE file, refuting a 3-way split) vs health/metadata surface (`gh_runs.py`
`_classify` + `doctor.py` `prescribe`); this two-surface design is why two magic constants must be hand-synced
(C17/C18, S14). Freshness → three consumers, three questions (DB age, refinery TTL, digest chain-ran) — not a
dup.

**Gates + overrides:** Gate 4 destructive-write-without-guard (override `ALLOW_REPLACE_WITHOUT_GUARD=1`);
pack-test env (override `ALLOW_PACK_TEST_ENV_FAIL=1`); Gate 7 registry identity `--static` (blocks on RED;
escape = a `known_drift` annotation — but that escape never checks the ledger, C16); CI freshness-probe
`doctor --fail-on red`.

- **Tests:** `node --test .github/scripts/classify-cron-failure.test.mjs`; `bun test
  ingest/tools/lib/identity-static.test.mts`; `pytest ingest/tests/` (doctor/registry spine).
- **How you'd tell it's broken:** cron silently stopped → doctor `run_severity=DISABLED` red +
  freshness-probe red; pipeline wrote 0 rows → `classify` `DATA_EMPTY` / doctor `GAP_SENTINEL`; red unnoticed →
  `doctor --fail-on red` + Healthchecks.io heartbeat. **The digest can still send stale numbers → C15.**
### A3. Refinery (brain build) — ✅ audited (ZERO confirmed defects)

**Entry points:** build one brain `bun refinery/cli.mts <pack-id>` (fail-fast); production nightly
`bun refinery/cli.mts master --resilient` (`daily-rebuild.yml:138`, pulls full upstream DAG); targeted debug
`workflow_dispatch pack_id=<id> [force=true]`; CLI `--target-only` rebuilds one pack without touching sibling
`brains/*.md` (`cli.mts:41,218`). **LOCAL TRAP:** a plain local build overwrites `brains/<id>.md` with
`localhost:3000` citation URLs — see C4.

**5 stages** (`refinery/stages/`): 1-ingest (fetch sources, no LLM) · 2-triage (pack-fit cutoff) ·
2.5-normalize (raw slug → registered concept; orphan aborts, `:443`) · 3-synthesis (LLM narrative, skippable
for deterministic packs) · 4-output (build `BrainOutput`, render, **run the one validator gate**, write file).

**One root each (all singular ✓):** pack def `refinery/config/packs.mts:381`; `BrainOutput` type
`refinery/types/brain-output.mts`; speaker/scrub `refinery/render/speaker.mts` (both `sanitizeProse` and
`scrubCaveatTechnical` funnel through `scrubVendorSystems:190`); validators all under `refinery/validate/*`
invoked from ONE site (`4-output.mts:556`); freshness token `refinery/lib/freshness.mts:21`.

**The gate (Stage 4, `4-output.mts:556` — a violation throws, prior file stays intact):** spec-validator,
facts-only-lint, inference-bait-lint, smoothing-lint, grain-guard-lint, zip-scope-lint, fixture-sentinel;
master-only circuit-breaker `lib/master-gate.mts` refuses a hollow/re-darkened master write; backstop
`detectSilentMasterFreeze` runs as a separate nightly step.

**Exit-code model:** `deriveExitCode` (`resilient-build.mts:212`) — single derivation, called once
(`cli.mts:453`): 0 clean · 2 all-transient degrade (quiet) · 1 LOUD (deterministic fail / master HELD).
The b90c0793 "targeted rebuild never derived an exit code" fix **moved** the guard (`if (resilient)` wraps
the block, inner `if includes("master")`), it did NOT add a second path — grep confirms one call site.

- **Tests:** `bun test` — `resilient-build.test.mts` (exit-code matrix), `4-output*.test.mts`,
  `2.5-normalize.test.mts`, `master-freeze-watchdog.test.mts`, each validator's `*.test.mts`, vocab coverage.
- **How you'd tell it's broken:** brain stale → `refined_at`/`freshness_token` vs `pack.ttl_seconds`;
  unregistered vocab slug → Stage 2.5 orphan abort + `bun refinery/tools/check-vocab-coverage.mts --all`;
  master froze → `brains/_build-report.json` `masterDecision` + `check-master-freeze.mts`; rebuild silently
  no-op'd → confirm `_build-report.json` exists and `deriveExitCode` ran.
### A4. Email design system + layout root — ✅ audited (the richest lane; roots are real but under-enforced)

**4 render engines (EmailDoc → output):**

| # | Engine           | Entry                            | Blocks                                                |
| - | ---------------- | -------------------------------- | ----------------------------------------------------- |
| 1 | Free-tier HTML   | `EmailDocRenderer.tsx:9`         | **shares** `BlockRenderer`                             |
| 2 | Paid-grid HTML   | `compile-grid.ts:133`            | **shares** `BlockRenderer` (positions only)           |
| 3 | PDF              | `email-doc-pdf.tsx:874`          | **REIMPLEMENTS** every block, own hex + off-scale type |
| 4 | Canvas (preview) | `GridCanvas.tsx` → BlockRenderer | **shares** `BlockRenderer`                             |

Engines 1+2 are picked by the HTML root `renderEmailDocHtml` (`render-email-doc.ts:22`, branch on
`isGridDoc`), which the lab render route, blast route, and scheduled runner all call — so **lab preview ==
send is VERIFIED; the "lab ≠ engine" fear is not real today.** Engines 1/2/4 share `BlockRenderer` →
identical fonts. **Only the PDF diverges** (parallel reimplementation → C11).

**One root per concept (all created/pinned TODAY):** brand color `lib/brand/tokens.ts` `BRAND` (7fba5b72,
mirrored to `globals.css`, drift-tested); weight ladder `lib/brand/weight.ts` `WEIGHT`=400/500/600
(928edaec, re-exported `scale.ts:73`); typography/spacing `lib/email/blocks/scale.ts` `TYPE/LEADING/SPACE`
+ `text()` composite that makes size-without-leading unreachable (1aad57ca); layout/position
`lib/email/doc/finalize-doc.ts` `finalizeDoc` stamping `SEAM` (a35012c3). **Verified via oracle:** the
commit measured "30 fontWeight declarations, ZERO compliant" before — after, blocks import `WEIGHT` and
tabular-nums flows through `scale.ts` `NUMERIC`; non-compliance is down to a single live residual (C10).

**The catch — the roots are conventions, not enforced authorities:**

- **The design-system guard is TEST-ONLY, never checked at render, and blind outside 3 directories.**
  `design-system-reachability.test.ts` is a *layout-provenance ledger*: it asserts no NEW file under
  `lib/email|lib/deliverable|lib/concoctions` writes a `layout:{` literal. It does NOT check color, weight,
  or size at all, and `wentThroughSeam` is consulted only in the test — never in `renderEmailDocHtml`. A
  hand-positioned doc built in `components/email-lab`, `app/`, `scripts/`, or `refinery/` renders in prod
  and the guard never sees it. → **C9 (high).**

- **How you'd tell it's broken:** color drift → `grep "#6B7280" lib/email/blocks/styles.ts` (won't follow
  `BRAND`); block bypass → `grep -n "fontWeight:" lib/email/blocks` (ImageBlock 700 is live, test stays
  GREEN = false comfort); lab≠send → only if the render route stopped calling `renderEmailDocHtml` (it
  doesn't).
### A5. Social design root + composer — ✅ audited (the design root is an ISLAND — see C12/C13)

**Two systems, still unwired (as `lib/social/CLAUDE.md:88` states):**

- **LAB / composer** — `components/email-lab/social/useSocialComposer.ts:57` → builds `SocialDesign` from
  `lib/social/design/templates.ts` → rendered by `KonvaStage.tsx`. The human/AI canvas post.
- **ENGINE** — `lib/social/render-social-image.ts` rasterizes brain-data cards via resvg, with its **own**
  type scale (lines 239-324) and **own** colors (`#9CA3AF`, `#FFFFFF`). Disclosed off-system in CLAUDE.md.
- They do not share a model (`SocialModel` vs `SocialDesign`/`EmailDoc`).

**The design root `lib/social/design/system.ts` — who actually reaches it:**

- **Brand teal:** `BRAND.teal` (`lib/brand/tokens.ts:70`) is the one teal root within social; the 07/14 teal
  fix landed in the LAB path (templates.ts:61, chart-attach.ts:76, serialize.ts:10). Only `THEMES`
  (surfaces) is consumed from system.ts.
- **The type ladder / contrast ink engine / fit budget** (`type()`, `ink()`, `accent()`, `fits()`,
  `CONTRAST_FLOOR`, `MIN_LEGIBLE_PX`) — **consumed by NOTHING except `system.test.ts`.** The renderers
  (`templates.ts`, `serialize.ts`, `KonvaStage.tsx`) import only `THEMES`. So the root is tested and
  documented as THE authority, but no renderer uses it → C12/C13.

- **Vacuity audit (all ~20 `system.test.ts` assertions):** every one survives a mutation test — the vacuous
  guard 6226906d admitted is already replaced by line 77. **No live vacuous assertion.** (Correctly not
  reported.)
- **How you'd tell it's broken:** build any `landscape` post → headline renders 54px vs 92px on square;
  check `getTemplate("headline-cta").build(tokens,"landscape").headline.fontSize`.
### A6. Charts — ✅ audited

**One fit root, two render twins that share it (verified):**

- Fit **math**: `lib/charts/fit-line.ts` (`fitLine` — the only least-squares + CI gate).
- Line-vs-fan **decision**: `lib/charts/fit-overlay.ts:105` `layerFor()` — single branch; both `windowViews`
  and `fitOverlay` call it. (Note: the fit logic is NOT in `vendor/bklit` — that code only paints.)
- **In-app** render: `DeskHero.tsx` → `components/charts/vendor/bklit/fit-glow.tsx` (paints `FitLayer`).
- **Email/PDF** render: `lib/charts/svg/fit-trend.ts:41,192` **imports** the same `FitLayer`/`FitOverlay` and
  reads `layer.line/fan/direction` — does NOT re-branch. Single root confirmed.
- Window/range select: `lib/charts/series-fit.ts:157` `fitWindows` + `:358` `trendVerdict`.
- Formatting: dates `vendor/bklit/chart-formatters.ts` `pickDateFmt` (cadence-based); values
  `lib/charts/format.ts`. Tooltip: `vendor/bklit/tooltip/chart-tooltip.tsx`.
- **Vendored fork:** `NOTICE.md` is accurate/current (documents the `yDomain` add, `pickDateFmt`, the 07/14
  `TooltipDot animate={!discreteInteraction}` patch at `chart-tooltip.tsx:266`). No doc-drift.
- **Tests:** `lib/charts/series-fit.test.ts`, `fit-overlay.test.ts` — now exercise the lopsided knife-edge
  case a tidy fixture used to hide.
- **How you'd tell it's broken:** wrong series drawn → check the panel's title source vs its series source
  are the same object (see S4); a fit points the wrong way → `fit-overlay.ts:105`; a falsifier reads
  trivially true → `series-fit.test.ts:418`.
- **All five flagged chart commits (6daa97df, f719a128, 3203a19d, 197b4694, 5a4a0e6a) are genuinely
  resolved in current code** — the old constructions are deleted, the discarded windows are now consumed,
  falsifiers are keyed per-window. Do not re-open these.
### A7. PDF + visual-parity harness — ✅ audited (built today)

**PDF path:** `email-doc-pdf.tsx:874` `EmailDocPdf` — the PDF engine `PdfBlock` **reimplements every block**
(can't consume HTML/React-email JSX), with its own hex + hand-picked type sizes (C11). This is the one render
engine that does NOT share `BlockRenderer`.

**Parity harness (the new regression test):** `pdf-html-visual-parity.test.ts` renders the SAME EmailDoc to
both HTML and PDF, rasterizes each, and pixel-compares geometry (not text — PDF uses built-in fonts). It uses
the real `pixelmatch` dep for diffing; `pixel-utils.ts` adds only geometry helpers (bounding-box / marker /
resize) — **not** a pixelmatch reimplementation. Pass criterion is a pixel threshold in the test.

**The Bun/Playwright workaround is real:** `chromium.launch()` hangs under Bun on this machine, so
`rasterize.ts:23` `Bun.spawn(["node", HTML_WORKER_PATH])` runs the HTML rasterization in a Node subprocess
(`rasterize-html-worker.mjs`, launches chromium + `page.screenshot`). Not a stub. (It is a 3rd chromium
screenshotter — C20.)

- **Does it run?** Discovered by CI's `bun test`, but hard-depends on chromium with no skip guard and no
  `playwright install` in any workflow → **can't pass on hosted CI (C19).** The purpose-built `test:visual` =
  `playwright test` + `playwright.config.ts` are wired to no workflow.
- **How you'd tell it's broken:** PDF diverges from HTML → run the parity test locally; the logo-squash class
  (react-pdf `objectFit` defaults to `fill`) is the recurring shape — G8 fixed it in-flight with
  `objectFit:"contain"`.
### A8. Deliverable recipes + no-invention gate — ✅ audited

**What a recipe is:** `RecipeBuilder = (ctx) => Promise<EmailDoc | null>` (`recipes/index.ts:70`); dispatch
table `RECIPE_BUILDERS` (`:78`) maps one `RecipeKey` → one builder. `build-doc.ts` does shared work first
(resolves the subject house once via `resolveSubject`, `shared.ts:52`), then calls the builder, which owns
four decisions: skeleton, cells, chart, prose. Returns `null` → falls through to the generic author (never
refuses, per RULE 0.7).

**The no-invention moat — PREMISE CORRECTION:** `gateNarrative` (`build.ts:444`) is **NOT** the recipe moat
and no recipe passes through it (its only callers are the separate `buildDeliverableNarrative` project-items
flow). Recipes gate their own prose via **`auditClaims` + `CLAIM_PROHIBITION`** (`lib/deliverable/claims.ts`),
fail-closed to an open slot / deterministic fallback. All 12 recipes verified to gate (incl. the invention-
prone market-comps `:981` and market-pulse `:522`). **No ungated-prose bypass exists** — but the no-invention
philosophy has **three separate implementations** (recipe `auditClaims`, `gateNarrative`, and the free-author
`author-doc.ts:856`). That's the architectural observation, not a bug.

**Other single roots:** subject `resolveSubject` (`shared.ts:52`); community line `communitySourceLine`
(`listing-detail.ts:173`, consumed by shared.ts + under-contract; the divergent `deIdentifyCommunity` fork was
*deleted* today — G5); peer scoping `loadAreaTiming` (`under-contract.ts:365`) composing `isCoreScope` +
`settledCount`. **The area-subject resolver is the exception — copied across 3 recipes (C8).**

- **Tests:** `bun test lib/deliverable/` (per-recipe `violationsIn`/claim guards).
- **How you'd tell it's broken:** a recipe invents a number → its `auditClaims`/`unanchoredNumbers` gate fails
  closed to an OPEN SLOT; a digit in prose absent from the settled/anchor set = a bypass. Wrong citation → the
  `figureCitations` accordion is the one root. Community leaks in coming-soon → `redactStreetLine` (community
  is permitted; only the street is blocked). Out-of-scope note: the **social path's free-text `stat.value` is
  ungated** (tracked in-code as `social_path_has_no_no_invention_gate`).
### A9. Desk + listings + community lookup — ✅ audited

**Desk** (`lib/desk/loaders.ts`): entry `loadDeskData()` at `:876` (called by `app/desk/page.tsx`), fires
~13 loaders in one `Promise.all` (`:879`), each empty-tolerant (dead feed → `null`/`[]` → the zone hides).
- **Hero "Home Price Trend" zone** is a 3-tier ladder at `:919`:
  1. `buildHeroFromSold` (`:727`) — live path, rides `redfin_city_swfl.median_sale_price` (monthly closed
     median per city, source **redfin.com**) via `loadSoldSeries` (`:166`); sets `rebase` at `:821`.
  2. `buildHeroFromAsking` (`:654`) — fallback (daily `median_asking_price`).
  3. `buildHeroFromZhvi` (`:825`) — deepest fallback; reuses the /charts `loadMetros(...,"zhvi_pivoted")`
     loader (explicitly "zero new source").
  - Renderer `app/desk/_components/DeskHero.tsx:111`; the two 07/14 fixes (rebase spike ca67ae2f, 3-city
    footer 80183680) are confirmed present in current code.
- **Provenance:** hero sold = redfin.com; asking/KPIs/movers/watchlist/map = "SWFL Data Gulf" spine
  (`listing_active_stats`, `listing_momentum_stats`, `listing_pulse_daily`, `listing_state`). Parcel
  sold-per-ZIP views are **not read by the desk at all.**

**Community name — ONE authority, three consumers (not a duplicate):** the root name is
`parcel_subdivision.subdivision_name` (tax roll). `neighborhood_stats` is literally its
`GROUP BY county, subdivision_name` rollup (`ingest/duckdb_pipelines/neighborhood_stats/agg.py:18`), so keys
match by construction. Three things read it for *different questions*: (a) `community-lookup.ts`
address→subdivision (**dormant — imported by nothing but its test**; header says "not yet wired, Gap 3");
(b) `refinery/sources/communities-swfl-source.mts` name→aggregate for the brain; (c) `listing-detail.ts`
`subdivision` = the marketed name parsed off the listing page — **this is the only one shipping in
deliverables today.**

**Listing URL → rendered:** `fetchListingFacts(url)` (`lib/email/listing-scrape.ts:418`, SSRF-guarded) →
deterministic cascade `parseListingFacts` → `parseJsonLdFacts` → LLM only if a core spec missing (`:432`);
community facts parsed from the SAME html via `parseListingDetail` (`lib/listings/listing-detail.ts:103`,
no second egress by design) → `buildListingFlyer` (`lib/email/listing-flyer.ts:120`).

- **Tests:** `bun test lib/desk/loaders.test.ts lib/listings/community-lookup.test.ts` (both new; guard the
  active-stats dedup + non-core county drop, and the fan-out refusal).
- **How you'd tell it's broken:** desk hero spike → `loaders.ts:821` (rebase unset); community mis-map →
  `community-lookup.ts:63` distinct-guard (dormant anyway); sold median stale → **see C3 below**; non-real
  county coverage → `isCoreScope` gate (`loaders.ts:261,:1058`) — desk is gated, listings/select is not
  (see S3).
### A10. Assistant answer path (MCP / consumption contract) — ✅ audited

**Two entry surfaces, one shared core:**

- **HTTP** `app/api/b/[slug]/route.ts:25` — `view=speak` → `fetchBrain` → `speak()`; `zip` set →
  `fetchDetailRow` → `renderDetailRowText` (`fetch-brain.ts:328`); `?format=json` also ships
  `buildDossier`.
- **MCP** `app/api/mcp/server.ts:218` `swfl_fetch` — `zip` fan-out `assembleLocationDossier`; `zip`+pinned
  report → `fetchDetailRow`; else `fetchBrain` + `_meta.dossier`.
- **Chat/highlighter grounding:** `lib/highlighter/grounding.ts` `buildGroundingContext` → dossier blocks;
  stream re-scrubbed in `lib/assistant/stream.ts`.
- **Core render:** `refinery/render/speaker.mts` `speak()` + `toDisplayBrain()`.

**Jargon/system-noun stripping — one root PER CLASS, layered (this is the drift surface):** vendor names
`scrubVendorSystems` (`speaker.mts:190`, the new shared root); pack-ids/`*-swfl` slugs `scrubBrainSlugs`
(`:145`); `§`/labels `sanitizeProse` (`:331`); internal ids/paths `scrubCaveatTechnical` (`:435`); z-score
`scrubStatsJargon` (`grounding.ts:100`, chat-only). Each applies a *different subset* — so a token stripped
in one path can leak in another (that is exactly C6).

**Citation rendering — ONE declared authority:** `cleanCitationForDisplay` (`speaker.mts:757`). Reached by
grounding + zip-dossier; **one path bypasses it → C6.**

**In-flight (uncommitted):** `fetch-brain.ts` (+75) adds `scrubDossierStrings` deep-scrubbing every
user-facing dossier string (sound, non-mutating); `grounding.ts` (+11) inserts `scrubVendorSystems` into the
block pipe. Both correct consolidations onto the shared root.

- **Tests:** new `lib/assistant/jargon-leak.test.ts` (untracked) asserts "Accela" can't reach grounding /
  `speak()` / `buildDossier` / `cleanCitationForDisplay`, and z-score→"index reading". Runs under
  `bun test` locally; **absent from CI because untracked → C7.** It does NOT exercise the detail-row path.
- **How you'd tell it's broken:** vendor noun leaks → `GET /api/b/permits-swfl?zip=33908`, look for
  `Source: …Accela…` (`fetch-brain.ts:354`); table in an answer → `|---|` in chat output; as-of raw token →
  grep response for `SWFL-\d+-v\d+-\d{8}`.

---

## PART B — FINDINGS

### READ ME FIRST — the 6 things that actually matter

Out of 10 subsystems, ~20 confirmed items. Most are low-severity drift. These six are not:

1. **C15 (HIGH, in-flight, catch it before it commits):** the digest send-gate `assertChainRanToday` will
   accept a *single-pack rebuild* receipt as proof the nightly chain ran → it can **email yesterday's numbers
   under today's date.** The exact bad receipt is sitting on HEAD right now. Still uncommitted — fixable now.
2. **C6 (HIGH, live in prod):** `GET /api/b/permits-swfl?zip=33908` returns `Source: …Accela…` — a vendor
   name leaking to users, because the ZIP detail-row path skips the citation-scrub authority its sibling uses.
3. **C4 (HIGH, do-not-commit):** the working-tree `brains/listing-momentum-swfl.md` is a **local-build
   artifact with `localhost:3000` links** — committing it ships broken links. `git checkout --` it.
4. **C9 (HIGH, systemic):** the email design-system guard runs **only as a test, never at render**, and is
   blind to any file outside 3 directories — the 07/13 postmortem's failure class, one dir-move from recurring.
5. **C12 + C13 (HIGH, systemic):** the social "design root" is imported by **nothing but its own test**;
   the renderers reimplement the very scale it claims to own → a landscape headline renders 54px where the
   root intends 92px, live in the composer.
6. **C5 (MED, the representative case):** trend colors are hardcoded in **4 places** that are contractually
   "the same picture."

---

### THE CROSS-CUTTING DIAGNOSIS — why "we keep doing it wrong" (read this, it's the point)

Today was a genuine, good-faith push to fix exactly this problem: "one root" for color, weight, layout,
fits, citations. The roots got **built**. The recurring failure is one level down:

> **A root was created as a module (a constant, a helper, a function), but nothing STRUCTURALLY forces
> callers through it. A root that a caller can bypass with a literal is a convention, not an authority.**

Every high/medium finding is an instance of this one shape:

| Root built today | How it's bypassed | Finding |
| ---------------- | ----------------- | ------- |
| `BRAND` color tokens | email & PDF re-type the greys as hex literals | C11, C14 |
| `WEIGHT` ladder | `ImageBlock` hardcodes `fontWeight:"700"` | C10 |
| `finalizeDoc` layout seam | never checked at render; guard blind outside 3 dirs | C9 |
| social `system.ts` (`type/ink/fits`) | renderers import only `THEMES`, reimplement the scale | C12, C13 |
| chart `FitLayer`/`fit-trend` | trend hues re-declared in 4 files | C5 |
| `cleanCitationForDisplay` (the "ONE authority") | detail-row path routes through nothing | C6 |
| `_build-report.json` as chain receipt | any `--target` overwrites it; gate doesn't check it's a chain run | C15 |
| shared magic thresholds | `0.95`, `≤2` hand-copied across JS↔Py | C17, C18 |

**The tell:** several of these files carry a *comment* asserting single-authority while being the second copy
(the deliverable area-resolver's "never a second crosswalk," social CLAUDE.md's "ONE ROOT" table pointing at
functions no renderer imports). The doc says authority; the code says convention.

**The fix pattern is NOT whack-a-mole** (deleting each duplicate as found — they grow back). It's making the
root the *only reachable path*, structurally:
- **Lint the bypass, not the instance.** A CI check that fails on any hex literal in `lib/email/blocks`
  outside `tokens.ts`/`scale.ts` kills C10/C11/C14/C5 as a *class* and stops the next one. (Extends the
  existing `design-system-reachability` ledger — which already proves this pattern works for layout; it just
  stops at layout and stops at 3 directories.)
- **Enforce at the choke point, not in a test.** Check `wentThroughSeam` inside `renderEmailDocHtml` (C9);
  route every citation through `cleanCitationForDisplay` by making the raw field private (C6); make
  `assertChainRanToday` demand `target==="master"` (C15).
- **Where two languages must share a number, name it once** or pair-comment both (C17/C18 — the codebase
  already does this for some pairs; make it the rule).

This is architecture discipline (CLAUDE.md RULE C2: *extend existing seams; one authority per shared
concept*). The seams to extend already exist. Nothing here needs a new framework.

---

### B-CONFIRMED — HIGH severity (verified; code quoted; path or input→output named)

#### C15 · correctness · HIGH · (IN-FLIGHT) digest send-gate accepts a single-pack receipt as a chain-ran proof

- **where:** `scripts/email/freshness-preflight.mts:138-165` (`assertChainRanToday`); producer
  `refinery/cli.mts:464-467`.
- **verified directly:** `brains/_build-report.json` on HEAD = `{"target":"communities-swfl",
  "timestamps.started":"2026-07-14T21:21:58Z", …}` — **no `masterDecision`.** `cli.mts:465` writes that path
  for *every* non-dry-run target (last-writer-wins). The gate only throws on `startedOn !== today` and
  `masterDecision === "held"`; a **missing** `masterDecision` sails through.
- **input → wrong output:** nightly chain drops **and** any targeted single-pack rebuild runs that day →
  `startedOn===today` ✓, `masterDecision` absent ✓, `master.md` still carries yesterday's token ✓ → **digest
  SENDS yesterday's master numbers stamped today.** This is precisely the failure the gate's own header says
  it exists to prevent.
- **fix:** require the receipt to be a chain run — reject when `masterDecision == null` (or assert
  `report.target === "master"`), not just `startedOn === today`. **This is uncommitted — fix before it lands.**

#### C6 · correctness / duplicate-path · HIGH · ZIP detail-row endpoint leaks the vendor name, bypassing the citation authority

- **where:** `lib/fetch-brain.ts:354` (`blocks.push(\`Source: ${table.source.citation}\`)`), also cells `:341`.
- **input → wrong output:** live artifact `brains/permits-swfl.md` has a `zip`-grain detail table whose
  `source.citation = "Lee County Accela Citizen Access — …"`. `GET /api/b/permits-swfl?zip=33908` (gated only
  by `VALID_SLUG`, unconditionally reachable) and MCP `swfl_fetch` both hit `renderDetailRowText`, which emits
  that string **verbatim** — a vendor name in a user answer (violates the consumption contract).
- **why (the duplicate):** the sibling ZIP-drill renderer scrubs the identical field —
  `lib/zip-dossier.ts:419` `cleanCitationForDisplay(table.source.citation)` — and `cleanCitationForDisplay`
  (`speaker.mts:757`) is the declared "ONE authority… every surface routes through this." This path routes
  through nothing. The in-flight `scrubDossierStrings` claim that "every raw-dossier consumer is covered" is
  false for this path (it reads `detail_tables` directly, never the dossier).
- **fix:** `Source: ${cleanCitationForDisplay(table.source.citation)}` at `:354`; run cells through
  `sanitizeProse` at `:341`.

#### C4 · correctness (do-not-commit) · HIGH · working-tree `brains/listing-momentum-swfl.md` is a local-build artifact

- **where:** working tree vs `HEAD:brains/listing-momentum-swfl.md` (uncommitted; −116 net lines).
- **verified:** 4 citation URLs rewrote `https://www.swfldatagulf.com/r/source/…` → **`http://localhost:3000/r/source/…`**; version 4→5; `refined_at` bumped to `2026-07-14T21:31:04Z`; ZIP rows 67→54 (the `isCoreScope` filter landed 07-10, *after* v4's 07-09, so 54 is correct Lee+Collier scoping, not lost content). No CI/prod build emits `localhost:3000` — this only happens on a local `bun refinery/cli.mts listing-momentum-swfl` run.
- **consequence:** committing it ships broken `localhost` citation links. It is the known local-overwrite trap (memory `feedback_refinery-build-overwrites-brain-md`), **not** a refinery defect.
- **fix:** `git checkout -- brains/listing-momentum-swfl.md` (or restore via a CI rebuild). Do not commit.

#### C9 · doc-drift / correctness · HIGH · email design-system provenance is enforced only in a test, and only in 3 directories

- **where:** `lib/email/render-email-doc.ts:22` (never consults `wentThroughSeam`); the guard
  `lib/email/design-system-reachability.test.ts` walks only `["lib/email","lib/deliverable","lib/concoctions"]`.
- **why:** `wentThroughSeam` (`finalize-doc.ts:81`) is read ONLY by the test. A hand-positioned, un-stamped
  doc renders byte-identically in prod. A builder placed in `components/email-lab`, `app/`, `scripts/`, or
  `refinery/` can hand-position and the guard never sees it. The test asserts layout provenance only — it
  checks **no** color/weight/size. This is the 07/13 postmortem's exact failure class, one scope-widening
  away, and it is why C10/C11/C14 pass CI green.
- **fix:** check `wentThroughSeam(doc)` in `renderEmailDocHtml` (warn/refuse); widen the ledger walk to all
  EmailDoc-producing roots; add color/weight literal-bans to the ledger.

#### C12 · correctness / duplicate-path · HIGH · social templates reimplement the `min(W,H)` scale the root claims to own

- **where:** `lib/social/design/templates.ts:84` (`const base = Math.min(W, H)`, then every `base * k`; e.g.
  `headlineCta` `:189`). Intended authority: `lib/social/design/system.ts:245` `type(role, format)`.
- **input → wrong output:** `templates.ts` imports only `THEMES`, never `type()`. `headline-cta` @ square →
  `base=1080` → 92px; @ landscape → `base=min(1200,630)=630` → **54px (41% smaller)** — the exact regression
  `system.ts`/`system.test.ts:70` claim is "nailed shut." Live: `author.ts:31` + `KonvaStage` render it.
- **fix:** migrate `templates.ts` to consume `type()/ink()/accent()/fits()`; delete the local `min(W,H)`.

#### C13 · dead-code / doc-drift · HIGH · the social design root is imported by nothing but its own test

- **where:** `lib/social/design/system.ts` exports `type/ink/accent/decor/fits/compact/widthScale/
  contentHeight/CONTRAST_FLOOR/MIN_LEGIBLE_PX/REF_WIDTH`; repo-wide, the only importer of any of them is
  `system.test.ts`. Every renderer (`templates.ts:19`, `serialize.ts:4`, `KonvaStage.tsx:7`) takes `THEMES`
  only.
- **why it matters:** the type ladder + contrast-enforcing ink engine + fit budget are tested and documented
  as THE authority (CLAUDE.md's "ONE ROOT" table tells authors to import them) but are **unreachable from any
  renderer.** The doc says root; the code says island. This is the purest instance of the diagnosis above.
- **fix:** wire `templates.ts`/`render-social-image.ts` to `system.ts`, OR mark `system.ts` explicitly
  pre-adoption in CLAUDE.md so "one root" isn't misread as "already the root."

### B-CONFIRMED — MED severity

#### C1 · duplicate-path · MED · Two pipelines scrape the identical FDOR layer
- **where:** `ingest/pipelines/parcel_subdivision/constants.py:36-37` and
  `ingest/pipelines/collier_parcels/constants.py:27-28`
- **code:** both build the same URL —
  `https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query`
- **why:** `parcel_subdivision` (all counties incl. Collier, `CO_NO=...`) and `collier_parcels`
  (Collier only) both pull overlapping Collier parcels from the *same* service + layer 0. Two pipelines,
  one source, overlapping rows.
- **status:** **Already tracked** as check `collier_parcels_parcel_subdivision_redundant_scrape`
  (cadence_registry.yaml:920 + SESSION_LOG.md:49). NOT a silent deferral — it's a logged, known
  consolidation task. The 07/14 widen deliberately routed the physical/geo fields into
  `parcel_subdivision` (not duplicated per-pipeline) rather than deepening the overlap. Consolidation
  itself is unstarted.
- **fix:** one pipeline reads the layer; the other consumes its Tier-2 output. Design task, not a hotfix.

#### C2 · duplicate-path · LOW→MED · Two `arcgis_count` implementations
- **where:** `ingest/pipelines/parcel_subdivision/resources.py:280` (`def arcgis_count`) vs
  `ingest/lib/arcgis_paginator.py` (shared `arcgis_count`, imported by `collier_parcels/pipeline.py:14`).
- **why:** `parcel_subdivision` defines its own count-against-ArcGIS helper; `collier_parcels` imports the
  shared one from `ingest/lib`. Same operation (count features for a `where` clause on the same service),
  two code paths that can drift (pagination limits, error handling, retry).
- **status:** Flagged to the ingest lane to confirm whether the private copy is a genuine superset or a
  stale fork. Verify before consolidating.
- **fix:** parcel_subdivision imports `ingest.lib.arcgis_paginator.arcgis_count`; delete the private copy.

#### C3 · correctness (stale-path re-arm) · MED · An operator helper re-applies the SUPERSEDED sold-median view

- **where:** `scripts/apply_collier_sold_median_view.py:65`
- **code:** `view_sql = (root/"docs"/"sql"/"20260711_collier_sold_median_by_zip.sql").read_text()` then
  `cur.execute(view_sql)` — `CREATE OR REPLACE VIEW data_lake.collier_sold_median_by_zip`.
- **why:** Today's fix 97f36d82 (`docs/sql/20260714_sold_median_recency_window.sql`) rewrote that view to a
  rolling-12-month window. This helper re-reads the **07/11** file — whose `eligible` CTE is the stale
  2.5-year blend (`20260711_...sql:24` `AND p.sale_yr1 >= 2024`, no rolling anchor). Running it after the
  fix **reinstates the old median** (~$370k vs the corrected ~$355,299 — the fix's own header calls the old
  value "high in a falling market"). This is the exact defect that was just fixed, left live behind an
  operator-run script = the "old path still reachable" pattern.
- **status:** The rest of the sold-median surface is single-authority and clean — both source connectors
  (`refinery/sources/{leepa,collier}-sold-median-source.mts:82`) and both property packs read the view **by
  name**, so the SQL fix reaches all of them once applied; no TS re-computes the median. Only this apply
  script points at the dead SQL. DB view's live state not inspectable from here.
- **fix:** repoint the script at `docs/sql/20260714_sold_median_recency_window.sql`, or delete it (the
  migration applies via `bun scripts/run-migration.ts`).

#### C5 · duplicate-path · MED · Trend colors hardcoded in 4 "same picture" places

- **where:** `components/charts/vendor/bklit/fit-glow.tsx:35` and `lib/charts/svg/fit-trend.ts:71` both
  declare `HUE = { up:"#5BC97A", down:"#E08158", none/…:"#D4B370" }`; 3rd/4th copies of the up/down hex at
  `DeskHero.tsx:17-18` and `loaders.ts:63-65`.
- **why:** the browser twin (`fit-glow`) and the email/PDF twin (`fit-trend`) are contractually "the same
  picture, same palette" (their own headers say so) yet each re-declares the hues. Edit one → the browser fit
  and the email/PDF fit drift silently. Bypasses the TEAL/NAVY "one root" landed the same day (928edaec).
- **fix:** one exported trend-hue constant imported into both twins (and the desk copies).

#### C7 · never-runs (in CI) · MED · the new jargon guard is untracked, so CI can't run it

- **where:** `lib/assistant/jargon-leak.test.ts` is untracked (`??`); CI runs `bun test` (`ci.yml:31`).
- **why:** `bun test` auto-discovers it locally, but CI builds checked-out committed code — an untracked file
  isn't in that tree, so the Accela/z-score regression is unenforced in CI. (State-of-tree fact, not a code
  defect; in-flight.)
- **fix:** commit the file — it then runs under the existing `bun test` step, no glob change.

#### C8 · duplicate-path · MED · the deliverable area-subject resolver is copied across 3 recipes

- **where:** `review-reply.ts:77-109` ↔ `sphere-weekly.ts:141-183` (byte-identical `CROSSWALK_ZIPS` +
  `resolveArea` logic); a **3rd, drifted** copy at `market-pulse.ts:172` (takes `ctx`, skips the prompt-ZIP
  scan).
- **why:** one shared concept ("resolve an AREA subject from prompt + scope ZIP") with three authorities;
  `sphere-weekly`'s return is a strict superset of `review-reply`'s. Both files carry the identical comment
  "built from the SAME gazetteer… never a second crosswalk" — while being exactly the second crosswalk of
  each other. `market-pulse`'s divergence is proof the concept has already drifted.
- **fix:** extract one `resolveArea(prompt, scopeZip)` into `shared.ts`; all three consume it.

#### C10 · correctness / duplicate-path · MED · off-ladder `fontWeight:"700"` overrides the scale composite (recipient-reachable)

- **where:** `lib/email/blocks/ImageBlock.tsx:79-83` — `...text("h2")` (returns weight 500) immediately
  overridden by `fontWeight: "700"`. The `WEIGHT` ladder tops out at 600; 700 is not a permitted value (the
  `scale.ts` docstring names this exact bug).
- **why:** reachable whenever an image block has an `overlayTitle` → headline renders at 700, off-root. Passes
  CI green because the reachability test checks layout only (C9).
- **fix:** delete the `fontWeight:"700"` line (let `text("h2")` govern) or pass `{weight: WEIGHT.display}`.

#### C11 · duplicate-path · MED · the PDF engine is a third, unrooted style copy

- **where:** `lib/pdf/email-doc-pdf.tsx:37-38` re-declares `BORDER="#E5E7EB"` / `MUTED="#6B7280"` (3rd copy
  after `tokens.ts` and `styles.ts`); hand-picked type sizes (hero 34 vs `TYPE.hero` 64, metric 22 vs
  `TYPE.metric` 36) at `:149,192,607,757`.
- **why:** `PdfBlock` reimplements every block instead of sharing `BlockRenderer`, consuming neither `BRAND`
  nor `scale.ts` → HTML and PDF drift independently. (Some medium-divergence is inherent to @react-pdf; the
  unrooted color/scale is not.)
- **fix:** import `BRAND.shellLine/shellMuted`; derive PDF sizes from a shared scale ratio.

#### C14 · duplicate-path · MED · email re-types the shell grey ramp instead of importing `BRAND`

- **where:** `lib/email/blocks/styles.ts:44-45` — `MUTED="#6B7280"`, `BORDER="#E5E7EB"`, identical to
  `BRAND.shellMuted`/`BRAND.shellLine` (`tokens.ts:119,112`). `BRAND` is imported by **zero** files in
  `lib/email`, though `tokens.ts` explicitly names email blocks as a consumer that "NEVER re-types the hex."
- **why:** email HTML can't use `var(--gulf-teal)`, so it's exactly the case `tokens.ts` says to import
  `BRAND` for. Values match today (no visible drift) — a second definition / future-drift, reachable via
  block borders + footer.
- **fix:** `import { BRAND }`; `MUTED = BRAND.shellMuted`, `BORDER = BRAND.shellLine`.

#### C19 · never-runs (in CI) · MED · the new PDF visual-parity test can't pass on hosted CI

- **where:** `lib/pdf/__tests__/pdf-html-visual-parity.test.ts` (a `bun:test`, discovered by `ci.yml:31`
  `bun test`) hard-depends on chromium via `rasterize-html-worker.mjs:24` (`chromium.launch()`), with **no
  skip guard** (grep for skip = 0 hits) and **no `playwright install` in any workflow** (ci.yml has zero
  playwright refs). The purpose-built `test:visual` = `playwright test` + `playwright.config.ts` are wired to
  **no** workflow.
- **why:** on `ubuntu-latest`, `chromium.launch()` has no browser → the test can't pass as configured. The
  regression test that found today's logo bugs is not reliably enforced going forward.
- **fix:** add `playwright install chromium` to `ci.yml`, OR gate the test with a browser-present
  `describe.skipIf`.

### B-CONFIRMED — LOW severity (drift risk; no wrong output today)

- **C2 · duplicate-path · `arcgis_count`:** `parcel_subdivision/resources.py:280` defines its own vs the
  shared `ingest/lib/arcgis_paginator.py` (`collier_parcels` imports the shared one). Real second path; the
  ingest lane treats it as tolerated. Fix: import the shared one, delete the private copy.
- **C16 · doc-drift · known_drift never checks the ledger:** `ingest/tools/lib/identity-static.mts:568,574`
  — the doc + error message promise a `known_drift` downgrade only applies when the named check is **OPEN**,
  but nothing reads the checks ledger, so a since-CLOSED key keeps downgrading a real RED→WARN forever (this
  is what currently suppresses the franchise `parked_but_scheduled` RED). Fix: load the ledger, suppress only
  when OPEN.
- **C17 · duplicate-path · `TIMEOUT_RATIO=0.95`:** hand-copied across `classify-cron-failure.mjs:280` (JS)
  and `gh_runs.py:38` (Py). Agree today; drift risk. Fix: pair-comment both or centralize.
- **C18 · duplicate-path · transient streak `≤2`:** a named constant in `gh_runs.py:205`
  (`_TRANSIENT_STREAK_MAX`) but a bare `<= 2` literal in `doctor.py:257`. Fix: import the constant.
- **C20 · duplicate-path · a third chromium screenshotter:** `rasterize-html-worker.mjs:24,28` duplicates the
  existing `scripts/capture-seed-previews.mts:37` and `scripts/capture-showcase.mjs:49` chromium screenshot
  paths. Fix: extract one shared chromium-screenshot helper.

### B-GOOD (verified — a thing done RIGHT today, recorded so it isn't "re-fixed")

> These are verified-correct. Recorded so a future session doesn't "re-discover" them as bugs and undo them.

- **G1 · parcel_subdivision widen followed the enumeration rule** (`cadence_registry.yaml:919`): the registry
  enumerates 120 FDOR fields, re-verified 07/14, with exclusions stated. It did NOT repeat the "7 of 120"
  postmortem. **Caveat:** the enumeration lives on the `collier_parcels` sibling entry, not on
  parcel_subdivision's own (S6), the 9 new physical field *names* weren't live-probed (S5), and the fields
  have no consumer yet — so it's rule-followed, not yet rule-complete.
- **G2 · the email design root actually landed** (verified via the commit's own oracle): before,
  "30 fontWeight declarations, ZERO compliant, tabular-nums used ZERO times." After: blocks import `WEIGHT`
  from `scale.ts` and tabular-nums flows through `scale.ts` `NUMERIC`; non-compliance is down to a single
  live residual (C10). The root is real; the gap is enforcement (C9), not existence.
- **G3 · the refinery has zero confirmed defects.** The b90c0793 "targeted rebuild never derived an exit
  code" fix **moved** the guard, it did not add a second path (one `deriveExitCode` call site). One retry
  wrapper, one prose-scrub root. Don't re-open.
- **G4 · all five flagged chart commits are genuinely resolved in current code** (6daa97df, f719a128,
  3203a19d, 197b4694, 5a4a0e6a) — old constructions deleted, discarded windows now consumed, falsifiers
  keyed per-window, and the fixture that hid the knife-edge case is replaced. Don't re-open.
- **G5 · community-name logic was consolidated to one authority today** (0247e890 *deleted* the divergent
  `deIdentifyCommunity` fork; `communitySourceLine` is the single narrator). This is the pattern done RIGHT —
  the model for fixing the others.
- **G6 · lab preview == email send is verified** — both go through `renderEmailDocHtml`, so the "lab ≠ engine"
  fear is not a real problem today.
- **G7 · the in-flight `replace_strategy` fix hit exactly the 6 replace pipelines** (grep of
  `write_disposition="replace"` returns exactly those 6; none missed). Sound.
- **G8 · the PDF logo-squash bug is real and the in-flight fix is correct** — react-pdf's `objectFit` defaults
  to `fill` (stretches); the uncommitted `objectFit:"contain"` on the hero `Image` is the right fix. (The
  test that found it just doesn't run in CI — C19.)

### B-SUSPECTED (NOT proven — re-verify before acting)

> Re-verify each yourself before acting. `S1` was promoted to `C4` once the refinery lane confirmed it.

- **S2 · LOW · latent dual community name** (`community-lookup.ts:71` vs `listing-detail.ts:117`): only the
  marketed name ships today; community-lookup is dormant. IF it's wired into `ListingFacts` (its "Gap 3"), a
  listing carries two names for one address (marketed "Bay Colony" vs tax-roll "BAY COLONY SHORES"). A wiring
  hazard to design around, not a live bug.
- **S3 · LOW · listings accepts non-core counties** (`lib/listings/select.ts:31` `COUNTY_ANCHOR_CITY`): unlike
  the desk (hard-gated by `isCoreCounty`), `scopeCity` will build a context for Charlotte/Sarasota/Glades/
  Hendry. Not fabrication (only real rows, cited "SWFL Data Gulf"), but the one path that could imply coverage
  we don't claim. Operator eyeball.
- **S4 · MED (latent) · charts asking-fallback re-introduces the wrong-series pattern**
  (`loaders.ts:684` `buildHeroFromAsking` + `DeskHero.tsx:124`): the fallback pairs a **dollar** headline with
  a **months-of-supply** area chart — the exact "area under a dollar figure" bug the sold path was rebuilt to
  eliminate, reintroduced in the fallback. Dormant today (sold feed has 421 rows so `buildHeroFromSold` wins);
  live only if the sold feed empties. Labeled, so honest to a careful reader. Fix: drop `trend` in the
  fallback, state supply as a datum.
- **S5 · MED · the 9 widened parcel fields were never live-probed** (`parcel_subdivision/constants.py:47`):
  only `SALE_PRC1` was live-verified; the physical/geo field *names* (`TOT_LVG_AR`, `NBRHD_CD`, …) are assumed,
  and `test_resources.py` hardcodes them in a closed loop that passes whether or not the live layer returns
  them. If a name is wrong, that column lands 100% NULL = cosmetic widen = the soft version of the postmortem.
  Fix: `parcel_subdivision --dry-run` prints row 0 — confirm the new fields are non-null.
- **S6 · LOW · parcel_subdivision's own cadence entry lacks a `source_scope` block** — the enumeration lives
  only on the `collier_parcels` sibling. Fix: add the block (or cross-reference the sibling).
- **S7 · LOW · review-reply gates numbers but not claim-shapes** (`review-reply.ts:402` uses only
  `unanchoredNumbers`, not `auditClaims`): its near-twin `sphere-weekly` added `auditClaims` specifically
  because a digit-gate misses claim-shaped invention (comparison, trajectory, mechanism). Not a proven
  violation — the locked rule's only hard block is an invented *number*, which review-reply does enforce.
- **S8 · LOW · under-contract self-reported extraction debt** (`under-contract.ts:162,353`): two copy-#2
  reads, each consciously marked "REPORTED FOR EXTRACTION" (a shared file a parallel build must not touch).
  Flagged debt, not silent drift.
- **S9 · LOW · answer-path freshness line falls back to the raw token** (`fetch-brain.ts:358,413`
  `asOfFromToken(t) ?? t`): `speaker.mts`'s `freshnessLine` deliberately omits rather than print the raw token
  (rule 5). Only fires on a malformed token, so no clean input→output — an inconsistency, not a live leak.
- **S10 · LOW · as-of formatting is reimplemented in `sanitizeProse`** (`speaker.mts:359` regex ISO→MM/DD/YYYY)
  without the range validation `lib/project/as-of.ts` `asOfFromIso` has. Different job (bulk prose vs single
  field), so not a live bug — a second implementation to consolidate.
- **S11 · LOW · the jargon test's completeness claims over-promise** (`jargon-leak.test.ts:132` "covers every
  chat surface"): it does NOT exercise `renderDetailRowText` — the fifth path, the one that leaks (C6). The
  comments say "every surface"; the coverage doesn't include the leaking one.
- **S12 · MED · social lab manual-insert hand-types off-ladder sizes** (`useSocialComposer.ts:131` `fontSize:56`,
  `:158` CTA `fontSize:30` < `MIN_LEGIBLE_PX=32`, `fontFamily:"Arial"` bypassing `BRAND_FONTS`): the
  human-driven insert path (no fence was ever claimed over it), but it corroborates that the type authority is
  unwired even inside the lab. Fix: seed inserts from `type(role, format)`.
- **S13 · LOW · franchise cron reconcile note** (in-flight `franchise-outcomes-quarterly.yml`): the uncommitted
  edit correctly comments out a quarterly cron that would have misfired 07/15 against a parked entry; residual
  registry `note`/`known_drift` still describe the now-disabled cron. Reconcile them in the same commit.
- **S14 · MED (architecture, not a bug) · the cron failure-classification split** —
  `classify-cron-failure.mjs` (incident/log surface) vs `gh_runs.py:_classify` + `doctor.py:prescribe`
  (health/metadata surface): two implementations of "is this a timeout kill / should we retry," on different
  inputs and enum vocabularies. Framed in-code as a deliberate two-surface design, but it is the structural
  reason C17/C18's constants must be hand-synced. Flag so the split stays a conscious decision.

---

## THE ACTION LIST (ordered — do these, in this order)

**Before your next commit / push:**

1. `git checkout -- brains/listing-momentum-swfl.md` — it's a local-build artifact with localhost links (C4).
2. Fix `assertChainRanToday` to require `masterDecision != null` (or `target==="master"`) BEFORE the digest
   send-gate rewrite is committed (C15). This is the one that can email wrong numbers.

**This session or next (live/user-facing):**

3. Scrub the ZIP detail-row citation: `cleanCitationForDisplay` at `fetch-brain.ts:354` (C6, live Accela leak).
4. Commit `jargon-leak.test.ts` so CI runs it (C7); add `playwright install chromium` to `ci.yml` or a
   skip-guard so the PDF parity test runs (C19).

**The structural fixes (this is the actual cure — schedule them, don't cram):**

5. Extend the `design-system-reachability` ledger to (a) check `wentThroughSeam` at render and (b) ban hex/
   weight literals outside `tokens.ts`/`scale.ts`, across all EmailDoc roots (C9 — kills C10/C11/C14 as a class).
6. Wire the social renderers to `system.ts` — or mark `system.ts` pre-adoption (C12/C13).
7. Extract the single roots: trend hue (C5), `resolveArea` (C8), `arcgis_count` (C2), the JS↔Py thresholds
   (C17/C18).

**Cleanup / correctness debt:** C3 (repoint the sold-median apply script), C16 (known_drift ledger check),
C20 (one chromium screenshotter), S4/S5/S12 (probe + fallback + lab-insert). Open a `checks` entry per item
per RULE 2.4 rather than leaving them in this doc.

---

## APPENDIX — provenance

- **The 61 commits:** `git log --since="2026-07-14 00:00" --oneline`. Themes: email/social/charts design
  roots; chart trend-fit + window menu; PDF visual-parity harness (new); ingest doctor/cron reds; parcel widen
  + community-lookup; desk hero + sold-median recency fix; deliverable recipe fixes.
- **How this audit was run:** 10 read-only `Explore` subagents (one per subsystem), each bound to quote
  current code at file:line and name the duplicate path or the input→wrong-output; unproven items parked in a
  separate SUSPECTED list. High-severity and in-flight findings (C4, C6, C9, C10, C15) were re-verified
  directly by the lead session against the live code/artifacts. Six lanes died on API stream-stalls mid-run
  and were relaunched leaner — the findings above are from completed lanes only.

_Status: COMPLETE — all 10 subsystems audited (A1–A10). Nothing in the working tree was modified by this
audit; it was strictly read-only. This file is the whole deliverable._
